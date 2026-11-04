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
//
//  v3 (2026-11-04) — "내가 고친 칸만 반영된다"
//   ▸ 서버에 쓸 때 통째로 덮어쓰지 않는다. 트랜잭션 안에서 서버 최신값을 읽어
//     기준값·내 값과 3-way 병합한 결과를 쓴다 (_pushItems · _pushDocs).
//     상대 변경을 아직 못 받은 기기가 써도 상대가 고친 칸이 지워지지 않는다.
//   ▸ 오프라인이면 올리지 않는다. 변경은 localStorage 에 남았다가 연결되면 같은 경로로 간다.
//     (SDK 오프라인 쓰기 대기열을 쓰면 재연결 때 낡은 문서가 더 최근 수정을 덮어쓴다)
//   ▸ 메모·MVV·라이프휠도 칸 단위로 병합한다.
//   ▸ 로그인 때 드라이브 백업으로 덮어쓰지 않는다(onSignInSync). 백업은 계속 올리되
//     서버 값을 받은 뒤에만 올린다. 수동 복원은 그대로다.
//   ▸ 관계없는 변경으로 화면을 다시 그리지 않고, 저장 전 입력을 지우지 않는다.
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
// 미러 자체의 형식 버전. 서버 스키마(FS_SCHEMA)와 별개다 — 미러는 로컬 캐시라
// 형식이 바뀌면 그냥 버리고 다시 만들면 된다(첫 스냅샷에서 즉시 복원된다).
var FS_MIRROR_VER        = 2;

// ── 매핑 정의 ────────────────────────────────
// 항목 단위 컬렉션 (배열/객체의 원소 1개 = 문서 1개)
//  idField : 문서 ID 로 쓸 필드. 만다라트는 연도가 자연스러운 키다.
//  deep : 충돌 시 문서를 통째로 고르지 않고 필드 단위로 병합한다.
//         이걸 켜면 미러에 해시뿐 아니라 '기준 내용'도 함께 보관한다(_fsMirror.base).
//         기준이 없으면 "저쪽이 추가한 것"과 "이쪽이 지운 것"을 구별할 수 없다.
var FS_ITEM_MAPS = [
  { lsKey: 'my-tasklog-data',      coll: 'tasks',     kind: 'array',  idField: 'id',   deep: true },
  { lsKey: 'my-tasklog-notes',     coll: 'notes',     kind: 'array',  idField: 'id',   deep: true },
  { lsKey: 'my-tasklog-journal',   coll: 'logs',      kind: 'object',                  deep: true },
  { lsKey: 'my-tasklog-mandalart', coll: 'mandalart', kind: 'array',  idField: 'year', deep: true },
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

// 화면이 어떤 데이터를 쓰는가. 여기 없는 키가 바뀌면 그 화면은 다시 그리지 않는다.
//  ⚠️ 폰에서 메모 하나 추가했다고 Work Diary 를 다시 그리면 쓰던 글이 날아간다.
//     목록에 없는 메뉴는 예전처럼 항상 다시 그린다 — 새 화면을 만들면 여기에 더할 것.
var FS_VIEW_DEPS = {
  home:      ['my-tasklog-data', 'my-tasklog-notes', 'my-tasklog-mandalart', 'my-tasklog-lifewheel'],
  cloud:     ['my-tasklog-data', 'my-tasklog-notes', 'my-tasklog-mandalart'],
  journal:   ['my-tasklog-data', 'my-tasklog-journal'],
  mvv:       ['tasklog-mvv-data'],
  wheel:     ['my-tasklog-mandalart', 'my-tasklog-lifewheel', 'my-tasklog-corevalues'],
  mandalart: ['my-tasklog-data', 'my-tasklog-mandalart', 'my-tasklog-lifewheel'],
  habit:     ['my-tasklog-mandalart'],
  todo:      ['my-tasklog-data', 'my-tasklog-mandalart', 'todoCols2', 'todoProjHidden'],
  project:   ['my-tasklog-data', 'my-tasklog-mandalart'],
  wbs:       ['my-tasklog-data', 'my-tasklog-mandalart', 'my-tasklog-lifewheel'],
  calendar:  ['my-tasklog-data'],
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

// 미러 = "서버가 갖고 있다고 내가 아는 상태".
//   items[lsKey][docId] = 해시 · itemUa[lsKey][docId] = 서버 _ua
//   docs[key] = 해시      · docUa[key] = 서버 _ua
//   base[lsKey][docId]  = 기준 내용 (deep:true 인 맵만) — 필드 단위 병합의 기준점
// 해시만으로는 "같은가/다른가"밖에 모른다. 필드 단위로 병합하려면 그때 무엇이
// 들어 있었는지를 알아야 해서, deep 맵에 한해 내용도 함께 보관한다.
var _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {}, base: {} };

var _lastServer     = {};    // { lsKey: {docId: {item?, ua, deleted?}} }  null 이면 '아직 모름'
var _lastServerDocs = null;  // { key: {raw, ua} }                          null 이면 '아직 모름'
var _pendingIds     = {};    // { lsKey: {docId:true} } 내 미확정 쓰기 — 병합에서 제외
var _pendingDocIds  = {};    // { key: true }
var _pendingUa      = {};    // { lsKey: {docId: ms} } 로컬 변경을 처음 인지한 시각
var _pendingDocUa   = {};    // { key: ms }
var _preRemote      = {};    // { lsKey: {docId: {hash, at}} } 원격 반영 직전의 로컬 값
var _lastLocalWrite = {};    // { key: ms } 사용자가 그 키를 마지막으로 쓴 시각(충돌 판정용)
var _syncLog        = [];    // 진단용 최근 기록
var _pendingH       = {};    // { lsKey: {docId: hash} } 그 시각에 본 로컬 내용 — 또 고치면 시각을 새로 찍는다
var _inflight       = {};    // { lsKey: {docId:true} } 트랜잭션으로 올리는 중
var _inflightDocs   = {};    // { key: true }
var _echo           = {};    // { lsKey: {docId: {ua, at}} } 내 쓰기가 스냅샷으로 돌아오기를 기다리는 중
var _echoDocs       = {};    // { key: {ua, at} }
var _prevRaw        = {};    // { lsKey: 원격 반영 직전 저장소 문자열 } 메모리의 저장 전 수정을 살릴 때 쓴다
var _pushFails      = 0;     // 연속 실패 횟수 (재시도 간격)
var _fsGen          = 0;     // 로그아웃·재시작 뒤 도착한 쓰기 결과를 버리기 위한 세대 번호
var _fsServerSeen   = {};    // { coll: true } 캐시가 아닌 서버 값을 받은 컬렉션
var _fsFirstSynced  = false; // 이번 접속에서 모든 컬렉션의 서버 값을 받아 병합을 마쳤는가
var _fsBackupWaiting = false;// 서버 값을 기다리느라 미룬 드라이브 백업이 있는가

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

function _eqVal(a, b) {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return _stableStringify(a) === _stableStringify(b);
}
function _isPlainObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// 원소가 모두 안정적인 고유 id 를 가진 객체 배열인가 (subGoals · actions · steps)
function _idKeyOf(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  var keys = ['id', 'year'];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k], seen = {}, ok = true;
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!_isPlainObj(e) || e[key] === undefined || e[key] === null || e[key] === '') { ok = false; break; }
      var s = String(e[key]);
      if (seen[s]) { ok = false; break; }
      seen[s] = 1;
    }
    if (ok) return key;
  }
  return null;
}

