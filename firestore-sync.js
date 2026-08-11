// ============================================
//  ☁️ Firestore 동기화 계층 v2 — 3-way 병합
// --------------------------------------------
//  구조
//   users/{uid}/tasks/{taskId}      ← my-tasklog-data 배열의 항목 1개 = 문서 1개
//   users/{uid}/notes/{noteId}      ← my-tasklog-notes 배열의 항목 1개 = 문서 1개
//   users/{uid}/logs/{weekKey}      ← my-tasklog-journal 의 주차 1개 = 문서 1개
//   users/{uid}/mandalart/{year}    ← my-tasklog-mandalart 의 연도 1개 = 문서 1개
//   users/{uid}/docs/{name}         ← 라이프휠·MVV·설정 등 단일 객체/문자열
//   users/{uid}/docs/_meta          ← 스키마 버전 기록
//
//  ⚠️ v1 이 데이터를 잃던 이유 — 되풀이하지 말 것
//   1) 수신할 때 서버 값으로 로컬 전체를 덮어썼다 → 아직 푸시 못 한 내 변경이 증발
//   2) "미러에 있고 로컬에 없으면 삭제" 로 서버 문서를 지웠다 → 다른 기기가 만든 항목이 소멸
//   3) 화면 모듈이 들고 있는 메모리 사본(tasks·notesData·journalData·mandalarts)을
//      다시 읽지 않았다 → 낡은 사본을 통째로 다시 쓰면서 (2)의 삭제를 유발
//   4) hasPendingWrites 인 스냅샷을 통째로 버렸다 → 그 안에 있던 남의 변경도 같이 버려짐
//
//  v2 의 규칙
//   ▸ 수신·송신이 한 경로(_syncNow)로 합쳐졌다. 언제나 "병합 후 푸시".
//   ▸ 병합은 3-way — 로컬 / 미러(마지막으로 아는 서버 상태) / 서버 를 비교한다.
//       로컬만 변경 → 푸시      원격만 변경 → 수용      둘 다 변경 → _ua 최신 우선
//       삭제 vs 편집이 부딪히면 언제나 '편집'이 이긴다 (유실보다 되살아나는 편이 낫다)
//   ▸ 삭제는 물리 삭제가 아니라 툼스톤({__deleted:true}). 30일 뒤 정리한다.
//   ▸ 원격 변경을 반영하면 각 모듈의 loader 를 다시 돌려 메모리 사본을 갱신한다.
//   ▸ 미러는 항목 해시로 localStorage 에 남는다 — 앱을 껐다 켜도 병합 기준점이 유지된다.
// ============================================

var FS_SCHEMA            = 2;                        // docs/_meta.schema
var FS_PUSH_DEBOUNCE_MS  = 2000;
var FS_TOMB_TTL_MS       = 30 * 24 * 60 * 60 * 1000; // 툼스톤 보관 기간
// 원격 변경을 반영한 뒤 이 시간 안에 로컬이 "반영 직전 값"으로 정확히 되돌아가면,
// 사용자의 수정이 아니라 낡은 메모리 사본이 통째로 덮어쓴 것으로 본다.
//  ▸ 모듈 재적재가 1차 방어이고, 이건 그 사이의 경합(진행 중이던 드래그·모달 저장)만
//    막는 그물이다. 그래서 창을 짧게 둔다.
//  ▸ "직전 값과 정확히 같을 때"로 좁혔기 때문에, 사용자가 새로 고친 값은 걸리지 않는다.
//    다른 기기의 변경을 일부러 되돌리는 경우만 이 시간 동안 막힌다.
var FS_RESTORE_WINDOW_MS = 20 * 1000;
var FS_MIRROR_KEY        = 'tasklog-sync-mirror';

// ── 매핑 정의 ────────────────────────────────
// 항목 단위 컬렉션 (배열/객체의 원소 1개 = 문서 1개)
//  idField : 문서 ID 로 쓸 필드. 만다라트는 연도가 자연스러운 키다.
var FS_ITEM_MAPS = [
  { lsKey: 'my-tasklog-data',      coll: 'tasks',     kind: 'array',  idField: 'id'   },
  { lsKey: 'my-tasklog-notes',     coll: 'notes',     kind: 'array',  idField: 'id'   },
  { lsKey: 'my-tasklog-journal',   coll: 'logs',      kind: 'object'                  },
  { lsKey: 'my-tasklog-mandalart', coll: 'mandalart', kind: 'array',  idField: 'year' },
];

// 단일 문서 키 (users/{uid}/docs/{docId} 에 원문 문자열 그대로 저장 — 무손실)
var FS_DOC_KEYS = [
  'my-tasklog-lifewheel', 'my-tasklog-corevalues',
  'tasklog-mvv-data', 'todoCols2', 'todoProjHidden', 'mdtFavActions',
  'my-tasklog-nickname',
  'app-theme', 'app-lang', 'app-week-start', 'app-font-size',
  'app-notif-deadline', 'app-notif-journal',
  'app-cal-sync', 'app-cal-provider', 'app-cal-direction', 'app-cal-items',
];

