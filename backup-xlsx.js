// ============================================
//  📊 엑셀(.xlsx) 양식 — Task · 만다라트 다운로드/복원 변환기
// --------------------------------------------
//  ▸ JSON 양식이 어려워서, Task(할 일)를 엑셀 표로 편집할 수 있게 합니다.
//  ▸ 다운로드: 현재 Task를 한글 헤더 엑셀로 내보냄(빈 줄에 새 일정 추가 가능).
//  ▸ 복원: 엑셀을 업로드하면 행 → Task 객체로 변환해 백업 엔진(applyBackupData)으로 복원.
//  ▸ ID가 같은 줄은 기존 Task를 바탕으로 덮어써서 세부단계 등 숨은 데이터를 보존합니다.
//  ▸ 만다라트(2026-11-12)는 파일 아래쪽 '🎯 만다라트 엑셀' 절. 업로드한 파일에 '만다라트' 시트가
//    있으면 그쪽으로 간다(handleRestoreXlsx).
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
      // 만다라트 양식이면 그쪽으로 (Task 목록을 건드리지 않는다)
      if (mdtXlsxFindSheet(wb)) { handleRestoreMandalartWb(wb); if (input) input.value = ''; return; }
      // Task 양식도 아니면 멈춘다 — 다른 엑셀을 올려 Task 목록 전체가 엉뚱한 내용으로 바뀌지 않게
      if (!wb.SheetNames.some(function (n) { return n.indexOf('할일') >= 0 || n.toLowerCase().indexOf('task') >= 0; })) {
        throw new Error('TaskLog 엑셀 양식이 아닙니다. [설정 > 백업 & 복원]에서 받은 Task 또는 만다라트 엑셀을 올려 주세요.');
      }
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


// ============================================
//  🎯 만다라트 엑셀 — 연도별 Section · Project 를 표로 받고 올린다 (2026-11-12)
// --------------------------------------------
//  ▸ 시트 '만다라트'  : 한 줄 = Project 한 칸. Project 가 없는 Section 은 Project 를 비운 줄 하나.
//  ▸ 시트 '핵심 목표' : 한 줄 = 한 해의 가운데 칸. 시트가 없으면 가운데는 건드리지 않는다.
//  ▸ 올리면 파일에 있는 연도만 바뀐다. 그 연도에서 파일에 있는 Section 은 이름·이모지·색과
//    Project 8칸을 파일대로 맞추고(파일에 없는 칸은 비운다), 파일에 없는 Section 은 그대로 둔다.
//  ▸ ⚠️ 칸의 정체는 번호다(Section 1~8 · Project 1~8). 앱에서 이름을 고칠 때와 같이, 이름이 바뀌어도
//    그 칸의 실적 기록·습관 체크·목표값은 그대로 이어진다. Task 연결도 번호로 걸려 있어 따라온다.
//    엑셀에 없는 숨은 값(실적 기록·habitLog·목표값·SMART 등)은 올려도 지우지 않는다.
//  ▸ 저장은 mandalart.js 의 saveMandalarts — 앱에서 고칠 때와 같은 길로 서버까지 올라간다.
// ============================================
var MDT_XLSX_SHEET = '만다라트';
var MDT_XLSX_CORE_SHEET = '핵심 목표';
var MDT_XLSX_HEADERS = ['연도', 'Section 번호', 'Section', '이모지', '색', 'Project 번호', 'Project', '유형', '완료', '메모'];
var MDT_XLSX_CORE_HEADERS = ['연도', '이모지', '핵심 목표', '연결 1', '연결 2', '연결 3', '연결 4'];
// 새 연도의 빈 Section — mandalart.js ensureMdtData 의 기본값과 같다
var MDT_XLSX_EMOJIS = ['💼', '🏃', '🧘', '📚', '🔧', '🎓', '🎸', '🎮'];
var MDT_XLSX_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#16a085', '#e67e22', '#8e44ad', '#1abc9c'];

