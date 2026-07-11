// ============================================
//  ☁️ Firestore 실시간 동기화 계층 (drive.js 대체)
// --------------------------------------------
//  구조
//   users/{uid}/tasks/{taskId}   ← my-tasklog-data 배열의 항목 1개 = 문서 1개
//   users/{uid}/notes/{noteId}   ← my-tasklog-notes 배열의 항목 1개 = 문서 1개
//   users/{uid}/logs/{logId}     ← my-tasklog-journal 의 주차 1개 = 문서 1개
//   users/{uid}/docs/{name}      ← 만다라트·라이프휠·MVV·설정 등 단일 객체/문자열
//   users/{uid}/docs/_meta       ← 마이그레이션 기록
//
//  동작 원리
//   ▸ localStorage 는 그대로 UI 캐시 — 기존 20여 모듈 무수정
//   ▸ 쓰기: backup-core.js 의 setItem 훅 → scheduleAutoBackup() → 항목 단위 diff → batch 푸시
//   ▸ 읽기: onSnapshot → localStorage 반영(__applyingRestore 가드) → 화면 갱신
//   ▸ 오프라인: firebase-init.js 의 persistence 가 큐잉/재전송을 자동 처리
// ============================================

// ── 매핑 정의 ────────────────────────────────
// 항목 단위 컬렉션 (배열/객체의 원소 1개 = 문서 1개)
const FS_ITEM_MAPS = [
  { lsKey: 'my-tasklog-data',    coll: 'tasks', kind: 'array'  },   // 할 일
  { lsKey: 'my-tasklog-notes',   coll: 'notes', kind: 'array'  },   // 메모
  { lsKey: 'my-tasklog-journal', coll: 'logs',  kind: 'object' },   // 저널(주차별)
];

// 단일 문서 키 (users/{uid}/docs/{docId} 에 원문 문자열 그대로 저장 — 무손실)
const FS_DOC_KEYS = [
  'my-tasklog-lifewheel', 'my-tasklog-corevalues', 'my-tasklog-mandalart',
  'tasklog-mvv-data', 'todoCols2', 'todoProjHidden', 'mdtFavActions',
  'my-tasklog-nickname',
  'app-theme', 'app-lang', 'app-week-start', 'app-font-size',
  'app-notif-deadline', 'app-notif-journal',
  'app-cal-sync', 'app-cal-provider', 'app-cal-direction', 'app-cal-items',
];

// localStorage 키 → 안전한 문서 ID
function _docIdForKey(key) { return key.replace(/[\/\.]/g, '_'); }

// ── 내부 상태 ────────────────────────────────
let _fsUid       = null;    // 현재 동기화 중인 uid
let _fsUnsubs    = [];      // onSnapshot 해제 함수들
let _fsMirror    = {};      // 마지막으로 알고 있는 서버 상태 { lsKey: {docId: json} | rawString }
let _fsPushTimer = null;    // 디바운스 타이머
let _fsStarted   = false;

// 키 순서를 정렬해 항상 같은 문자열이 나오는 stringify (diff 오탐 방지)
function _stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) {
    return JSON.stringify(k) + ':' + _stableStringify(v[k]);
  }).join(',') + '}';
}

// Firestore에 넣을 수 있게 정리 (undefined 제거). 객체가 아니면 __raw 로 감싼다.
function _sanitizeItem(v) {
  var clean = JSON.parse(JSON.stringify(v === undefined ? null : v));
  if (clean !== null && typeof clean === 'object' && !Array.isArray(clean)) return clean;
  return { __raw: JSON.stringify(clean) };
}
function _unwrapItem(data) {
  if (data && typeof data === 'object' && typeof data.__raw === 'string') {
    try { return JSON.parse(data.__raw); } catch (e) { return null; }
  }
  return data;
}