// ============================================
//  🧬 재귀 3-way 병합
// --------------------------------------------
//  문서 하나가 통째로 이기고 지는 대신, 안쪽으로 들어가며 필드별로 판단한다.
//  이게 없으면 두 기기가 같은 문서의 서로 다른 곳을 고쳐도 한쪽이 통째로 사라진다.
//   · mandalart/{year} 는 그 해 전체(Section 8 × 실행항목 8 × habitLog)가 문서 하나다.
//     서로 다른 습관을 체크해도 같은 문서라 충돌로 잡혔다.
//   · habitLog 는 {날짜:true} 라서, 아래 객체 규칙이 그대로 '합집합'이 된다.
//     한쪽만 지웠으면 지워지고, 한쪽만 넣었으면 들어온다.
//
//  base   = 마지막으로 서버와 같다고 아는 값 (undefined = 그때 없던 것)
//  local  = 지금 로컬 값                     (undefined = 로컬에서 지워짐)
//  server = 지금 서버 값                     (undefined = 서버에서 지워짐)
//  serverWins = 더 못 쪼개는 값이 양쪽 다 바뀌었을 때 누구를 택할지(_ua 비교 결과)
function _deepMerge3(base, local, server, serverWins) {
  if (_eqVal(local, server)) return local;
  if (_eqVal(base, local))   return server;   // 로컬 그대로 → 서버 변경 수용
  if (_eqVal(base, server))  return local;    // 서버 그대로 → 로컬 변경 채택

  // 양쪽 다 바뀌었다. 한쪽이 통째로 사라졌으면 편집을 살린다
  // (항목 단위 정책과 같다 — 유실보다 되살아나는 편이 낫다)
  if (local === undefined)  return server;
  if (server === undefined) return local;

  if (_isPlainObj(local) && _isPlainObj(server)) {
    var b = _isPlainObj(base) ? base : {};
    var out = {}, keys = {};
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(local).forEach(function (k) { keys[k] = 1; });
    Object.keys(server).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var r = _deepMerge3(b[k], local[k], server[k], serverWins);
      if (r !== undefined) out[k] = r;
    });
    return out;
  }

  if (Array.isArray(local) && Array.isArray(server)) {
    var ba = Array.isArray(base) ? base : [];

    // (1) id 로 짝지을 수 있으면 id 기준 — 순서 변경·삽입·삭제에 강하다
    var idKey = _idKeyOf(local) || _idKeyOf(server) || _idKeyOf(ba);
    if (idKey) {
      var byId = function (arr) {
        var m = {};
        (arr || []).forEach(function (e) {
          if (_isPlainObj(e) && e[idKey] !== undefined && e[idKey] !== null) m[String(e[idKey])] = e;
        });
        return m;
      };
      var mb = byId(ba), ml = byId(local), ms = byId(server);
      var order = [];
      local.forEach(function (e) {
        if (_isPlainObj(e) && e[idKey] != null) order.push(String(e[idKey]));
      });
      server.forEach(function (e) {
        if (!_isPlainObj(e) || e[idKey] == null) return;
        var id = String(e[idKey]);
        if (order.indexOf(id) === -1) order.push(id);   // 저쪽이 새로 만든 것은 뒤에
      });
      var arrOut = [];
      order.forEach(function (id) {
        var r = _deepMerge3(mb[id], ml[id], ms[id], serverWins);
        if (r !== undefined) arrOut.push(r);
      });
      return arrOut;
    }

    // (2) 길이가 같은 고정 슬롯 배열(quarters · connections)은 인덱스가 곧 정체성이다
    if (local.length === server.length && (!ba.length || ba.length === local.length)) {
      var res = [];
      for (var i = 0; i < local.length; i++) {
        var rv = _deepMerge3(ba.length ? ba[i] : undefined, local[i], server[i], serverWins);
        res.push(rv === undefined ? null : rv);
      }
      return res;
    }

    // (3) 그 밖의 배열은 안전하게 쪼갤 수 없다 → 최신 우선
    return serverWins ? server : local;
  }

  return serverWins ? server : local;         // 스칼라거나 타입이 다르다
}

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

// ============================================
//  ⏱️ 서버 시계 맞추기
// --------------------------------------------
//  충돌은 _ua(마지막 수정 시각) 비교로 정하는데, 이 값을 각 기기가 자기
//  Date.now() 로 찍었다. 폰과 PC 시계가 몇 분만 어긋나도 "나중에 고친 쪽"이
//  아니라 "시계가 빠른 쪽"이 이겨서, 방금 한 수정이 옛 값에 덮였다.
//
//  ⚠️ _ua 에 serverTimestamp() 를 그대로 넣지는 않는다.
//     구버전 클라이언트가 `d._ua || 0` 으로 읽어 숫자처럼 비교하기 때문에,
//     거기에 Timestamp 객체가 들어가면 비교가 전부 무너진다(= 지금 고치려는
//     유실을 오히려 만든다). 대신 서버와의 시계 차를 실측해 보정한 '숫자'를
//     넣는다 — 값의 형태는 그대로라 구버전과 섞여 있어도 안전하다.
//
//  로컬에 남기는 시각(_lastLocalWrite·_pendingUa)은 일부러 로컬 시계 그대로 둔다.
//  비교하는 순간에 오프셋을 더하므로, 나중에 오차 추정이 정확해지면 이미 쌓인
//  값들도 자동으로 같이 보정된다.
// ============================================
var FS_CLOCK_KEY      = 'tasklog-sync-clock';
var FS_CLOCK_TTL_MS   = 6 * 60 * 60 * 1000;   // 이 시간이 지나면 다시 잰다
var FS_CLOCK_MAX_RTT  = 10000;                // 왕복이 이보다 느리면 추정을 믿지 않는다

var _fsClockOffset = 0;          // 서버시각 ≈ Date.now() + _fsClockOffset
var _fsClockRtt    = Infinity;   // 그 추정을 만든 왕복 시간(작을수록 정확)
var _fsClockAt     = 0;          // 마지막으로 잰 시각(로컬)

function _serverNow() { return Date.now() + _fsClockOffset; }
// 로컬 시계로 찍힌 시각을 서버 기준으로 환산. 0(모름)은 그대로 둔다.
function _toServerTime(localMs) { return localMs ? localMs + _fsClockOffset : 0; }

function _loadClockOffset() {
  try {
    var o = JSON.parse(localStorage.getItem(FS_CLOCK_KEY) || 'null');
    if (o && typeof o.offset === 'number' && isFinite(o.offset)) {
      _fsClockOffset = o.offset;
      _fsClockRtt    = (typeof o.rtt === 'number') ? o.rtt : Infinity;
      _fsClockAt     = o.at || 0;
    }
  } catch (e) {}
}