function readMandalartArray() {
  try {
    var v = JSON.parse(localStorage.getItem('my-tasklog-mandalart') || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function mdtXlsxById(a, b) { return (+a.id || 0) - (+b.id || 0); }

// 유형 이름표 — 앱의 mdtTypeLabel 과 같은 글자
function mdtXlsxTypeLabel(a) {
  if (a.trackingType === 'habit') return '습관형';
  return (a.resultMode === 'goal' || a.resultMode === 'value') ? '실적 · 목표' : '실적 · 누적';
}
// 엑셀 글자 → 유형. '' = 그대로 둠, null = 알 수 없는 글자
function mdtXlsxParseType(v) {
  var s = String(v == null ? '' : v).replace(/\s/g, '');
  if (!s) return '';
  if (s.indexOf('습관') >= 0) return 'habit';
  if (s.indexOf('목표') >= 0) return 'result-goal';
  if (s.indexOf('누적') >= 0 || s === '실적' || s === '실적형') return 'result-cum';
  return null;
}

// 새 칸 — mandalart.js ensureMdtData 의 칸과 같은 모양이어야 한다
function mdtXlsxBlankAction(id) {
  return {
    id: id, text: '', completed: false, trackingType: 'task', achieveType: 'result', resultCompare: 'gte', resultMode: 'cum',
    habitFreq: 'weekly', successThreshold: 80, habitWeeklyTarget: 1, habitLog: {}, resultMonths: {}, resultEntries: [],
    annualTarget: 0, annualUnit: '', cumActual: 0, goalText: '', evalIndicators: '',
    quarters: (typeof defaultMdtQuarters === 'function') ? defaultMdtQuarters()
      : [{ done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }]
  };
}
function mdtXlsxBlankSection(i) {   // i = 1..8
  return {
    id: i, text: 'Section' + i, emoji: MDT_XLSX_EMOJIS[i - 1], color: MDT_XLSX_COLORS[i - 1], badge: 'Section' + i,
    smart: { specific: '', measurable: '', achievable: '', relevant: '', timeBound: '' }, notes: '',
    actions: [1, 2, 3, 4, 5, 6, 7, 8].map(mdtXlsxBlankAction)
  };
}
// [2011,2012,2013,2015] → '2011–2013 · 2015'
function mdtXlsxYearsLabel(ys) {
  ys = ys.map(Number).sort(function (a, b) { return a - b; });
  var out = [], s = null, p = null;
  ys.concat([null]).forEach(function (y) {
    if (s !== null && y === p + 1) { p = y; return; }
    if (s !== null) out.push(s === p ? String(s) : (s + '–' + p));
    s = p = y;
  });
  return out.join(' · ');
}

// ─────────────────────────────────────────────
//  만다라트 엑셀 다운로드 — 모든 연도
// ─────────────────────────────────────────────
function downloadMandalartExcel() {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    return;
  }
  var arr = readMandalartArray().slice().sort(function (a, b) { return a.year - b.year; });
  var aoa = [MDT_XLSX_HEADERS], core = [MDT_XLSX_CORE_HEADERS];
  arr.forEach(function (m) {
    var cg = m.coreGoal || {}, cn = cg.connections || [];
    core.push([m.year, cg.emoji || '', cg.text || '', cn[0] || '', cn[1] || '', cn[2] || '', cn[3] || '']);
    (m.subGoals || []).slice().sort(mdtXlsxById).forEach(function (sg) {
      var head = [m.year, sg.id, sg.text || '', sg.emoji || '', sg.color || ''];
      var acts = (sg.actions || []).filter(function (a) { return (a.text || '').trim(); }).sort(mdtXlsxById);
      if (!acts.length) { aoa.push(head.concat(['', '', '', '', ''])); return; }
      acts.forEach(function (a) {
        aoa.push(head.concat([a.id, a.text.trim(), mdtXlsxTypeLabel(a), a.completed ? 'O' : '', a.memo || '']));
      });
    });
  });
  if (!arr.length) {   // 비어 있으면 예시 한 줄
    var y0 = new Date().getFullYear();
    aoa.push([y0, 1, '건강', '💪', '#E64A19', 1, '예) 걷기 주3회↑', '습관형', '', '']);
    core.push([y0, '🎯', '예) 올해의 핵심 목표', '', '', '', '']);
  }
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 7 }, { wch: 8 }, { wch: 18 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 40 }, { wch: 12 }, { wch: 6 }, { wch: 40 }];
  var wsCore = XLSX.utils.aoa_to_sheet(core);
  wsCore['!cols'] = [{ wch: 7 }, { wch: 6 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
  var guide = [
    ['🎯 TaskLog 만다라트 엑셀 — 사용법'],
    [''],
    ['1) [만다라트] 시트에서 한 줄이 Project 한 칸입니다. Project 가 없는 Section 은 Project 를 비운 줄 하나로 둡니다.'],
    ['2) [핵심 목표] 시트에서 한 줄이 한 해의 가운데 칸입니다.'],
    ['3) 고친 뒤 저장하고, 앱 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 반영됩니다.'],
    [''],
    ['올리면 무엇이 바뀌나'],
    ['연도', '파일에 있는 연도만 바뀝니다. 없는 연도는 그대로 둡니다. 새 연도는 새로 만듭니다.'],
    ['Section', '파일에 있는 Section 은 이름·이모지·색과 Project 8칸을 파일대로 맞춥니다. 파일에 없는 칸은 비웁니다. 파일에 없는 Section 은 그대로 둡니다.'],
    ['번호', 'Section 번호·Project 번호(1~8)가 칸의 자리입니다. 이름을 바꿔도 그 칸의 실적 기록·습관 체크·목표값과 Task 연결은 그대로 이어집니다(앱에서 이름을 고칠 때와 같습니다). 번호를 비우면 남은 칸에 차례로 들어갑니다.'],
    [''],
    ['열 설명'],
    ['이모지 · 색', '비우면 지금 값을 그대로 둡니다. 색은 #RRGGBB (예: #E64A19).'],
    ['유형', '실적 · 누적 / 실적 · 목표 / 습관형. 비우면 지금 유형을 그대로 둡니다(새 칸은 실적 · 누적).'],
    ['완료', '완료했으면 O, 아니면 비워 둡니다.'],
    ['메모', 'Project 메모. 비우면 메모를 지웁니다.'],
    ['연결 1~4', '가운데 칸 둘레의 네 줄. 비우면 지웁니다.'],
    [''],
    ['⚠️ 실적 기록·목표값·습관 체크는 엑셀에 없고, 올려도 지우지 않습니다. 올리기 전에 전체 백업(JSON)을 먼저 받아 두세요.']
  ];
  var wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 14 }, { wch: 100 }];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, MDT_XLSX_SHEET);
  XLSX.utils.book_append_sheet(wb, wsCore, MDT_XLSX_CORE_SHEET);
  XLSX.utils.book_append_sheet(wb, wsGuide, '사용법');
  var fname = 'tasklog-만다라트-' +
    (typeof fmtDateForFile === 'function' ? fmtDateForFile(new Date()) : Date.now()) + '.xlsx';
  XLSX.writeFile(wb, fname);
}

