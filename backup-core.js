// ============================================
//  💾 백업 코어 — 모든 페이지 데이터의 단일 백업/복원 엔진
// --------------------------------------------
//  ▸ 백업 파일과 복원 파일은 "완전히 같은 형식"을 사용합니다.
//  ▸ 새 페이지/데이터를 추가하면 아래 BACKUP_REGISTRY 에 한 줄만 더하면
//    로컬 다운로드 · 구글 드라이브 백업 · 복원 · 양식이 자동으로 따라옵니다.
// ============================================

// 백업 대상 = 사용자가 각 페이지에서 직접 입력한 모든 데이터 + 환경설정
//  key   : 실제 localStorage 키
//  label : 사람이 읽는 이름
//  type  : 'json'(배열/객체) | 'string'(단순 문자열)
const BACKUP_REGISTRY = [
  // ── 사용자 입력 데이터 ──────────────────
  { key: 'my-tasklog-data',       label: '할 일(Task)',          type: 'json'   },
  { key: 'my-tasklog-notes',      label: '메모',                 type: 'json'   },
  { key: 'my-tasklog-journal',    label: '저널',                 type: 'json'   },
  { key: 'my-tasklog-lifewheel',  label: '인생수레바퀴',         type: 'json'   },
  { key: 'my-tasklog-corevalues', label: '핵심가치',             type: 'json'   },
  { key: 'my-tasklog-mandalart',  label: '만다라트',             type: 'json'   },
  { key: 'tasklog-mvv-data',      label: 'MVV(미션·비전·가치)',  type: 'json'   },
  { key: 'todoCols',              label: 'Board 컬럼 설정',      type: 'json'   },
  { key: 'todoProjHidden',        label: 'Board 숨김 프로젝트',  type: 'json'   },
  { key: 'mdtFavActions',         label: '만다라트 즐겨찾기',    type: 'json'   },
  { key: 'my-tasklog-nickname',   label: '닉네임',               type: 'string' },
  // ── 환경설정(사용자 선택값) ─────────────
  { key: 'app-theme',             label: '테마',                 type: 'string' },
  { key: 'app-lang',              label: '언어',                 type: 'string' },
  { key: 'app-week-start',        label: '주 시작요일',          type: 'string' },
  { key: 'app-font-size',         label: '글자 크기',            type: 'string' },
  { key: 'app-notif-deadline',    label: '마감 알림',            type: 'string' },
  { key: 'app-notif-journal',     label: '저널 알림',            type: 'string' },
];

const BACKUP_FORMAT  = 'tasklog-backup';
const BACKUP_VERSION = 2;

// 레지스트리에서 키 정보 찾기
function backupKeyInfo(key) {
  for (var i = 0; i < BACKUP_REGISTRY.length; i++) {
    if (BACKUP_REGISTRY[i].key === key) return BACKUP_REGISTRY[i];
  }
  return null;
}

// ─────────────────────────────────────────────
//  현재 앱의 모든 데이터를 통일된 형식으로 모읍니다.
// ─────────────────────────────────────────────
function collectBackupData() {
  var data = {};
  BACKUP_REGISTRY.forEach(function (item) {
    var raw = localStorage.getItem(item.key);
    if (raw === null) { data[item.key] = null; return; }
    if (item.type === 'json') {
      try { data[item.key] = JSON.parse(raw); }
      catch (e) { data[item.key] = raw; }   // 깨진 값은 원문 그대로 보존
    } else {
      data[item.key] = raw;
    }
  });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    backupDate: new Date().toISOString(),
    data: data,
  };
}

// localStorage 에 값 한 개 안전하게 쓰기
function writeBackupValue(key, value) {
  if (value === null || value === undefined) return;   // 빈 값은 덮어쓰지 않음
  var info = backupKeyInfo(key);
  var type = info ? info.type : 'json';
  if (type === 'string') {
    localStorage.setItem(key, typeof value === 'string' ? value : String(value));
  } else {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

// ─────────────────────────────────────────────
//  통일된 형식의 객체를 받아 localStorage 로 복원합니다.
//  ▸ 신규 형식  { format, version, data:{ "키": 값 } }
//  ▸ 구버전 형식 { tasks, mvv, lifewheel, mandalarts } (옛 백업 파일 호환)
//  반환: 복원된 키 개수
// ─────────────────────────────────────────────
function applyBackupData(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('형식 오류');
  var restored = 0;

  // 1) 신규 통일 형식
  if (backup.data && typeof backup.data === 'object') {
    Object.keys(backup.data).forEach(function (key) {
      if (!backupKeyInfo(key)) return;                 // 등록된 키만 복원(안전)
      var v = backup.data[key];
      if (v === null || v === undefined) return;
      writeBackupValue(key, v);
      restored++;
    });
    return restored;
  }

  // 2) 구버전 평면 형식 (이전 백업 파일과 호환)
  var legacyMap = {
    tasks:      'my-tasklog-data',
    mvv:        'tasklog-mvv-data',
    lifewheel:  'my-tasklog-lifewheel',
    mandalarts: 'my-tasklog-mandalart',
    mandalart:  'my-tasklog-mandalart',
    notes:      'my-tasklog-notes',
    journal:    'my-tasklog-journal',
    corevalues: 'my-tasklog-corevalues',
    nickname:   'my-tasklog-nickname',
  };
  Object.keys(legacyMap).forEach(function (oldKey) {
    if (backup[oldKey] != null) { writeBackupValue(legacyMap[oldKey], backup[oldKey]); restored++; }
  });
  return restored;
}

// 백업 객체에서 Task 개수 세기 (확인창 표시용 — 신규/구버전 모두 지원)
function backupTaskCount(backup) {
  if (backup && backup.data && Array.isArray(backup.data['my-tasklog-data']))
    return backup.data['my-tasklog-data'].length;
  if (backup && Array.isArray(backup.tasks)) return backup.tasks.length;
  return 0;
}

// 백업 객체가 우리 형식인지 간단 검증
function isValidBackup(backup) {
  if (!backup || typeof backup !== 'object') return false;
  if (backup.data && typeof backup.data === 'object') return true;     // 신규
  if (Array.isArray(backup.tasks)) return true;                        // 구버전
  return false;
}

// ─────────────────────────────────────────────
//  복원용 빈 양식 — 백업 파일과 "완전히 같은 구조", 값만 비어 있음
// ─────────────────────────────────────────────
function buildRestoreTemplate() {
  var data = {};
  var fields = {};
  BACKUP_REGISTRY.forEach(function (item) {
    data[item.key]   = (item.type === 'json') ? [] : '';
    fields[item.key] = item.label;
  });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    backupDate: '',
    _guide: '이 파일은 복원용 빈 양식입니다. 백업 파일과 동일한 형식이에요. '
          + 'data 안의 각 항목에 값을 채운 뒤 [설정 > 백업 & 복원 > 파일 업로드]로 복원하세요. '
          + '비워 둔 항목은 복원할 때 무시되어 기존 데이터를 건드리지 않습니다.',
    _fields: fields,   // 각 키가 무슨 데이터인지 안내
    data: data,
  };
}

// ─────────────────────────────────────────────
//  공통 다운로드 헬퍼
// ─────────────────────────────────────────────
function downloadBackupJSON(obj, filename) {
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