async function _measureClockOffset(force) {
  if (!db || !_fsUid) return;
  if (!force && _fsClockAt && (Date.now() - _fsClockAt) < FS_CLOCK_TTL_MS) {
    // 아무 말도 안 하면 "측정이 실패한 것"과 구별이 안 된다 — 재사용도 드러낸다
    console.log('⏱️ 시계 보정 재사용: ' + Math.round(_fsClockOffset) + 'ms ('
      + Math.round((Date.now() - _fsClockAt) / 60000) + '분 전 측정)');
    return;
  }
  // 오프라인이면 set() 이 서버 확인까지 영원히 안 끝난다 → 매달려 있지 않도록 시간을 끊는다
  function _withTimeout(p, ms, what) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('시간 초과(' + what + ', ' + ms + 'ms)')); }, ms);
    })]);
  }

  try {
    var ref = _docRef('_clock');
    var t0 = Date.now();
    await _withTimeout(ref.set({
      key: '_clock',                      // FS_DOC_KEYS 에 없으므로 docs 리스너가 무시한다
      at: firebase.firestore.FieldValue.serverTimestamp()
    }), 15000, 'set');
    var snap = await _withTimeout(ref.get({ source: 'server' }), 15000, 'get');
    var t1 = Date.now();
    var ts = snap && snap.get ? snap.get('at') : null;
    if (!ts || typeof ts.toMillis !== 'function') {
      console.warn('⏱️ 시계 측정: 서버 시각을 읽지 못했습니다', ts);
      _logSync('시계 측정 실패(서버 시각 없음)');
      return;
    }

    var rtt = t1 - t0;
    if (rtt > FS_CLOCK_MAX_RTT) { _logSync('시계 측정 무시(왕복 ' + rtt + 'ms)'); return; }
    // 서버가 쓰기를 처리한 시점은 t0~t1 사이 어딘가 → 가운데로 잡는다
    var offset = ts.toMillis() - (t0 + rtt / 2);

    // 이번 왕복이 더 빠를 때만 갈아끼운다 (느린 왕복 = 부정확한 추정)
    if (rtt <= _fsClockRtt || (Date.now() - _fsClockAt) >= FS_CLOCK_TTL_MS) {
      _fsClockOffset = offset; _fsClockRtt = rtt; _fsClockAt = Date.now();
      try {
        localStorage.setItem(FS_CLOCK_KEY,
          JSON.stringify({ offset: offset, rtt: rtt, at: _fsClockAt }));
      } catch (e) {}
      // 측정이 실제로 됐는지는 이 한 줄로만 알 수 있다(실패해도 조용히 넘어가므로).
      console.log('⏱️ 서버와 시계 차 ' + Math.round(offset) + 'ms (왕복 ' + rtt + 'ms)'
        + (Math.abs(offset) > 5000 ? ' — 충돌 판정에 보정해서 씁니다' : ''));
      _logSync('시계 보정 ' + Math.round(offset) + 'ms (왕복 ' + rtt + 'ms)');
    }
  } catch (e) {
    // 오프라인이면 실패하는 게 정상이다 — 저장해 둔 값(없으면 0)으로 계속 간다.
    // 다만 조용히 삼키면 "보정이 되고 있다"고 착각하게 되므로 남긴다.
    console.warn('⏱️ 시계 측정 실패 — 보정 없이 진행합니다:', (e && (e.code || e.message)) || e);
    _logSync('시계 측정 실패: ' + ((e && (e.code || e.message)) || e));
  }
}

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
function _mirrorBase(lsKey) {
  if (!_fsMirror.base) _fsMirror.base = {};
  if (!_fsMirror.base[lsKey]) _fsMirror.base[lsKey] = {};
  return _fsMirror.base[lsKey];
}

var _mirrorSaveTimer = null;
function _saveMirrorSoon() {
  if (_mirrorSaveTimer) return;
  _mirrorSaveTimer = setTimeout(function () {
    _mirrorSaveTimer = null;
    if (!_fsUid) return;
    // ⚠️ FS_MIRROR_KEY 는 BACKUP_REGISTRY 에 없다 → setItem 훅이 푸시를 예약하지 않는다.
    var envelope = {
      uid: _fsUid, schema: FS_SCHEMA, mv: FS_MIRROR_VER, m: _fsMirror,
      // 아직 서버에 못 올린 로컬 변경의 시각. 이게 없으면 앱을 껐다 켠 뒤
      // 충돌이 났을 때 로컬 시각이 0 이라 서버가 무조건 이긴다 → 방금 한 수정이 사라진다.
      llw: _lastLocalWrite, pua: _pendingUa, pdua: _pendingDocUa, phs: _pendingH
    };
    try {
      localStorage.setItem(FS_MIRROR_KEY, JSON.stringify(envelope));
    } catch (e) {
      // 용량 초과 — 기준 내용(base)을 버리고 해시만이라도 남긴다.
      // 그러면 필드 단위 병합은 못 하지만 문서 단위 병합은 계속 동작한다(예전 동작).
      try {
        envelope.m = { items: _fsMirror.items, itemUa: _fsMirror.itemUa,
                       docs: _fsMirror.docs, docUa: _fsMirror.docUa, base: {} };
        localStorage.setItem(FS_MIRROR_KEY, JSON.stringify(envelope));
        console.warn('☁️ 저장 공간이 모자라 필드 병합 기준을 비웠습니다(동기화는 계속됩니다):', e);
      } catch (e2) {
        console.warn('☁️ 동기화 기준 상태 저장 실패:', e2);
      }
    }
  }, 800);
}