// ─────────────────────────────────────────────
//  엑셀 → 올릴 내용 (검사만 하고 아직 쓰지 않는다)
// ─────────────────────────────────────────────
function mdtXlsxFindSheet(wb) {
  for (var i = 0; i < wb.SheetNames.length; i++) {
    if (wb.SheetNames[i].indexOf('만다라트') >= 0) return wb.SheetNames[i];
  }
  return null;
}
// 머리글 줄 찾기 — 띄어쓰기는 무시한다('Section 번호' = 'Section번호')
function mdtXlsxHeaderMap(rows, need) {
  for (var r = 0; r < Math.min(rows.length, 10); r++) {
    var map = {};
    (rows[r] || []).forEach(function (h, i) {
      var k = String(h == null ? '' : h).replace(/\s/g, '');
      if (k && map[k] === undefined) map[k] = i;
    });
    if (need.every(function (k) { return map[k] !== undefined; })) return { row: r, col: map };
  }
  return null;
}
function mdtXlsxCell(row, col, key) {
  var i = col[key];
  if (i === undefined) return undefined;
  var v = row[i];
  return v == null ? '' : String(v).trim();
}
// 번호 없는 Section — 같은 해 위 줄의 같은 이름 → 지금 만다라트의 같은 이름 → 빈 번호
function mdtXlsxFindSecId(Y, m, name) {
  var i;
  for (i = 1; i <= 8; i++) if (Y.secs[i] && Y.secs[i].name === name) return i;
  var sgs = (m && m.subGoals) || [];
  for (i = 0; i < sgs.length; i++) if ((sgs[i].text || '') === name && !Y.secs[sgs[i].id]) return sgs[i].id;
  for (i = 1; i <= 8; i++) if (!Y.secs[i]) return i;
  return 0;
}