// 원격 변경을 반영한 뒤 다시 돌려야 하는 각 모듈의 적재 함수.
//  ⚠️ 이걸 빠뜨리면 화면 모듈이 낡은 배열을 계속 들고 있다가 통째로 다시 써서
//     다른 기기의 변경을 지운다. v1 의 실제 유실 원인이었다.
var FS_RELOADERS = {
  'my-tasklog-data':       ['loadTasks'],
  'my-tasklog-notes':      ['loadNotes'],
  'my-tasklog-journal':    ['loadJournal'],
  'my-tasklog-mandalart':  ['loadMandalarts'],
  'my-tasklog-lifewheel':  ['loadLifeWheel'],
  'my-tasklog-corevalues': ['loadCoreValues'],
  'tasklog-mvv-data':      ['loadMVV'],
  'app-theme':             ['initTheme'],
};

// localStorage 키 → 안전한 문서 ID
function _docIdForKey(key) { return String(key).replace(/[\/\.]/g, '_'); }

// ── 내부 상태 ────────────────────────────────
var _fsUid        = null;   // 현재 동기화 중인 uid
var _fsUnsubs     = [];     // onSnapshot 해제 함수들
var _fsStarted    = false;
var _fsPushTimer  = null;   // 디바운스 타이머
var _syncing      = false;  // _syncNow 재진입 방지
var _syncAgain    = false;

// 미러 = "서버가 갖고 있다고 내가 아는 상태". 내용 비교만 필요하므로 해시로 갖는다.
//   items[lsKey][docId] = 해시 · itemUa[lsKey][docId] = 서버 _ua
//   docs[key] = 해시      · docUa[key] = 서버 _ua
var _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {} };

var _lastServer     = {};    // { lsKey: {docId: {item?, ua, deleted?}} }  null 이면 '아직 모름'
var _lastServerDocs = null;  // { key: {raw, ua} }                          null 이면 '아직 모름'
var _pendingIds     = {};    // { lsKey: {docId:true} } 내 미확정 쓰기 — 병합에서 제외
var _pendingDocIds  = {};    // { key: true }
var _pendingUa      = {};    // { lsKey: {docId: ms} } 로컬 변경을 처음 인지한 시각
var _pendingDocUa   = {};    // { key: ms }
var _preRemote      = {};    // { lsKey: {docId: {hash, at}} } 원격 반영 직전의 로컬 값
var _lastLocalWrite = {};    // { key: ms } 사용자가 그 키를 마지막으로 쓴 시각(충돌 판정용)
var _syncLog        = [];    // 진단용 최근 기록

// ============================================
//  🧮 유틸
// ============================================

// 키 순서를 정렬해 항상 같은 문자열이 나오는 stringify (diff 오탐 방지)
function _stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) {
    return JSON.stringify(k) + ':' + _stableStringify(v[k]);
  }).join(',') + '}';
}

// 미러에는 내용이 아니라 해시만 둔다 — localStorage 를 두 배로 쓰지 않기 위해서다.
// 병합에 필요한 건 "같은가/다른가" 뿐이라 해시로 충분하다.
function _hash(str) {
  var h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 ^ c) * 0x85ebca6b) >>> 0;
  }
  return h1.toString(36) + '.' + h2.toString(36);
}
function _hashItem(item) { return _hash(_stableStringify(item)); }

// Firestore에 넣을 수 있게 정리 (undefined 제거). 객체가 아니면 __raw 로 감싼다.
function _sanitizeItem(v) {
  var clean = JSON.parse(JSON.stringify(v === undefined ? null : v));
  if (clean !== null && typeof clean === 'object' && !Array.isArray(clean)) return clean;
  return { __raw: JSON.stringify(clean) };
}
// 문서 → 앱 항목. 동기화용 메타(_ua·__deleted)는 앱 데이터에 새어 나가면 안 된다.
function _unwrapItem(data) {
  if (!data || typeof data !== 'object') return data;
  if (typeof data.__raw === 'string') {
    try { return JSON.parse(data.__raw); } catch (e) { return null; }
  }
  var out = {};
  Object.keys(data).forEach(function (k) {
    if (k === '_ua' || k === '__deleted') return;
    out[k] = data[k];
  });
  return out;
}

// 사용자가 그 키를 마지막으로 쓴 시각을 기록해 둔다.
//  ⚠️ 이게 없으면 "아직 못 올린 로컬 변경"의 시각이 0 이라, 충돌이 나면 언제나
//     서버가 이긴다 — 방금 입력한 값이 소리 없이 사라진다.
(function () {
  if (typeof Storage === 'undefined' || !Storage.prototype) return;
  if (window.__fsWriteObserverHooked) return;
  window.__fsWriteObserverHooked = true;
  var _orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    _orig.apply(this, arguments);
    try {
      if (this === window.localStorage && !window.__applyingRestore) {
        _lastLocalWrite[key] = Date.now();
      }
    } catch (e) {}
  };
})();