function _loadMirror(uid) {
  _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {}, base: {} };
  try {
    var o = JSON.parse(localStorage.getItem(FS_MIRROR_KEY) || 'null');
    if (o && o.uid === uid && o.schema === FS_SCHEMA && o.mv === FS_MIRROR_VER && o.m && o.m.items) {
      _fsMirror = {
        items:  o.m.items  || {}, itemUa: o.m.itemUa || {},
        docs:   o.m.docs   || {}, docUa:  o.m.docUa  || {},
        base:   o.m.base   || {}, docBase: o.m.docBase || {}
      };
      // 미푸시 로컬 변경의 시각을 되살린다 (앱 재시작 후에도 충돌 판정이 공정하도록)
      // 이번 실행에서 이미 기록한 쓰기 시각이 있으면 더 최근 값을 지킨다
      var _llw = o.llw || {};
      Object.keys(_lastLocalWrite).forEach(function (k) {
        if (!_llw[k] || _lastLocalWrite[k] > _llw[k]) _llw[k] = _lastLocalWrite[k];
      });
      _lastLocalWrite = _llw;
      _pendingUa      = o.pua  || {};
      _pendingDocUa   = o.pdua || {};
      _pendingH       = o.phs  || {};
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

// 그 항목의 로컬 변경을 처음 본 시각을 남긴다. 내용이 또 바뀌면 시각도 새로 찍는다
//  (오프라인에서 오래전에 시작한 수정을 나중에 더 고쳤는데 옛 시각으로 판정되면 안 된다).
//  ⚠️ 시각은 '항목 단위'다. 키 전체의 마지막 저장 시각을 그대로 쓰면, 새 메모 하나 저장한 것만으로
//     오래전에 고친 다른 메모까지 방금 고친 것처럼 되어 더 최근의 다른 기기 수정을 이긴다.
function _touchPending(lsKey, id, hash) {
  if (!_pendingUa[lsKey]) _pendingUa[lsKey] = {};
  if (!_pendingH[lsKey]) _pendingH[lsKey] = {};
  if (_pendingUa[lsKey][id] && _pendingH[lsKey][id] === hash) return;
  _pendingUa[lsKey][id] = _lastLocalWrite[lsKey] || Date.now();
  _pendingH[lsKey][id] = hash;
}
function _clearPending(lsKey, id) {
  if (_pendingUa[lsKey]) delete _pendingUa[lsKey][id];
  if (_pendingH[lsKey]) delete _pendingH[lsKey][id];
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
  var busy   = _inflight[lsKey] || {};
  var mir    = _mirrorItems(lsKey);
  var mua    = _mirrorItemUa(lsKey);
  var mbase  = _mirrorBase(lsKey);
  var out = {}, push = {}, restored = 0, conflicts = 0, pushCount = 0, merged3 = 0;

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

    // 내가 방금 쓴 것이 아직 확정되지 않았거나 올리는 중이다 → 이번 판단에서 제외
    if (pend[id] || busy[id]) { if (l !== undefined) out[id] = l; return; }

    var sEntry = server[id];
    var s  = (sEntry && !sEntry.deleted) ? sEntry.item : undefined;
    var lh = (l !== undefined) ? _hashItem(l) : null;
    var sh = (s !== undefined) ? _hashItem(s) : null;
    var mh = (mir[id] !== undefined) ? mir[id] : null;
    // 병합 기준값은 미러를 갱신하기 '전' 값이어야 한다 — 아래에서 덮어쓰기 때문에 먼저 집어둔다
    var mBaseVal = map.deep ? mbase[id] : undefined;

    // 미러 = "서버가 지금 갖고 있다고 아는 상태" 로 갱신한다.
    // (올리는 항목은 커밋에 성공한 뒤 _applyPushResults 가 올린 값으로 다시 덮어쓴다)
    if (sh !== null) {
      mir[id] = sh; mua[id] = (sEntry && sEntry.ua) || 0;
      if (map.deep) mbase[id] = s;
    } else {
      delete mir[id]; delete mua[id]; delete mbase[id];
    }

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
        out[id] = l; push[id] = l; pushCount++; _touchPending(lsKey, id, lh);
        return;
      }
      push[id] = null; pushCount++; _touchPending(lsKey, id, null);   // 진짜 삭제 → 툼스톤
      return;
    }

    // 양쪽 다 변경 — 칸 단위로 합친다
    conflicts++;
    if (l === undefined) { if (s !== undefined) { out[id] = s; restored++; } return; }  // 삭제 vs 편집 → 편집
    _touchPending(lsKey, id, lh);
    if (s === undefined) { out[id] = l; push[id] = l; pushCount++; return; }            // 편집 vs 삭제 → 편집
    // 서버의 _ua 는 이미 서버 기준(쓴 기기가 보정해 넣었다).
    // 로컬 시각은 로컬 시계로 찍혀 있으므로 여기서 서버 기준으로 환산해 비교한다.
    var sua = (sEntry && sEntry.ua) || 0;
    var lua = _toServerTime(_pendingUa[lsKey][id] || 0);

    //  기준값(mBaseVal)이 있으면 "저쪽이 추가"와 "이쪽이 삭제"를 구분해 정확히 합친다.
    //  기준이 없으면(미러가 갓 만들어졌거나 용량 때문에 비웠으면) 양쪽을 다 살리는 쪽으로 합치고,
    //  같은 칸이 다를 때만 시각이 늦은 쪽을 고른다.
    var m = _deepMerge3(mBaseVal, l, s, sua > lua);
    out[id] = m;
    merged3++;
    if (!_eqVal(m, s)) { push[id] = m; pushCount++; _touchPending(lsKey, id, _hashItem(m)); }
    else _clearPending(lsKey, id);
    // 병합 결과가 로컬과 다르면 화면 모듈이 들고 있는 낡은 사본이 되돌릴 수 있다
    if (!_eqVal(m, l)) _markPreRemote(lsKey, id, lh);
  });

  return { out: out, order: repr.order, push: push, pushCount: pushCount,
           restored: restored, conflicts: conflicts, merged3: merged3, exists: repr.exists };
}

// 병합 결과를 localStorage 에 반영 (바뀐 게 있으면 true)
function _applyMerged(map, r) {
  // 원래 없던 키를 빈 배열/객체로 만들어 두지 않는다 (쓸데없는 쓰기·화면 갱신 방지)
  if (!r.exists && Object.keys(r.out).length === 0) return false;
  var next = JSON.stringify(_reprToLocalValue(map, r.out, r.order));
  var _cur = localStorage.getItem(map.lsKey);
  if (next === _cur) return false;
  _prevRaw[map.lsKey] = _cur;
  window.__applyingRestore = true;          // setItem 훅이 '사용자 변경'으로 세지 않도록
  try { localStorage.setItem(map.lsKey, next); }
  finally { window.__applyingRestore = false; }
  return true;
}

// ============================================
//  ⬆️ 서버에 쓰기 — 쓰기 직전 서버 최신값과 합친다
// --------------------------------------------
//  예전에는 batch.set 으로 문서를 통째로 덮어썼다. 상대 변경을 아직 못 받은 기기가 쓰면
//  그 기기가 모르는 칸이 사라졌고, 오프라인 대기열의 낡은 문서도 재연결 때 더 최근 수정을
//  덮어썼다. 지금은 쓰기 직전 서버 값을 읽어 기준값(마지막으로 받은 서버 값)·내 값·서버 값을
//  비교해 바뀐 칸만 합친다.
//
//  ⚠️ 트랜잭션은 온라인에서만 된다. 실패해도 잃는 것은 없다 — 미러는 커밋에 성공한 뒤에만
//     내 값으로 올라가므로, 로컬 변경은 '아직 안 올린 변경'으로 남아 다음 병합 때 다시 올라간다.
//  ⚠️ 트랜잭션 쓰기는 SDK 의 지연 보상을 거치지 않아 커밋 직후에 낡은 스냅샷이 올 수 있다.
//     그대로 믿으면 "원격이 옛 값으로 바뀌었다"고 판단해 화면이 되돌아간다.
//     _echo 가 내 쓰기가 돌아올 때까지 지킨다. 그래서 _ua 는 항상 서버 값보다 크게 찍는다.
// ============================================
var FS_PUSH_CHUNK   = 50;          // 트랜잭션 하나에 담을 문서 수
var FS_PUSH_TIMEOUT = 45 * 1000;   // 이 시간이 지나면 올리는 중 표시를 풀고 다시 시도한다
var FS_ECHO_TTL_MS  = 60 * 1000;   // 그 뒤의 스냅샷은 내 쓰기 이후의 것이 확실하다

function _withDeadline(p, ms, what) {
  return Promise.race([p, new Promise(function (_, rej) {
    setTimeout(function () { rej(new Error('시간 초과(' + what + ')')); }, ms);
  })]);
}

