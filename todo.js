// ============================================
//  📅 Board — todo.js
//  To Do / Task / Project 통합 단일 표
//  - 구분항목: To Do, Task, Project, Start, Due, %, Status, Coworker, UpStream Dept.
//  - 헤더 텍스트 클릭 → 표시 항목 필터 드롭다운
//  - 헤더 오른쪽 ▲/▼ 버튼 → 오름차순/내림차순 정렬
// ============================================

var _todoCollapsed = {};   // { groupKey: true/false }

function todoEmptyCell() { return '<span class="todo-table-empty">-</span>'; }

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

// 진행현황(status) 배지
function buildTodoStatusCell(task) {
  if (!task.status) return todoEmptyCell();
  var colors = { '대기':'var(--text-2)', '진행':'var(--success)', '중단':'var(--danger)', '완료':'var(--info)', '취소':'var(--text-3)' };
  var c = colors[task.status] || 'var(--text-2)';
  return '<span class="todo-status-badge" style="color:'+c+';background:color-mix(in srgb, '+c+' 12%, transparent);border:1px solid color-mix(in srgb, '+c+' 33%, transparent);">'+escapeHtml(task.status)+'</span>';
}

// 담당자 셀
function buildTodoAssigneeCell(task) {
  var a = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
  if (!a.length) return todoEmptyCell();
  return escapeHtml(a.join(', '));
}

function fmtTodoTableDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
}

// task가 속한 "섹션"의 이모지 가져오기
//  우선순위: 연계된 만다라트 Section(subGoal.id 기준, 항상 최신값)
//          → 라이프휠 섹션 → 저장된 lwSectionEmoji(과거 저장값, 최후 폴백)
//  ※ 과거에는 저장 시점의 lwSectionEmoji를 우선 사용해서, Project가 다른
//    Section으로 연결돼도 옛 이모지가 표시되는 문제가 있었음 (WORK인데 HEALTH 이모지)
function todoSectionEmoji(task) {
  if (!task) return '';
  var sgId = (task.mdtAction && task.mdtAction.sgId) ||
             (task.mdtGoal   && task.mdtGoal.sgId)   || null;
  var year = (task.mdtAction && task.mdtAction.year) ||
             (task.mdtGoal   && task.mdtGoal.year)   ||
             (typeof appGetYear === 'function' ? appGetYear() : new Date().getFullYear());

  // 만다라트 데이터가 아직 로드되지 않았으면 로드
  try {
    if (typeof mandalarts !== 'undefined' && !mandalarts.length && typeof loadMandalarts === 'function') loadMandalarts();
  } catch (e) {}

  // 1) 만다라트 연계가 있으면 해당 Section(subGoal)을 id로 찾아 최신 이모지 사용
  if (sgId !== null && sgId !== undefined) {
    try {
      if (typeof getMdt === 'function') {
        var mdt = getMdt(parseInt(year, 10));
        if (!mdt && typeof appGetYear === 'function') mdt = getMdt(appGetYear());
        if (mdt && Array.isArray(mdt.subGoals)) {
          var sg = mdt.subGoals.find(function(s){ return s.id === parseInt(sgId, 10); });
          if (sg && sg.emoji) return sg.emoji;
        }
      }
    } catch (e) {}
  }

  // 2) 라이프휠 섹션 인덱스로 조회
  var idx = (task.lwSection !== null && task.lwSection !== undefined)
            ? task.lwSection
            : (sgId ? parseInt(sgId, 10) - 1 : null);
  if (idx !== null && idx !== undefined && idx >= 0) {
    try {
      if (typeof getLwSections === 'function') {
        var secs = getLwSections();
        if (secs && secs[idx] && secs[idx].emoji) return secs[idx].emoji;
      }
    } catch (e) {}
    try {
      if (typeof getMdt === 'function') {
        var mdt2 = getMdt(parseInt(year, 10));
        if (mdt2 && mdt2.subGoals && mdt2.subGoals[idx] && mdt2.subGoals[idx].emoji)
          return mdt2.subGoals[idx].emoji;
      }
    } catch (e) {}
  }

  // 3) 최후 폴백: 저장 시점의 이모지
  return task.lwSectionEmoji || '';
}