function _logSync(msg) {
  _syncLog.push(new Date().toISOString().slice(11, 19) + ' ' + msg);
  if (_syncLog.length > 60) _syncLog.shift();
}

// ── localStorage → {docId: item} 표현으로 변환 ──
function _idOf(map, item) {
  var v = item ? item[map.idField] : null;
  // id 가 없는 항목: 내용 해시를 쓴다. v1 은 난수를 써서 푸시할 때마다
  // 새 문서가 생기고 옛 문서가 지워졌다.
  if (v === undefined || v === null || v === '') return 'h' + _hashItem(item);
  return String(v);
}

//  반환 { byId:{docId:item}, order:[docId], exists:로컬 키가 있었는가 }
function _localRepr(map) {
  var raw = localStorage.getItem(map.lsKey);
  var out = { byId: {}, order: [], exists: raw !== null };
  if (!raw) return out;
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return out; }
  if (map.kind === 'array') {
    if (!Array.isArray(parsed)) return out;
    parsed.forEach(function (item) {
      if (item === null || item === undefined) return;
      var id = _docIdForKey(_idOf(map, item));
      if (out.byId[id] === undefined) out.order.push(id);
      out.byId[id] = item;
    });
  } else {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    Object.keys(parsed).forEach(function (k) {
      var id = _docIdForKey(k);
      out.order.push(id);
      out.byId[id] = { __key: k, __value: parsed[k] };
    });
  }
  return out;
}

// {docId: item} → localStorage 값으로 역변환.
//  ⚠️ 순서는 지금 로컬 순서를 그대로 따르고, 새로 받은 것만 뒤에 붙인다.
//     매번 정렬하면 내용이 같아도 문자열이 달라져 쓸데없이 다시 쓰고 화면이 다시 그려진다.
function _reprToLocalValue(map, repr, localOrder) {
  if (map.kind === 'array') {
    var used = {}, arr = [];
    (localOrder || []).forEach(function (id) {
      if (repr[id] !== undefined && !used[id]) { used[id] = 1; arr.push(repr[id]); }
    });
    var rest = Object.keys(repr).filter(function (id) { return !used[id]; });
    var f = map.idField;
    rest.sort(function (a, b) {
      var na = Number(repr[a] && repr[a][f]), nb = Number(repr[b] && repr[b][f]);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a < b ? -1 : 1;
    });
    rest.forEach(function (id) { arr.push(repr[id]); });
    return arr;
  }
  var obj = {};
  var ids = (localOrder || []).filter(function (id) { return repr[id] !== undefined; });
  Object.keys(repr).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
  ids.forEach(function (id) {
    var d = repr[id];
    if (d && d.__key !== undefined) obj[d.__key] = d.__value;
    else obj[id] = d;
  });
  return obj;
}

// ── Firestore 참조 헬퍼 ──────────────────────
function _userRef()     { return db.collection('users').doc(_fsUid); }
function _collRef(name) { return _userRef().collection(name); }
function _docRef(docId) { return _collRef('docs').doc(docId); }

// ============================================
//  🪞 미러 (병합 기준점) — localStorage 에 영속
// ============================================

function _mirrorItems(lsKey) {
  if (!_fsMirror.items[lsKey]) _fsMirror.items[lsKey] = {};
  return _fsMirror.items[lsKey];
}
function _mirrorItemUa(lsKey) {
  if (!_fsMirror.itemUa[lsKey]) _fsMirror.itemUa[lsKey] = {};
  return _fsMirror.itemUa[lsKey];
}

var _mirrorSaveTimer = null;
function _saveMirrorSoon() {
  if (_mirrorSaveTimer) return;
  _mirrorSaveTimer = setTimeout(function () {
    _mirrorSaveTimer = null;
    if (!_fsUid) return;
    try {
      // ⚠️ FS_MIRROR_KEY 는 BACKUP_REGISTRY 에 없다 → setItem 훅이 푸시를 예약하지 않는다.
      localStorage.setItem(FS_MIRROR_KEY,
        JSON.stringify({ uid: _fsUid, schema: FS_SCHEMA, m: _fsMirror }));
    } catch (e) {
      console.warn('☁️ 동기화 기준 상태 저장 실패(용량?):', e);
    }
  }, 800);
}

function _loadMirror(uid) {
  _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {} };
  try {
    var o = JSON.parse(localStorage.getItem(FS_MIRROR_KEY) || 'null');
    if (o && o.uid === uid && o.schema === FS_SCHEMA && o.m && o.m.items) {
      _fsMirror = {
        items:  o.m.items  || {}, itemUa: o.m.itemUa || {},
        docs:   o.m.docs   || {}, docUa:  o.m.docUa  || {}
      };
      return true;
    }
  } catch (e) {}
  return false;
}