// ── localStorage → {docId: item} 표현으로 변환 ──
function _localRepr(map) {
  var raw = localStorage.getItem(map.lsKey);
  var out = {};
  if (!raw) return out;
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return out; }
  if (map.kind === 'array') {
    if (!Array.isArray(parsed)) return out;
    parsed.forEach(function (item) {
      if (item === null || item === undefined) return;
      var id = (item && item.id !== undefined && item.id !== null) ? String(item.id) : null;
      if (!id) { id = 'x' + Math.random().toString(36).slice(2); item = Object.assign({}, item, { id: id }); }
      out[_docIdForKey(id)] = item;
    });
  } else {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    Object.keys(parsed).forEach(function (k) {
      out[_docIdForKey(k)] = { __key: k, __value: parsed[k] };
    });
  }
  return out;
}

// {docId: item} → localStorage 값으로 역변환
function _reprToLocalValue(map, repr) {
  if (map.kind === 'array') {
    var arr = Object.keys(repr).map(function (id) { return repr[id]; });
    arr.sort(function (a, b) {
      var na = Number(a && a.id), nb = Number(b && b.id);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a && a.id) < String(b && b.id) ? -1 : 1;
    });
    return arr;
  }
  var obj = {};
  Object.keys(repr).forEach(function (id) {
    var d = repr[id];
    if (d && d.__key !== undefined) obj[d.__key] = d.__value;
    else obj[id] = d;
  });
  return obj;
}

// ── Firestore 참조 헬퍼 ──────────────────────
function _userRef()      { return db.collection('users').doc(_fsUid); }
function _collRef(name)  { return _userRef().collection(name); }
function _docRef(docId)  { return _collRef('docs').doc(docId); }

// ============================================
//  📤 푸시 (로컬 변경 → Firestore, 항목 단위 diff)
// ============================================