function workbookToMandalartPlan(wb) {
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[mdtXlsxFindSheet(wb)], { header: 1, raw: false, defval: '' });
  var h = mdtXlsxHeaderMap(rows, ['연도', 'Section', 'Project']);
  if (!h) throw new Error("'만다라트' 시트에서 머리글(연도 · Section · Project)을 찾지 못했습니다");
  var C = h.col, errs = [], years = {}, existing = {};
  readMandalartArray().forEach(function (m) { existing[m.year] = m; });
  var has = { emoji: C['이모지'] !== undefined, color: C['색'] !== undefined, type: C['유형'] !== undefined,
              done: C['완료'] !== undefined, memo: C['메모'] !== undefined };

  for (var r = h.row + 1; r < rows.length; r++) {
    var row = rows[r] || [], line = r + 1;
    var ys = mdtXlsxCell(row, C, '연도'), sname = mdtXlsxCell(row, C, 'Section'), pname = mdtXlsxCell(row, C, 'Project');
    var sno = mdtXlsxCell(row, C, 'Section번호') || '', pno = mdtXlsxCell(row, C, 'Project번호') || '';
    if (!ys && !sname && !pname && !sno && !pno) continue;               // 빈 줄
    var y = parseInt(ys, 10);
    if (!(y >= 2000 && y <= 2100)) { errs.push(line + '행: 연도가 이상합니다 (' + ys + ')'); continue; }
    var Y = years[y] || (years[y] = { year: y, secs: {}, order: [] });

    var sid = sno ? parseInt(sno, 10) : 0;
    if (sno && !(sid >= 1 && sid <= 8)) { errs.push(line + '행: Section 번호는 1~8 입니다 (' + sno + ')'); continue; }
    if (!sid) {
      if (!sname) { errs.push(line + '행: Section 번호나 이름이 필요합니다'); continue; }
      sid = mdtXlsxFindSecId(Y, existing[y], sname);
      if (!sid) { errs.push(line + '행: ' + y + '년 Section 이 8개를 넘습니다 (' + sname + ')'); continue; }
    }
    var S = Y.secs[sid];
    if (!S) { S = Y.secs[sid] = { id: sid, name: sname, emoji: '', color: '', acts: {}, autoActs: [] }; Y.order.push(sid); }
    else if (sname && S.name && S.name !== sname) {
      errs.push(line + '행: ' + y + '년 Section ' + sid + ' 의 이름이 위 줄(' + S.name + ')과 다릅니다 (' + sname + ')'); continue;
    }
    if (sname && !S.name) S.name = sname;
    if (has.emoji) { var em = mdtXlsxCell(row, C, '이모지'); if (em) S.emoji = em; }
    if (has.color) {
      var co = mdtXlsxCell(row, C, '색');
      if (co) {
        if (!/^#?[0-9a-f]{6}$/i.test(co)) { errs.push(line + '행: 색은 #RRGGBB 로 적어 주세요 (' + co + ')'); continue; }
        S.color = '#' + co.replace('#', '').toUpperCase();
      }
    }
    if (!pname && !pno) continue;                                         // Project 없는 Section 줄
    var typ = has.type ? mdtXlsxParseType(mdtXlsxCell(row, C, '유형')) : '';
    if (typ === null) { errs.push(line + '행: 유형은 실적 · 누적 / 실적 · 목표 / 습관형 중 하나입니다 (' + mdtXlsxCell(row, C, '유형') + ')'); continue; }
    var P = { name: pname, type: typ, line: line,
              done: has.done ? xlsxTruthy(mdtXlsxCell(row, C, '완료')) : undefined,
              memo: has.memo ? String(row[C['메모']] == null ? '' : row[C['메모']]).trim() : undefined };
    if (pno) {
      var aid = parseInt(pno, 10);
      if (!(aid >= 1 && aid <= 8)) { errs.push(line + '행: Project 번호는 1~8 입니다 (' + pno + ')'); continue; }
      if (S.acts[aid]) { errs.push(line + '행: ' + y + '년 Section ' + sid + ' 의 Project ' + aid + '번이 두 번 나옵니다'); continue; }
      S.acts[aid] = P;
    } else S.autoActs.push(P);
  }
  // 번호 없는 Project 는 남은 칸에 차례로
  Object.keys(years).forEach(function (y) {
    years[y].order.forEach(function (sid) {
      var S = years[y].secs[sid];
      S.autoActs.forEach(function (P) {
        for (var i = 1; i <= 8; i++) if (!S.acts[i]) { S.acts[i] = P; return; }
        errs.push(P.line + '행: ' + y + '년 ' + (S.name || ('Section ' + sid)) + ' 의 Project 가 8개를 넘습니다 (' + P.name + ')');
      });
    });
  });

  // 핵심 목표 시트 (없어도 된다)
  var core = {}, cname = null;
  wb.SheetNames.forEach(function (n) { if (n.replace(/\s/g, '').indexOf('핵심목표') >= 0) cname = n; });
  if (cname) {
    var crows = XLSX.utils.sheet_to_json(wb.Sheets[cname], { header: 1, raw: false, defval: '' });
    var ch = mdtXlsxHeaderMap(crows, ['연도', '핵심목표']);
    if (!ch) errs.push("'핵심 목표' 시트에서 머리글(연도 · 핵심 목표)을 찾지 못했습니다");
    else {
      for (var k = ch.row + 1; k < crows.length; k++) {
        var cr = crows[k] || [];
        var cy = mdtXlsxCell(cr, ch.col, '연도');
        if (!cy && !mdtXlsxCell(cr, ch.col, '핵심목표')) continue;
        var yy = parseInt(cy, 10);
        if (!(yy >= 2000 && yy <= 2100)) { errs.push("'핵심 목표' " + (k + 1) + '행: 연도가 이상합니다 (' + cy + ')'); continue; }
        core[yy] = {
          emoji: mdtXlsxCell(cr, ch.col, '이모지') || '',
          text: mdtXlsxCell(cr, ch.col, '핵심목표'),
          conns: [1, 2, 3, 4].map(function (j) { return mdtXlsxCell(cr, ch.col, '연결' + j); })
        };
      }
    }
  }
  return { years: years, core: core, errs: errs };
}