// ── 원격 변경을 반영하기 '직전'의 로컬 값을 기억한다 ──
//  화면 모듈이 아직 들고 있을 수 있는 값이 바로 이것이다. 잠시 뒤 로컬이 정확히
//  이 값으로 돌아왔다면 사용자가 고친 게 아니라 낡은 사본이 덮어쓴 것이다.
//  (hash 가 null = 그때 로컬에 없던 항목 → 원격이 새로 추가해 준 것)
function _markPreRemote(lsKey, id, prevHash) {
  if (!_preRemote[lsKey]) _preRemote[lsKey] = {};
  _preRemote[lsKey][id] = { hash: prevHash, at: Date.now() };
}
function _isStaleOverwrite(lsKey, id, localHash) {
  var p = _preRemote[lsKey] && _preRemote[lsKey][id];
  if (!p) return false;
  if ((Date.now() - p.at) >= FS_RESTORE_WINDOW_MS) return false;
  return p.hash === localHash;
}

function _touchPending(lsKey, id) {
  if (!_pendingUa[lsKey]) _pendingUa[lsKey] = {};
  if (!_pendingUa[lsKey][id]) _pendingUa[lsKey][id] = Date.now();
}
function _clearPending(lsKey, id) {
  if (_pendingUa[lsKey]) delete _pendingUa[lsKey][id];
}

// ============================================
//  🔀 3-way 병합 (항목 단위 컬렉션)
// ============================================
//  반환 { out:{docId:item}, order:[docId], push:{docId:item|null}, restored, conflicts }
function _mergeMap(map) {
  var lsKey  = map.lsKey;
  var repr   = _localRepr(map);
  var local  = repr.byId;
  var server = _lastServer[lsKey] || null;      // null = 아직 서버 상태를 모름
  var pend   = _pendingIds[lsKey] || {};
  var mir    = _mirrorItems(lsKey);
  var mua    = _mirrorItemUa(lsKey);
  var out = {}, push = {}, restored = 0, conflicts = 0, pushCount = 0;

  // ⚠️ 서버 상태를 한 번도 못 본 동안에는 아무것도 올리지 않는다.
  //    미러가 비어 있으면 "새 항목"과 "그냥 아직 모름"을 구분할 수 없어서,
  //    낡은 로컬을 서버에 밀어 넣어 최신 데이터를 덮을 위험이 있다.
  //    리스너는 (오프라인이어도) 캐시 스냅샷을 곧바로 주므로 잠깐 미루는 것뿐이다.
  if (server === null) {
    return { out: local, order: repr.order, push: {}, pushCount: 0, restored: 0, conflicts: 0,
             exists: repr.exists };
  }

  var ids = {};
  Object.keys(local).forEach(function (id) { ids[id] = 1; });
  Object.keys(mir).forEach(function (id) { ids[id] = 1; });
  Object.keys(server).forEach(function (id) { ids[id] = 1; });

  Object.keys(ids).forEach(function (id) {
    var l = local[id];

    // 내가 방금 쓴 것이 아직 서버에서 확정되지 않았다 → 이번 판단에서 제외
    if (pend[id]) { if (l !== undefined) out[id] = l; return; }

    var sEntry = server[id];
    var s  = (sEntry && !sEntry.deleted) ? sEntry.item : undefined;
    var lh = (l !== undefined) ? _hashItem(l) : null;
    var sh = (s !== undefined) ? _hashItem(s) : null;
    var mh = (mir[id] !== undefined) ? mir[id] : null;

    // 미러 = "서버가 지금 갖고 있다고 아는 상태" 로 갱신한다.
    // (푸시하는 항목은 _queueItemOps 가 방금 올린 값으로 다시 덮어쓴다)
    if (sh !== null) { mir[id] = sh; mua[id] = (sEntry && sEntry.ua) || 0; }
    else { delete mir[id]; delete mua[id]; }

    if (lh === sh) {                       // 이미 같음
      if (l !== undefined) out[id] = l;
      _clearPending(lsKey, id);
      return;
    }

    var localChanged  = (lh !== mh);
    var serverChanged = (sh !== mh);

    if (!localChanged && serverChanged) {  // 원격만 변경 → 수용 (s 없음 = 원격 삭제)
      if (s !== undefined) { out[id] = s; _markPreRemote(lsKey, id, lh); }
      return;
    }

    if (localChanged && !serverChanged) {  // 로컬만 변경 — 진짜 수정/삭제인가?
      // 방금 원격 변경을 반영하기 직전의 값으로 정확히 되돌아왔다
      //  = 화면 모듈이 들고 있던 낡은 사본이 통째로 덮어쓴 것이다.
      //    그대로 올리면 다른 기기의 변경이 서버에서 지워진다 (v1 의 유실 원인).
      if (s !== undefined && _isStaleOverwrite(lsKey, id, lh)) {
        out[id] = s; restored++;
        return;
      }
      if (l !== undefined) {
        out[id] = l; push[id] = l; pushCount++; _touchPending(lsKey, id);
        return;
      }
      push[id] = null; pushCount++;        // 진짜 삭제 → 툼스톤
      return;
    }

    // 양쪽 다 변경 — 충돌
    conflicts++;
    if (l === undefined) { if (s !== undefined) { out[id] = s; restored++; } return; }  // 삭제 vs 편집 → 편집
    if (s === undefined) { out[id] = l; push[id] = l; pushCount++; return; }            // 편집 vs 삭제 → 편집
    var sua = (sEntry && sEntry.ua) || 0;
    var lua = (_pendingUa[lsKey] && _pendingUa[lsKey][id]) || _lastLocalWrite[lsKey] || 0;
    if (sua > lua) { out[id] = s; _markPreRemote(lsKey, id, lh); _clearPending(lsKey, id); }
    else { out[id] = l; push[id] = l; pushCount++; }
  });

  return { out: out, order: repr.order, push: push, pushCount: pushCount,
           restored: restored, conflicts: conflicts, exists: repr.exists };
}

