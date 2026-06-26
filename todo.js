// ============================================
//  📅 계획된 일정 (Planned View)  — todo.js
// ============================================

var _todoCollapsed  = {};   // { sectionKey: true/false }
var _todoActiveTab  = 'list'; // 'list' | 'table'

// ── 표시할 구분(컬럼) 다중 선택 ─────────────────
// 상단 "구분"에서 체크한 항목만 하단 표의 컬럼으로 표시된다.
function todoEmptyCell() { return '<span class="todo-table-empty">-</span>'; }
function todoDueBadge(t) {
  if (!t.dueDateTime) return todoEmptyCell();
  var ds  = (typeof getDueStatus === 'function') ? (getDueStatus(t.dueDateTime) || '') : '';
  var dfl = (typeof formatDueDate === 'function') ? formatDueDate(t.dueDateTime, t.hasTime) : '';
  return '<span class="due-badge '+ds+'">📅 '+escapeHtml(dfl)+'</span>';
}

// 컬럼명은 Task 생성 항목명과 통일
var TODO_COLS = [
  { key:'start', label:'Start', cell:function(t){
      return '<td class="todo-table-start">'+(t.startDate?fmtTodoTableDate(t.startDate):todoEmptyCell())+'</td>';
  } },
  { key:'due', label:'Due', cell:function(t){
      // 시작일과 동일한 표시형식
      return '<td class="todo-table-due">'+(t.dueDateTime?fmtTodoTableDate(t.dueDateTime):todoEmptyCell())+'</td>';
  } },
  { key:'progress', label:'%', cell:function(t){
      return '<td class="todo-table-progress">'+buildProgressCellHtml(t)+'</td>';
  } },
  { key:'status', label:'Status', cell:function(t){
      return '<td class="todo-table-status">'+buildTodoStatusCell(t)+'</td>';
  } },
  { key:'coworker', label:'Coworker', cell:function(t){
      return '<td class="todo-table-assignee">'+buildTodoAssigneeCell(t)+'</td>';
  } },
  { key:'upstream', label:'UpStream Dept.', cell:function(t){
      var o = (Array.isArray(t.upstreamDepts) && t.upstreamDepts.length) ? t.upstreamDepts.join(', ') : (t.upstreamDept || '');
      return '<td class="todo-table-org">'+(o?escapeHtml(o):todoEmptyCell())+'</td>';
  } },
  { key:'project', label:'Project', cell:function(t){
      var p = '';
      var _em = todoSectionEmoji(t);
      if (t.mdtAction && t.mdtAction.text) p = (_em || '🔮') + ' ' + t.mdtAction.text;
      else if (t.lwSectionName) p = (_em ? _em + ' ' : '') + t.lwSectionName;
      return '<td class="todo-table-proj">'+(p?escapeHtml(p):todoEmptyCell())+'</td>';
  } },
];

var _todoCols = ['start','due','progress','status','coworker','project'];
try {
  var _c = localStorage.getItem('todoCols');
  if (_c) {
    var arr = JSON.parse(_c);
    if (Array.isArray(arr)) {
      // 구버전 키 마이그레이션: workinglist→project, star 제거, 유효 키만
      var valid = TODO_COLS.map(function(c){ return c.key; });
      var mapped = [];
      arr.forEach(function(k){
        if (k === 'workinglist') k = 'project';
        if (k === 'star') return;
        if (valid.indexOf(k) !== -1 && mapped.indexOf(k) === -1) mapped.push(k);
      });
      _todoCols = mapped;
    }
  }
} catch(e) {}

function saveTodoCols() { try { localStorage.setItem('todoCols', JSON.stringify(_todoCols)); } catch(e) {} }
function selectedTodoCols() { return TODO_COLS.filter(function(c){ return _todoCols.indexOf(c.key) !== -1; }); }