function todoProjectKey(task) {
  if (task.mdtAction && task.mdtAction.text) return task.mdtAction.text;
  if (task.lwSectionName) return task.lwSectionName;
  return '프로젝트 없음';
}

// Project 표시명 (연계 Section 이모지 포함)
function todoProjectLabel(task) {
  var key = todoProjectKey(task);
  if (key === '프로젝트 없음') return '';
  var em = todoSectionEmoji(task);
  if (!em && task.mdtAction && task.mdtAction.text) em = '🔮';
  return (em ? em + ' ' : '') + key;
}

// Project 이모지만 (텍스트 제외) — Board 표 표시용
function todoProjectEmoji(task) {
  if (todoProjectKey(task) === '프로젝트 없음') return '';
  var em = todoSectionEmoji(task);
  if (!em && task.mdtAction && task.mdtAction.text) em = '🔮';
  return em || '';
}

// Linked Tasks 라벨 (선행/후행 연결 Task 이름)
function todoLinkedTasksLabel(task) {
  var ids = [].concat(task.prevTaskIds || []).concat(task.nextTaskIds || []);
  if (!ids.length) return '';
  var seen = {};
  var names = ids.map(function(id){
    if (seen[id]) return null; seen[id] = 1;
    var t = (typeof tasks !== 'undefined') ? tasks.find(function(x){ return x.id === id; }) : null;
    return t ? String(t.text || '').replace(/^\[\d{6}\] /,'') : null;
  }).filter(Boolean);
  return names.join(', ');
}

// ============================================
//  통합 표 정의
//  entry = { task, step } (step 없는 Task는 step:null 한 행)
// ============================================

