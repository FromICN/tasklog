// ============================================
//  📊 페이지별 엑셀 [2/4] — Board(Task)
// ============================================

var BOARD_HEADERS = [
  'ID', 'TASK', 'START', 'DUE', '마감시간', 'TO DO(기한 포함)', 'PRIORITY', 'STATUS',
  'COWORKER', 'UPSTREAM DEPT.', 'PROJECT', 'LINKED TASKS(이전)', 'LINKED TASKS(후행)', 'MEMO', '완료', '별표'
];
function boardStepsToStr(steps) {
  if (!Array.isArray(steps)) return '';
  return steps.map(function (s) {
    var str = (s.completed ? '[v] ' : '') + (s.text || '');
    if (s.dueDateTime) str += ' @' + String(s.dueDateTime).slice(0, 10) + (s.hasTime ? ' ' + String(s.dueDateTime).slice(11, 16) : '');
    return str;
  }).join(' | ');
}
function boardStrToSteps(raw) {
  if (!raw) return [];
  return String(raw).split('|').map(function (s) {
    s = s.trim(); var sc = false;
    if (/^\[v\]/i.test(s)) { sc = true; s = s.replace(/^\[v\]\s*/i, ''); }
    var sDue = null, sHasTime = false;
    var m = s.match(/@\s*(\d{4}-\d{1,2}-\d{1,2})(?:[ T](\d{1,2}:\d{2}))?/);
    if (m) { sDue = m[2] ? (m[1] + 'T' + m[2] + ':00') : (m[1] + 'T09:00:00'); sHasTime = !!m[2]; s = s.replace(m[0], '').trim(); }
    return { id: Date.now() + Math.floor(Math.random() * 100000), text: s, completed: sc, dueDateTime: sDue, hasTime: sHasTime };
  }).filter(function (s) { return s.text; });
}
function exportBoardXlsx() {
  if (!pxHasXLSX()) return pxAlertNoXLSX();
  var tasksArr = pxReadJSON(PX_KEY_TASK, []) || [];
  if (!Array.isArray(tasksArr)) tasksArr = [];
  var byId = {}; tasksArr.forEach(function (t) { if (t && t.id != null) byId[String(t.id)] = t; });
  function titlesOf(ids) {
    if (!Array.isArray(ids)) return '';
    return ids.map(function (id) { var t = byId[String(id)]; return t ? (t.text || '') : ''; })
      .filter(function (x) { return x; }).join(' | ');
  }
  var rows = tasksArr.map(function (t) {
    var due = t.dueDateTime || '';
    var coworker = Array.isArray(t.assignees) ? t.assignees.join(', ') : (t.assignee || '');
    var upstream = Array.isArray(t.upstreamDepts) ? t.upstreamDepts.join(', ') : (t.upstreamDept || '');
    var project = t.mdtAction ? ((t.mdtAction.year ? t.mdtAction.year + '년 ' : '') + (t.mdtAction.text || '')) : '';
    return [
      pxStr(t.id), pxStr(t.text),
      t.startDate ? String(t.startDate).slice(0, 10) : '',
      due ? String(due).slice(0, 10) : '', (due && t.hasTime) ? String(due).slice(11, 16) : '',
      boardStepsToStr(t.steps), pxStr(t.eisenhower), pxStr(t.status),
      coworker, upstream, project,
      titlesOf(t.prevTaskIds), titlesOf(t.nextTaskIds),
      pxStr(t.notes), t.completed ? '완료' : '', t.starred ? 'O' : ''
    ];
  });
  if (!rows.length) {
    rows.push(['', '예) 보고서 초안 작성', '2026-06-21', '2026-06-25', '18:00',
      '자료수집 @2026-06-22 | [v]목차정리', 'SCHEDULE', '진행', '홍길동', '기획팀', '', '', '', '비고 메모', '', 'O']);
  }
  var guide = [
    ['📊 TaskLog — Board 백업/복원 서식'], [''],
    ['• 한 줄이 Task 1개입니다. 맨 아래 빈 줄에 새 Task 를 추가할 수 있습니다.'],
    ['• 이 파일을 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 그대로 복원됩니다.'], [''],
    ['열 설명'],
    ['ID', '비워 두면 새 Task. 그대로 두면 기존 Task 수정(세부단계·반복·알림 등 숨은 값 보존).'],
    ['TASK', '할 일 제목(필수).'],
    ['START / DUE', 'YYYY-MM-DD. 마감시간은 HH:MM(선택).'],
    ['TO DO(기한 포함)', '하위 단계를 " | " 로 구분. 완료는 앞에 [v], 기한은 뒤에 @YYYY-MM-DD 또는 @YYYY-MM-DD HH:MM.'],
    ['PRIORITY', '아이젠하워: DO / SCHEDULE / DELEGATE / DROP. 비워도 됨.'],
    ['STATUS', '대기 / 진행 / 중단 / 완료 / 취소.'],
    ['COWORKER', '협업자 이름(여러 명은 쉼표로 구분).'],
    ['UPSTREAM DEPT.', '상위·협의 부서(여러 개는 쉼표로 구분).'],
    ['PROJECT', '연결된 만다라트 프로젝트(읽기용). 복원 시 기존 Task 연결값을 보존.'],
    ['LINKED TASKS(이전/후행)', '연계 Task 제목을 " | " 로 구분. 같은 파일의 다른 Task 제목과 매칭해 복원.'],
    ['MEMO', '메모(비고).'],
    ['완료 / 별표', '완료=완료 또는 O, 별표=O. 아니면 비워 둡니다.'], [''],
    ['⚠️ 복원하면 현재 Task 목록 전체가 이 엑셀 내용으로 교체됩니다.']
  ];
  pxBuildAndSave('Board', BOARD_HEADERS, rows,
    [16, 32, 12, 12, 10, 36, 12, 8, 16, 16, 20, 22, 22, 28, 8, 8], guide,
    'tasklog-Board-' + pxFileDate() + '.xlsx');
}
function boardRowsToTasks(rows) {
  var hIdx = pxFindHeaderIdx(rows, ['TASK', '할 일', 'ID']);
  var map = pxColMap(rows[hIdx]);
  function col() { for (var i = 0; i < arguments.length; i++) if (map[arguments[i]] !== undefined) return map[arguments[i]]; return -1; }
  var cID = col('ID'), cTASK = col('TASK', '할 일'), cSTART = col('START', '시작일'),
      cDUE = col('DUE', '마감일'), cTIME = col('마감시간'), cTODO = col('TO DO(기한 포함)', 'TO DO', '세부단계'),
      cPRI = col('PRIORITY'), cSTAT = col('STATUS'), cCO = col('COWORKER', '담당자'),
      cUP = col('UPSTREAM DEPT.'), cPROJ = col('PROJECT'),
      cPREV = col('LINKED TASKS(이전)'), cNEXT = col('LINKED TASKS(후행)'),
      cMEMO = col('MEMO'), cDONE = col('완료'), cSTAR = col('별표', '중요(별표)');
  var existing = pxReadJSON(PX_KEY_TASK, []) || []; if (!Array.isArray(existing)) existing = [];
  var byId = {}; existing.forEach(function (t) { if (t && t.id != null) byId[String(t.id)] = t; });
  var out = [], usedIds = {}, titleToId = {};
  for (var r = hIdx + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row) continue;
    var text = pxTrim(pxCell(row, cTASK)); if (!text) continue;
    var id = pxTrim(pxCell(row, cID));
    var base = (id && byId[id]) ? JSON.parse(JSON.stringify(byId[id])) : null;
    var task = base || {
      id: Date.now() + out.length, text: '', completed: false, starred: false,
      createdAt: new Date().toISOString(), dueDateTime: null, hasTime: false,
      steps: [], reminder: null, assignee: '', assignees: [], repeat: null,
      startDate: null, upstreamDepts: [], upstreamDept: '', prevTaskIds: [], nextTaskIds: [],
      eisenhower: null, status: '대기', notes: ''
    };
    var finalId = task.id;
    if (usedIds[String(finalId)]) finalId = Date.now() + out.length + Math.floor(Math.random() * 1000);
    usedIds[String(finalId)] = true; task.id = finalId;
    task.text = text;
    task.completed = pxTruthy(pxCell(row, cDONE));
    task.starred = pxTruthy(pxCell(row, cSTAR));
    var sd = pxDateStr(pxCell(row, cSTART));
    task.startDate = sd ? (sd + 'T09:00:00') : null;
    var dd = pxDateStr(pxCell(row, cDUE)), dt = pxTimeStr(pxCell(row, cTIME));
    if (dd) { task.dueDateTime = dt ? (dd + 'T' + dt + ':00') : (dd + 'T09:00:00'); task.hasTime = !!dt; }
    else { task.dueDateTime = null; task.hasTime = false; }
    var todo = pxTrim(pxCell(row, cTODO));
    if (todo) task.steps = boardStrToSteps(todo); else if (!base) task.steps = [];
    var pri = pxTrim(pxCell(row, cPRI)); task.eisenhower = pri ? pri.toUpperCase() : null;
    var stat = pxTrim(pxCell(row, cSTAT)); if (stat) task.status = stat;
    var co = pxTrim(pxCell(row, cCO));
    task.assignees = co ? co.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    task.assignee = '';
    var up = pxTrim(pxCell(row, cUP));
    task.upstreamDepts = up ? up.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    task.upstreamDept = task.upstreamDepts.join(', ');
    if (!base) {
      var proj = pxTrim(pxCell(row, cPROJ));
      if (proj) { var ym = proj.match(/(\d{4})\s*년\s*(.*)$/); task.mdtAction = ym ? { year: parseInt(ym[1]), text: ym[2].trim() } : { text: proj }; }
    }
    task.notes = pxStr(pxCell(row, cMEMO));
    task._prevTitles = pxTrim(pxCell(row, cPREV));
    task._nextTitles = pxTrim(pxCell(row, cNEXT));
    if (!titleToId[text]) titleToId[text] = task.id;
    out.push(task);
  }
  function resolve(titles) {
    if (!titles) return [];
    return titles.split('|').map(function (t) { return titleToId[t.trim()]; }).filter(function (x) { return x != null; });
  }
  out.forEach(function (t) { t.prevTaskIds = resolve(t._prevTitles); t.nextTaskIds = resolve(t._nextTitles); delete t._prevTitles; delete t._nextTitles; });
  var idSet = {}; out.forEach(function (t) { idSet[String(t.id)] = t; });
  out.forEach(function (t) {
    t.prevTaskIds.forEach(function (pid) { var o = idSet[String(pid)]; if (o && o.nextTaskIds.indexOf(t.id) < 0) o.nextTaskIds.push(t.id); });
    t.nextTaskIds.forEach(function (nid) { var o = idSet[String(nid)]; if (o && o.prevTaskIds.indexOf(t.id) < 0) o.prevTaskIds.push(t.id); });
  });
  return out;
}