// ── Project 탭: 표시할 프로젝트 필터 (체크 해제 = 숨김) ──
var _todoProjHidden = [];
try { var _ph = localStorage.getItem('todoProjHidden'); if (_ph) { var _pa = JSON.parse(_ph); if (Array.isArray(_pa)) _todoProjHidden = _pa; } } catch(e) {}
function saveTodoProjHidden() { try { localStorage.setItem('todoProjHidden', JSON.stringify(_todoProjHidden)); } catch(e) {} }

function allProjectKeys() {
  var set = {};
  (typeof tasks !== 'undefined' ? tasks : []).forEach(function(t){ set[todoProjectKey(t)] = true; });
  return Object.keys(set).sort(function(a,b){
    if (a === '프로젝트 없음') return 1;
    if (b === '프로젝트 없음') return -1;
    return a.localeCompare(b, 'ko');
  });
}

var _todoProjPickOpen = false;
function openTodoProjPick() {
  _todoProjPickOpen = true;
  var p = document.getElementById('todo-projpick-panel');
  if (p) p.style.display = 'block';
}
function closeTodoProjPick() {
  _todoProjPickOpen = false;
  var p = document.getElementById('todo-projpick-panel');
  if (p) p.style.display = 'none';
}
function toggleTodoProjPick(e) {
  if (e) e.stopPropagation();
  if (_todoProjPickOpen) closeTodoProjPick(); else openTodoProjPick();
}

// Project 탭 헤더 — 필터/정렬은 상단 통합 컴포넌트로 이동, 일반 라벨만 표시
function todoProjFilterTh() {
  return '<th class="todo-th-proj" data-cr-key="project">Project</th>';
}

// ── 정렬/필터: 상단 통합 컴포넌트(TLFilter)로 위임 ──
function todoTaskYear(task) {
  if (task.mdtAction && task.mdtAction.year) return parseInt(task.mdtAction.year, 10);
  if (task.mdtGoal   && task.mdtGoal.year)   return parseInt(task.mdtGoal.year, 10);
  var d = task.startDate || task.dueDateTime;
  if (d) { var y = new Date(d).getFullYear(); if (!isNaN(y)) return y; }
  return null;
}

function todoSortValue(task, key) {
  switch (key) {
    case 'title':    return (task.text || '').replace(/^\[\d{6}\] /,'').toLowerCase();
    case 'start':    return task.startDate ? new Date(task.startDate).getTime() : null;
    case 'due':      return task.dueDateTime ? new Date(task.dueDateTime).getTime() : null;
    case 'progress': return getTaskProgressPct(task);
    case 'status':   { var order=['대기','진행','중단','완료','취소']; var i=order.indexOf(task.status); return i<0?null:i; }
    case 'coworker': { var a=Array.isArray(task.assignees)?task.assignees:(task.assignee?[task.assignee]:[]); return a.join(', ').toLowerCase()||null; }
    case 'project':  return (((task.mdtAction&&task.mdtAction.text)||task.lwSectionName)||'').toLowerCase()||null;
    default: return null;
  }
}

function applyTodoFilter(arr) {
  return (typeof TLFilter !== 'undefined') ? TLFilter.apply('todo', arr) : arr;
}
function todoHasSort() {
  if (typeof TLFilter === 'undefined') return false;
  var st = TLFilter.getState('todo');
  return !!(st && st.sort && st.sort.key);
}