var BOARD_COLS = [
  { key:'todo',     label:'To Do',
    val:function(e){ return e.step ? (e.step.text || '') : ''; },
    cell:function(e){ return '<td class="todo-table-title bd-td-todo"' + (e.step ? ' title="' + escapeHtml(e.step.text) + '"' : '') + '>' + (e.step ? escapeHtml(e.step.text) : todoEmptyCell()) + '</td>'; } },
  { key:'task',     label:'Task',
    val:function(e){ return (e.task.text || '').replace(/^\[\d{6}\] /,''); },
    cell:function(e){ return '<td class="todo-table-title bd-td-task" title="' + escapeHtml(e.task.text) + '">' + escapeHtml(e.task.text) + '</td>'; } },
  { key:'project',  label:'Project',
    val:function(e){ return todoProjectKey(e.task); },
    cell:function(e){ var em = todoProjectEmoji(e.task); return '<td class="todo-table-proj">' + (em ? em : todoEmptyCell()) + '</td>'; } },
  { key:'start',    label:'Start',
    val:function(e){ return e.task.startDate ? fmtTodoTableDate(e.task.startDate) : ''; },
    cell:function(e){ return '<td class="todo-table-start">' + (e.task.startDate ? fmtTodoTableDate(e.task.startDate) : todoEmptyCell()) + '</td>'; } },
  { key:'due',      label:'Due',
    val:function(e){ var d = boardEntryDue(e); return d ? fmtTodoTableDate(d) : ''; },
    cell:function(e){ var d = boardEntryDue(e); return '<td class="todo-table-due">' + (d ? fmtTodoTableDate(d) : todoEmptyCell()) + '</td>'; } },
  { key:'progress', label:'%',
    val:function(e){ return e.step ? (e.step.completed ? 100 : 0) : getTaskProgressPct(e.task); },
    cell:function(e){ return '<td class="todo-table-progress">' + buildProgressBar(e.step ? (e.step.completed ? 100 : 0) : getTaskProgressPct(e.task)) + '</td>'; } },
  { key:'status',   label:'Status',
    val:function(e){ return e.task.status || ''; },
    cell:function(e){ return '<td class="todo-table-status">' + buildTodoStatusCell(e.task) + '</td>'; } },
  { key:'coworker', label:'Coworker',
    val:function(e){ var a = Array.isArray(e.task.assignees) ? e.task.assignees : (e.task.assignee ? [e.task.assignee] : []); return a.join(', '); },
    cell:function(e){ return '<td class="todo-table-assignee">' + buildTodoAssigneeCell(e.task) + '</td>'; } },
  { key:'upstream', label:'UpStream Dept.',
    val:function(e){ return (Array.isArray(e.task.upstreamDepts) && e.task.upstreamDepts.length) ? e.task.upstreamDepts.join(', ') : (e.task.upstreamDept || ''); },
    cell:function(e){ var o = (Array.isArray(e.task.upstreamDepts) && e.task.upstreamDepts.length) ? e.task.upstreamDepts.join(', ') : (e.task.upstreamDept || ''); return '<td class="todo-table-org">' + (o ? escapeHtml(o) : todoEmptyCell()) + '</td>'; } },
  { key:'priority', label:'Priority',
    val:function(e){ return e.task.priority || ''; },
    cell:function(e){ return '<td class="todo-table-priority">' + (e.task.priority ? escapeHtml(String(e.task.priority)) : todoEmptyCell()) + '</td>'; } },
  { key:'linked',   label:'Linked Tasks',
    val:function(e){ return todoLinkedTasksLabel(e.task); },
    cell:function(e){ var l = todoLinkedTasksLabel(e.task); return '<td class="todo-table-linked">' + (l ? escapeHtml(l) : todoEmptyCell()) + '</td>'; } },
  { key:'memo',     label:'Memo',
    val:function(e){ return e.task.memo || ''; },
    cell:function(e){ return '<td class="todo-table-memo">' + (e.task.memo ? escapeHtml(String(e.task.memo)) : todoEmptyCell()) + '</td>'; } },
];

// ── 표시 컬럼 선택 (오른쪽 상단 필터 아이콘) ──
var BD_FILTER_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M3 4 L13 4 L9 9 L9 13 L7 14.5 L7 9 Z"></path>'
  + '<circle cx="15.5" cy="15.5" r="3.3"></circle>'
  + '<line x1="18" y1="18" x2="21.5" y2="21.5"></line>'
  + '<line x1="22" y1="2" x2="2" y2="22" stroke-width="1.3" opacity="0.55"></line>'
  + '</svg>';
var _boardColVis = null;
var _boardColPickerOpen = false;
function boardLoadColVis() {
  if (_boardColVis) return _boardColVis;
  try { var r = localStorage.getItem('boardColVis'); if (r) _boardColVis = JSON.parse(r); } catch (e) {}
  if (!_boardColVis || typeof _boardColVis !== 'object') _boardColVis = {};
  return _boardColVis;
}
function boardSaveColVis() { try { localStorage.setItem('boardColVis', JSON.stringify(_boardColVis)); } catch (e) {} }
function boardColVisible(key) { return boardLoadColVis()[key] !== false; }   // 기본: 모두 표시
// 컬럼 순서 (드래그 재정렬, localStorage 저장)
function boardLoadColOrder() { try { var r = localStorage.getItem('boardColOrder'); if (r) { var o = JSON.parse(r); if (Array.isArray(o)) return o; } } catch (e) {} return []; }
function boardOrderedCols() {
  var order = boardLoadColOrder();
  if (!order.length) return BOARD_COLS.slice();
  var byKey = {}; BOARD_COLS.forEach(function(c){ byKey[c.key] = c; });
  var out = [];
  order.forEach(function(k){ if (byKey[k]) { out.push(byKey[k]); delete byKey[k]; } });
  BOARD_COLS.forEach(function(c){ if (byKey[c.key]) out.push(c); });   // 순서에 없는 항목은 원래 순서로 뒤에
  return out;
}
function boardVisibleCols() { return boardOrderedCols().filter(function(c){ return boardColVisible(c.key); }); }