// 병합 결과를 localStorage 에 반영 (바뀐 게 있으면 true)
function _applyMerged(map, r) {
  // 원래 없던 키를 빈 배열/객체로 만들어 두지 않는다 (쓸데없는 쓰기·화면 갱신 방지)
  if (!r.exists && Object.keys(r.out).length === 0) return false;
  var next = JSON.stringify(_reprToLocalValue(map, r.out, r.order));
  if (next === localStorage.getItem(map.lsKey)) return false;
  window.__applyingRestore = true;          // setItem 훅이 '사용자 변경'으로 세지 않도록
  try { localStorage.setItem(map.lsKey, next); }
  finally { window.__applyingRestore = false; }
  return true;
}

// 푸시할 것들을 배치에 싣는다
function _queueItemOps(map, pushSet, addOp) {
  var mir = _mirrorItems(map.lsKey), mua = _mirrorItemUa(map.lsKey);
  var now = Date.now();
  Object.keys(pushSet).forEach(function (id) {
    var item = pushSet[id];
    if (item === null) {
      // 물리 삭제 대신 툼스톤 — 다른 기기가 "내가 모르는 새 항목"으로 되살리지 않도록
      addOp(function (b) { b.set(_collRef(map.coll).doc(id), { __deleted: true, _ua: now }); });
      delete mir[id]; delete mua[id];
      _logSync('삭제 ' + map.coll + '/' + id);
    } else {
      var data = _sanitizeItem(item);
      data._ua = now;
      addOp(function (b) { b.set(_collRef(map.coll).doc(id), data); });
      mir[id] = _hashItem(item); mua[id] = now;
    }
  });
}

// ============================================
//  🔀 단일 문서 키 (설정·라이프휠·MVV) — 문서 단위 최신 우선
// ============================================

function _applyDocValue(key, raw) {
  window.__applyingRestore = true;
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } finally { window.__applyingRestore = false; }
}