// ─────────────────────────────────────────────
//  올릴 내용 → 새 만다라트 배열 (지금 값은 건드리지 않고 사본에)
// ─────────────────────────────────────────────
function mdtXlsxApply(plan) {
  var arr = JSON.parse(JSON.stringify(readMandalartArray()));
  var byYear = {};
  arr.forEach(function (m) { byYear[m.year] = m; });
  var st = { years: [], newYears: [], updYears: [], named: 0, renamed: 0, cleared: 0 };
  var all = {};
  Object.keys(plan.years).forEach(function (y) { all[y] = 1; });
  Object.keys(plan.core).forEach(function (y) { all[y] = 1; });
  Object.keys(all).map(Number).sort(function (a, b) { return a - b; }).forEach(function (y) {
    st.years.push(y);
    var m = byYear[y];
    if (!m) {
      m = { id: Date.now() + y, year: y, coreGoal: { text: '', emoji: '🎯', connections: ['', '', '', ''] },
            subGoals: [1, 2, 3, 4, 5, 6, 7, 8].map(mdtXlsxBlankSection) };
      arr.push(m); byYear[y] = m; st.newYears.push(y);
    } else st.updYears.push(y);

    var c = plan.core[y];
    if (c) {
      if (!m.coreGoal) m.coreGoal = { text: '', emoji: '🎯', connections: ['', '', '', ''] };
      if (!Array.isArray(m.coreGoal.connections)) m.coreGoal.connections = ['', '', '', ''];
      if (c.emoji) m.coreGoal.emoji = c.emoji;
      if (c.text !== undefined) m.coreGoal.text = c.text;
      c.conns.forEach(function (v, i) { if (v !== undefined) m.coreGoal.connections[i] = v; });
    }

    var Y = plan.years[y];
    if (!Y) return;
    if (!Array.isArray(m.subGoals)) m.subGoals = [];
    Y.order.forEach(function (sid) {
      var S = Y.secs[sid];
      // ⚠️ subGoals 배열 순서는 바꾸지 않는다 — Life Wheel 은 번호가 아니라 '배열 자리'로 짝을 짓는다(lwSyncToMandalart)
      var sg = m.subGoals.find(function (s) { return s.id === sid; });
      if (!sg) { sg = mdtXlsxBlankSection(sid); m.subGoals.push(sg); }
      if (S.name && S.name !== sg.text) {
        if (!sg.badge || sg.badge === sg.text) sg.badge = S.name;
        sg.text = S.name;
      }
      if (S.emoji && S.emoji !== sg.emoji) sg.emoji = S.emoji;
      if (S.color && S.color.toUpperCase() !== String(sg.color || '').toUpperCase()) sg.color = S.color;
      if (!Array.isArray(sg.actions)) sg.actions = [];
      var added = false;
      for (var i = 1; i <= 8; i++) {
        var a = sg.actions.find(function (x) { return x.id === i; });
        if (!a) { a = mdtXlsxBlankAction(i); sg.actions.push(a); added = true; }
        var P = S.acts[i], oldT = (a.text || '').trim(), newT = P ? P.name : '';
        if (oldT && newT && oldT !== newT) st.renamed++;
        if (oldT && !newT) st.cleared++;
        if (newT) st.named++;
        // 값이 같으면 쓰지 않는다 — 안 바뀐 칸까지 '내가 고친 칸'으로 서버에 올라가지 않게
        if ((a.text || '') !== newT) a.text = newT;
        if (!P) continue;
        var tv = (a.trackingType === 'habit') ? 'habit' : ((a.resultMode === 'goal' || a.resultMode === 'value') ? 'result-goal' : 'result-cum');
        if (P.type && P.type !== tv) {
          if (P.type === 'habit') a.trackingType = 'habit';
          else { a.trackingType = 'task'; a.achieveType = 'result'; a.resultMode = (P.type === 'result-goal') ? 'goal' : 'cum'; }
        }
        if (P.done !== undefined && !!a.completed !== P.done) a.completed = P.done;
        if (P.memo !== undefined && (a.memo || '') !== P.memo) a.memo = P.memo;
      }
      if (added) sg.actions.sort(mdtXlsxById);   // 화면 순서는 sg.actionOrder 가 따로 정한다
    });
  });
  return { arr: arr, st: st };
}