// 이 문서를 서버에 어떻게 쓸지 정한다. l === null 이면 로컬에서 지운 것이다.
//  반환 { merged:합친 값(undefined=없음), write, data, ua }
function _resolvePush(l, base, snap, lua) {
  var d = snap.exists ? (snap.data() || {}) : null;
  var s = (d && !d.__deleted) ? _unwrapItem(d) : undefined;
  var sua = d ? (d._ua || 0) : 0;
  var ua = Math.max(_serverNow(), sua + 1);

  if (l === null) {
    if (s === undefined) return { merged: undefined, write: false, ua: sua };
    // 삭제 vs 편집 — 내가 모르는 사이 서버가 바뀌었으면 편집을 살린다
    if (base !== undefined && !_eqVal(base, s)) return { merged: s, write: false, ua: sua };
    return { merged: undefined, write: true, ua: ua, data: { __deleted: true, _ua: ua } };
  }

  var merged = (s === undefined || _eqVal(base, s)) ? l : _deepMerge3(base, l, s, sua > lua);
  var data = _sanitizeItem(merged);
  var clean = _unwrapItem(data);
  if (s !== undefined && _eqVal(clean, s)) return { merged: s, write: false, ua: sua };
  data._ua = ua;
  return { merged: clean, write: true, ua: ua, data: data };
}

// 커밋이 끝났다 — 미러·서버 상태를 맞추고, 합친 결과를 로컬에도 반영한다.
//  바뀐 게 있으면 true (호출한 쪽이 화면을 갱신한다)
function _applyPushResults(map, jobs, results) {
  var lsKey = map.lsKey;
  var mir = _mirrorItems(lsKey), mua = _mirrorItemUa(lsKey), mbase = _mirrorBase(lsKey);
  var srv = _lastServer[lsKey] || (_lastServer[lsKey] = {});
  var echo = _echo[lsKey] || (_echo[lsKey] = {});
  var repr = _localRepr(map);
  var changed = false;

  jobs.forEach(function (j) {
    var id = j.id, r = results[id], m = r.merged;
    var sent = (j.item === null) ? undefined : j.item;

    if (m === undefined) {
      delete mir[id]; delete mua[id]; delete mbase[id];
      srv[id] = { deleted: true, ua: r.ua };
    } else {
      mir[id] = _hashItem(m); mua[id] = r.ua; mbase[id] = m;
      srv[id] = { item: m, ua: r.ua };
    }
    if (r.write) echo[id] = { ua: r.ua, at: Date.now() };

    var cur = repr.byId[id];
    var untouched = _eqVal(cur, sent);
    // 올리는 동안 또 고쳤으면 그 수정은 살리고, 합쳐져 들어온 것만 받는다
    var next = untouched ? m : _deepMerge3(sent, cur, m, false);
    if (!_eqVal(next, cur)) {
      if (next === undefined) delete repr.byId[id]; else repr.byId[id] = next;
      _markPreRemote(lsKey, id, cur === undefined ? null : _hashItem(cur));
      changed = true;
    }
    if (untouched) _clearPending(lsKey, id);
    if (r.write) _logSync((m === undefined ? '삭제 ' : '올림 ') + map.coll + '/' + id);
  });

  if (!changed) return false;
  return _applyMerged(map, { exists: true, out: repr.byId, order: repr.order });
}

function _pushItems(map, jobs, gen) {
  var lsKey = map.lsKey;
  var busy = _inflight[lsKey] || (_inflight[lsKey] = {});
  var mbase = _mirrorBase(lsKey);
  var bases = {}, luas = {};
  jobs.forEach(function (j) {
    busy[j.id] = true;
    bases[j.id] = mbase[j.id];
    luas[j.id] = _toServerTime((_pendingUa[lsKey] && _pendingUa[lsKey][j.id]) || _lastLocalWrite[lsKey] || 0);
  });
  var results = {};
  var work = db.runTransaction(function (tx) {
    results = {};                     // 경합으로 재시도되면 처음부터 다시 계산한다
    var refs = jobs.map(function (j) { return _collRef(map.coll).doc(j.id); });
    return Promise.all(refs.map(function (r) { return tx.get(r); })).then(function (snaps) {
      snaps.forEach(function (snap, i) {
        var id = jobs[i].id;
        var r = _resolvePush(jobs[i].item, bases[id], snap, luas[id]);
        if (r.write) tx.set(refs[i], r.data);
        results[id] = r;
      });
    });
  });
  return _withDeadline(work, FS_PUSH_TIMEOUT, '쓰기').then(function () {
    jobs.forEach(function (j) { delete busy[j.id]; });
    if (gen !== _fsGen) return [];
    return _applyPushResults(map, jobs, results) ? [lsKey] : [];
  }, function (e) {
    jobs.forEach(function (j) { delete busy[j.id]; });
    throw e;
  });
}