async function _pushChanges(force) {
  if (!_fsStarted || !_fsUid || !db) return;
  var prevMirror = JSON.parse(JSON.stringify(_fsMirror));   // 실패 시 되돌리기용
  var batch = db.batch();
  var ops = 0;
  var commits = [];

  function addOp(fn) {
    fn(batch);
    ops++;
    if (ops >= 400) { commits.push(batch.commit()); batch = db.batch(); ops = 0; }
  }

  // 1) 항목 단위 컬렉션 diff
  FS_ITEM_MAPS.forEach(function (map) {
    var cur = _localRepr(map);
    var mir = (!force && _fsMirror[map.lsKey]) || {};
    var curJson = {};
    Object.keys(cur).forEach(function (id) {
      var j = _stableStringify(cur[id]);
      curJson[id] = j;
      if (mir[id] !== j) {
        var data = _sanitizeItem(cur[id]);
        addOp(function (b) { b.set(_collRef(map.coll).doc(id), data); });
      }
    });
    Object.keys(mir).forEach(function (id) {
      if (!(id in curJson)) addOp(function (b) { b.delete(_collRef(map.coll).doc(id)); });
    });
    _fsMirror[map.lsKey] = curJson;
  });

  // 2) 단일 문서 diff (원문 문자열 그대로)
  FS_DOC_KEYS.forEach(function (key) {
    var raw = localStorage.getItem(key);   // null 가능
    var mir = force ? undefined : _fsMirror[key];
    if (mir === raw && !force) return;
    if (raw === null) {
      if (mir !== undefined && mir !== null) {
        addOp(function (b) { b.delete(_docRef(_docIdForKey(key))); });
      }
    } else {
      addOp(function (b) {
        b.set(_docRef(_docIdForKey(key)), {
          key: key, raw: raw,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
    }
    _fsMirror[key] = raw;
  });

  if (ops > 0) commits.push(batch.commit());
  if (commits.length === 0) return;

  // ⚠️ 오프라인에서는 commit 이 서버 확인까지 지연됨(로컬 캐시에는 즉시 기록).
  //    따라서 await 하지 않고, 성공 시 상태 갱신 / 실패 시 미러 롤백 후 재시도.
  Promise.all(commits).then(function () {
    localStorage.setItem('last-backup-time', new Date().toISOString());
    updateBackupStatus();
    if (typeof refreshSettingsBackupStatus === 'function') refreshSettingsBackupStatus();
    console.log('☁️ Firestore 푸시 완료');
  }).catch(function (e) {
    console.error('☁️ Firestore 푸시 실패 → 잠시 후 재시도:', e);
    _fsMirror = prevMirror;          // 실패분이 다음 diff 에 다시 포함되도록 롤백
    setTimeout(scheduleAutoBackup, 5000);
  });
}

// 기존 코드(saveTasks·setItem 훅)가 호출하던 이름 그대로 유지 — 디바운스 푸시
function scheduleAutoBackup() {
  if (!_fsStarted) return;
  if (_fsPushTimer) clearTimeout(_fsPushTimer);
  _fsPushTimer = setTimeout(function () { _pushChanges(false); }, 2000);
}

// 수동 '지금 동기화' 버튼
async function forceSyncNow() {
  if (!_fsStarted) { alert('먼저 구글 로그인을 해주세요! 🔑'); return; }
  if (_fsPushTimer) clearTimeout(_fsPushTimer);
  await _pushChanges(false);
  if (typeof refreshSettingsBackupStatus === 'function') refreshSettingsBackupStatus();
  console.log('☁️ 수동 동기화 완료');
}

// ============================================
//  📥 실시간 수신 (Firestore → localStorage → 화면)
// ============================================

function _applyLocal(lsKey, value) {
  window.__applyingRestore = true;    // setItem 훅이 '사용자 변경'으로 세지 않도록
  try {
    if (value === null) localStorage.removeItem(lsKey);
    else localStorage.setItem(lsKey, typeof value === 'string' ? value : JSON.stringify(value));
  } finally { window.__applyingRestore = false; }
  _refreshAfterRemoteChange(lsKey);
}

// 원격 변경 반영 후 화면 갱신 (열려있는 화면만 다시 그림)
function _refreshAfterRemoteChange(lsKey) {
  try {
    if (lsKey === 'my-tasklog-data') {
      if (typeof loadTasks === 'function') loadTasks();
      if (typeof renderTasks === 'function') renderTasks();
      if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
    }
    // 다른 페이지들은 열 때마다 localStorage에서 다시 읽으므로 자동 반영됨.
    // 필요한 모듈이 구독할 수 있도록 이벤트도 발행.
    document.dispatchEvent(new CustomEvent('tasklog-remote-update', { detail: { key: lsKey } }));
  } catch (e) { console.warn('원격 변경 화면 갱신 실패:', e); }
}

function _attachListeners() {
  // 1) 항목 단위 컬렉션
  FS_ITEM_MAPS.forEach(function (map) {
    var unsub = _collRef(map.coll).onSnapshot(function (snap) {
      if (snap.metadata.hasPendingWrites) return;   // 내 쓰기의 메아리는 무시
      var repr = {}, reprJson = {};
      snap.forEach(function (doc) {
        var item = _unwrapItem(doc.data());
        repr[doc.id] = item;
        reprJson[doc.id] = _stableStringify(item);
      });
      _fsMirror[map.lsKey] = reprJson;

      var value = _reprToLocalValue(map, repr);
      var localRaw = localStorage.getItem(map.lsKey);
      var localVal = null;
      try { localVal = localRaw ? JSON.parse(localRaw) : (map.kind === 'array' ? [] : {}); }
      catch (e) { localVal = null; }
      if (_stableStringify(value) === _stableStringify(localVal)) return;   // 이미 같음

      _applyLocal(map.lsKey, value);
      console.log('📥 원격 변경 반영:', map.lsKey, '(' + snap.size + '개 문서)');
    }, function (err) { console.error('onSnapshot 오류(' + map.coll + '):', err); });
    _fsUnsubs.push(unsub);
  });

  // 2) 단일 문서 컬렉션
  var unsubDocs = _collRef('docs').onSnapshot(function (snap) {
    if (snap.metadata.hasPendingWrites) return;
    snap.docChanges().forEach(function (change) {
      var d = change.doc.data() || {};
      var key = d.key;
      if (!key || FS_DOC_KEYS.indexOf(key) === -1) return;   // _meta 등 무시
      if (change.type === 'removed') {
        _fsMirror[key] = null;
        if (localStorage.getItem(key) !== null) _applyLocal(key, null);
        return;
      }
      _fsMirror[key] = d.raw;
      if (localStorage.getItem(key) !== d.raw) {
        _applyLocal(key, d.raw);
        console.log('📥 원격 설정 반영:', key);
      }
    });
  }, function (err) { console.error('onSnapshot 오류(docs):', err); });
  _fsUnsubs.push(unsubDocs);
}

// ============================================
//  🚚 일회성 마이그레이션 (로컬/드라이브 백업 → Firestore)
// ============================================

function _hasLocalData() {
  var keys = ['my-tasklog-data', 'my-tasklog-notes', 'my-tasklog-journal',
              'my-tasklog-mandalart', 'my-tasklog-lifewheel', 'tasklog-mvv-data'];
  return keys.some(function (k) {
    var v = localStorage.getItem(k);
    return v && v !== '[]' && v !== '{}';
  });
}

async function _migrateIfNeeded() {
  var metaRef = _docRef('_meta');
  try {
    var meta = await metaRef.get();
    if (meta.exists) return;                       // 이미 마이그레이션됨 → 서버가 원본
    if (_hasLocalData()) {
      console.log('🚚 첫 로그인 — 로컬 데이터를 Firestore로 마이그레이션...');
      await _pushChanges(true);                    // 전체 강제 푸시
      console.log('🚚 마이그레이션 완료');
    }
    await metaRef.set({
      key: '_meta',
      migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
      appVersion: 'firestore-v1'
    });
  } catch (e) {
    console.warn('🚚 마이그레이션 확인 실패(오프라인?) — 실시간 동기화는 계속 진행:', e);
  }
}

// ============================================
//  ▶️ 시작 / ⏹️ 중지
// ============================================

async function startFirestoreSync(uid) {
  if (!db) { console.error('Firestore 미초기화 — 동기화 불가'); return; }
  if (_fsStarted && _fsUid === uid) return;
  stopFirestoreSync();

  _fsUid = uid;
  _fsStarted = true;
  console.log('🔄 Firestore 동기화 시작:', uid);

  await _migrateIfNeeded();
  _attachListeners();
  window.__backupReady = true;    // 이후부터 사용자 저장을 '변경'으로 감지 → 자동 푸시
}

function stopFirestoreSync() {
  _fsUnsubs.forEach(function (u) { try { u(); } catch (e) {} });
  _fsUnsubs = [];
  if (_fsPushTimer) { clearTimeout(_fsPushTimer); _fsPushTimer = null; }
  _fsMirror = {};
  _fsUid = null;
  _fsStarted = false;
}

// ============================================
//  🕐 상태 표시 + 하위 호환 별칭
// ============================================

function updateBackupStatus() {
  var statusEl = document.getElementById('backup-status');
  if (!statusEl) return;
  var last = localStorage.getItem('last-backup-time');
  if (last) {
    var date = new Date(last);
    var timeStr = (date.getMonth() + 1) + '/' + date.getDate() + ' '
      + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    statusEl.textContent = '마지막 동기화: ' + timeStr;
  } else {
    statusEl.textContent = '동기화 기록 없음';
  }
}

// script.js 초기화부에서 호출되던 이름 — 이제 할 일 없음(동기화는 로그인 시 자동 시작)
function initAutoBackup() { updateBackupStatus(); }

// JSON 백업 파일 가져오기(applyBackupData) 후 자동으로 Firestore에 푸시
(function () {
  if (typeof applyBackupData !== 'function') return;
  var _orig = applyBackupData;
  applyBackupData = function (backup) {
    var r = _orig(backup);
    try { if (_fsStarted) { if (_fsPushTimer) clearTimeout(_fsPushTimer); _pushChanges(false); } }
    catch (e) { console.warn('가져오기 후 푸시 실패:', e); }
    return r;
  };
})();