function todoRegisterFilter() {
  if (typeof TLFilter === 'undefined') return;
  TLFilter.register('todo', {
    items: function(){ return (typeof tasks!=='undefined') ? tasks : []; },
    onChange: function(){ renderTodoView(); },
    // 표시 항목(컬럼 표시/숨김) — 필터와 통합된 1차 영역
    display: {
      label: '표시 항목',
      options: function(){ return TODO_COLS.map(function(c){ return { value:c.key, label:c.label }; }); },
      isOn: function(key){ return _todoCols.indexOf(key) !== -1; },
      toggle: function(key){ toggleTodoCol(key); }
    },
    filters: [
      { key:'year',     label:'연도',     get:function(t){ return todoTaskYear(t); }, format:function(v){ return v+'년'; } },
      { key:'status',   label:'Status',   options:function(){ return ['대기','진행','중단','완료','취소']; }, get:function(t){ return t.status||''; } },
      { key:'project',  label:'Project',  get:function(t){ return todoProjectKey(t); } },
      { key:'coworker', label:'Coworker', get:function(t){ var a=Array.isArray(t.assignees)?t.assignees:(t.assignee?[t.assignee]:[]); return a; } }
    ],
    sorts: [
      { key:'title',    label:'제목',    get:function(t){ return todoSortValue(t,'title'); } },
      { key:'start',    label:'시작일',  get:function(t){ return todoSortValue(t,'start'); } },
      { key:'due',      label:'마감일',  get:function(t){ return todoSortValue(t,'due'); } },
      { key:'progress', label:'진행률',  get:function(t){ return todoSortValue(t,'progress'); } },
      { key:'status',   label:'Status',  get:function(t){ return todoSortValue(t,'status'); } },
      { key:'project',  label:'Project', get:function(t){ return todoSortValue(t,'project'); } }
    ]
  });
}

function todoSortableTh(key, label, cls) {
  return '<th class="'+(cls||'')+'" data-cr-key="'+key+'">'+label+'</th>';
}

function todoColHeadsHtml() { return selectedTodoCols().map(function(c){ return todoSortableTh(c.key, c.label, c.thCls); }).join(''); }
function todoColCellsHtml(task) { return selectedTodoCols().map(function(c){ return c.cell(task); }).join(''); }

function renderTodoView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  todoRegisterFilter();
  if (typeof TLFilter !== 'undefined') TLFilter.render('todo');
  content.innerHTML = '<div class="todo-view">'
    + buildTodoTabBar()
    + '<div id="todo-body">' + buildTodoBody() + '</div>'
    + '</div>';
  applyTodoColResize();
}

function buildTodoBody() {
  if (_todoActiveTab === 'table')   return buildTodoTableView();
  if (_todoActiveTab === 'project') return buildTodoProjectView();
  return buildTodoListView();
}

function refreshTodoBody() {
  var el = document.getElementById('todo-body');
  if (el) el.innerHTML = buildTodoBody();
  applyTodoColResize();
}

// 표 열 너비 드래그 조정 적용 (Board)
function applyTodoColResize() {
  if (typeof TLColResize === 'undefined') return;
  var c = document.getElementById('page-content');
  if (!c) return;
  Array.prototype.forEach.call(c.querySelectorAll('table.todo-table'), function(t){ TLColResize.table(t, 'cr-todo'); });
}

// ── 탭 바 + 구분(컬럼) 다중 선택 ───────────────
function buildTodoTabBar() {
  // 표시 항목 선택은 상단 통합 필터(TLFilter)의 "표시 항목" 영역으로 이동됨
  return '<div class="todo-tabs">'
    + '<div class="todo-tabs-left">'
    + '<button class="todo-tab' + (_todoActiveTab==='list'?' active':'') + '" onclick="switchTodoTab(\'list\')">To Do</button>'
    + '<button class="todo-tab' + (_todoActiveTab==='table'?' active':'') + '" onclick="switchTodoTab(\'table\')">Task</button>'
    + '<button class="todo-tab' + (_todoActiveTab==='project'?' active':'') + '" onclick="switchTodoTab(\'project\')">Project</button>'
    + '</div>'
    + '</div>';
}

function switchTodoTab(tab) {
  _todoActiveTab = tab;
  renderTodoView();
}

function toggleTodoColPick(e) {
  if (e) e.stopPropagation();
  var p = document.getElementById('todo-colpick-panel');
  if (!p) return;
  p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}

function toggleTodoCol(key) {
  var i = _todoCols.indexOf(key);
  if (i >= 0) _todoCols.splice(i, 1); else _todoCols.push(key);
  saveTodoCols();
  refreshTodoBody(); // 패널은 그대로 열어둔 채 표만 갱신
}

