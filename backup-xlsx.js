// ============================================
//  📊 엑셀(.xlsx) 양식 — Task · 만다라트 다운로드/복원 변환기
// --------------------------------------------
//  ▸ JSON 양식이 어려워서, Task(할 일)를 엑셀 표로 편집할 수 있게 합니다.
//  ▸ 다운로드: Task · To Do 를 표 두 장으로 (2026-11-25 v2 — 아래 '📋 Task 엑셀 v2' 절).
//  ▸ 복원: 고친 칸만 반영하고, 받은 그대로 올리면 아무것도 바뀌지 않는다. 결과는 백업 엔진(applyBackupData)으로 쓴다.
//  ▸ 만다라트(2026-11-12)는 파일 아래쪽 '🎯 만다라트 엑셀' 절. 업로드한 파일에 '만다라트' 시트가
//    있으면 그쪽으로 간다(handleRestoreXlsx).
//  ▸ SheetJS(XLSX) 라이브러리가 필요합니다 (index.html 에서 CDN 로드).
// ============================================

var TASK_STORAGE_KEY = 'my-tasklog-data';

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

// ─────────────────────────────────────────────
//  📋 Task 엑셀 v2 (2026-11-25) — 받은 파일을 그대로 올리면 한 글자도 안 바뀐다
// ─────────────────────────────────────────────
//  ▸ 시트 '할일(Task)' 한 줄 = Task 하나 · 시트 'To Do' 한 줄 = To Do 하나 (Task 안 순서대로).
//  ▸ 맨 오른쪽 '보존 데이터' 칸에 그 줄의 원본(JSON)을 담는다. 올릴 때 칸마다
//    · 원본으로 그린 값과 같으면 '안 고친 칸' → 지금 앱의 값을 그대로 둔다
//    · 다르면 그 칸만 고친다 (Section·Project, 날짜·시간처럼 묶인 칸은 묶음으로)
//    · 지금 앱에 없는 ID 면(초기화·다른 기기) 보존 데이터로 되살린다 → 엑셀만으로도 손실 없이 복원된다
//  ▸ 파일에 없는 Task·To Do 는 지운다(복원 = 파일이 기준). 확인 창이 지워질 개수를 먼저 보여 준다.
//  ▸ 예전 양식(세부단계 한 칸, 2026-11-25 이전에 받은 파일)도 읽는다 — 그때도 안 고친 칸·안 고친
//    To Do 는 그대로 둔다. 예전에는 세부단계를 늘 새로 만들어 To Do 의 완료 시각·수행 시간·
//    Work Diary 위치·Focus 기록이 지워졌다.
//  ⚠️ 시트 이름 '할일(Task)' · 'To Do' 를 바꾸지 말 것 — handleRestoreXlsx 가 시트 이름으로 양식을 가른다.
var TX_SHEET_TASK = '할일(Task)';
var TX_SHEET_TODO = 'To Do';
var TX_TASK_HEADERS = ['ID', '할 일', '완료', '완료 시각', '중요(별표)', '상태', '우선순위',
  '시작일', '시작 시간', '마감일', '마감 시간', '막대', '만다라트 연도', 'Section', 'Project',
  '장소', '메모', 'Coworker', 'UpStream', '선행 Task ID', '후행 Task ID', '만든 시각', '구글 일정 ID', '보존 데이터'];
var TX_TODO_HEADERS = ['Task ID', 'Task', 'To Do ID', 'To Do', '완료', '완료 시각', '마감일', '마감 시간',
  '수행 시간', '구글 일정 ID', '보존 데이터'];
var TX_KEEP_MAX = 32000;   // 엑셀 한 칸 한도(32,767자) 안쪽