// 컬럼 헤더 드래그로 순서 변경
var _bdColDrag = null;
function boardColDragStart(key, ev) {
  _bdColDrag = key;
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', key); } catch(e){} }
  if (ev.stopPropagation) ev.stopPropagation();
}
function boardColDragOver(ev) { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'; }
function boardColDrop(toKey, ev) {
  ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation();
  var from = _bdColDrag; _bdColDrag = null;
  if (!from || from === toKey) return;
  var order = boardOrderedCols().map(function(c){ return c.key; });
  var fi = order.indexOf(from); if (fi < 0) return;
  order.splice(fi, 1);
  var ti = order.indexOf(toKey); if (ti < 0) ti = order.length;
  var th = document.getElementById('bd-th-' + toKey);
  if (th) { var r = th.getBoundingClientRect(); if (ev.clientX > r.left + r.width / 2) ti += 1; }
  order.splice(ti, 0, from);
  try { localStorage.setItem('boardColOrder', JSON.stringify(order)); } catch (e) {}
  renderTodoView();
}

// 전체 내용 검색
var _boardSearch = '';
function boardMatchesSearch(e) {
  var q = (_boardSearch || '').trim().toLowerCase();
  if (!q) return true;
  for (var i = 0; i < BOARD_COLS.length; i++) {
    var v = BOARD_COLS[i].val(e);
    if (String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0) return true;
  }
  return false;
}
function boardOnSearch(v) { _boardSearch = v; refreshTodoBody(); }
function boardToggleColVis(key, ev) {
  if (ev) ev.stopPropagation();
  var v = boardLoadColVis();
  v[key] = (v[key] === false) ? true : false;
  if (!BOARD_COLS.some(function(c){ return v[c.key] !== false; })) v[key] = true;   // 최소 1개 유지
  boardSaveColVis();
  renderTodoView();
}
function boardToggleColPicker(ev) { if (ev) ev.stopPropagation(); _boardColPickerOpen = !_boardColPickerOpen; renderTodoView(); }
function boardColPickerPanel() {
  if (!_boardColPickerOpen) return '';
  var items = BOARD_COLS.map(function(c){
    var checked = boardColVisible(c.key) ? ' checked' : '';
    return '<label class="todo-colpick-item"><input type="checkbox"' + checked
      + ' onclick="event.stopPropagation();" onchange="boardToggleColVis(\'' + c.key + '\',event)">'
      + '<span>' + c.label + '</span></label>';
  }).join('');
  return '<div class="bd-colpick-panel" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();">'
    + '<div class="bd-colpick-search-wrap">'
    + '<input type="text" class="bd-colpick-search" id="bd-colpick-search" placeholder="🔍 전체 검색..." value="' + escapeHtml(_boardSearch || '') + '"'
    + ' oninput="boardOnSearch(this.value)" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();">'
    + '</div>'
    + '<div class="bd-colpick-title">표시 항목</div>' + items + '</div>';
}

// 행의 마감일 (To Do 행 = step 마감일 우선, 없으면 상위 Task 마감일)
function boardEntryDue(e) {
  if (e.step && e.step.dueDateTime) return e.step.dueDateTime;
  return e.task.dueDateTime || null;
}

// ── 정렬 상태 ──
var _boardSort = { key: null, dir: 'asc' };

function boardSetSort(key, dir, ev) {
  if (ev) ev.stopPropagation();
  if (_boardSort.key === key && _boardSort.dir === dir) { _boardSort = { key: null, dir: 'asc' }; }
  else _boardSort = { key: key, dir: dir };
  renderTodoView();
}

function boardSortVal(e, key) {
  if (key === 'start') return e.task.startDate ? new Date(e.task.startDate).getTime() : Infinity;
  if (key === 'due')   { var d = boardEntryDue(e); return d ? new Date(d).getTime() : Infinity; }
  if (key === 'progress') return BOARD_COLS.filter(function(c){ return c.key==='progress'; })[0].val(e);
  if (key === 'status') { var order = ['대기','진행','중단','완료','취소']; var i = order.indexOf(e.task.status); return i < 0 ? 99 : i; }
  var col = BOARD_COLS.filter(function(c){ return c.key === key; })[0];
  return col ? String(col.val(e)).toLowerCase() : '';
}

function boardApplySort(arr) {
  if (!_boardSort.key) return arr;
  var k = _boardSort.key, dir = (_boardSort.dir === 'desc') ? -1 : 1;
  return arr.slice().sort(function(a, b) {
    var va = boardSortVal(a, k), vb = boardSortVal(b, k);
    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    return 0;
  });
}

// ── 필터 상태 (컬럼별 제외 값 목록 — 기본: 모두 표시) ──
var _boardFilters = {};        // { colKey: { '값': true(제외) } }
var _boardFilterOpen = null;   // 현재 열린 필터 컬럼 key

function boardFilterDisplayVal(col, e) {
  var v = String(col.val(e) == null ? '' : col.val(e)).trim();
  return v === '' ? '(없음)' : v;
}

function boardToggleFilterPanel(key, ev) {
  if (ev) ev.stopPropagation();
  _boardFilterOpen = (_boardFilterOpen === key) ? null : key;
  renderTodoView();
}

function boardToggleFilterVal(key, encVal, ev) {
  if (ev) ev.stopPropagation();
  var val = decodeURIComponent(encVal);
  if (!_boardFilters[key]) _boardFilters[key] = {};
  if (_boardFilters[key][val]) delete _boardFilters[key][val];
  else _boardFilters[key][val] = true;
  renderTodoView();
}

function boardFilterAll(key, on, ev) {
  if (ev) ev.stopPropagation();
  if (on) { _boardFilters[key] = {}; }
  else {
    var vals = boardDistinctVals(key);
    _boardFilters[key] = {};
    vals.forEach(function(v){ _boardFilters[key][v] = true; });
  }
  renderTodoView();
}

function boardAllEntries() {
  var entries = [];
  (typeof tasks !== 'undefined' ? tasks : []).forEach(function(t) {
    var steps = t.steps || [];
    if (steps.length) steps.forEach(function(s){ entries.push({ task: t, step: s }); });
    else entries.push({ task: t, step: null });
  });
  return entries;
}

function boardDistinctVals(key) {
  var col = BOARD_COLS.filter(function(c){ return c.key === key; })[0];
  if (!col) return [];
  var set = {};
  boardAllEntries().forEach(function(e){ set[boardFilterDisplayVal(col, e)] = true; });
  return Object.keys(set).sort(function(a, b) {
    if (a === '(없음)') return 1;
    if (b === '(없음)') return -1;
    return a.localeCompare(b, 'ko');
  });
}

function boardPassesFilters(e) {
  var cols = boardVisibleCols();
  for (var i = 0; i < cols.length; i++) {
    var col = cols[i];
    var ex = _boardFilters[col.key];
    if (!ex) continue;
    if (ex[boardFilterDisplayVal(col, e)]) return false;
  }
  return true;
}

// ── 헤더 셀 (텍스트 클릭=필터 드롭다운 · 오른쪽 ▲▼=정렬) ──
function boardTh(col) {
  var key = col.key;
  var open = (_boardFilterOpen === key);
  var filterOn = _boardFilters[key] && Object.keys(_boardFilters[key]).length > 0;
  var panel = '';
  if (open) {
    var ex = _boardFilters[key] || {};
    var items = boardDistinctVals(key).map(function(v) {
      var checked = ex[v] ? '' : ' checked';
      return '<label class="todo-colpick-item"><input type="checkbox"' + checked
        + ' onclick="event.stopPropagation();" onchange="boardToggleFilterVal(\'' + key + '\',\'' + encodeURIComponent(v) + '\',event)">'
        + '<span>' + escapeHtml(v) + '</span></label>';
    }).join('');
    panel = '<div class="todo-colpick-panel bd-filter-panel" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();">'
      + '<div class="bd-filter-actions">'
      + '<button onclick="boardFilterAll(\'' + key + '\',true,event)">전체 선택</button>'
      + '<button onclick="boardFilterAll(\'' + key + '\',false,event)">전체 해제</button>'
      + '</div>'
      + (items || '<div class="todo-colpick-item" style="color:var(--text-3);">항목 없음</div>')
      + '</div>';
  }
  var upOn = (_boardSort.key === key && _boardSort.dir === 'asc');
  var dnOn = (_boardSort.key === key && _boardSort.dir === 'desc');
  // 항목 텍스트(헤더 셀) 자체 클릭 → 필터 드롭박스 (정렬 버튼/패널 클릭은 제외)
  return '<th class="bd-th bd-th-' + key + '" id="bd-th-' + key + '" data-cr-key="' + key + '" style="position:sticky;top:0;"'
    + ' ondragover="boardColDragOver(event)" ondrop="boardColDrop(\'' + key + '\',event)"'
    + ' title="클릭: 표시 항목 필터 · 드래그: 순서 변경" onclick="boardToggleFilterPanel(\'' + key + '\',event)">'
    + '<span class="bd-th-label' + (filterOn ? ' bd-filter-on' : '') + '" draggable="true"'
    + ' ondragstart="boardColDragStart(\'' + key + '\',event)">' + col.label + '</span>'
    + '<span class="bd-sortbtns">'
    + '<button class="bd-sortbtn' + (upOn ? ' on' : '') + '" title="오름차순" onclick="boardSetSort(\'' + key + '\',\'asc\',event)">▲</button>'
    + '<button class="bd-sortbtn' + (dnOn ? ' on' : '') + '" title="내림차순" onclick="boardSetSort(\'' + key + '\',\'desc\',event)">▼</button>'
    + '</span>'
    + panel
    + '</th>';
}

// ── 렌더 ──
function renderTodoView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="todo-view"><div id="todo-body">' + buildBoardTable() + '</div></div>';
  var slot = document.getElementById('topbar-board-slot');
  if (slot) {
    slot.innerHTML = '<button class="bd-colpick-btn' + (_boardColPickerOpen ? ' on' : '') + '" id="bd-colpick-btn" title="표시 항목 선택" onclick="boardToggleColPicker(event)">' + BD_FILTER_ICON + '</button>' + boardColPickerPanel();
  }
  boardAttachColResize();
}