// 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e){
  var cp = document.getElementById('todo-colpick');
  if (cp && !cp.contains(e.target)) {
    var p = document.getElementById('todo-colpick-panel');
    if (p) p.style.display = 'none';
  }
  var pth = document.getElementById('todo-proj-th');
  if (pth && !pth.contains(e.target)) {
    _todoProjPickOpen = false;
    var pp2 = document.getElementById('todo-projpick-panel');
    if (pp2) pp2.style.display = 'none';
  }
});

// ── task 한 줄 (선택된 컬럼만) ───────────────────
function buildTodoRow(task) {
  var isDone = task.completed ? 'is-done' : '';
  var isSel  = (typeof detailTaskId !== 'undefined' && detailTaskId === task.id) ? 'is-selected' : '';
  return '<tr class="todo-table-row '+isDone+' '+isSel+'" onclick="openDetailPanel('+task.id+')">'
    + '<td class="todo-table-check"><span class="task-check '+isDone+'" onclick="event.stopPropagation();toggleComplete('+task.id+')"></span></td>'
    + '<td class="todo-table-title">'+escapeHtml(task.text)+'</td>'
    + todoColCellsHtml(task)
    + '</tr>';
}

// ── To Do 뷰 (각 Task의 To Do 항목을 개별 행으로 — 날짜 분류 없이, 완료는 하단) ───────────
function buildTodoListView() {
  // Task에 필터/정렬 적용 후, 각 Task의 To Do(step)를 개별 항목으로 수집
  var ftasks = applyTodoFilter(tasks);
  var entries = [];
  ftasks.forEach(function(t){ (t.steps || []).forEach(function(s){ entries.push({ task:t, step:s }); }); });

  if (!entries.length) {
    return '<div class="todo-empty">등록된 To Do가 없어요 ✨<br><small>Task 안에 To Do를 추가하면 여기에 표시돼요.</small></div>';
  }

  var active    = entries.filter(function(e){ return !e.step.completed; });
  var completed = entries.filter(function(e){ return e.step.completed; });

  var colspan = 2 + selectedTodoCols().length;
  var head = '<thead><tr>'
    + '<th class="c-check" data-cr-key="check"></th>'
    + todoSortableTh('title', 'To Do', 'todo-th-title')
    + todoColHeadsHtml()
    + '</tr></thead>';
  var rowFn = function(e){ return buildTodoStepRow(e.task, e.step); };

  // 정렬 지정 시 Task 정렬 순서 유지, 미지정 시 마감일 오름차순
  var activeSorted = todoHasSort()
    ? active
    : active.slice().sort(function(a,b){
        var va = a.step.dueDateTime ? new Date(a.step.dueDateTime).getTime() : Infinity;
        var vb = b.step.dueDateTime ? new Date(b.step.dueDateTime).getTime() : Infinity;
        return va - vb;
      });

  var body = activeSorted.map(rowFn).join('');

  // 완료: 하단 "완료됨" 그룹 (기본 접힘)
  if (completed.length > 0) {
    var cs = todoHasSort() ? completed
      : completed.slice().sort(function(a,b){ return new Date(b.step.dueDateTime||0)-new Date(a.step.dueDateTime||0); });
    body += buildTodoGroupRows('completed', '완료됨', 'var(--text-2)', cs, true, colspan, rowFn);
  }

  return '<div class="todo-list-table-wrap">'
    + '<table class="todo-table todo-ltable">' + head
    + '<tbody>' + body + '</tbody>'
    + '</table></div>';
}

// To Do(step) 한 줄 — 체크는 step 완료 토글, 그 외 컬럼은 step/부모 Task 값
function buildTodoStepRow(task, step) {
  var isDone = step.completed ? 'is-done' : '';
  return '<tr class="todo-table-row '+isDone+'" onclick="openDetailPanel('+task.id+')">'
    + '<td class="todo-table-check"><span class="task-check '+isDone+'" onclick="event.stopPropagation();toggleStep('+task.id+','+step.id+')"></span></td>'
    + '<td class="todo-table-title">'+escapeHtml(step.text)+'</td>'
    + selectedTodoCols().map(function(c){ return todoStepColCell(c, task, step); }).join('')
    + '</tr>';
}