function _pushDocs(jobs, gen) {
  jobs.forEach(function (j) { _inflightDocs[j.key] = true; });
  var results = {};
  var work = db.runTransaction(function (tx) {
    results = {};
    var refs = jobs.map(function (j) { return _docRef(_docIdForKey(j.key)); });
    return Promise.all(refs.map(function (r) { return tx.get(r); })).then(function (snaps) {
      snaps.forEach(function (snap, i) {
        var j = jobs[i];
        var d = snap.exists ? (snap.data() || {}) : null;
        var sRaw = (d && typeof d.raw === 'string') ? d.raw : null;
        var sua = d ? (d._ua || 0) : 0;
        var ua = Math.max(_serverNow(), sua + 1);
        var merged, wrote = false;
        if (j.raw === null) {
          if (sRaw === null) merged = null;
          else if (j.base !== null && j.base !== undefined && sRaw !== j.base) merged = sRaw;   // 삭제 vs 편집
          else { merged = null; wrote = true; tx.delete(refs[i]); }
        } else {
          merged = (sRaw === null || sRaw === j.base) ? j.raw : _mergeRawDoc(j.base, j.raw, sRaw, sua > j.lua);
          if (merged !== sRaw) {
            wrote = true;
            tx.set(refs[i], { key: j.key, raw: merged, _ua: ua,
                              updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
        }
        results[j.key] = { merged: merged, wrote: wrote, ua: wrote ? ua : sua };
      });
    });
  });
  return _withDeadline(work, FS_PUSH_TIMEOUT, '쓰기').then(function () {
    jobs.forEach(function (j) { delete _inflightDocs[j.key]; });
    if (gen !== _fsGen) return [];
    var touched = [], dbase = _mirrorDocBase();
    if (!_lastServerDocs) _lastServerDocs = {};
    jobs.forEach(function (j) {
      var r = results[j.key], m = r.merged;
      _fsMirror.docs[j.key] = (m === null) ? null : _hash(m);
      _fsMirror.docUa[j.key] = r.ua;
      dbase[j.key] = m;
      if (m === null) delete _lastServerDocs[j.key];
      else _lastServerDocs[j.key] = { raw: m, ua: r.ua };
      if (r.wrote) _echoDocs[j.key] = { ua: r.ua, at: Date.now() };

      var cur = localStorage.getItem(j.key);
      var untouched = (cur === j.raw);
      var next = untouched ? m : _mergeRawDoc(j.raw, cur, m, false);
      if (next !== cur) { _applyDocValue(j.key, next); touched.push(j.key); }
      if (untouched) delete _pendingDocUa[j.key];
    });
    return touched;
  }, function (e) {
    jobs.forEach(function (j) { delete _inflightDocs[j.key]; });
    throw e;
  });
}

function _startPush(jobs, docJobs) {
  if (!jobs.length && !docJobs.length) return;
  // 오프라인이면 시도하지 않는다. 변경은 그대로 남아 있고, online 이벤트·재연결 스냅샷이 다시 부른다.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _logSync('오프라인 — 올리기 미룸 ' + (jobs.length + docJobs.length) + '건');
    return;
  }
  var gen = _fsGen, work = [], byMap = {}, i;
  jobs.forEach(function (j) {
    var g = byMap[j.map.lsKey] || (byMap[j.map.lsKey] = { map: j.map, list: [] });
    g.list.push(j);
  });
  Object.keys(byMap).forEach(function (k) {
    var g = byMap[k];
    for (var n = 0; n < g.list.length; n += FS_PUSH_CHUNK) {
      work.push(_pushItems(g.map, g.list.slice(n, n + FS_PUSH_CHUNK), gen));
    }
  });
  for (i = 0; i < docJobs.length; i += FS_PUSH_CHUNK) {
    work.push(_pushDocs(docJobs.slice(i, i + FS_PUSH_CHUNK), gen));
  }

  // 일부가 실패해도 성공한 몫은 화면까지 반영한다
  var failed = null, touched = [];
  Promise.all(work.map(function (p) {
    return p.then(function (keys) { touched = touched.concat(keys); },
                  function (e) { failed = failed || e || new Error('쓰기 실패'); });
  })).then(function () {
    if (gen !== _fsGen) return;
    if (touched.length) {
      _afterRemoteApply(touched.filter(function (k, idx) { return touched.indexOf(k) === idx; }));
    }
    _saveMirrorSoon();
    if (failed) {
      _pushFails++;
      var wait = Math.min(60000, 5000 * Math.pow(2, _pushFails - 1));
      console.warn('☁️ Firestore 쓰기 실패 → ' + (wait / 1000) + '초 뒤 재시도:', failed.code || failed.message || failed);
      _logSync('쓰기 실패: ' + (failed.code || failed.message || failed));
      setTimeout(_syncSoon, wait);
      return;
    }
    _pushFails = 0;
    localStorage.setItem('last-backup-time', new Date().toISOString());
    updateBackupStatus();
    if (typeof refreshSettingsBackupStatus === 'function') refreshSettingsBackupStatus();
    console.log('☁️ Firestore 푸시 완료');
    _syncSoon();       // 올리는 동안 또 바뀐 것이 있으면 이어서 올린다
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

function _mirrorDocBase() {
  if (!_fsMirror.docBase) _fsMirror.docBase = {};
  return _fsMirror.docBase;
}

// 문자열로 저장된 문서를 합친다. JSON 이면 칸 단위로, 단순 문자열(테마 등)이면 시각이 늦은 쪽.
//  ⚠️ MVV·라이프휠은 문서 전체가 문자열 하나라, 예전에는 Mission 만 고쳐도 Vision 까지 통째로 이기고 졌다.
function _mergeRawDoc(baseRaw, localRaw, serverRaw, serverWins) {
  if (localRaw === serverRaw) return localRaw;
  if (localRaw === null || localRaw === undefined) return serverRaw;
  if (serverRaw === null || serverRaw === undefined) return localRaw;
  function parse(raw) {
    if (raw === null || raw === undefined) return undefined;
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }
  var L = parse(localRaw), S = parse(serverRaw);
  if ((_isPlainObj(L) && _isPlainObj(S)) || (Array.isArray(L) && Array.isArray(S))) {
    return JSON.stringify(_deepMerge3(parse(baseRaw), L, S, serverWins));
  }
  return serverWins ? serverRaw : localRaw;
}

function _syncDocKeys(docJobs) {
  var touched = [];
  var server = _lastServerDocs;              // null = 아직 모름
  // 항목 컬렉션과 같은 이유로, 서버 상태를 보기 전에는 아무것도 올리지 않는다
  if (server === null) return touched;
  var dbase = _mirrorDocBase();

  FS_DOC_KEYS.forEach(function (key) {
    if (_pendingDocIds[key] || _inflightDocs[key]) return;

    var localRaw = localStorage.getItem(key);
    var lh = (localRaw === null) ? null : _hash(localRaw);
    var mh = (_fsMirror.docs[key] !== undefined) ? _fsMirror.docs[key] : null;
    var baseRaw = dbase[key];                // 기준값은 미러를 갱신하기 전에 집어 둔다

    var sEntry = server[key];
    var sRaw = (sEntry && typeof sEntry.raw === 'string') ? sEntry.raw : null;
    var sh = (sRaw === null) ? null : _hash(sRaw);
    var sua = (sEntry && sEntry.ua) || 0;

    // 미러 = 서버가 지금 갖고 있다고 아는 상태
    _fsMirror.docs[key] = sh; _fsMirror.docUa[key] = sua; dbase[key] = sRaw;

    if (lh === sh) { delete _pendingDocUa[key]; return; }

    var localChanged  = (lh !== mh);
    var serverChanged = (sh !== mh);

    if (!localChanged && serverChanged) {
      _applyDocValue(key, sRaw);
      touched.push(key);
      return;
    }

    if (!_pendingDocUa[key]) _pendingDocUa[key] = Date.now();
    var lua = _toServerTime(Math.max(_lastLocalWrite[key] || 0, _pendingDocUa[key] || 0));

    if (!serverChanged) {
      docJobs.push({ key: key, raw: localRaw, base: sRaw, lua: lua });
      return;
    }

    // 양쪽 다 바뀌었다 — 칸 단위로 합친다
    var m = _mergeRawDoc(baseRaw, localRaw, sRaw, sua > lua);
    if (m !== localRaw) { _applyDocValue(key, m); touched.push(key); }
    if (m !== sRaw) docJobs.push({ key: key, raw: m, base: sRaw, lua: lua });
    else delete _pendingDocUa[key];
    _logSync('충돌(문서) ' + key + ' → 합침');
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
  var jobs = [], docJobs = [], touched = [];
  try {
    FS_ITEM_MAPS.forEach(function (map) {
      var r = _mergeMap(map);
      if (_applyMerged(map, r)) touched.push(map.lsKey);
      Object.keys(r.push).forEach(function (id) { jobs.push({ map: map, id: id, item: r.push[id] }); });
      if (r.restored) {
        console.warn('🛟 낡은 사본이 지울 뻔한 ' + map.coll + ' 항목 ' + r.restored + '건을 되살렸습니다');
        _logSync('복구 ' + map.coll + ' ' + r.restored + '건');
      }
      if (r.conflicts) {
        _logSync('충돌 ' + map.coll + ' ' + r.conflicts + '건'
          + (r.merged3 ? ' (필드 병합 ' + r.merged3 + '건)' : ''));
      }
    });
    touched = touched.concat(_syncDocKeys(docJobs));
  } catch (e) {
    console.error('☁️ 병합 중 오류:', e);
    _fsMirror = prevMirror;
    _syncing = false;
    return;
  }

  if (touched.length) _afterRemoteApply(touched);
  _saveMirrorSoon();
  _checkFirstSynced();

  _syncing = false;
  if (_syncAgain) { _syncAgain = false; setTimeout(_syncNow, 0); }

  _startPush(jobs, docJobs);
}

// 모든 컬렉션의 서버 값을 받아 병합까지 끝났는가 — 미뤄 둔 드라이브 백업을 이때 올린다.
//  ⚠️ 그 전에 올리면 이 기기의 낡은 상태가 '가장 최근 백업'이 된다.
function _checkFirstSynced() {
  if (_fsFirstSynced || !_fsServerSeen.docs) return;
  for (var i = 0; i < FS_ITEM_MAPS.length; i++) {
    if (!_fsServerSeen[FS_ITEM_MAPS[i].coll]) return;
  }
  _fsFirstSynced = true;
  _logSync('서버 값 수신 완료');
  if (_fsBackupWaiting) {
    _fsBackupWaiting = false;
    setTimeout(function () {
      if (typeof silentBackupToDrive === 'function') silentBackupToDrive();
    }, 1500);
  }
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

// 지금 다시 그리면 안 되는가 — 다시 그리면 메모리·화면의 저장 전 내용이 사라지는 경우
function _viewBusy() {
  if (_isEditing()) return true;
  try {
    if (typeof currentMenu !== 'undefined' && currentMenu === 'mandalart') {
      // 세부 실적 페이지는 저장 버튼을 누르기 전까지 메모리에만 있다(saveActF).
      // 다시 그리면 목록 화면으로 튕기면서 그 수정도 버려진다.
      if (typeof mdtDirtyCards !== 'undefined' && Object.keys(mdtDirtyCards).length) return true;
      if (document.getElementById('mdt-detail-save-btn')) return true;
    }
  } catch (e) {}
  return false;
}

function _viewDependsOn(keys) {
  var deps = (typeof currentMenu !== 'undefined') ? FS_VIEW_DEPS[currentMenu] : null;
  if (!deps) return true;
  return keys.some(function (k) { return deps.indexOf(k) >= 0; });
}

var _rerenderTimer = null;
var _rerenderWanted = false;
//  keys 를 주면 그 변경이 이 화면과 관계있을 때만 다시 그린다. 인자 없음 = 미뤄 둔 것을 다시 시도.
function _rerenderCurrentView(keys) {
  if (_rerenderTimer) { clearTimeout(_rerenderTimer); _rerenderTimer = null; }
  if (keys && _viewDependsOn(keys)) _rerenderWanted = true;
  if (!_rerenderWanted) return;
  // 입력 중에 화면을 갈아끼우면 타이핑하던 내용이 날아간다 → 잠시 뒤 다시 시도
  if (_viewBusy()) { _rerenderTimer = setTimeout(function () { _rerenderCurrentView(); }, 3000); return; }
  _rerenderWanted = false;
  try {
    if (typeof MENU_RENDERERS === 'undefined' || typeof currentMenu === 'undefined') return;
    // Web 은 보드만 다시 그린다. 페이지 전체를 그리면 작성칸 초안이 지워지고 커서도 그리로 튄다.
    if (currentMenu === 'cloud' && typeof renderNoteBoard === 'function' && document.getElementById('nb-board')) {
      renderNoteBoard();
      return;
    }
    var fn = MENU_RENDERERS[currentMenu];
    if (fn && typeof window[fn] === 'function') window[fn]();
  } catch (e) { console.warn('원격 반영 후 화면 갱신 실패:', e); }
}

// 모듈의 메모리 사본을 저장소 값으로 다시 읽는다.
//  ⚠️ 만다라트 세부 페이지의 수정은 저장 버튼 전까지 메모리에만 있다. 그냥 다시 읽으면 사라지므로
//     '반영 직전 저장소 / 메모리 / 새 저장소'를 합쳐 저장 전 수정을 살린다.
function _reloadModule(key, fn) {
  if (typeof window[fn] !== 'function') return;
  if (key === 'my-tasklog-mandalart' && typeof mdtDirtyCards !== 'undefined'
      && Object.keys(mdtDirtyCards).length && typeof mandalarts !== 'undefined' && _prevRaw[key]) {
    var mem = JSON.parse(JSON.stringify(mandalarts));
    var prior = JSON.parse(_prevRaw[key]);
    window[fn]();
    mandalarts = _deepMerge3(prior, mem, mandalarts, false);
    return;
  }
  window[fn]();
}

function _afterRemoteApply(keys) {
  keys.forEach(function (k) {
    (FS_RELOADERS[k] || []).forEach(function (fn) {
      try { _reloadModule(k, fn); }
      catch (e) { console.warn('원격 반영 후 재적재 실패(' + fn + '):', e); }
    });
    try { document.dispatchEvent(new CustomEvent('tasklog-remote-update', { detail: { key: k } })); }
    catch (e) {}
  });
  if (keys.indexOf('my-tasklog-data') >= 0) {
    try { if (typeof renderTasks === 'function') renderTasks(); } catch (e) {}
    try { if (typeof updateCategoryCounts === 'function') updateCategoryCounts(); } catch (e) {}
  }
  _rerenderCurrentView(keys);
  console.log('📥 원격 변경 반영:', keys.join(', '));
}

// 화면이 저장할 때 자기가 손댄 칸만 반영하려고 쓴다 (기준값 · 내 값 · 지금 값)
function fsMerge3(base, local, remote) { return _deepMerge3(base, local, remote, false); }

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

// 내 쓰기가 아직 안 돌아온 낡은 스냅샷인가 (돌아왔거나 시간이 지났으면 지키기를 끝낸다)
function _echoHolds(echo, id, ua) {
  var e = echo[id];
  if (!e) return false;
  if (ua >= e.ua || (Date.now() - e.at) > FS_ECHO_TTL_MS) { delete echo[id]; return false; }
  return true;
}

function _noteServerSeen(name, snap) {
  if (snap && snap.metadata && !snap.metadata.fromCache) _fsServerSeen[name] = true;
}

function _attachListeners() {
  FS_ITEM_MAPS.forEach(function (map) {
    // ⚠️ includeMetadataChanges 가 있어야 내 쓰기가 확정된 뒤 스냅샷이 한 번 더 온다.
    //    v1 은 이게 없어서, 미확정 구간에 도착한 남의 변경이 영영 반영되지 않았다.
    var unsub = _collRef(map.coll).onSnapshot({ includeMetadataChanges: true }, function (snap) {
      var server = {}, pend = {}, tombs = [], seen = {};
      var cutoff = _serverNow() - FS_TOMB_TTL_MS;   // _ua 가 서버 기준이라 여기도 맞춘다
      var echo = _echo[map.lsKey] || {}, prev = _lastServer[map.lsKey] || {};
      snap.forEach(function (doc) {
        seen[doc.id] = 1;
        // 통째로 버리지 않는다 — 미확정인 '그 문서'만 이번 판단에서 뺀다
        if (doc.metadata.hasPendingWrites) { pend[doc.id] = true; return; }
        var d = doc.data() || {};
        if (prev[doc.id] && _echoHolds(echo, doc.id, d._ua || 0)) { server[doc.id] = prev[doc.id]; return; }
        if (d.__deleted) {
          server[doc.id] = { deleted: true, ua: d._ua || 0 };
          if ((d._ua || 0) && (d._ua < cutoff)) tombs.push(doc.id);
          return;
        }
        server[doc.id] = { item: _unwrapItem(d), ua: d._ua || 0 };
      });
      // 방금 만든 문서가 아직 안 실린 낡은 스냅샷 — 서버에서 지워진 것으로 읽으면 안 된다
      Object.keys(echo).forEach(function (id) {
        if (seen[id]) return;
        if ((Date.now() - echo[id].at) > FS_ECHO_TTL_MS) { delete echo[id]; return; }
        if (prev[id]) server[id] = prev[id];
      });
      _lastServer[map.lsKey] = server;
      _pendingIds[map.lsKey] = pend;
      _noteServerSeen(map.coll, snap);
      _syncSoon();
      if (tombs.length) _cleanupTombstones(map.coll, tombs);
    }, function (err) { console.error('onSnapshot 오류(' + map.coll + '):', err); });
    _fsUnsubs.push(unsub);
  });

  var unsubDocs = _collRef('docs').onSnapshot({ includeMetadataChanges: true }, function (snap) {
    var server = {}, pend = {}, seen = {};
    var prev = _lastServerDocs || {};
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      if (!d.key || FS_DOC_KEYS.indexOf(d.key) === -1) return;   // _meta 등 무시
      seen[d.key] = 1;
      if (doc.metadata.hasPendingWrites) { pend[d.key] = true; return; }
      if (_echoHolds(_echoDocs, d.key, d._ua || 0)) { if (prev[d.key]) server[d.key] = prev[d.key]; return; }
      server[d.key] = { raw: (typeof d.raw === 'string' ? d.raw : null), ua: d._ua || 0 };
    });
    Object.keys(_echoDocs).forEach(function (key) {
      if (seen[key]) return;
      if ((Date.now() - _echoDocs[key].at) > FS_ECHO_TTL_MS) { delete _echoDocs[key]; return; }
      if (prev[key]) server[key] = prev[key];
    });
    _lastServerDocs = server;
    _pendingDocIds  = pend;
    _noteServerSeen('docs', snap);
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
    data._ua = legacyUa || _serverNow();
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
  _fsGen++;
  // 다시 연결되면 미뤄 둔 변경을 올린다
  if (!window.__fsOnlineHooked) {
    window.__fsOnlineHooked = true;
    if (window.addEventListener) window.addEventListener('online', function () { if (_fsStarted) _syncSoon(); });
    if (document.addEventListener) document.addEventListener('visibilitychange', function () {
      if (_fsStarted && document.visibilityState === 'visible') _syncSoon();
    });
  }
  var reused = _loadMirror(uid);
  _loadClockOffset();     // 저장해 둔 시계 보정값을 먼저 쓴다 (측정은 아래에서 비동기로)
  console.log('🔄 Firestore 동기화 시작:', uid, reused ? '(이전 기준 상태 이어받음)' : '(기준 상태 새로 만듦)');

  await _migrateIfNeeded();

  // 시계 측정은 네트워크를 타므로 기다리지 않는다 — 오프라인이면 저장값으로 간다.
  // 끝나면 다음 병합부터 새 보정값이 적용된다.
  _measureClockOffset().then(function () { if (_fsStarted) _syncSoon(); });

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
  _fsMirror = { items: {}, itemUa: {}, docs: {}, docUa: {}, base: {} };
  _lastServer = {}; _lastServerDocs = null;
  _pendingIds = {}; _pendingDocIds = {};
  _pendingUa = {};  _pendingDocUa = {};
  _preRemote = {};
  _pendingH = {};
  _inflight = {}; _inflightDocs = {};
  _echo = {}; _echoDocs = {};
  _prevRaw = {};
  _pushFails = 0;
  // ⚠️ _fsBackupWaiting 은 여기서 지우지 않는다. onSignInSync 가 startFirestoreSync 보다 먼저 돌 수 있고,
  //    시작할 때 이 함수를 한 번 부르므로 지우면 미뤄 둔 백업이 영영 안 올라간다.
  _fsServerSeen = {}; _fsFirstSynced = false;
  _rerenderWanted = false;
  _fsGen++;
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
      미확정: Object.keys(_pendingIds[map.lsKey] || {}).length,
      필드병합: map.deep ? (Object.keys(_mirrorBase(map.lsKey)).length + '건 기준 보유') : '미사용'
    };
  });
  return {
    uid: _fsUid, 동작중: _fsStarted, 서버값수신: _fsFirstSynced, 항목수: counts,
    올리는중: FS_ITEM_MAPS.reduce(function (n, map) {
      return n + Object.keys(_inflight[map.lsKey] || {}).length;
    }, Object.keys(_inflightDocs).length),
    연속실패: _pushFails,
    시계보정: { 오프셋ms: Math.round(_fsClockOffset), 왕복ms: _fsClockRtt,
              잰시각: _fsClockAt ? new Date(_fsClockAt).toLocaleString('ko-KR') : '아직 못 잼' },
    최근기록: _syncLog.slice(-20)
  };
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

// ============================================
//  ☁️ 드라이브는 이제 백업 전용이다
// --------------------------------------------
//  ⚠️ drive.js 의 onSignInSync 는 로그인할 때마다 가장 최근 드라이브 백업으로 데이터 전체를
//     덮어썼고, applyBackupData 위의 훅이 그 내용을 Firestore 로 올렸다. 그래서 폰이 접속만 해도
//     백업 이후의 수정이 서버에서 사라졌고, 폰이 올린 낡은 백업을 웹이 새로고침 때 받아 웹 수정까지
//     지웠다. Firestore 가 원본이므로 로그인 때는 아무것도 덮어쓰지 않는다.
//     (설정의 수동 복원 restoreFromDrive 는 확인창을 거치므로 그대로 둔다)
//  ⚠️ 백업은 서버 값을 받은 뒤에만 올린다. 그 전에 올리면 낡은 상태가 '가장 최근 백업'이 된다.
//  firebaseReady 가 false 면(Firestore 미설정) 예전 동작 그대로 둔다.
// ============================================
(function () {
  if (typeof onSignInSync !== 'function' || typeof silentBackupToDrive !== 'function') return;
  var _driveSignInSync = onSignInSync;
  var _driveSilentBackup = silentBackupToDrive;
  function firestoreOn() { return typeof firebaseReady !== 'undefined' && firebaseReady; }

  silentBackupToDrive = async function () {
    if (firestoreOn() && !_fsFirstSynced) {
      if (!_fsBackupWaiting) {
        _fsBackupWaiting = true;
        // Firebase 로그인 자체가 안 되는 상황이면 로컬이 유일한 사본이다 — 1분 기다렸다가 그대로 올린다
        setTimeout(function () {
          if (_fsBackupWaiting && !_fsStarted) { _fsBackupWaiting = false; _driveSilentBackup(); }
        }, 60000);
      }
      return;
    }
    return _driveSilentBackup();
  };

  onSignInSync = async function () {
    if (!firestoreOn()) return _driveSignInSync();
    if (!isSignedIn()) return;
    try { sessionStorage.setItem('tasklog-synced', '1'); } catch (e) {}
    if (typeof enableAutoBackupNow === 'function') enableAutoBackupNow();
    window.__backupReady = true;
    console.log('🔑 로그인 감지 → 드라이브는 백업만 사용 (Firestore 가 원본)');
  };
})();
