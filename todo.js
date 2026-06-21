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

// ── Project 헤더: 짧게 클릭=정렬 / 길게 누름=필터 드롭다운 ──
var _todoProjPressTimer = null;
var _todoProjLongFired  = false;
function todoProjPressStart(e) {
  if (e) e.stopPropagation();
  _todoProjLongFired = false;
  clearTimeout(_todoProjPressTimer);
  _todoProjPressTimer = setTimeout(function(){
    _todoProjLongFired = true;   // 길게 누름 → 필터 열기 (정렬 안 함)
    openTodoProjPick();
  }, 450);
}
function todoProjPressEnd(e) {
  if (e) e.stopPropagation();
  clearTimeout(_todoProjPressTimer);
  if (_todoProjLongFired) { _todoProjLongFired = false; return; }
  todoSortBy('project');         // 짧은 클릭 → 정렬 토글
}
function todoProjPressCancel() { clearTimeout(_todoProjPressTimer); }

function toggleTodoProj(key) {
  var i = _todoProjHidden.indexOf(key);
  if (i >= 0) _todoProjHidden.splice(i, 1); else _todoProjHidden.push(key);
  saveTodoProjHidden();
  refreshTodoBody(); // _todoProjPickOpen 유지 → 패널 열린 채로 갱신
}

// Project 탭 헤더(가장 왼쪽 데이터 컬럼) — 클릭=정렬, 길게 누름=표시 프로젝트 필터
function todoProjFilterTh() {
  var projItems = allProjectKeys().map(function(k){
    var checked = _todoProjHidden.indexOf(k) === -1 ? ' checked' : '';
    return '<label class="todo-colpick-item"><input type="checkbox"'+checked+' data-projkey="'+encodeURIComponent(k)+'" onchange="toggleTodoProj(decodeURIComponent(this.dataset.projkey))"><span>'+escapeHtml(k)+'</span></label>';
  }).join('');
  var disp = _todoProjPickOpen ? 'block' : 'none';
  var ind  = (_todoSort.key === 'project') ? ' <span class="todo-sort-ind">'+(_todoSort.dir==='desc'?'▼':'▲')+'</span>' : '';
  return '<th class="todo-th-sort todo-th-proj" id="todo-proj-th" title="클릭: 정렬 / 길게 누름: 표시 프로젝트 선택" style="position:relative;cursor:pointer;white-space:nowrap;user-select:none;" '
    + 'onmousedown="todoProjPressStart(event)" onmouseup="todoProjPressEnd(event)" onmouseleave="todoProjPressCancel()" '
    + 'ontouchstart="todoProjPressStart(event)" ontouchend="event.preventDefault();todoProjPressEnd(event)">'
    + 'Project' + ind + ' <span class="todo-colpick-arrow">▾</span>'
    + '<div class="todo-colpick-panel" id="todo-projpick-panel" style="display:'+disp+';position:absolute;top:100%;left:0;z-index:60;font-weight:normal;text-align:left;" onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();" onclick="event.stopPropagation();">'
    + (projItems || '<div class="todo-colpick-item" style="color:var(--text-3);">프로젝트 없음</div>')
    + '</div>'
    + '</th>';
}

// ── 정렬 ──
var _todoSort = { key: null, dir: 'asc' };

function todoSortBy(key) {
  if (_todoSort.key === key) _todoSort.dir = (_todoSort.dir === 'asc') ? 'desc' : 'asc';
  else { _todoSort.key = key; _todoSort.dir = 'asc'; }
  refreshTodoBody();
}

function todoSortValue(task, key) {
  switch (key) {
    case 'title':    return (task.text || '').replace(/^\[\d{6}\] /,'').toLowerCase();
    case 'start':    return task.startDate ? new Date(task.startDate).getTime() : Infinity;
    case 'due':      return task.dueDateTime ? new Date(task.dueDateTime).getTime() : Infinity;
    case 'progress': return getTaskProgressPct(task);
    case 'status':   { var order=['대기','진행','중단','완료','취소']; var i=order.indexOf(task.status); return i<0?99:i; }
    case 'coworker': { var a=Array.isArray(task.assignees)?task.assignees:(task.assignee?[task.assignee]:[]); return a.join(', ').toLowerCase(); }
    case 'upstream': { var o=(Array.isArray(task.upstreamDepts)&&task.upstreamDepts.length)?task.upstreamDepts.join(', '):(task.upstreamDept||''); return o.toLowerCase(); }
    case 'project':  return (((task.mdtAction&&task.mdtAction.text)||task.lwSectionName)||'').toLowerCase();
    default: return '';
  }
}

