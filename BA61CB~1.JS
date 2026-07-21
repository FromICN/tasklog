// ============================================
//  📊 엑셀(.xlsx) 양식 — Task 데이터 전용 다운로드/복원 변환기
// --------------------------------------------
//  ▸ JSON 양식이 어려워서, Task(할 일)를 엑셀 표로 편집할 수 있게 합니다.
//  ▸ 다운로드: 현재 Task를 한글 헤더 엑셀로 내보냄(빈 줄에 새 일정 추가 가능).
//  ▸ 복원: 엑셀을 업로드하면 행 → Task 객체로 변환해 백업 엔진(applyBackupData)으로 복원.
//  ▸ ID가 같은 줄은 기존 Task를 바탕으로 덮어써서 세부단계 등 숨은 데이터를 보존합니다.
//  ▸ SheetJS(XLSX) 라이브러리가 필요합니다 (index.html 에서 CDN 로드).
// ============================================

var TASK_STORAGE_KEY = 'my-tasklog-data';

// 엑셀 열(헤더) ↔ Task 필드 정의. 순서가 곧 열 순서입니다.
var TASK_XLSX_HEADERS = [
  'ID', '할 일', '완료', '중요(별표)', '시작일', '마감일', '마감시간', '담당자', '세부단계(| 구분, @마감일)'
];

// '완료', 'O', '예', 'Y', '1', 'true', '✓' 등을 true 로 해석
function xlsxTruthy(v) {
  if (v === true) return true;
  if (v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'o' || s === '완료' || s === 'y' || s === 'yes' || s === '예'
      || s === '1' || s === 'true' || s === '✓' || s === 'v' || s === 'x';
}

// 날짜/시간 값을 안전하게 문자열로 (SheetJS 가 Date 객체로 줄 수도 있어 방어)
function xlsxDateStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    var y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }
  return String(v).trim();
}
function xlsxTimeStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    var h = v.getHours(), mi = v.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (mi < 10 ? '0' + mi : mi);
  }
  var s = String(v).trim();
  // 'HH:MM:SS' → 'HH:MM'
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
}