function todoStepColCell(col, task, step) {
  if (col.key === 'due') return '<td class="todo-table-due">'+(step.dueDateTime?fmtTodoTableDate(step.dueDateTime):todoEmptyCell())+'</td>';
  if (col.key === 'progress') return '<td class="todo-table-progress">'+buildProgressBar(step.completed?100:0)+'</td>';
  return col.cell(task); // 나머지는 부모 Task 정보 상속
}

// 그룹 헤더 + 행 (rowFn으로 각 항목 렌더)
function buildTodoGroupRows(key, label, color, items, defaultCollapsed, colspan, rowFn) {
  var collapsed = defaultCollapsed ? (_todoCollapsed[key] !== false) : (_todoCollapsed[key] === true);
  var arrow = collapsed ? '' : 'open';

  var html = '<tr class="todo-group-row" onclick="toggleTodoSection(\''+key+'\')">'
    + '<td colspan="'+colspan+'">'
    + '<span class="todo-sec-arrow '+arrow+'">›</span>'
    + '<span class="todo-sec-label" style="color:'+color+'">'+escapeHtml(label)+'</span>'
    + '<span class="todo-sec-count">'+items.length+'</span>'
    + '</td></tr>';

  if (!collapsed) items.forEach(function(it){ html += rowFn(it); });
  return html;
}

// ── 진행률 ──
function getTaskProgressPct(task) {
  if (task.steps && task.steps.length > 0) {
    var done = task.steps.filter(function(s){ return s.completed; }).length;
    return Math.round(done / task.steps.length * 100);
  }
  return task.completed ? 100 : 0;
}

function buildProgressBar(pct) {
  return '<div class="todo-progress-wrap">'
    + '<div class="todo-progress-bar"><div class="todo-progress-fill" style="width:'+pct+'%;"></div></div>'
    + '<span class="todo-progress-pct">'+pct+'%</span>'
    + '</div>';
}

function buildProgressCellHtml(task) {
  return buildProgressBar(getTaskProgressPct(task));
}

// 진행현황(status) 배지
function buildTodoStatusCell(task) {
  if (!task.status) return todoEmptyCell();
  var colors = { '대기':'#9CA3AF', '진행':'#2ecc71', '중단':'#ef4444', '완료':'#4F6EF7', '취소':'#6b7280' };
  var c = colors[task.status] || '#9CA3AF';
  return '<span class="todo-status-badge" style="color:'+c+';background:'+c+'1f;border:1px solid '+c+'55;">'+escapeHtml(task.status)+'</span>';
}

// 담당자 셀
function buildTodoAssigneeCell(task) {
  var a = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
  if (!a.length) return todoEmptyCell();
  return escapeHtml(a.join(', '));
}

// ── Task (표) 뷰 — 전체 목록(평면) + 선택 컬럼 ────────────
function buildTodoTableView() {
  if (typeof tasks === 'undefined' || !tasks.length) {
    return '<div class="todo-empty">등록된 Task가 없어요 ✨</div>';
  }

  var ftasks    = applyTodoFilter(tasks);
  var active    = ftasks.filter(function(t){ return !t.completed; });
  var completed = ftasks.filter(function(t){ return t.completed; });

  var activeSorted = todoHasSort()
    ? active
    : active.slice().sort(function(a,b){ return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });

  var head = '<thead><tr>'
    + '<th class="c-check" data-cr-key="check"></th>'
    + todoSortableTh('title', 'Task', 'todo-th-title')
    + todoColHeadsHtml()
    + '</tr></thead>';

  var body = activeSorted.map(buildTodoRow).join('');

  // 완료된 Task는 하단 "완료됨" 그룹으로 이동 (기본 접힘)
  if (completed.length > 0) {
    var colspan = 2 + selectedTodoCols().length;
    var cs = todoHasSort() ? completed
      : completed.slice().sort(function(a,b){ return new Date(b.completedAt||b.createdAt||0) - new Date(a.completedAt||a.createdAt||0); });
    body += buildTodoGroupRows('table-completed', '완료됨', 'var(--text-2)', cs, true, colspan, buildTodoRow);
  }

  return '<div class="todo-table-wrap">'
    + '<table class="todo-table">' + head
    + '<tbody>' + body + '</tbody>'
    + '</table>'
    + '</div>'
    + '<div class="todo-table-count">총 ' + (active.length + completed.length) + '개</div>';
}