function applyTodoSort(arr) {
  if (!_todoSort.key) return arr;
  var k = _todoSort.key, dir = (_todoSort.dir === 'desc') ? -1 : 1;
  return arr.slice().sort(function(a, b){
    var va = todoSortValue(a, k), vb = todoSortValue(b, k);
    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    return 0;
  });
}

function todoSortableTh(key, label, cls) {
  var ind = (_todoSort.key === key) ? ' <span class="todo-sort-ind">'+(_todoSort.dir==='desc'?'▼':'▲')+'</span>' : '';
  return '<th class="todo-th-sort '+(cls||'')+'" onclick="todoSortBy(\''+key+'\')">'+label+ind+'</th>';
}

function todoColHeadsHtml() { return selectedTodoCols().map(function(c){ return todoSortableTh(c.key, c.label, c.thCls); }).join(''); }
function todoColCellsHtml(task) { return selectedTodoCols().map(function(c){ return c.cell(task); }).join(''); }

function renderTodoView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="todo-view">'
    + buildTodoTabBar()
    + '<div id="todo-body">' + buildTodoBody() + '</div>'
    + '</div>';
}

function buildTodoBody() {
  if (_todoActiveTab === 'table')   return buildTodoTableView();
  if (_todoActiveTab === 'project') return buildTodoProjectView();
  return buildTodoListView();
}

function refreshTodoBody() {
  var el = document.getElementById('todo-body');
  if (el) el.innerHTML = buildTodoBody();
}