// 현재 localStorage 의 Task 배열을 읽어옵니다.
function readTaskArray() {
  try {
    var v = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

// ─────────────────────────────────────────────
//  Task 한 개 → 엑셀 한 행(배열)
// ─────────────────────────────────────────────
function taskToRow(t) {
  var due = t.dueDateTime || '';
  var dueDate = due ? String(due).slice(0, 10) : '';
  var dueTime = (due && t.hasTime) ? String(due).slice(11, 16) : '';
  var steps = Array.isArray(t.steps)
    ? t.steps.map(function (s) {
        var str = (s.completed ? '[v] ' : '') + (s.text || '');
        if (s.dueDateTime) {
          var sd = String(s.dueDateTime).slice(0, 10);
          var stime = s.hasTime ? (' ' + String(s.dueDateTime).slice(11, 16)) : '';
          str += ' @' + sd + stime;
        }
        return str;
      }).join(' | ')
    : '';
  return [
    t.id || '',
    t.text || '',
    t.completed ? '완료' : '',
    t.starred ? 'O' : '',
    t.startDate || '',
    dueDate,
    dueTime,
    t.assignee || '',
    steps
  ];
}

// ─────────────────────────────────────────────
//  엑셀 양식 다운로드 — 현재 Task 를 표로 내보냄
// ─────────────────────────────────────────────
function downloadTaskExcel() {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    return;
  }
  var tasksArr = readTaskArray();
  var aoa = [TASK_XLSX_HEADERS];
  tasksArr.forEach(function (t) { aoa.push(taskToRow(t)); });
  // 비어 있으면 입력 예시 한 줄 제공
  if (tasksArr.length === 0) {
    aoa.push(['', '예) 보고서 초안 작성', '', 'O', '2026-06-21', '2026-06-25', '18:00', '', '자료수집 @2026-06-22 | 목차정리 @2026-06-23 14:00 | [v]초안작성']);
  }

  var wsTask = XLSX.utils.aoa_to_sheet(aoa);
  wsTask['!cols'] = [
    { wch: 16 }, { wch: 36 }, { wch: 8 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 40 }
  ];

  // 사용법 시트
  var guide = [
    ['📊 TaskLog 엑셀 양식 — 사용법'],
    [''],
    ['1) [할일(Task)] 시트에서 한 줄이 할 일 한 개입니다.'],
    ['2) 맨 아래 빈 줄에 새 할 일을 추가하면 됩니다.'],
    ['3) 다 채운 뒤 저장하고, 앱 [설정 > 백업 & 복원 > 파일 업로드]에 올리면 복원됩니다.'],
    [''],
    ['열 설명'],
    ['ID', '비워 두면 새 할 일로 추가됩니다. 기존 값을 그대로 두면 그 할 일을 수정합니다(세부 데이터 보존).'],
    ['할 일', '필수. 할 일 제목.'],
    ['완료', '완료했으면 "완료" 또는 O, 아니면 비워 둡니다.'],
    ['중요(별표)', '별표 표시하려면 O, 아니면 비워 둡니다.'],
    ['시작일', 'YYYY-MM-DD 형식 (예: 2026-06-21). 없으면 비워 둡니다.'],
    ['마감일', 'YYYY-MM-DD 형식. 없으면 비워 둡니다.'],
    ['마감시간', 'HH:MM 형식 (예: 18:00). 시간이 없으면 비워 둡니다.'],
    ['담당자', '담당자 이름(선택).'],
    ['세부단계', '하위 단계(to-do)를 " | " 로 구분해 적습니다. 완료한 단계는 앞에 [v]. 마감일은 뒤에 @날짜 또는 @날짜 시간 으로 적습니다. 예: 자료수집 @2026-06-22 | 정리 @2026-06-23 14:00 | [v]초안. 비워 두면 기존 세부단계가 유지됩니다.'],
    [''],
    ['⚠️ 복원하면 현재 Task 목록 전체가 이 엑셀 내용으로 교체됩니다. 복원 전 전체 백업(JSON)을 먼저 받아두세요.']
  ];
  var wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 14 }, { wch: 80 }];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsTask, '할일(Task)');
  XLSX.utils.book_append_sheet(wb, wsGuide, '사용법');

  var fname = 'tasklog-할일양식-' +
    (typeof fmtDateForFile === 'function' ? fmtDateForFile(new Date()) : Date.now()) + '.xlsx';
  XLSX.writeFile(wb, fname);
}