// task가 속한 "섹션"의 이모지 가져오기
//  1) task.lwSectionEmoji (직접 지정)
//  2) 만다라트 subGoal 이모지 (프로젝트 연결의 sgId로 역산)
//  3) 라이프휠 섹션 이모지
function todoSectionEmoji(task) {
  if (!task) return '';
  if (task.lwSectionEmoji) return task.lwSectionEmoji;
  var sgId = (task.mdtAction && task.mdtAction.sgId) ||
             (task.mdtGoal   && task.mdtGoal.sgId)   || null;
  var idx = (task.lwSection !== null && task.lwSection !== undefined)
            ? task.lwSection
            : (sgId ? parseInt(sgId, 10) - 1 : null);
  if (idx === null || idx === undefined || idx < 0) return '';
  var year = (task.mdtAction && task.mdtAction.year) ||
             (task.mdtGoal   && task.mdtGoal.year)   ||
             (typeof appGetYear === 'function' ? appGetYear() : null);
  try {
    if (typeof getMdt === 'function') {
      var mdt = getMdt(parseInt(year, 10));
      if (mdt && mdt.subGoals && mdt.subGoals[idx] && mdt.subGoals[idx].emoji)
        return mdt.subGoals[idx].emoji;
    }
  } catch (e) {}
  try {
    if (typeof getLwSections === 'function') {
      var secs = getLwSections();
      if (secs && secs[idx] && secs[idx].emoji) return secs[idx].emoji;
    }
  } catch (e) {}
  return '';
}

// ── Project 뷰 — Task 탭 구성 + Project 기준 그룹 ────────────
function todoProjectKey(task) {
  if (task.mdtAction && task.mdtAction.text) return task.mdtAction.text;
  if (task.lwSectionName) return task.lwSectionName;
  return '프로젝트 없음';
}

// 프로젝트 오름차순 정렬 (프로젝트 없음은 맨 뒤), 동률이면 생성일 최신순
function todoProjCompare(a, b) {
  var ka = todoProjectKey(a), kb = todoProjectKey(b);
  if (ka === '프로젝트 없음' && kb !== '프로젝트 없음') return 1;
  if (kb === '프로젝트 없음' && ka !== '프로젝트 없음') return -1;
  var c = ka.localeCompare(kb, 'ko');
  if (c !== 0) return c;
  return new Date(b.createdAt||0) - new Date(a.createdAt||0);
}

// Project 탭 한 줄 — Project를 가장 왼쪽 데이터 컬럼으로
function buildTodoProjRow(task) {
  var isDone = task.completed ? 'is-done' : '';
  var isSel  = (typeof detailTaskId !== 'undefined' && detailTaskId === task.id) ? 'is-selected' : '';
  return '<tr class="todo-table-row '+isDone+' '+isSel+'" onclick="openDetailPanel('+task.id+')">'
    + '<td class="todo-table-check"><span class="task-check '+isDone+'" onclick="event.stopPropagation();toggleComplete('+task.id+')"></span></td>'
    + '<td class="todo-table-proj">'+escapeHtml(todoProjectKey(task))+'</td>'
    + '<td class="todo-table-title">'+escapeHtml(task.text)+'</td>'
    + selectedTodoCols().filter(function(c){ return c.key !== 'project'; }).map(function(c){ return c.cell(task); }).join('')
    + '</tr>';
}