// ─────────────────────────────────────────────
//  Life Wheel 도 같이 맞춘다
//  ⚠️ Life Wheel 이 Section 이름·이모지·색의 원천이다. 만다라트 화면을 열 때마다 lwSyncToMandalart 가
//     그 해 Life Wheel 값으로 만다라트를 덮어쓴다. 만다라트만 바꾸면 화면을 여는 순간 옛 이름으로 돌아간다.
//     짝은 번호가 아니라 배열 자리다(Life Wheel sections[i] ↔ 만다라트 subGoals[i]).
//     Life Wheel 에 그 해가 없으면 손대지 않는다 — 나중에 그 해를 열면 만다라트 이름으로 만들어진다.
// ─────────────────────────────────────────────
function mdtXlsxLifeWheelPatch(plan, arr) {
  var lw = null;
  try { lw = JSON.parse(localStorage.getItem('my-tasklog-lifewheel') || '[]'); } catch (e) { lw = null; }
  var out = { years: [], changes: [] };
  if (!Array.isArray(lw)) return out;
  Object.keys(plan.years).map(Number).forEach(function (y) {
    var rec = lw.find(function (r) { return r && r.year === y; });
    var m = arr.find(function (x) { return x.year === y; });
    if (!rec || !Array.isArray(rec.sections) || !m) return;
    var touched = false;
    plan.years[y].order.forEach(function (sid) {
      var idx = m.subGoals.findIndex(function (s) { return s.id === sid; });
      var sec = rec.sections[idx], sg = m.subGoals[idx];
      if (idx < 0 || !sec || !sg) return;
      var ch = {};
      if (sg.text && sec.name !== sg.text) ch.name = sg.text;
      if (sg.emoji && sec.emoji !== sg.emoji) ch.emoji = sg.emoji;
      if (sg.color && String(sec.color || '').toUpperCase() !== String(sg.color).toUpperCase()) ch.color = sg.color;
      if (Object.keys(ch).length) { out.changes.push({ year: y, idx: idx, ch: ch }); touched = true; }
    });
    if (touched) out.years.push(y);
  });
  return out;
}
function mdtXlsxLifeWheelApply(patch) {
  if (!patch.changes.length) return;
  var useMem = (typeof loadLifeWheel === 'function' && typeof saveLifeWheel === 'function' && typeof lwYears !== 'undefined');
  var years;
  if (useMem) { loadLifeWheel(); years = lwYears; }
  else { try { years = JSON.parse(localStorage.getItem('my-tasklog-lifewheel') || '[]'); } catch (e) { return; } }
  patch.changes.forEach(function (c) {
    var rec = years.find(function (r) { return r && r.year === c.year; });
    var sec = rec && rec.sections && rec.sections[c.idx];
    if (sec) Object.keys(c.ch).forEach(function (k) { sec[k] = c.ch[k]; });
  });
  if (useMem) saveLifeWheel();
  else localStorage.setItem('my-tasklog-lifewheel', JSON.stringify(years));
}