function _syncDocKeys(addOp) {
  var touched = [];
  var now = Date.now();
  var server = _lastServerDocs;              // null = 아직 모름

  FS_DOC_KEYS.forEach(function (key) {
    if (_pendingDocIds[key]) return;

    var localRaw = localStorage.getItem(key);
    var lh = (localRaw === null) ? null : _hash(localRaw);
    var mh = (_fsMirror.docs[key] !== undefined) ? _fsMirror.docs[key] : null;

    function pushLocal() {
      var docId = _docIdForKey(key);
      if (localRaw === null) {
        addOp(function (b) { b.delete(_docRef(docId)); });
        _fsMirror.docs[key] = null;
      } else {
        addOp(function (b) {
          b.set(_docRef(docId), {
            key: key, raw: localRaw, _ua: now,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        _fsMirror.docs[key] = lh;
      }
      _fsMirror.docUa[key] = now;
      _pendingDocUa[key] = now;
    }

    // 항목 컬렉션과 같은 이유로, 서버 상태를 보기 전에는 아무것도 올리지 않는다
    if (server === null) return;

    var sEntry = server[key];
    var sRaw = sEntry ? sEntry.raw : null;
    var sh = (sRaw === null || sRaw === undefined) ? null : _hash(sRaw);

    if (lh === sh) { _fsMirror.docs[key] = sh; delete _pendingDocUa[key]; return; }

    var localChanged  = (lh !== mh);
    var serverChanged = (sh !== mh);

    if (!localChanged && serverChanged) {
      _applyDocValue(key, sRaw === undefined ? null : sRaw);
      _fsMirror.docs[key] = sh;
      _fsMirror.docUa[key] = (sEntry && sEntry.ua) || 0;
      touched.push(key);
      return;
    }
    if (localChanged && !serverChanged) { pushLocal(); return; }

    // 충돌 → 최신 우선
    var sua = (sEntry && sEntry.ua) || 0;
    var lua = _pendingDocUa[key] || _lastLocalWrite[key] || 0;
    if (sua > lua) {
      _applyDocValue(key, sRaw === undefined ? null : sRaw);
      _fsMirror.docs[key] = sh; _fsMirror.docUa[key] = sua;
      touched.push(key);
      _logSync('충돌(설정) ' + key + ' → 서버 채택');
    } else {
      pushLocal();
      _logSync('충돌(설정) ' + key + ' → 로컬 채택');
    }
  });

  return touched;
}

// ============================================
//  🔁 동기화 한 바퀴 — 병합 → 로컬 반영 → 푸시
// ============================================

function _syncNow() {
  if (!_fsStarted || !_fsUid || !db) return;
  if (_syncing) { _syncAgain = true; return; }
  _syncing = true;

  var prevMirror = JSON.parse(JSON.stringify(_fsMirror));   // 실패 시 되돌리기용
  var batch = db.batch(), ops = 0, commits = [];
  function addOp(fn) {
    fn(batch); ops++;
    if (ops >= 400) { commits.push(batch.commit()); batch = db.batch(); ops = 0; }
  }

  var touched = [];
  try {
    FS_ITEM_MAPS.forEach(function (map) {
      var r = _mergeMap(map);
      if (_applyMerged(map, r)) touched.push(map.lsKey);
      _queueItemOps(map, r.push, addOp);
      if (r.restored) {
        console.warn('🛟 낡은 사본이 지울 뻔한 ' + map.coll + ' 항목 ' + r.restored + '건을 되살렸습니다');
        _logSync('복구 ' + map.coll + ' ' + r.restored + '건');
      }
      if (r.conflicts) _logSync('충돌 ' + map.coll + ' ' + r.conflicts + '건');
    });
    touched = touched.concat(_syncDocKeys(addOp));
  } catch (e) {
    console.error('☁️ 병합 중 오류:', e);
    _fsMirror = prevMirror;
    _syncing = false;
    return;
  }

  if (touched.length) _afterRemoteApply(touched);
  _saveMirrorSoon();

  if (ops > 0) commits.push(batch.commit());
  _syncing = false;
  if (_syncAgain) { _syncAgain = false; setTimeout(_syncNow, 0); }

  if (!commits.length) return;

  // ⚠️ 오프라인에서는 commit 이 서버 확인까지 지연된다(로컬 캐시에는 즉시 기록).
  //    await 하지 않고, 성공 시 상태 갱신 / 실패 시 미러 롤백 후 재시도.
  Promise.all(commits).then(function () {
    localStorage.setItem('last-backup-time', new Date().toISOString());
    updateBackupStatus();
    if (typeof refreshSettingsBackupStatus === 'function') refreshSettingsBackupStatus();
    console.log('☁️ Firestore 푸시 완료');
  }).catch(function (e) {
    console.error('☁️ Firestore 푸시 실패 → 잠시 후 재시도:', e);
    _fsMirror = prevMirror;           // 실패분이 다음 병합에 다시 포함되도록 롤백
    _saveMirrorSoon();
    setTimeout(scheduleAutoBackup, 5000);
  });
}

// 리스너가 부르는 짧은 디바운스. includeMetadataChanges 를 켜면 스냅샷이 잦게 오므로
// 몰아서 한 번만 돌린다.
var _syncSoonTimer = null;
function _syncSoon() {
  if (_syncSoonTimer) return;
  _syncSoonTimer = setTimeout(function () { _syncSoonTimer = null; _syncNow(); }, 150);
}

// 기존 코드(saveTasks·setItem 훅)가 호출하던 이름 그대로 유지 — 디바운스 동기화
function scheduleAutoBackup() {
  if (!_fsStarted) return;
  if (_fsPushTimer) clearTimeout(_fsPushTimer);
  _fsPushTimer = setTimeout(function () { _fsPushTimer = null; _syncNow(); }, FS_PUSH_DEBOUNCE_MS);
}

// 수동 '지금 동기화' 버튼
function forceSyncNow() {
  if (!_fsStarted) { alert('먼저 구글 로그인을 해주세요! 🔑'); return; }
  if (_fsPushTimer) { clearTimeout(_fsPushTimer); _fsPushTimer = null; }
  _syncNow();
  if (typeof refreshSettingsBackupStatus === 'function') refreshSettingsBackupStatus();
  console.log('☁️ 수동 동기화 완료');
}

// ============================================
//  🖥️ 원격 반영 후 — 메모리 사본 갱신 + 화면 갱신
// ============================================

function _isEditing() {
  var el = document.activeElement;
  if (!el) return false;
  var tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

var _rerenderTimer = null;
function _rerenderCurrentView() {
  if (_rerenderTimer) { clearTimeout(_rerenderTimer); _rerenderTimer = null; }
  // 입력 중에 화면을 갈아끼우면 타이핑하던 내용이 날아간다 → 잠시 뒤 다시 시도
  if (_isEditing()) { _rerenderTimer = setTimeout(_rerenderCurrentView, 3000); return; }
  try {
    if (typeof MENU_RENDERERS === 'undefined' || typeof currentMenu === 'undefined') return;
    var fn = MENU_RENDERERS[currentMenu];
    if (fn && typeof window[fn] === 'function') window[fn]();
  } catch (e) { console.warn('원격 반영 후 화면 갱신 실패:', e); }
}

function _afterRemoteApply(keys) {
  keys.forEach(function (k) {
    (FS_RELOADERS[k] || []).forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); }
      catch (e) { console.warn('원격 반영 후 재적재 실패(' + fn + '):', e); }
    });
    try { document.dispatchEvent(new CustomEvent('tasklog-remote-update', { detail: { key: k } })); }
    catch (e) {}
  });
  if (keys.indexOf('my-tasklog-data') >= 0) {
    try { if (typeof renderTasks === 'function') renderTasks(); } catch (e) {}
    try { if (typeof updateCategoryCounts === 'function') updateCategoryCounts(); } catch (e) {}
  }
  _rerenderCurrentView();
  console.log('📥 원격 변경 반영:', keys.join(', '));
}

// ============================================
//  📡 실시간 수신
// ============================================

function _cleanupTombstones(coll, ids) {
  // 오래된 툼스톤 정리. 실패해도 그만이라 조용히 처리한다.
  try {
    var batch = db.batch();
    ids.slice(0, 100).forEach(function (id) { batch.delete(_collRef(coll).doc(id)); });
    batch.commit().catch(function () {});
  } catch (e) {}
}

function _attachListeners() {
  FS_ITEM_MAPS.forEach(function (map) {
    // ⚠️ includeMetadataChanges 가 있어야 내 쓰기가 확정된 뒤 스냅샷이 한 번 더 온다.
    //    v1 은 이게 없어서, 미확정 구간에 도착한 남의 변경이 영영 반영되지 않았다.
    var unsub = _collRef(map.coll).onSnapshot({ includeMetadataChanges: true }, function (snap) {
      var server = {}, pend = {}, tombs = [];
      var cutoff = Date.now() - FS_TOMB_TTL_MS;
      snap.forEach(function (doc) {
        // 통째로 버리지 않는다 — 미확정인 '그 문서'만 이번 판단에서 뺀다
        if (doc.metadata.hasPendingWrites) { pend[doc.id] = true; return; }
        var d = doc.data() || {};
        if (d.__deleted) {
          server[doc.id] = { deleted: true, ua: d._ua || 0 };
          if ((d._ua || 0) && (d._ua < cutoff)) tombs.push(doc.id);
          return;
        }
        server[doc.id] = { item: _unwrapItem(d), ua: d._ua || 0 };
      });
      _lastServer[map.lsKey] = server;
      _pendingIds[map.lsKey] = pend;
      _syncSoon();
      if (tombs.length) _cleanupTombstones(map.coll, tombs);
    }, function (err) { console.error('onSnapshot 오류(' + map.coll + '):', err); });
    _fsUnsubs.push(unsub);
  });

  var unsubDocs = _collRef('docs').onSnapshot({ includeMetadataChanges: true }, function (snap) {
    var server = {}, pend = {};
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      if (!d.key || FS_DOC_KEYS.indexOf(d.key) === -1) return;   // _meta 등 무시
      if (doc.metadata.hasPendingWrites) { pend[d.key] = true; return; }
      server[d.key] = { raw: (typeof d.raw === 'string' ? d.raw : null), ua: d._ua || 0 };
    });
    _lastServerDocs = server;
    _pendingDocIds  = pend;
    _syncSoon();
  }, function (err) { console.error('onSnapshot 오류(docs):', err); });
  _fsUnsubs.push(unsubDocs);
}