function buildTodoProjectView() {
  if (typeof tasks === 'undefined' || !tasks.length) {
    return '<div class="todo-empty">등록된 Task가 없어요 ✨</div>';
  }

  var otherCols = selectedTodoCols().filter(function(c){ return c.key !== 'project'; });
  var colspan = 3 + otherCols.length;
  var head = '<thead><tr>'
    + '<th class="c-check" data-cr-key="check"></th>'
    + todoProjFilterTh()
    + todoSortableTh('title', 'Task', 'todo-th-title')
    + otherCols.map(function(c){ return todoSortableTh(c.key, c.label, c.thCls); }).join('')
    + '</tr></thead>';

  var visible = applyTodoFilter(tasks);

  if (!visible.length) {
    return '<div class="todo-table-wrap"><table class="todo-table">' + head
      + '<tbody><tr><td colspan="'+colspan+'" style="text-align:center;padding:30px;color:var(--text-3);">조건에 맞는 Task가 없어요.</td></tr></tbody>'
      + '</table></div>';
  }

  var active    = visible.filter(function(t){ return !t.completed; });
  var completed = visible.filter(function(t){ return t.completed; });

  // 기본: 프로젝트 오름차순. 통합 정렬 지정 시 해당 기준 적용
  var activeSorted = todoHasSort() ? active : active.slice().sort(todoProjCompare);
  var body = activeSorted.map(buildTodoProjRow).join('');

  // 완료된 Task는 하단 "완료됨" 그룹으로 이동 (기본 접힘)
  if (completed.length > 0) {
    var cs = todoHasSort() ? completed : completed.slice().sort(todoProjCompare);
    body += buildTodoGroupRows('proj-completed', '완료됨', 'var(--text-2)', cs, true, colspan, buildTodoProjRow);
  }

  return '<div class="todo-table-wrap">'
    + '<table class="todo-table">' + head
    + '<tbody>' + body + '</tbody>'
    + '</table>'
    + '</div>'
    + '<div class="todo-table-count">총 ' + visible.length + '개</div>';
}

function fmtTodoTableDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
}

function buildTodoTaskItem(task) {
  var isDone = task.completed ? 'is-done' : '';
  var isSel  = (typeof detailTaskId !== 'undefined' && detailTaskId === task.id) ? 'is-selected' : '';

  var meta = '';
  if (task.dueDateTime) {
    var ds  = (typeof getDueStatus === 'function') ? getDueStatus(task.dueDateTime) : '';
    var dfl = (typeof formatDueDate === 'function') ? formatDueDate(task.dueDateTime, task.hasTime) : '';
    meta += '<span class="due-badge '+ds+'">📅 '+dfl+'</span>';
  }
  var listLabel = '';
  var _lem = todoSectionEmoji(task);
  if (task.lwSectionName) listLabel = (_lem ? _lem + ' ' : '') + task.lwSectionName;
  else if (task.mdtAction && task.mdtAction.text) listLabel = (_lem || '🔮') + ' ' + task.mdtAction.text;
  if (listLabel) meta += '<span class="due-badge">'+escapeHtml(listLabel)+'</span>';

  if (task.steps && task.steps.length > 0) {
    var done = task.steps.filter(function(s){ return s.completed; }).length;
    meta += '<span class="due-badge">📝 '+done+'/'+task.steps.length+'</span>';
  }
  if (task.repeat && typeof REPEAT_LABELS !== 'undefined') {
    meta += '<span class="due-badge">🔄 '+REPEAT_LABELS[task.repeat]+'</span>';
  }

  return '<div class="task-item '+isDone+' '+isSel+'" id="task-item-'+task.id+'">'
       + '<div class="task-check '+isDone+'" onclick="event.stopPropagation();toggleComplete('+task.id+')"></div>'
       + '<div class="task-body" onclick="openDetailPanel('+task.id+')">'
       + '<span class="task-title">'+escapeHtml(task.text)+'</span>'
       + (meta ? '<div class="task-meta">'+meta+'</div>' : '')
       + '</div>'
       + '</div>';
}

function toggleTodoSection(key) {
  _todoCollapsed[key] = !_todoCollapsed[key];
  refreshTodoBody();
}