function refreshTodoBody() {
  var el = document.getElementById('todo-body');
  if (el) el.innerHTML = buildBoardTable();
  boardAttachColResize();
}

// 컬럼 너비 드래그 조정 (localStorage 저장 → 새로고침 후에도 유지)
function boardAttachColResize() {
  var tbl = document.querySelector('#todo-body .bd-table');
  if (tbl && typeof TLColResize !== 'undefined') TLColResize.table(tbl, 'boardColW');
}

function buildBoardRow(e) {
  var isDone = (e.step ? e.step.completed : e.task.completed) ? 'is-done' : '';
  var isSel  = (typeof detailTaskId !== 'undefined' && detailTaskId === e.task.id) ? 'is-selected' : '';
  return '<tr class="todo-table-row ' + isDone + ' ' + isSel + '" onclick="openDetailPanel(' + e.task.id + ')">'
    + boardVisibleCols().map(function(c){ return c.cell(e); }).join('')
    + '</tr>';
}

function buildBoardTable() {
  var entries = boardAllEntries();
  if (!entries.length) {
    return '<div class="todo-empty">등록된 Task가 없어요 ✨</div>';
  }

  var visible = entries.filter(boardPassesFilters).filter(boardMatchesSearch);
  var vcols = boardVisibleCols();
  var head = '<thead><tr>' + vcols.map(boardTh).join('') + '</tr></thead>';

  if (!visible.length) {
    return '<div class="todo-table-wrap"><table class="todo-table bd-table">' + head
      + '<tbody><tr><td colspan="' + vcols.length + '" style="text-align:center;padding:30px;color:var(--text-3);">표시할 항목이 없어요. 헤더를 클릭해 필터를 확인하세요.</td></tr></tbody>'
      + '</table></div>';
  }

  var isDoneEntry = function(e){ return e.step ? e.step.completed : e.task.completed; };
  var active    = visible.filter(function(e){ return !isDoneEntry(e); });
  var completed = visible.filter(isDoneEntry);

  // 기본 정렬: 마감일 임박 순 (마감일 없음 = 맨 뒤)
  var activeSorted = _boardSort.key
    ? boardApplySort(active)
    : active.slice().sort(function(a, b) {
        var va = boardEntryDue(a) ? new Date(boardEntryDue(a)).getTime() : Infinity;
        var vb = boardEntryDue(b) ? new Date(boardEntryDue(b)).getTime() : Infinity;
        return va - vb;
      });

  var body = activeSorted.map(buildBoardRow).join('');

  // 완료 항목: 하단 "완료됨" 그룹 (기본 접힘)
  if (completed.length > 0) {
    var cs = _boardSort.key ? boardApplySort(completed) : completed;
    body += buildTodoGroupRows('board-completed', '완료됨', 'var(--text-2)', cs, true, boardVisibleCols().length, buildBoardRow);
  }

  return '<div class="todo-table-wrap">'
    + '<table class="todo-table bd-table">' + head
    + '<tbody>' + body + '</tbody>'
    + '</table>'
    + '</div>';
}