// ============================================
//  🚚 마이그레이션
// ============================================

function _hasLocalData() {
  var keys = ['my-tasklog-data', 'my-tasklog-notes', 'my-tasklog-journal',
              'my-tasklog-mandalart', 'my-tasklog-lifewheel', 'tasklog-mvv-data'];
  return keys.some(function (k) {
    var v = localStorage.getItem(k);
    return v && v !== '[]' && v !== '{}';
  });
}

// 만다라트: docs/my-tasklog-mandalart (통짜 문자열) → mandalart/{year} 로 분리.
//  통짜로 두면 두 기기가 서로 다른 해를 고쳐도 한쪽 편집분이 통째로 날아간다.
async function _splitMandalartDoc() {
  var legacyRef = _docRef(_docIdForKey('my-tasklog-mandalart'));
  var snap = await legacyRef.get();
  if (!snap.exists) return 0;

  var d = snap.data() || {};
  var legacyUa = d._ua || 0;
  var arr = [];
  try { arr = JSON.parse(d.raw || '[]'); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];

  // 이미 옮겨진 연도가 더 최신이면 건드리지 않는다 (구버전 클라이언트가 다시 쓴 경우 대비)
  var existing = {};
  var cur = await _collRef('mandalart').get();
  cur.forEach(function (doc) { existing[doc.id] = (doc.data() || {})._ua || 0; });

  var batch = db.batch(), n = 0;
  arr.forEach(function (m) {
    if (!m || m.year === undefined || m.year === null) return;
    var id = _docIdForKey(String(m.year));
    if (existing[id] !== undefined && existing[id] >= legacyUa) return;
    var data = _sanitizeItem(m);
    data._ua = legacyUa || Date.now();
    batch.set(_collRef('mandalart').doc(id), data);
    n++;
  });
  batch.delete(legacyRef);
  await batch.commit();
  console.log('🚚 만다라트를 연도별 문서로 분리했습니다 (' + n + '개 연도)');
  return n;
}