function txPad(n) { return (n < 10 ? '0' : '') + n; }
// ISO → 이 기기 시간대 'YYYY-MM-DD HH:MM'
function txLocal(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.getFullYear() + '-' + txPad(d.getMonth() + 1) + '-' + txPad(d.getDate()) + ' ' + txPad(d.getHours()) + ':' + txPad(d.getMinutes());
}
// 'YYYY-MM-DD HH:MM' (또는 엑셀 날짜값) → ISO. '' = 비었음, null = 못 읽음
function txParseLocal(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    var p = XLSX.SSF.parse_date_code(v);
    return p ? new Date(p.y, p.m - 1, p.d, p.H, p.M, 0, 0).toISOString() : null;
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0, 0).toISOString();
}
function txList(v) { return String(v == null ? '' : v).split(/[,，\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
function txKeepJson(o, dropSteps) {
  var c = {};
  // To Do 는 To Do 시트에 따로 담는다. 자리만 남겨 두어야 되살릴 때 칸 순서까지 그대로다.
  Object.keys(o).forEach(function (k) { c[k] = (dropSteps && k === 'steps') ? [] : o[k]; });
  var s = JSON.stringify(c);
  return s.length > TX_KEEP_MAX ? '' : s;
}
function txMdtYears() {
  var out = {};
  readMandalartArray().forEach(function (m) { if (m && m.year) out[m.year] = m; });
  return out;
}
// Task 의 만다라트 연결을 엑셀 세 칸으로 (연도 · Section · Project)
function txLinkCells(t, mdts) {
  var a = t.mdtAction, g = t.mdtGoal;
  var yr = (a && a.year != null) ? a.year : ((g && g.year != null) ? g.year : '');
  var sgId = (a && a.sgId != null) ? a.sgId : ((g && g.sgId != null) ? g.sgId : null);
  var sec = '';
  if (sgId != null) {
    var m = mdts[parseInt(yr, 10)];
    var sg = m && (m.subGoals || []).find(function (s) { return s.id === sgId; });
    sec = sg ? (sg.text || '') : ((g && g.text) || '');
  } else if (g && g.text) sec = g.text;
  return { yr: yr === '' ? '' : String(yr), sec: sec, proj: a ? (a.text || '') : '' };
}
function txSlotsText(slots) {
  return (Array.isArray(slots) ? slots : []).map(function (sl) {
    var a = String(sl.start || ''), b = String(sl.end || '');
    var sd = a.slice(0, 10), ed = b.slice(0, 10);
    return sd + ' ' + a.slice(11, 16) + '~' + (ed === sd ? '' : ed + ' ') + b.slice(11, 16);
  }).join(' | ');
}

// 한 줄의 칸 값 (내보내기와 '안 고친 칸' 판정이 같은 함수를 쓴다)
function txTaskCells(t, mdts) {
  var L = txLinkCells(t, mdts);
  var sd = String(t.startDate || ''), dd = String(t.dueDateTime || '');
  return {
    'ID': t.id == null ? '' : String(t.id),
    '할 일': t.text || '',
    '완료': t.completed ? '완료' : '',
    '완료 시각': txLocal(t.completedAt),
    '중요(별표)': t.starred ? 'O' : '',
    '상태': t.status || '',
    '우선순위': t.eisenhower || '',
    '시작일': sd.slice(0, 10),
    '시작 시간': (t.startHasTime && sd.length >= 16) ? sd.slice(11, 16) : '',
    '마감일': dd.slice(0, 10),
    '마감 시간': (t.hasTime && dd.length >= 16) ? dd.slice(11, 16) : '',
    '막대': t.calBar ? 'O' : '',
    '만다라트 연도': L.yr, 'Section': L.sec, 'Project': L.proj,
    '장소': t.location || '',
    '메모': t.notes || '',
    'Coworker': (Array.isArray(t.assignees) ? t.assignees : []).join(', '),
    'UpStream': (Array.isArray(t.upstreamDepts) ? t.upstreamDepts : []).join(', '),
    '선행 Task ID': (Array.isArray(t.prevTaskIds) ? t.prevTaskIds : []).join(', '),
    '후행 Task ID': (Array.isArray(t.nextTaskIds) ? t.nextTaskIds : []).join(', '),
    '만든 시각': txLocal(t.createdAt),
    '구글 일정 ID': t.gcalId || '',
    '보존 데이터': txKeepJson(t, true)
  };
}
function txStepCells(t, s) {
  var dd = String(s.dueDateTime || '');
  return {
    'Task ID': String(t.id), 'Task': t.text || '',
    'To Do ID': s.id == null ? '' : String(s.id),
    'To Do': s.text || '',
    '완료': s.completed ? '완료' : '',
    '완료 시각': txLocal(s.completedAt),
    '마감일': dd.slice(0, 10),
    '마감 시간': (s.hasTime && dd.length >= 16) ? dd.slice(11, 16) : '',
    '수행 시간': txSlotsText(s.slots),
    '구글 일정 ID': s.gcalId || '',
    '보존 데이터': txKeepJson(s, false)
  };
}

// 현재 localStorage 의 Task 배열을 읽어옵니다.
function readTaskArray() {
  try {
    var v = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

// ─────────────────────────────────────────────
//  엑셀 양식 다운로드 — 지금 Task · To Do 를 표 두 장으로
// ─────────────────────────────────────────────
function buildTaskWorkbook(tasksArr) {
  var mdts = txMdtYears();
  var aoaT = [TX_TASK_HEADERS], aoaS = [TX_TODO_HEADERS];
  tasksArr.forEach(function (t) {
    var c = txTaskCells(t, mdts);
    aoaT.push(TX_TASK_HEADERS.map(function (h) { return c[h]; }));
    (t.steps || []).forEach(function (s) {
      var d = txStepCells(t, s);
      aoaS.push(TX_TODO_HEADERS.map(function (h) { return d[h]; }));
    });
  });
  var wsT = XLSX.utils.aoa_to_sheet(aoaT), wsS = XLSX.utils.aoa_to_sheet(aoaS);
  // 날짜·시간·ID 가 엑셀에서 숫자로 바뀌지 않게 모든 칸을 글자 칸으로
  [wsT, wsS].forEach(function (ws) {
    Object.keys(ws).forEach(function (k) { if (k[0] !== '!' && ws[k] && ws[k].t === 's') ws[k].z = '@'; });
  });
  wsT['!cols'] = [16, 36, 6, 16, 8, 7, 10, 11, 8, 11, 8, 5, 8, 14, 22, 18, 24, 12, 12, 14, 14, 16, 14, 12].map(function (w) { return { wch: w }; });
  wsS['!cols'] = [16, 30, 16, 32, 6, 16, 11, 8, 30, 14, 12].map(function (w) { return { wch: w }; });
  var guide = [
    ['📊 TaskLog 할 일 엑셀 — 사용법'],
    [''],
    ['1) [할일(Task)] 시트 한 줄 = Task 하나, [To Do] 시트 한 줄 = To Do 하나(Task 안 순서대로).'],
    ['2) 고칠 칸만 고치고 저장한 뒤 [설정 > 백업 & 복원 > 파일로 복원]에 올립니다. 고치지 않은 칸은 지금 앱의 값이 그대로 남습니다.'],
    ['3) 받은 파일을 고치지 않고 그대로 올리면 아무것도 바뀌지 않습니다. 앱을 초기화했거나 다른 기기라도 이 파일로 그대로 되살아납니다.'],
    ['⚠️ 파일에 없는 Task · To Do 는 지워집니다(줄을 지우면 지우는 것). 확인 창에 지워질 개수가 먼저 나옵니다.'],
    [''],
    ['[할일(Task)] 칸'],
    ['ID', '비우면 새 Task. 새 Task 에 To Do 를 달려면 ID 에 아무 숫자(예: 1)를 적고 To Do 시트 Task ID 에 같은 숫자를 적습니다.'],
    ['할 일', '필수. 완료한 Task 는 앞에 [YYMMDD](완료일)가 붙어 있습니다 — 만다라트 실적이 이 날짜를 읽습니다.'],
    ['완료 · 완료 시각', '완료/O. 완료로 바꾸면 [YYMMDD]·완료 시각이 붙고, 지우면 떼어집니다. 완료 시각은 YYYY-MM-DD HH:MM.'],
    ['중요(별표) · 막대', 'O 면 켬. 막대 = 달력에 Start~Due 를 막대로.'],
    ['상태 · 우선순위', '상태: 대기 · 진행 · 중단 · 완료 · 취소. 우선순위: DO · SCHEDULE · DELEGATE · DELETE.'],
    ['시작일·시간 / 마감일·시간', 'YYYY-MM-DD / HH:MM. 시간을 비우면 종일.'],
    ['만다라트 연도 · Section · Project', '그 해 만다라트의 이름 그대로. Project 를 비우면 Section 에만, 셋 다 비우면 연결 없음.'],
    ['장소 · 메모', '그대로.'],
    ['Coworker · UpStream', '여러 명은 쉼표로.'],
    ['선행 · 후행 Task ID', 'Task ID 를 쉼표로.'],
    ['만든 시각 · 구글 일정 ID', '참고용. 고쳐도 반영되지 않습니다.'],
    ['보존 데이터', '고치지 마세요. 엑셀에 칸이 없는 값(알림·Work Diary 위치 등)을 담아, 손실 없이 되살리는 데 씁니다.'],
    [''],
    ['[To Do] 칸'],
    ['Task ID · To Do ID', 'To Do ID 를 비우면 새 To Do. Task ID 는 [할일(Task)] 시트에 있는 ID 여야 합니다. Task 칸은 참고용.'],
    ['To Do · 완료 · 완료 시각', 'Task 와 같은 규칙.'],
    ['마감일 · 마감 시간', 'YYYY-MM-DD / HH:MM.'],
    ['수행 시간', '2026-04-13 14:00~16:30 처럼, 여러 줄은 " | " 로. 다음 날로 넘어가면 2026-04-13 23:00~2026-04-14 01:00.'],
    [''],
    ['완전한 백업은 [전체 백업 내보내기 (JSON)] 입니다 — 메모·저널·만다라트·MVV 등 모든 페이지가 들어 있습니다. 이 엑셀은 할 일(Task·To Do)만 담습니다.']
  ];
  var wsG = XLSX.utils.aoa_to_sheet(guide);
  wsG['!cols'] = [{ wch: 26 }, { wch: 100 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsT, TX_SHEET_TASK);
  XLSX.utils.book_append_sheet(wb, wsS, TX_SHEET_TODO);
  XLSX.utils.book_append_sheet(wb, wsG, '사용법');
  return wb;
}
function downloadTaskExcel() {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    return;
  }
  var wb = buildTaskWorkbook(readTaskArray());
  var fname = 'tasklog-할일양식-' +
    (typeof fmtDateForFile === 'function' ? fmtDateForFile(new Date()) : Date.now()) + '.xlsx';
  XLSX.writeFile(wb, fname);
}

// ─────────────────────────────────────────────
//  엑셀 → Task 배열 (검사만 하고 아직 쓰지 않는다)
//  반환 { arr, st:{same, changed, created, deleted, deletedNames, todoChanged, todoCreated, todoDeleted}, errs }
// ─────────────────────────────────────────────
function txSheetRows(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
}
function txFindSheet(wb, test) {
  for (var i = 0; i < wb.SheetNames.length; i++) if (test(wb.SheetNames[i])) return wb.SheetNames[i];
  return null;
}
function txIdStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v).trim().replace(/\.0+$/, '');
}
function txIdVal(s) { return /^\d+$/.test(s) ? Number(s) : s; }   // 앱의 ID 는 숫자다
// 칸 하나를 비교·적용할 수 있게 같은 모양으로
var TX_DATE_COLS = { '시작일': 1, '마감일': 1 }, TX_TIME_COLS = { '시작 시간': 1, '마감 시간': 1 },
    TX_YES_COLS = { '완료': 1, '중요(별표)': 1, '막대': 1 }, TX_STAMP_COLS = { '완료 시각': 1, '만든 시각': 1 },
    TX_ID_COLS = { 'ID': 1, 'Task ID': 1, 'To Do ID': 1, '만다라트 연도': 1 };
function txNorm(h, v) {
  if (TX_DATE_COLS[h]) return gcalXlsxDate(v);
  if (TX_TIME_COLS[h]) return gcalXlsxTime(v);
  if (TX_YES_COLS[h]) return gcalXlsxYes(v) ? 'Y' : '';
  if (TX_STAMP_COLS[h]) { var iso = txParseLocal(v); return iso === null ? null : txLocal(iso); }
  if (TX_ID_COLS[h]) return txIdStr(v);
  if (h === '수행 시간') return String(v == null ? '' : v).split('|').map(function (x) { return x.trim().replace(/\s+/g, ' '); }).filter(Boolean).join(' | ');
  return v == null ? '' : String(v);
}
function txDonePrefix(iso) {
  var d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return '[' + String(d.getFullYear()).slice(2) + txPad(d.getMonth() + 1) + txPad(d.getDate()) + '] ';
}
// 수행 시간 글 → slots (같은 시각의 예전 줄은 id·fs 를 그대로 쓴다)
function txParseSlots(text, oldSlots, newId) {
  var out = [], used = {}, olds = Array.isArray(oldSlots) ? oldSlots : [];
  var parts = String(text || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean);
  for (var i = 0; i < parts.length; i++) {
    var m = parts[i].match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*~\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var sd = m[1], ed = m[4] || m[1];
    var st = txPad(+m[2]) + ':' + m[3], et = txPad(+m[5]) + ':' + m[6];
    if (!m[4] && et < st) { var n = new Date(sd + 'T00:00:00'); n.setDate(n.getDate() + 1); ed = n.getFullYear() + '-' + txPad(n.getMonth() + 1) + '-' + txPad(n.getDate()); }
    var start = sd + 'T' + st + ':00', end = ed + 'T' + et + ':00';
    var old = null;
    for (var j = 0; j < olds.length; j++) if (!used[j] && olds[j].start === start && olds[j].end === end) { old = olds[j]; used[j] = 1; break; }
    out.push(old ? JSON.parse(JSON.stringify(old)) : { id: newId(), start: start, end: end });
  }
  return out;
}
// 완료 묶음 (완료 · 이름 · 완료 시각) — Task · To Do 공통. 앱의 toggleComplete / toggleStep 과 같은 규칙.
function txApplyDone(o, c, ch, errs, tag) {
  if (ch['완료']) {
    var done = c['완료'] === 'Y';
    if (done && !o.completed) {
      if (!o.completedAt) o.completedAt = new Date().toISOString();
      if (!/^\[\d{6}\]/.test(o.text || '')) o.text = txDonePrefix(o.completedAt) + (o.text || '');
      delete o.wdTimed; delete o.wdLogAt;
    } else if (!done && o.completed) {
      o.text = String(o.text || '').replace(/^\[\d{6}\] /, '');
      delete o.completedAt; delete o.wdTimed; delete o.wdLogAt;
    }
    o.completed = done;
  }
  if (ch['_text']) o.text = c['_text'];
  if (ch['완료 시각']) {
    var iso = txParseLocal(c['완료 시각raw']);
    if (iso === null) errs.push(tag + ': 완료 시각을 읽지 못했습니다 (예: 2026-04-13 14:00)');
    else if (iso === '') delete o.completedAt; else o.completedAt = iso;
  }
}

function workbookToTaskPlan(wb, cur) {
  var tName = txFindSheet(wb, function (n) { return n.indexOf('할일') >= 0 || n.toLowerCase().indexOf('task') >= 0 && n.replace(/\s/g, '').toLowerCase() !== 'todo'; }) || wb.SheetNames[0];
  var sName = txFindSheet(wb, function (n) { return n.replace(/\s/g, '').toLowerCase() === 'todo'; });
  var rowsT = txSheetRows(wb, tName);
  var hT = mdtXlsxHeaderMap(rowsT, ['ID', '할일']);
  if (!hT) throw new Error("'" + tName + "' 시트에서 머리글(ID · 할 일)을 찾지 못했습니다");
  if (!sName || hT.col['보존데이터'] === undefined) return txLegacyPlan(rowsT, hT, cur);

  var mdts = txMdtYears(), errs = [];
  var curById = {}; cur.forEach(function (t) { curById[String(t.id)] = t; });
  var used = {}, next = Date.now();
  cur.forEach(function (t) { used[t.id] = 1; (t.steps || []).forEach(function (s) { used[s.id] = 1; }); });
  function newId() { while (used[next]) next++; used[next] = 1; return next++; }
  function cellOf(row, col, h) { var i = col[h.replace(/\s/g, '')]; return i === undefined ? undefined : row[i]; }

  // ── To Do 시트를 Task ID 별로 모은다 ──
  var rowsS = txSheetRows(wb, sName);
  var hS = mdtXlsxHeaderMap(rowsS, ['TaskID', 'ToDo']);
  if (!hS) throw new Error("'To Do' 시트에서 머리글(Task ID · To Do)을 찾지 못했습니다");
  var stepRows = {}, stepOrder = [];
  for (var r = hS.row + 1; r < rowsS.length; r++) {
    var row = rowsS[r] || [];
    var tid = txIdStr(cellOf(row, hS.col, 'Task ID')), txt = cellOf(row, hS.col, 'To Do');
    if (!tid && (txt === '' || txt == null)) continue;
    if (!tid) { errs.push('To Do ' + (r + 1) + '번 줄: Task ID 가 비었습니다'); continue; }
    if (!stepRows[tid]) { stepRows[tid] = []; stepOrder.push(tid); }
    stepRows[tid].push({ r: r + 1, row: row });
  }

  var st = { same: 0, changed: 0, created: 0, revived: 0, deleted: 0, deletedNames: [], todoChanged: 0, todoCreated: 0, todoDeleted: 0 };
  var out = [], seen = {}, tempMap = {};
  for (var k = hT.row + 1; k < rowsT.length; k++) {
    var rowT = rowsT[k] || [];
    var idS = txIdStr(cellOf(rowT, hT.col, 'ID'));
    var textRaw = cellOf(rowT, hT.col, '할 일');
    if (!idS && (textRaw === '' || textRaw == null)) continue;
    var tag = '할일 ' + (k + 1) + '번 줄';
    if (textRaw === '' || textRaw == null) { errs.push(tag + ': 할 일(이름)이 비었습니다'); continue; }
    if (idS && seen[idS]) { errs.push(tag + ': ID ' + idS + ' 가 두 줄에 있습니다'); continue; }
    if (idS) seen[idS] = 1;

    var snap = null, keepRaw = cellOf(rowT, hT.col, '보존 데이터');
    if (keepRaw) { try { snap = JSON.parse(String(keepRaw)); } catch (e) { snap = null; } }
    if (snap && String(snap.id) !== idS) snap = null;            // 다른 줄의 보존 데이터를 붙여 넣은 경우
    var base = idS ? curById[idS] : null;
    var isNew = !base && !snap;
    var ref = snap || base || {};                                   // '안 고친 칸' 판정 기준
    var t = isNew ? ((typeof newTaskDoc === 'function') ? newTaskDoc({ text: '' }) : { text: '', steps: [] })
                  : JSON.parse(JSON.stringify(base || snap));
    if (isNew) {
      t.id = (idS && !used[txIdVal(idS)] && !/^\d{1,9}$/.test(idS)) ? txIdVal(idS) : newId();
      used[t.id] = 1;
      if (idS) tempMap[idS] = t.id;
      if (!t.createdAt) t.createdAt = new Date().toISOString();
    }
    var refCells = txTaskCells(ref, mdts);
    var c = {}, ch = {}, any = false;
    TX_TASK_HEADERS.forEach(function (h) {
      if (h === 'ID' || h === '만든 시각' || h === '구글 일정 ID' || h === '보존 데이터') return;
      var raw = cellOf(rowT, hT.col, h);
      if (raw === undefined) return;                               // 그 칸이 없는 파일 — 건드리지 않는다
      var v = txNorm(h, raw), rv = txNorm(h, refCells[h]);
      c[h] = v; c[h + 'raw'] = raw;
      if (isNew ? (v !== '' && v !== rv) || (v === null) : v !== rv) { ch[h] = true; any = true; }
    });
    if (ch['할 일']) { ch['_text'] = true; c['_text'] = String(textRaw); }
    txApplyDone(t, c, ch, errs, tag);
    if (ch['중요(별표)']) t.starred = c['중요(별표)'] === 'Y';
    if (ch['상태']) t.status = c['상태'] || '대기';
    if (ch['우선순위']) t.eisenhower = c['우선순위'] || null;
    if (ch['막대']) { if (c['막대'] === 'Y') t.calBar = true; else delete t.calBar; }
    if (ch['장소']) { if (c['장소'].trim()) t.location = c['장소']; else delete t.location; }
    if (ch['메모']) t.notes = c['메모'];
    if (ch['Coworker']) t.assignees = txList(c['Coworker']);
    if (ch['UpStream']) { t.upstreamDepts = txList(c['UpStream']); t.upstreamDept = t.upstreamDepts.join(', '); }
    if (ch['선행 Task ID']) t.prevTaskIds = txList(c['선행 Task ID']).map(txIdVal);
    if (ch['후행 Task ID']) t.nextTaskIds = txList(c['후행 Task ID']).map(txIdVal);
    ['시작', '마감'].forEach(function (p) {
      var dH = p + '일', tH = p + ' 시간';
      if (!ch[dH] && !ch[tH]) return;
      var d = c[dH], tm = c[tH];
      if (d === null || tm === null) { errs.push(tag + ': ' + p + '일·시간을 읽지 못했습니다 (예: 2026-04-13 / 14:00)'); return; }
      if (d === undefined) d = refCells[dH];
      if (tm === undefined) tm = refCells[tH];
      if (!d && tm) { errs.push(tag + ': ' + p + ' 시간만 있고 날짜가 없습니다'); return; }
      var val = d ? d + 'T' + (tm || '09:00') + ':00' : null;
      if (p === '시작') { t.startDate = val; t.startHasTime = !!(d && tm); }
      else { t.dueDateTime = val; t.hasTime = !!(d && tm); }
    });
    if (ch['만다라트 연도'] || ch['Section'] || ch['Project']) {
      var yS = c['만다라트 연도'] !== undefined ? c['만다라트 연도'] : refCells['만다라트 연도'];
      var sS = c['Section'] !== undefined ? c['Section'] : refCells['Section'];
      var pS = c['Project'] !== undefined ? c['Project'] : refCells['Project'];
      if (!String(sS).trim() && !String(pS).trim()) {
        delete t.mdtGoal; t.mdtAction = null;
        delete t.lwSection; delete t.lwSectionName; delete t.lwSectionEmoji;
      } else if (!String(sS).trim()) errs.push(tag + ': Project 만 있고 Section 이 비었습니다');
      else {
        var y = parseInt(yS, 10), m = mdts[y];
        var sg = m && (m.subGoals || []).find(function (s) { return s.text && gcalSecKey(s.text) === gcalSecKey(sS); });
        if (!y) errs.push(tag + ': 만다라트 연도를 적어 주세요');
        else if (!sg) errs.push(tag + ': ' + y + '년 만다라트에 Section \'' + sS + '\' 이 없습니다');
        else {
          var act = null;
          if (String(pS).trim()) {
            var a = (sg.actions || []).find(function (x) { return x.text && gcalNormName(x.text) === gcalNormName(pS); });
            if (!a) errs.push(tag + ": Section '" + sg.text + "' 에 Project '" + pS + "' 이 없습니다");
            else act = { year: y, sgId: sg.id, actionId: a.id, text: a.text };
          }
          t.mdtGoal = { year: y, sgId: sg.id, text: sg.text };
          t.mdtAction = act;
          delete t.lwSection; delete t.lwSectionName; delete t.lwSectionEmoji;
        }
      }
    }

    // ── 이 Task 의 To Do ──
    var srows = stepRows[idS] || [], stepsOut = [], stepSeen = {}, stepAny = false;
    var baseSteps = {}; ((base && base.steps) || []).forEach(function (s) { baseSteps[String(s.id)] = s; });
    var snapSteps = {}; ((snap && snap.steps) || []).forEach(function (s) { snapSteps[String(s.id)] = s; });
    srows.forEach(function (sr) {
      var row = sr.row, stag = 'To Do ' + sr.r + '번 줄';
      var sid = txIdStr(cellOf(row, hS.col, 'To Do ID'));
      var sText = cellOf(row, hS.col, 'To Do');
      if (sText === '' || sText == null) { errs.push(stag + ': To Do 이름이 비었습니다'); return; }
      if (sid && stepSeen[sid]) { errs.push(stag + ': To Do ID ' + sid + ' 가 두 줄에 있습니다'); return; }
      if (sid) stepSeen[sid] = 1;
      var sSnap = null, sk = cellOf(row, hS.col, '보존 데이터');
      if (sk) { try { sSnap = JSON.parse(String(sk)); } catch (e) { sSnap = null; } }
      if (sSnap && String(sSnap.id) !== sid) sSnap = null;
      var sBase = sid ? (baseSteps[sid] || snapSteps[sid] || null) : null;
      var sNew = !sBase && !sSnap;
      var sRef = sSnap || sBase || {};
      var s = sNew ? { id: 0, text: '', completed: false, dueDateTime: null, hasTime: false } : JSON.parse(JSON.stringify(sBase || sSnap));
      if (sNew) s.id = newId();
      var rc = txStepCells(t, sRef), sc = {}, sch = {}, sAny = false;
      ['To Do', '완료', '완료 시각', '마감일', '마감 시간', '수행 시간'].forEach(function (h) {
        var raw = cellOf(row, hS.col, h);
        if (raw === undefined) return;
        var v = txNorm(h, raw), rv = txNorm(h, rc[h]);
        sc[h] = v; sc[h + 'raw'] = raw;
        if (sNew ? (v !== '' && v !== rv) || v === null : v !== rv) { sch[h] = true; sAny = true; }
      });
      if (sch['To Do']) { sch['_text'] = true; sc['_text'] = String(sText); }
      txApplyDone(s, sc, sch, errs, stag);
      if (sch['마감일'] || sch['마감 시간']) {
        var d = sc['마감일'], tm = sc['마감 시간'];
        if (d === null || tm === null) errs.push(stag + ': 마감일·시간을 읽지 못했습니다');
        else {
          if (d === undefined) d = rc['마감일'];
          if (tm === undefined) tm = rc['마감 시간'];
          s.dueDateTime = d ? d + 'T' + (tm || '09:00') + ':00' : null;
          s.hasTime = !!(d && tm);
        }
      }
      if (sch['수행 시간']) {
        var sl = txParseSlots(sc['수행 시간'], s.slots, newId);
        if (sl === null) errs.push(stag + ': 수행 시간을 읽지 못했습니다 (예: 2026-04-13 14:00~16:30)');
        else if (sl.length) s.slots = sl; else delete s.slots;
      }
      if (sNew) st.todoCreated++; else if (sAny) st.todoChanged++;
      if (sNew || sAny) stepAny = true;
      stepsOut.push(s);
    });
    var baseIds = ((base || snap || {}).steps || []).map(function (s) { return String(s.id); });
    baseIds.forEach(function (id) { if (!stepSeen[id]) { st.todoDeleted++; stepAny = true; } });
    if (!stepAny && base && JSON.stringify(baseIds) !== JSON.stringify(stepsOut.map(function (s) { return String(s.id); }))) stepAny = true;   // 순서만 바뀜
    t.steps = stepAny || !base ? stepsOut : base.steps;
    if (isNew) st.created++; else if (!base) st.revived++; else if (any || stepAny) st.changed++; else st.same++;
    out.push(t);
  }
  // 임시 번호로 단 To Do 줄의 Task ID 를 진짜 ID 로 (새 Task 의 선행·후행 번호도)
  Object.keys(stepRows).forEach(function (tid) { if (!seen[tid]) errs.push('To Do 시트의 Task ID ' + tid + ' 가 [할일(Task)] 시트에 없습니다'); });
  out.forEach(function (t) {
    ['prevTaskIds', 'nextTaskIds'].forEach(function (k) {
      if (Array.isArray(t[k])) t[k] = t[k].map(function (x) { return tempMap[String(x)] !== undefined ? tempMap[String(x)] : x; });
    });
  });
  cur.forEach(function (t) { if (!seen[String(t.id)]) { st.deleted++; if (st.deletedNames.length < 5) st.deletedNames.push(t.text); } });
  return { arr: out, st: st, errs: errs };
}

// ── 예전 양식(2026-11-25 이전에 받은 파일: 세부단계 한 칸) ──
//  예전 내보내기와 같은 모양으로 지금 값을 그려 보고, 다른 칸만 고친다.
function txLegacyRow(t) {
  var due = t.dueDateTime || '';
  var steps = Array.isArray(t.steps) ? t.steps.map(txLegacyStep).join(' | ') : '';
  return { text: t.text || '', done: !!t.completed, star: !!t.starred, start: t.startDate || '',
           dueD: due ? String(due).slice(0, 10) : '', dueT: (due && t.hasTime) ? String(due).slice(11, 16) : '',
           who: t.assignee || '', steps: steps };
}
function txLegacyStep(s) {
  var str = (s.completed ? '[v] ' : '') + (s.text || '');
  if (s.dueDateTime) str += ' @' + String(s.dueDateTime).slice(0, 10) + (s.hasTime ? ' ' + String(s.dueDateTime).slice(11, 16) : '');
  return str;
}
function txLegacyPlan(rows, h, cur) {
  var errs = [], out = [], seen = {}, curById = {};
  cur.forEach(function (t) { curById[String(t.id)] = t; });
  var used = {}, next = Date.now();
  cur.forEach(function (t) { used[t.id] = 1; (t.steps || []).forEach(function (s) { used[s.id] = 1; }); });
  function newId() { while (used[next]) next++; used[next] = 1; return next++; }
  var st = { same: 0, changed: 0, created: 0, deleted: 0, deletedNames: [], todoChanged: 0, todoCreated: 0, todoDeleted: 0, legacy: true };
  function str(v) { return v == null ? '' : (v instanceof Date ? xlsxDateStr(v) : String(v)); }
  for (var k = h.row + 1; k < rows.length; k++) {
    var row = rows[k] || [];
    var idS = txIdStr(row[0]), text = str(row[1]).trim();
    if (!text) continue;
    var tag = '할일 ' + (k + 1) + '번 줄';
    if (idS && seen[idS]) { errs.push(tag + ': ID ' + idS + ' 가 두 줄에 있습니다'); continue; }
    if (idS) seen[idS] = 1;
    var done = xlsxTruthy(row[2]), star = xlsxTruthy(row[3]);
    // 엑셀에서 다시 친 날짜·시간은 숫자로 온다
    var startD = typeof row[4] === 'number' ? (gcalXlsxDate(row[4]) || '') : xlsxDateStr(row[4]);
    var dueD = typeof row[5] === 'number' ? (gcalXlsxDate(row[5]) || '') : xlsxDateStr(row[5]);
    var dueT = typeof row[6] === 'number' ? (gcalXlsxTime(row[6]) || '') : xlsxTimeStr(row[6]);
    var who = str(row[7]).trim(), stepsRaw = str(row[8]).trim();
    var base = idS ? curById[idS] : null;
    var t, any = false;
    if (!base) {
      t = { id: newId(), text: '', completed: false, starred: false, createdAt: new Date().toISOString(),
            dueDateTime: null, hasTime: false, steps: [], reminder: null, assignee: '', assignees: [], repeat: null,
            startDate: null, prevTaskIds: [], nextTaskIds: [] };
      st.created++;
    } else t = JSON.parse(JSON.stringify(base));
    var L = base ? txLegacyRow(base) : { text: '', done: false, star: false, start: '', dueD: '', dueT: '', who: '', steps: '' };
    if (!base || text !== L.text.trim()) { t.text = text; any = true; }
    if (!base || done !== L.done) { t.completed = done; any = true; }
    if (!base || star !== L.star) { t.starred = star; any = true; }
    if (!base || startD !== L.start) {
      t.startDate = startD ? (/^\d{4}-\d{2}-\d{2}$/.test(startD) ? startD + 'T09:00:00' : startD) : null;
      if (base) t.startHasTime = false;
      any = true;
    }
    if (!base || dueD !== L.dueD || dueT !== L.dueT) {
      t.dueDateTime = dueD ? (dueT ? dueD + 'T' + dueT + ':00' : dueD + 'T09:00:00') : null;
      t.hasTime = !!(dueD && dueT);
      any = true;
    }
    if (!base || who !== L.who) { t.assignee = who; any = true; }
    if (stepsRaw && (!base || stepsRaw !== L.steps)) {
      // 같은 이름의 예전 To Do 는 그대로 살린다(완료 시각·수행 시간·Work Diary 위치·Focus 기록)
      var pool = ((base && base.steps) || []).slice(), taken = {};
      t.steps = stepsRaw.split('|').map(function (s0) {
        var s = s0.trim(), sc = false;
        if (/^\[v\]/i.test(s)) { sc = true; s = s.replace(/^\[v\]\s*/i, ''); }
        var sDue = null, sHas = false;
        var m = s.match(/@\s*(\d{4}-\d{1,2}-\d{1,2})(?:[ T](\d{1,2}:\d{2}))?/);
        if (m) { sDue = m[2] ? (m[1] + 'T' + m[2] + ':00') : (m[1] + 'T09:00:00'); sHas = !!m[2]; s = s.replace(m[0], '').trim(); }
        if (!s) return null;
        for (var i = 0; i < pool.length; i++) {
          if (taken[i] || (pool[i].text || '') !== s) continue;
          taken[i] = 1;
          var o = JSON.parse(JSON.stringify(pool[i]));
          if (txLegacyStep(o) !== txLegacyStep({ text: s, completed: sc, dueDateTime: sDue, hasTime: sHas })) {
            if (!!o.completed !== sc) { o.completed = sc; if (!sc) delete o.completedAt; }
            var oldDue = o.dueDateTime ? String(o.dueDateTime).slice(0, 10) + (o.hasTime ? ' ' + String(o.dueDateTime).slice(11, 16) : '') : '';
            var newDue = sDue ? sDue.slice(0, 10) + (sHas ? ' ' + sDue.slice(11, 16) : '') : '';
            if (oldDue !== newDue) { o.dueDateTime = sDue; o.hasTime = sHas; }
            st.todoChanged++;
          }
          return o;
        }
        st.todoCreated++;
        return { id: newId(), text: s, completed: sc, dueDateTime: sDue, hasTime: sHas };
      }).filter(Boolean);
      pool.forEach(function (p, i) { if (!taken[i]) st.todoDeleted++; });
      any = true;
    } else if (!base) t.steps = [];
    if (base) { if (any) st.changed++; else st.same++; }
    out.push(t);
  }
  cur.forEach(function (t) { if (!seen[String(t.id)]) { st.deleted++; if (st.deletedNames.length < 5) st.deletedNames.push(t.text); } });
  return { arr: out, st: st, errs: errs };
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
      // 일정 가져오기 양식이면 Task 를 더하기만 한다 (목록을 바꾸지 않는다)
      if (gcalXlsxFindSheet(wb)) { handleImportEventsWb(wb); if (input) input.value = ''; return; }
      // Task 양식도 아니면 멈춘다 — 다른 엑셀을 올려 Task 목록 전체가 엉뚱한 내용으로 바뀌지 않게
      if (!wb.SheetNames.some(function (n) { return n.indexOf('할일') >= 0 || n.toLowerCase().indexOf('task') >= 0; })) {
        throw new Error('TaskLog 엑셀 양식이 아닙니다. [설정 > 백업 & 복원]에서 받은 Task 또는 만다라트 엑셀, 또는 일정 가져오기 엑셀을 올려 주세요.');
      }
      var plan = workbookToTaskPlan(wb, readTaskArray());
      if (plan.errs.length) {
        throw new Error('할 일 엑셀을 고쳐 주세요.\n' + plan.errs.slice(0, 12).join('\n')
          + (plan.errs.length > 12 ? '\n… 외 ' + (plan.errs.length - 12) + '건' : ''));
      }
      var taskArr = plan.arr, ps = plan.st;
      if (!taskArr.length) throw new Error('가져올 할 일이 없습니다. [할 일] 열을 채웠는지 확인하세요.');
      if (!ps.changed && !ps.created && !ps.revived && !ps.deleted) {
        alert('엑셀이 지금 Task 와 같습니다. 바뀌는 것이 없습니다. (Task ' + taskArr.length + '개)');
        if (input) input.value = ''; return;
      }
      var msg = '엑셀의 내용으로 Task 목록을 맞춥니다.' + (ps.legacy ? ' (예전 양식)' : '') + '\n'
        + '· 그대로 ' + ps.same + '개 · 바뀜 ' + ps.changed + '개 · 새로 ' + ps.created + '개'
        + (ps.revived ? ' · 보존 데이터로 되살림 ' + ps.revived + '개' : '') + '\n'
        + (ps.todoChanged || ps.todoCreated || ps.todoDeleted
            ? '· To Do: 바뀜 ' + ps.todoChanged + ' · 새로 ' + ps.todoCreated + ' · 지워짐 ' + ps.todoDeleted + '\n' : '')
        + (ps.deleted ? '⚠️ 엑셀에 없는 Task ' + ps.deleted + '개는 지워집니다: ' + ps.deletedNames.join(', ') + (ps.deleted > ps.deletedNames.length ? ' …' : '') + '\n' : '')
        + '\n엑셀에서 고치지 않은 칸은 지금 값 그대로 둡니다. 계속할까요?';
      if (!confirm(msg)) {
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
      // 색은 Life Wheel 에 색이 있을 때만 맞춘다 — 빈 색은 lwSyncToMandalart 가 만다라트 색을 덮지 않으므로
      //  (2026-11-25: 받은 파일을 그대로 올려도 2023–2025 Life Wheel 빈 색 24칸이 채워졌다)
      if (sg.color && sec.color && String(sec.color).toUpperCase() !== String(sg.color).toUpperCase()) ch.color = sg.color;
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
    + (st.updYears.length ? '· 파일대로 맞추는 연도(이미 있는 해): ' + mdtXlsxYearsLabel(st.updYears) + '\n' : '')
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


// ============================================
//  📅 일정 가져오기 엑셀 — 구글 캘린더 일정을 Task · To Do 로 '더한다' (2026-11-25)
// --------------------------------------------
//  ▸ 시트 '일정 가져오기' : 한 줄 = 일정 하나. '처리' 칸이 새 Task / 새 To Do / 채우기 / 건너뜀.
//  ▸ Task 엑셀과 달리 지금 Task 목록을 바꾸지 않는다 — 새 Task 는 더하고, 새 To Do 는 '연결 Task ID' 의
//    Task 끝에 붙인다. 지우는 것은 없다.
//  ▸ 채우기 = TaskLog 에 이미 있는 같은 일에 구글 정보를 넣는다(제목·완료·To Do 는 그대로).
//    · '연결 To Do ID' 가 있으면 그 To Do 에: 같은 날 시간 일정이면 수행 시간 한 줄, 마감일이 일정 날과 같으면 마감 시각도.
//    · 없으면 그 Task 에: Start·Due 날짜가 일정과 같으면 Start·Due 시간(여러 날이면 막대),
//      다르면(기간이 긴 Task) 그 일정을 To Do 로 하나 더한다.
//    · 장소는 Task 에 장소가 없을 때만, 메모는 Task 메모에 아직 없는 글이면 뒤에 붙인다.
//  ▸ 시간: 시작·종료 시간이 있으면 Start·Due 시간으로(startHasTime·hasTime). 비우면 종일.
//    To Do 는 같은 날 시작·종료 시간이 둘 다 있으면 수행 시간(slots) 한 줄도 만든다(여러 날짜 일정은 만들지 않는다).
//  ▸ 줄마다 '구글 일정 ID' 를 gcalId(두 번째부터는 gcalIds)로 남긴다. 같은 파일을 두 번 올려도 이미 들어간 줄은 건너뛴다.
//  ▸ ⚠️ 시트 이름에 '할일'·'task'·'만다라트' 를 넣지 말 것 — handleRestoreXlsx 가 시트 이름으로 양식을 가른다.
//    그래서 이 기능이 없는 옛 앱은 이 파일을 'TaskLog 양식이 아님'으로 거절한다(Task 목록 전체가 바뀌지 않는다).
// ============================================
var GCAL_XLSX_SHEET = '일정 가져오기';

function gcalXlsxFindSheet(wb) {
  for (var i = 0; i < wb.SheetNames.length; i++) {
    if (wb.SheetNames[i].replace(/\s/g, '').indexOf('일정가져오기') >= 0) return wb.SheetNames[i];
  }
  return null;
}
function gcalPad2(n) { return (n < 10 ? '0' : '') + n; }
// 날짜 칸 → 'YYYY-MM-DD' ('' = 비었음, null = 못 읽음). 엑셀이 날짜로 바꿔 둔 칸(일련번호)도 읽는다.
function gcalXlsxDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.getFullYear() + '-' + gcalPad2(v.getMonth() + 1) + '-' + gcalPad2(v.getDate());
  if (typeof v === 'number') {
    var p = XLSX.SSF.parse_date_code(v);
    return p ? p.y + '-' + gcalPad2(p.m) + '-' + gcalPad2(p.d) : null;
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3];
  var t = new Date(y, mo - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
  return y + '-' + gcalPad2(mo) + '-' + gcalPad2(d);
}
// 시간 칸 → 'HH:MM' ('' = 비었음, null = 못 읽음). '오후 2:30' · '2:30 PM' · 엑셀 시간값도 읽는다.
function gcalXlsxTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return gcalPad2(v.getHours()) + ':' + gcalPad2(v.getMinutes());
  if (typeof v === 'number') {
    var mins = Math.round((v - Math.floor(v)) * 1440);
    if (mins >= 1440) mins = 1439;
    return gcalPad2(Math.floor(mins / 60)) + ':' + gcalPad2(mins % 60);
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  var pm = /오후|pm/i.test(s), am = /오전|am/i.test(s);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return gcalPad2(h) + ':' + gcalPad2(mi);
}
// 완료 · 막대 칸 — xlsxTruthy 와 달리 'X' 는 '아니오'로 읽는다
function gcalXlsxYes(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'o' || s === '○' || s === '◯' || s === '완료' || s === 'y' || s === 'yes' || s === '예'
      || s === '1' || s === 'true' || s === '✓' || s === '✔' || s === 'v';
}
function gcalXlsxAction(v) {
  var k = String(v == null ? '' : v).replace(/\s/g, '').toLowerCase();
  if (!k) return '';
  if (k.indexOf('채우') >= 0 || k === 'fill') return 'fill';
  if (k.indexOf('todo') >= 0) return 'todo';
  if (k.indexOf('task') >= 0) return 'task';
  if (k === '건너뜀' || k === '건너뛰기' || k === 'x' || k === 'skip' || k === '제외') return 'skip';
  return null;
}
// 'S7 🌈 Fixing' · '🌈 Fixing' · 'Fixing' 모두 같은 Section 으로 본다
function gcalNormName(s) { return String(s == null ? '' : s).replace(/[\s ]+/g, ' ').trim().toLowerCase(); }
function gcalSecKey(s) { return gcalNormName(s).replace(/^s\d\s+/, '').replace(/^[^0-9a-z가-힣]+/, '').trim(); }
function gcalDonePrefix(ymd) { return '[' + ymd.slice(2, 4) + ymd.slice(5, 7) + ymd.slice(8, 10) + '] '; }
// 'YYYY-MM-DD' + 'HH:MM' (이 기기 시간대) → ISO
function gcalLocalIso(ymd, hm) {
  var p = ymd.split('-'), q = (hm || '00:00').split(':');
  return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1], 0, 0).toISOString();
}

// 엑셀 → 할 일 목록 (검사만 하고 아직 쓰지 않는다)
function workbookToEventPlan(wb, curTasks) {
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[gcalXlsxFindSheet(wb)], { header: 1, raw: true, defval: '' });
  var h = mdtXlsxHeaderMap(rows, ['처리', '제목', '시작일']);
  if (!h) throw new Error("'일정 가져오기' 시트에서 머리글(처리 · 제목 · 시작일)을 찾지 못했습니다");
  var col = h.col;
  function cell(row, key) { var i = col[key]; return i === undefined ? '' : row[i]; }
  function text(row, key) { var v = cell(row, key); return v == null ? '' : String(v).trim(); }

  var mdts = {};
  readMandalartArray().forEach(function (m) { if (m && m.year) mdts[m.year] = m; });
  var byId = {}, seen = {};
  function see(o) {
    if (!o) return;
    if (o.gcalId) seen[o.gcalId] = 1;
    (Array.isArray(o.gcalIds) ? o.gcalIds : []).forEach(function (g) { seen[g] = 1; });
  }
  (curTasks || []).forEach(function (t) {
    if (!t) return;
    byId[String(t.id)] = t;
    see(t);
    (t.steps || []).forEach(see);
  });

  var plan = { tasks: [], todos: [], fills: [], skip: 0, already: 0, errs: [] }, fileIds = {};
  for (var r = h.row + 1; r < rows.length; r++) {
    var row = rows[r] || [];
    var title = text(row, '제목');
    var actRaw = text(row, '처리');
    if (!title && !actRaw) continue;
    var tag = (text(row, '번호') || (r + 1)) + '번 줄';
    var act = gcalXlsxAction(actRaw);
    if (act === null || act === '') { plan.errs.push(tag + ": '처리' 는 새 Task · 새 To Do · 채우기 · 건너뜀 중 하나여야 합니다"); continue; }
    if (act === 'skip') { plan.skip++; continue; }
    if (!title) { plan.errs.push(tag + ': 제목이 비었습니다'); continue; }
    var gid = text(row, '구글일정ID');
    if (gid && seen[gid]) { plan.already++; continue; }
    if (gid && fileIds[gid]) { plan.errs.push(tag + ': 구글 일정 ID 가 ' + fileIds[gid] + ' 과 같습니다'); continue; }
    if (gid) fileIds[gid] = tag;

    var sd = gcalXlsxDate(cell(row, '시작일')), ed = gcalXlsxDate(cell(row, '종료일'));
    var st = gcalXlsxTime(cell(row, '시작시간')), et = gcalXlsxTime(cell(row, '종료시간'));
    if (!sd) { plan.errs.push(tag + ': 시작일을 읽지 못했습니다 (예: 2026-04-13)'); continue; }
    if (ed === null) { plan.errs.push(tag + ': 종료일을 읽지 못했습니다'); continue; }
    if (st === null || et === null) { plan.errs.push(tag + ': 시간을 읽지 못했습니다 (예: 14:00)'); continue; }
    if (!ed) ed = sd;
    if ((ed + 'T' + (et || '99:99')) < (sd + 'T' + (st || '00:00')) || ed < sd) { plan.errs.push(tag + ': 종료가 시작보다 이릅니다'); continue; }
    var done = gcalXlsxYes(cell(row, '완료'));
    var dd = gcalXlsxDate(cell(row, '완료일'));
    if (dd === null) { plan.errs.push(tag + ': 완료일을 읽지 못했습니다'); continue; }
    if (done && !dd) dd = ed;
    var it = { tag: tag, title: title, sd: sd, st: st, ed: ed, et: et, done: done, dd: dd, gid: gid,
               location: text(row, '장소'), memo: text(row, '메모'), bar: gcalXlsxYes(cell(row, '막대')) };

    if (act === 'todo' || act === 'fill') {
      var pid = text(row, '연결TaskID').replace(/\.0+$/, '');
      var parent = pid ? byId[pid] : null;
      if (!parent) { plan.errs.push(tag + ": '연결 Task ID' 의 Task 를 찾지 못했습니다" + (pid ? ' (' + pid + ')' : ' (비었음)')); continue; }
      it.parent = parent;
      if (act === 'todo') { plan.todos.push(it); continue; }
      // 채우기 — 어디에 무엇을 넣을지 지금 정해 둔다 (확인 창에 개수를 보여 주려고)
      var sid = text(row, '연결ToDoID').replace(/\.0+$/, '');
      if (sid) {
        it.step = (parent.steps || []).find(function (s) { return String(s.id) === sid; }) || null;
        if (!it.step) { plan.errs.push(tag + ": '연결 To Do ID' 의 To Do 를 그 Task 에서 찾지 못했습니다 (" + sid + ')'); continue; }
        it.mode = 'step';
      } else {
        var pS = String(parent.startDate || '').slice(0, 10), pD = String(parent.dueDateTime || '').slice(0, 10);
        it.mode = (pS === sd && pD === ed) ? 'taskTime' : 'taskTodo';
      }
      plan.fills.push(it);
      continue;
    }
    // 새 Task — Section · Project (그 해 만다라트에서 이름으로 찾는다)
    var secName = text(row, 'Section'), projName = text(row, 'Project');
    if (secName) {
      var year = +sd.slice(0, 4), m = mdts[year];
      var sg = m && (m.subGoals || []).find(function (s) { return s.text && gcalSecKey(s.text) === gcalSecKey(secName); });
      if (!sg) { plan.errs.push(tag + ': ' + year + '년 만다라트에 Section \'' + secName + '\' 이 없습니다'); continue; }
      it.goal = { year: year, sgId: sg.id, text: sg.text };
      if (projName) {
        var a = (sg.actions || []).find(function (x) { return x.text && gcalNormName(x.text) === gcalNormName(projName); });
        if (!a) { plan.errs.push(tag + ": Section '" + sg.text + "' 에 Project '" + projName + "' 이 없습니다"); continue; }
        it.action = { year: year, sgId: sg.id, actionId: a.id, text: a.text };
      }
    } else if (projName) { plan.errs.push(tag + ': Project 만 있고 Section 이 비었습니다'); continue; }
    plan.tasks.push(it);
  }
  return plan;
}

// 할 일 목록 → Task 배열에 더한다 (arr 를 고친다)
function gcalXlsxApply(plan, arr) {
  var used = {}, next = Date.now();
  arr.forEach(function (t) { used[t.id] = 1; (t.steps || []).forEach(function (s) { used[s.id] = 1; }); });
  function newId() { while (used[next]) next++; used[next] = 1; return next++; }
  var nowIso = new Date().toISOString();

  plan.tasks.forEach(function (it) {
    var o = {
      text: (it.done && !/^\[\d{6}\]/.test(it.title) ? gcalDonePrefix(it.dd) : '') + it.title,
      completed: it.done, starred: false,
      startDate: it.sd + 'T' + (it.st || '09:00') + ':00', startHasTime: !!it.st,
      dueDateTime: it.ed + 'T' + (it.et || '09:00') + ':00', hasTime: !!it.et,
      status: it.done ? '완료' : '대기', notes: it.memo, steps: [],
      mdtGoal: it.goal || null, mdtAction: it.action || null,
      location: it.location, calBar: it.bar
    };
    var doc = (typeof newTaskDoc === 'function') ? newTaskDoc(o) : Object.assign({
      createdAt: nowIso, reminder: null, assignee: '', assignees: [], repeat: null, eisenhower: null,
      upstreamDepts: [], upstreamDept: '', prevTaskIds: [], nextTaskIds: []
    }, o);
    if (!doc.mdtGoal) delete doc.mdtGoal;
    if (!doc.location) delete doc.location;
    if (!doc.calBar) delete doc.calBar;
    doc.id = newId();
    if (it.done && it.et) doc.completedAt = gcalLocalIso(it.ed, it.et);
    if (it.gid) doc.gcalId = it.gid;
    arr.push(doc);
  });

  // 같은 날 시작·종료 시간이 다 있는 일정만 수행 시간 한 줄 (여러 날짜 일정을 수행 시간으로 넣으면 며칠치 블록이 된다)
  function slotOf(it) {
    return (it.sd === it.ed && it.st && it.et) ? { id: newId(), start: it.sd + 'T' + it.st + ':00', end: it.ed + 'T' + it.et + ':00' } : null;
  }
  function markGid(o, gid) {
    if (!gid) return;
    if (!o.gcalId) { o.gcalId = gid; return; }
    if (o.gcalId === gid) return;
    if (!Array.isArray(o.gcalIds)) o.gcalIds = [];
    if (o.gcalIds.indexOf(gid) < 0) o.gcalIds.push(gid);
  }
  function addStep(p, it) {
    if (!Array.isArray(p.steps)) p.steps = [];
    var sameDay = it.sd === it.ed;
    var s = {
      id: newId(),
      text: (it.done && !/^\[\d{6}\]/.test(it.title) ? gcalDonePrefix(it.dd) : '') + it.title,
      completed: it.done,
      dueDateTime: it.ed + 'T' + ((sameDay && it.st) || '09:00') + ':00', hasTime: !!(sameDay && it.st)
    };
    var sl = slotOf(it);
    if (sl) s.slots = [sl];
    if (it.done && it.et) s.completedAt = gcalLocalIso(it.ed, it.et);
    markGid(s, it.gid);
    p.steps.push(s);
  }

  plan.todos.forEach(function (it) {
    var p = arr.find(function (t) { return t.id === it.parent.id; });
    if (p) addStep(p, it);
  });

  // 채우기 — 있던 Task·To Do 에 구글 정보를 넣는다. 제목·완료·다른 To Do 는 건드리지 않는다.
  plan.fills.forEach(function (it) {
    var t = arr.find(function (x) { return x.id === it.parent.id; });
    if (!t) return;
    if (it.mode === 'step') {
      var s = (t.steps || []).find(function (x) { return x.id === it.step.id; });
      if (!s) return;
      var dueDay = String(s.dueDateTime || '').slice(0, 10);
      if (it.st && dueDay === it.sd) { s.dueDateTime = it.sd + 'T' + it.st + ':00'; s.hasTime = true; }
      var sl = slotOf(it);
      if (sl) {
        var have = (s.slots || []).some(function (x) { return x.start === sl.start && x.end === sl.end; });
        if (!have) { if (!Array.isArray(s.slots)) s.slots = []; s.slots.push(sl); }
      }
      markGid(s, it.gid);
    } else if (it.mode === 'taskTime') {
      if (it.st) { t.startDate = it.sd + 'T' + it.st + ':00'; t.startHasTime = true; }
      if (it.et) { t.dueDateTime = it.ed + 'T' + it.et + ':00'; t.hasTime = true; }
      if (it.bar && it.sd !== it.ed) t.calBar = true;
      markGid(t, it.gid);
    } else {
      addStep(t, it);     // 기간이 긴 Task — 그 안의 일정 날을 To Do 로
    }
    if (it.location && !t.location) t.location = it.location;
    if (it.memo && String(t.notes || '').indexOf(it.memo) < 0) t.notes = t.notes ? t.notes + '\n' + it.memo : it.memo;
  });
}

// ─────────────────────────────────────────────
//  일정 가져오기 엑셀 → 확인 → 저장 (handleRestoreXlsx 에서 부른다)
// ─────────────────────────────────────────────
function handleImportEventsWb(wb) {
  // 앱이 들고 있는 Task 를 저장소의 최신 값으로 맞춘 뒤 그 위에 더한다
  var mem = (typeof tasks !== 'undefined' && Array.isArray(tasks) && typeof saveTasks === 'function');
  if (mem && typeof loadTasks === 'function') loadTasks();
  var arr = mem ? tasks : readTaskArray();
  var plan = workbookToEventPlan(wb, arr);
  if (plan.errs.length) {
    throw new Error('일정 가져오기 엑셀을 고쳐 주세요.\n' + plan.errs.slice(0, 12).join('\n')
      + (plan.errs.length > 12 ? '\n… 외 ' + (plan.errs.length - 12) + '건' : ''));
  }
  if (!plan.tasks.length && !plan.todos.length && !plan.fills.length) {
    alert('더할 줄이 없습니다.' + (plan.already ? ' (이미 가져온 줄 ' + plan.already + '개)' : '') + (plan.skip ? ' (건너뜀 ' + plan.skip + '줄)' : ''));
    return;
  }
  var doneN = plan.tasks.filter(function (x) { return x.done; }).length;
  var parents = {};
  plan.todos.forEach(function (x) { parents[x.parent.id] = 1; });
  var fm = { step: 0, taskTime: 0, taskTodo: 0 }, fillTasks = {};
  plan.fills.forEach(function (x) { fm[x.mode]++; fillTasks[x.parent.id] = 1; });
  var msg = '일정 가져오기 엑셀로 Task 를 더합니다.\n'
    + (plan.tasks.length ? '· 새 Task ' + plan.tasks.length + '개 (완료 ' + doneN + ' · 미완료 ' + (plan.tasks.length - doneN) + ')\n' : '')
    + (plan.todos.length ? '· 새 To Do ' + plan.todos.length + '개 → 있던 Task ' + Object.keys(parents).length + '개에 붙임\n' : '')
    + (plan.fills.length ? '· 있던 항목에 구글 정보 채우기 ' + plan.fills.length + '줄 (Task ' + Object.keys(fillTasks).length + '개)\n'
        + '    To Do 시간 ' + fm.step + ' · Task 시간 ' + fm.taskTime + ' · 기간이 긴 Task 에 일정 날 To Do 추가 ' + fm.taskTodo + '\n' : '')
    + (plan.skip ? '· 건너뜀 ' + plan.skip + '줄\n' : '')
    + (plan.already ? '· 이미 가져온 줄 ' + plan.already + '개는 다시 넣지 않음\n' : '')
    + '\n지우는 것은 없습니다. 있던 Task 는 제목·완료·다른 To Do 를 그대로 두고 시간·장소·메모와 To Do 만 늘어납니다. 계속할까요?';
  if (!confirm(msg)) return;
  gcalXlsxApply(plan, arr);
  if (mem) saveTasks(); else localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(arr));
  alert('일정 가져오기 완료! (새 Task ' + plan.tasks.length + '개 · 새 To Do ' + (plan.todos.length + fm.taskTodo) + '개 · 채운 항목 ' + (fm.step + fm.taskTime) + '개) 페이지를 새로고침합니다. ✅');
  location.reload();
}