// 그룹 헤더 + 행 (rowFn으로 각 항목 렌더)
function buildTodoGroupRows(key, label, color, items, defaultCollapsed, colspan, rowFn) {
  var collapsed = defaultCollapsed ? (_todoCollapsed[key] !== false) : (_todoCollapsed[key] === true);
  var arrow = collapsed ? '' : 'open';

  var html = '<tr class="todo-group-row" onclick="toggleTodoSection(\'' + key + '\')">'
    + '<td colspan="' + colspan + '">'
    + '<span class="todo-sec-arrow ' + arrow + '">›</span>'
    + '<span class="todo-sec-label" style="color:' + color + '">' + escapeHtml(label) + '</span>'
    + '<span class="todo-sec-count">' + items.length + '</span>'
    + '</td></tr>';

  if (!collapsed) items.forEach(function(it){ html += rowFn(it); });
  return html;
}

function toggleTodoSection(key) {
  _todoCollapsed[key] = !_todoCollapsed[key];
  refreshTodoBody();
}

// 컬럼 선택 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e) {
  if (!_boardColPickerOpen) return;
  var btn = document.getElementById('bd-colpick-btn');
  var pnl = document.querySelector('.bd-colpick-panel');
  if ((btn && btn.contains(e.target)) || (pnl && pnl.contains(e.target))) return;
  _boardColPickerOpen = false;
  renderTodoView();
});

// 필터 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e) {
  if (_boardFilterOpen === null) return;
  if (typeof currentMenu !== 'undefined' && currentMenu !== 'todo') return;
  var th = document.getElementById('bd-th-' + _boardFilterOpen);
  if (th && !th.contains(e.target)) {
    _boardFilterOpen = null;
    renderTodoView();
  }
});