// ─────────────────────────────────────────────
//  만다라트 엑셀 → 확인 → 저장 (handleRestoreXlsx 에서 부른다)
// ─────────────────────────────────────────────
function handleRestoreMandalartWb(wb) {
  var plan = workbookToMandalartPlan(wb);
  if (plan.errs.length) {
    throw new Error('만다라트 엑셀을 고쳐 주세요.\n' + plan.errs.slice(0, 12).join('\n')
      + (plan.errs.length > 12 ? '\n… 외 ' + (plan.errs.length - 12) + '건' : ''));
  }
  var res = mdtXlsxApply(plan), st = res.st;
  if (!st.years.length) throw new Error('올릴 만다라트 줄이 없습니다');
  var lwPatch = mdtXlsxLifeWheelPatch(plan, res.arr);
  var msg = '만다라트 엑셀로 ' + st.years.length + '개 연도(' + mdtXlsxYearsLabel(st.years) + ')를 맞춥니다.\n'
    + (st.newYears.length ? '· 새로 만드는 연도: ' + mdtXlsxYearsLabel(st.newYears) + '\n' : '')
    + (st.updYears.length ? '· 바뀌는 연도: ' + mdtXlsxYearsLabel(st.updYears) + '\n' : '')
    + '· 이름이 있는 Project ' + st.named + '칸'
    + (st.renamed ? ' · 이름이 바뀌는 칸 ' + st.renamed : '')
    + (st.cleared ? ' · 비워지는 칸 ' + st.cleared : '') + '\n'
    + (lwPatch.years.length ? '· Life Wheel ' + mdtXlsxYearsLabel(lwPatch.years) + ' 의 Section 이름·이모지·색도 같이 바꿉니다(점수·Ideal·Goal 은 그대로)\n' : '')
    + (st.renamed ? '\n이름이 바뀌어도 그 칸의 실적 기록·습관 체크는 그대로 이어집니다(앱에서 이름을 고칠 때와 같습니다).\n' : '')
    + '파일에 없는 연도와 Section 은 그대로 둡니다. 계속할까요?';
  if (!confirm(msg)) return;
  mdtXlsxLifeWheelApply(lwPatch);
  if (typeof saveMandalarts === 'function') {
    mandalarts = res.arr;     // mandalart.js 의 전역. saveMandalarts 가 저장하고 Task 의 Project 이름도 맞춘다
    saveMandalarts();
  } else {
    localStorage.setItem('my-tasklog-mandalart', JSON.stringify(res.arr));
  }
  alert('만다라트 올리기 완료! (' + st.years.length + '개 연도) 페이지를 새로고침합니다. ✅');
  location.reload();
}