// ─────────────────────────────────────────────
//  엑셀 워크북 → Task 배열  (ID 매칭으로 기존 데이터 보존)
// ─────────────────────────────────────────────
function workbookToTaskArray(wb) {
  // '할일'이 들어간 시트 우선, 없으면 첫 시트
  var sheetName = wb.SheetNames[0];
  for (var i = 0; i < wb.SheetNames.length; i++) {
    if (wb.SheetNames[i].indexOf('할일') >= 0 || wb.SheetNames[i].toLowerCase().indexOf('task') >= 0) {
      sheetName = wb.SheetNames[i]; break;
    }
  }
  var ws = wb.Sheets[sheetName];
  var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!rows.length) throw new Error('엑셀에서 데이터를 찾지 못했습니다');

  // 헤더 행 찾기 ('할 일' 또는 'ID' 가 있는 줄)
  var headerIdx = 0;
  for (var r = 0; r < rows.length; r++) {
    var joined = rows[r].join('|');
    if (joined.indexOf('할 일') >= 0 || joined.indexOf('ID') >= 0) { headerIdx = r; break; }
  }

  // 기존 Task 를 ID로 매핑(중첩 데이터 보존용)
  var existing = readTaskArray();
  var byId = {};
  existing.forEach(function (t) { if (t && t.id != null) byId[String(t.id)] = t; });

  var out = [];
  var usedIds = {};
  for (var k = headerIdx + 1; k < rows.length; k++) {
    var row = rows[k];
    if (!row) continue;
    var id      = (row[0] === undefined ? '' : String(row[0]).trim());
    var text    = (row[1] === undefined ? '' : String(row[1]).trim());
    if (!text) continue;                      // 제목 없는 줄은 건너뜀
    var done    = xlsxTruthy(row[2]);
    var starred = xlsxTruthy(row[3]);
    var startD  = xlsxDateStr(row[4]);
    var dueD    = xlsxDateStr(row[5]);
    var dueT    = xlsxTimeStr(row[6]);
    var assignee= (row[7] === undefined ? '' : String(row[7]).trim());
    var stepsRaw= (row[8] === undefined ? '' : String(row[8]).trim());

    // 기존 Task 가 있으면 복제해서 시작(숨은 필드 보존), 없으면 새로 생성
    var base = (id && byId[id]) ? JSON.parse(JSON.stringify(byId[id])) : null;
    var task = base || {
      id: Date.now() + out.length, text: '', completed: false, starred: false,
      createdAt: new Date().toISOString(), dueDateTime: null, hasTime: false,
      steps: [], reminder: null, assignee: '', assignees: [], repeat: null,
      startDate: null, prevTaskIds: [], nextTaskIds: []
    };

    // ID 중복 방지(엑셀에서 같은 ID를 두 줄에 쓴 경우)
    var finalId = task.id;
    if (usedIds[String(finalId)]) finalId = Date.now() + out.length + Math.floor(Math.random() * 1000);
    usedIds[String(finalId)] = true;
    task.id = finalId;

    task.text      = text;
    task.completed = done;
    task.starred   = starred;
    task.assignee  = assignee;
    task.startDate = startD || null;
    if (dueD) {
      task.dueDateTime = dueT ? (dueD + 'T' + dueT + ':00') : (dueD + 'T09:00:00');
      task.hasTime = !!dueT;
    } else {
      task.dueDateTime = null;
      task.hasTime = false;
    }
    // 세부단계: 입력이 있으면 새로 구성, 비어 있으면 기존(base) 유지
    if (stepsRaw) {
      task.steps = stepsRaw.split('|').map(function (s) {
        s = s.trim();
        var sc = false;
        if (/^\[v\]/i.test(s)) { sc = true; s = s.replace(/^\[v\]\s*/i, ''); }
        // 세부단계 마감일: "@YYYY-MM-DD" 또는 "@YYYY-MM-DD HH:MM"
        var sDue = null, sHasTime = false;
        var m = s.match(/@\s*(\d{4}-\d{1,2}-\d{1,2})(?:[ T](\d{1,2}:\d{2}))?/);
        if (m) {
          sDue = m[2] ? (m[1] + 'T' + m[2] + ':00') : (m[1] + 'T09:00:00');
          sHasTime = !!m[2];
          s = s.replace(m[0], '').trim();
        }
        return { id: Date.now() + Math.floor(Math.random() * 100000), text: s, completed: sc, dueDateTime: sDue, hasTime: sHasTime };
      }).filter(function (s) { return s.text; });
    } else if (!base) {
      task.steps = [];
    }
    out.push(task);
  }
  return out;
}

// ─────────────────────────────────────────────
//  엑셀 파일 → 복원 실행 (handleRestoreFile 에서 .xlsx 일 때 호출)
// ─────────────────────────────────────────────
function handleRestoreXlsx(file, input) {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    if (input) input.value = '';
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var taskArr = workbookToTaskArray(wb);
      if (!taskArr.length) throw new Error('가져올 할 일이 없습니다. [할 일] 열을 채웠는지 확인하세요.');
      if (!confirm('엑셀의 내용으로 현재 Task 목록 전체를 교체합니다.\n(할 일 ' + taskArr.length + '개)\n계속할까요?')) {
        if (input) input.value = ''; return;
      }
      var backup = {
        format: (typeof BACKUP_FORMAT !== 'undefined' ? BACKUP_FORMAT : 'tasklog-backup'),
        version: (typeof BACKUP_VERSION !== 'undefined' ? BACKUP_VERSION : 2),
        backupDate: new Date().toISOString(),
        data: {}
      };
      backup.data[TASK_STORAGE_KEY] = taskArr;
      var n = applyBackupData(backup);
      alert('복원 완료! (할 일 ' + taskArr.length + '개) 페이지를 새로고침합니다. ✅');
      location.reload();
    } catch (err) {
      alert('엑셀 복원 실패: ' + err.message);
    }
    if (input) input.value = '';
  };
  reader.readAsArrayBuffer(file);
}