// ── 탭 바 + 구분(컬럼) 다중 선택 ───────────────
function buildTodoTabBar() {
  var items = TODO_COLS.map(function(c){
    var checked = _todoCols.indexOf(c.key) !== -1 ? ' checked' : '';
    return '<label class="todo-colpick-item"><input type="checkbox"'+checked+' onchange="toggleTodoCol(\''+c.key+'\')"><span>'+c.label+'</span></label>';
  }).join('');
  // Project 탭의 표시 프로젝트 필터는 Project 컬럼 헤더 클릭으로 이동됨
  return '<div class="todo-tabs">'
    + '<div class="todo-tabs-left">'
    + '<button class="todo-tab' + (_todoActiveTab==='list'?' active':'') + '" onclick="switchTodoTab(\'list\')">To Do</button>'
    + '<button class="todo-tab' + (_todoActiveTab==='table'?' active':'') + '" onclick="switchTodoTab(\'table\')">Task</button>'
    + '<button class="todo-tab' + (_todoActiveTab==='project'?' active':'') + '" onclick="switchTodoTab(\'project\')">Project</button>'
    + '</div>'
    + '<div class="todo-tabs-right">'
    + '<div class="todo-colpick" id="todo-colpick">'
    + '<span class="todo-groupby-label">구분</span>'
    + '<button class="todo-colpick-btn" onclick="toggleTodoColPick(event)">표시 항목 선택 <span class="todo-colpick-arrow">▾</span></button>'
    + '<div class="todo-colpick-panel" id="todo-colpick-panel" style="display:none;">' + items + '</div>'
    + '</div>'
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
  // 모든 Task의 To Do(step)를 개별 항목으로 수집 (Task 자체는 행으로 표시하지 않음)
  var entries = [];
  tasks.forEach(function(t){ (t.steps || []).forEach(function(s){ entries.push({ task:t, step:s }); }); });

  if (!entries.length) {
    return '<div class="todo-empty">등록된 To Do가 없어요 ✨<br><small>Task 안에 To Do를 추가하면 여기에 표시돼요.</small></div>';
  }

  var active    = entries.filter(function(e){ return !e.step.completed; });
  var completed = entries.filter(function(e){ return e.step.completed; });

  var colspan = 2 + selectedTodoCols().length;
  var head = '<thead><tr>'
    + '<th class="c-check"></th>'
    + todoSortableTh('title', 'To Do', 'todo-th-title')
    + todoColHeadsHtml()
    + '</tr></thead>';
  var rowFn = function(e){ return buildTodoStepRow(e.task, e.step); };

  // 미완료: 분류 없이 평면 나열 (정렬 미지정 시 마감일 오름차순)
  var activeSorted = _todoSort.key
    ? applyTodoSortEntries(active)
    : active.slice().sort(function(a,b){
        var va = a.step.dueDateTime ? new Date(a.step.dueDateTime).getTime() : Infinity;
        var vb = b.step.dueDateTime ? new Date(b.step.dueDateTime).getTime() : Infinity;
        return va - vb;
      });

  var body = activeSorted.map(rowFn).join('');

  // 완료: 하단 "완료됨" 그룹 (기본 접힘)
  if (completed.length > 0) {
    var cs = completed.slice().sort(function(a,b){ return new Date(b.step.dueDateTime||0)-new Date(a.step.dueDateTime||0); });
    body += buildTodoGroupRows('completed', '완료됨', 'var(--text-2)', applyTodoSortEntries(cs), true, colspan, rowFn);
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

function todoSortValueEntry(e, key) {
  if (key === 'title')    return (e.step.text || '').replace(/^\[\d{6}\] /,'').toLowerCase();
  if (key === 'due')      return e.step.dueDateTime ? new Date(e.step.dueDateTime).getTime() : Infinity;
  if (key === 'progress') return e.step.completed ? 100 : 0;
  return todoSortValue(e.task, key);
}

function applyTodoSortEntries(arr) {
  if (!_todoSort.key) return arr;
  var k = _todoSort.key, dir = (_todoSort.dir === 'desc') ? -1 : 1;
  return arr.slice().sort(function(a, b){
    var va = todoSortValueEntry(a, k), vb = todoSortValueEntry(b, k);
    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    return 0;
  });
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

  var active    = tasks.filter(function(t){ return !t.completed; });
  var completed = tasks.filter(function(t){ return t.completed; });

  var activeSorted = _todoSort.key
    ? applyTodoSort(active)
    : active.slice().sort(function(a,b){ return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });

  var head = '<thead><tr>'
    + '<th class="c-check"></th>'
    + todoSortableTh('title', 'Task', 'todo-th-title')
    + todoColHeadsHtml()
    + '</tr></thead>';

  var body = activeSorted.map(buildTodoRow).join('');

  // 완료된 Task는 하단 "완료됨" 그룹으로 이동 (기본 접힘)
  if (completed.length > 0) {
    var colspan = 2 + selectedTodoCols().length;
    var cs = _todoSort.key
      ? applyTodoSort(completed)
      : completed.slice().sort(function(a,b){ return new Date(b.completedAt||b.createdAt||0) - new Date(a.completedAt||a.createdAt||0); });
    body += buildTodoGroupRows('table-completed', '완료됨', 'var(--text-2)', cs, true, colspan, buildTodoRow);
  }

  return '<div class="todo-table-wrap">'
    + '<table class="todo-table">' + head
    + '<tbody>' + body + '</tbody>'
    + '</table>'
    + '</div>'
    + '<div class="todo-table-count">총 ' + tasks.length + '개</div>';
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
    + '<th class="c-check"></th>'
    + todoProjFilterTh()
    + todoSortableTh('title', 'Task', 'todo-th-title')
    + otherCols.map(function(c){ return todoSortableTh(c.key, c.label, c.thCls); }).join('')
    + '</tr></thead>';

  var visible = tasks.filter(function(t){ return _todoProjHidden.indexOf(todoProjectKey(t)) === -1; });

  if (!visible.length) {
    return '<div class="todo-table-wrap"><table class="todo-table">' + head
      + '<tbody><tr><td colspan="'+colspan+'" style="text-align:center;padding:30px;color:var(--text-3);">표시할 프로젝트가 없어요. "Project" 헤더(▾)를 클릭해 선택하세요.</td></tr></tbody>'
      + '</table></div>';
  }

  var active    = visible.filter(function(t){ return !t.completed; });
  var completed = visible.filter(function(t){ return t.completed; });

  // 기본: 프로젝트 오름차순. 정렬 헤더 클릭 시 해당 기준 적용
  var activeSorted = _todoSort.key ? applyTodoSort(active) : active.slice().sort(todoProjCompare);
  var body = activeSorted.map(buildTodoProjRow).join('');

  // 완료된 Task는 하단 "완료됨" 그룹으로 이동 (기본 접힘)
  if (completed.length > 0) {
    var cs = _todoSort.key ? applyTodoSort(completed) : completed.slice().sort(todoProjCompare);
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
       + '<button class="task-star '+(task.starred?'starred':'')+'" onclick="event.stopPropagation();toggleStar('+task.id+')">'
       + (task.starred?'★':'☆')+'</button>'
       + '</div>';
}

function toggleTodoSection(key) {
  _todoCollapsed[key] = !_todoCollapsed[key];
  refreshTodoBody();
}