async function _migrateIfNeeded() {
  var metaRef = _docRef('_meta');
  try {
    var meta = await metaRef.get();
    var data = meta.exists ? (meta.data() || {}) : null;

    if (!meta.exists) {
      // 첫 로그인 — 서버가 비어 있다. "서버는 빈 상태" 를 기준으로 두면
      // 평소의 병합 규칙(로컬만 변경 → 푸시)이 그대로 전체 업로드가 된다.
      if (_hasLocalData()) {
        console.log('🚚 첫 로그인 — 로컬 데이터를 Firestore로 올립니다...');
        FS_ITEM_MAPS.forEach(function (map) { _lastServer[map.lsKey] = {}; });
        _lastServerDocs = {};
        _syncNow();
      }
      await metaRef.set({
        key: '_meta', schema: FS_SCHEMA,
        migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
        appVersion: 'firestore-v2'
      });
      return;
    }

    if ((data.schema || 1) < 2) {
      await _splitMandalartDoc();
      await metaRef.set({ schema: FS_SCHEMA, appVersion: 'firestore-v2' }, { merge: true });
    } else {
      // 스키마는 최신인데 구버전 클라이언트가 통짜 문서를 다시 써 둔 경우 회수
      await _splitMandalartDoc();
    }
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
  var reused = _loadMirror(uid);
  console.log('🔄 Firestore 동기화 시작:', uid, reused ? '(이전 기준 상태 이어받음)' : '(기준 상태 새로 만듦)');

  await _migrateIfNeeded();

  _attachListeners();
  window.__backupReady = true;    // 이후부터 사용자 저장을 '변경'으로 감지 → 자동 동기화
}

function stopFirestoreSync() {
  _fsUnsubs.forEach(function (u) { try { u(); } catch (e) {} });
  _fsUnsubs = [];
  if (_fsPushTimer)    { clearTimeout(_fsPushTimer);    _fsPushTimer = null; }
  if (_syncSoonTimer)  { clearTimeout(_syncSoonTimer);  _syncSoonTimer = null; }
  if (_mirrorSaveTimer){ clearTimeout(_mirrorSaveTimer);_mirrorSaveTimer = null; }
  if (_rerenderTimer)  { clearTimeout(_rerenderTimer);  _rerenderTimer = null; }
  _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {} };
  _lastServer = {}; _lastServerDocs = null;
  _pendingIds = {}; _pendingDocIds = {};
  _pendingUa = {};  _pendingDocUa = {};
  _preRemote = {};
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

// 진단용 — 콘솔에서 tasklogSyncStatus() 로 현재 상태를 본다
function tasklogSyncStatus() {
  var counts = {};
  FS_ITEM_MAPS.forEach(function (map) {
    counts[map.coll] = {
      로컬: Object.keys(_localRepr(map).byId).length,
      서버: _lastServer[map.lsKey] ? Object.keys(_lastServer[map.lsKey]).length : '모름',
      미러: Object.keys(_mirrorItems(map.lsKey)).length,
      미확정: Object.keys(_pendingIds[map.lsKey] || {}).length
    };
  });
  return { uid: _fsUid, 동작중: _fsStarted, 항목수: counts, 최근기록: _syncLog.slice(-20) };
}

// JSON 백업 파일 가져오기(applyBackupData) 후 자동으로 Firestore에 반영
(function () {
  if (typeof applyBackupData !== 'function') return;
  var _orig = applyBackupData;
  applyBackupData = function (backup) {
    var r = _orig(backup);
    try {
      if (_fsStarted) {
        if (_fsPushTimer) { clearTimeout(_fsPushTimer); _fsPushTimer = null; }
        _syncNow();
      }
    } catch (e) { console.warn('가져오기 후 동기화 실패:', e); }
    return r;
  };
})();
