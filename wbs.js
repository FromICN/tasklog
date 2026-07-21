// ============================================
//  🗂 WBS 트리 뷰 (Work Breakdown Structure)
// ============================================

var _wbsOpen = {};

// 현재 연도(전역 연도 동기화 — 다른 페이지와 항상 연결)
function wbsYearVal() {
  return (typeof appGetYear === 'function') ? appGetYear() : new Date().getFullYear();
}

// ── 검색 (대상: Task 및 To Do 텍스트) ──
var _wbsSearch = '';

function wbsSetSearch(val) {
  _wbsSearch = (val || '').trim();
  var root = document.getElementById('wbs-root');
  if (root) root.innerHTML = buildWbsTree();
}

function wbsMatchesSearch(task) {
  if (!_wbsSearch) return true;
  var q = _wbsSearch.toLowerCase();
  if ((task.text || '').toLowerCase().indexOf(q) !== -1) return true;
  return (task.steps || []).some(function(s){ return (s.text || '').toLowerCase().indexOf(q) !== -1; });
}

function renderWbsView() {
  if (typeof appSyncVars === 'function') appSyncVars();
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  renderWbsTitleYear();
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="wbs-page-wrap">'
    + '<div class="wbs-wrap" id="wbs-root">' + buildWbsTree() + '</div>'
    + '</div>';
}

// ── 타이틀 영역 연도 선택 (전역 연도 — MVV·LifeWheel·Mandalart·Task 함께 이동) ──
function handleWbsYearSelect(val) {
  if (val === '__new__') { promptNewWbsYear(); return; }
  if (val === '__delete__') {
    if (typeof appDeleteCurrentYear === 'function') appDeleteCurrentYear();
    else renderWbsView();
    return;
  }
  var y = parseInt(val, 10);
  if (typeof appSetYear === 'function') appSetYear(y);
  else renderWbsView();
}

function promptNewWbsYear() {
  var def = wbsYearVal() + 1;
  var input = prompt('추가할 연도를 입력하세요', def);
  if (input == null) return;
  var y = parseInt(input, 10);
  if (isNaN(y) || y < 2000 || y > 2100) { alert('2000~2100 사이의 연도를 입력하세요.'); return; }
  if (typeof appSetYear === 'function') appSetYear(y);
}

function renderWbsTitleYear() {
  var slot = document.getElementById('topbar-mdt-year-slot');
  if (!slot) return;
  var cur = wbsYearVal();
  var years = (typeof appAllSavedYears === 'function') ? appAllSavedYears().slice() : [];
  if (years.indexOf(cur) === -1) years.push(cur);
  years.sort(function(a, b){ return b - a; });
  var opts = years.map(function(y){
    return '<option value="' + y + '"' + (y === cur ? ' selected' : '') + '>' + y + '년</option>';
  }).join('');
  opts += '<option value="__new__">+ 새 연도 추가</option>';
  opts += '<option value="__delete__">🗑 현재 연도 삭제</option>';
  // 연도 선택 + 검색창 (검색창은 연도 선택 오른쪽)
  slot.innerHTML = '<div class="wbs-title-tools">'
    + '<select class="year-select" onchange="handleWbsYearSelect(this.value)">' + opts + '</select>'
    + '<input type="text" class="wbs-search-inp" id="wbs-search-inp" placeholder="🔍 Task · To Do 검색"'
    + ' value="' + wbsEsc(_wbsSearch) + '" oninput="wbsSetSearch(this.value)">'
    + '</div>';
}

// ── 연도 필터 (전역 연도 기준 · 연도 미지정 항목은 항상 표시) ──
function wbsTaskYear(task) {
  if (task.mdtGoal   && task.mdtGoal.year)   return task.mdtGoal.year;
  if (task.mdtAction && task.mdtAction.year) return task.mdtAction.year;
  return null;
}

function wbsTaskPassesFilter(task) {
  var y = wbsTaskYear(task);
  if (y === null) return true;          // 미분류(연도 미지정) → 항상 표시
  return y === wbsYearVal();
}

// ── 라이브 연계 (WBS ↔ LifeWheel · Mandalart 실시간 동기화) ──
// 작업에 저장된 sgId/actionId 로 현재 연도의 만다라트에서 최신 텍스트를 가져온다.
function wbsLiveMdt() {
  var y = wbsYearVal();
  return (typeof getMdt === 'function') ? getMdt(y) : null;
}

// 작업이 속한 만다라트 핵심목표 id (mdtGoal 우선, 없으면 mdtAction 에서)
function wbsTaskSgId(task) {
  if (task.mdtGoal   && task.mdtGoal.sgId)   return task.mdtGoal.sgId;
  if (task.mdtAction && task.mdtAction.sgId) return task.mdtAction.sgId;
  return null;
}

// 작업의 라이프휠 섹션 인덱스 (lwSection 우선, 없으면 sgId 로 역산: subGoal.id = i+1)
function wbsTaskSection(task) {
  if (task.lwSection !== null && task.lwSection !== undefined) return task.lwSection;
  var sgId = wbsTaskSgId(task);
  return (sgId != null) ? (sgId - 1) : null;
}

function wbsGoalText(sgId, fallback) {
  var mdt = wbsLiveMdt();
  if (mdt && sgId) {
    var sg = (mdt.subGoals || []).find(function(s){ return s.id === sgId; });
    // Mandalart section의 이모지와 동일한 이모지 표시
    if (sg && sg.text) return (sg.emoji ? sg.emoji + ' ' : '') + sg.text;
    if (sg && sg.emoji) return sg.emoji + ' ' + (fallback || 'Section');
  }
  return fallback || 'Section';
}

function wbsActionText(sgId, actionId, fallback) {
  var mdt = wbsLiveMdt();
  if (mdt && sgId && actionId) {
    var sg = (mdt.subGoals || []).find(function(s){ return s.id === sgId; });
    if (sg) {
      var act = (sg.actions || []).find(function(a){ return a.id === actionId; });
      if (act && act.text) return act.text;
    }
  }
  return fallback || 'Project';
}

// 섹션 라벨: 라이프휠 우선, 없으면 만다라트 핵심목표로 폴백
function wbsSectionLabel(lk, lwSecs) {
  var idx = parseInt(lk);
  var sec = lwSecs ? lwSecs[idx] : null;
  if (sec) return (sec.emoji ? sec.emoji + ' ' : '') + sec.name;
  var mdt = wbsLiveMdt();
  var sg = mdt ? (mdt.subGoals || []).find(function(s){ return s.id === idx + 1; }) : null;
  if (sg) return (sg.emoji ? sg.emoji + ' ' : '') + (sg.text || ('영역 ' + (idx + 1)));
  return '영역 ' + (idx + 1);
}

// ── 우측 컬럼: START / DUE / STATUS (날짜는 TASK 행에만 표시) ──
function wbsEmptyCol() { return '<span class="wbs-col"></span>'; }

// 날짜 표시 형식: YYYY-MM-DD
function wbsFmtDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function wbsStartCol(task) {
  if (!task.startDate) return wbsEmptyCol();
  return '<span class="wbs-col set">' + wbsEsc(wbsFmtDate(task.startDate)) + '</span>';
}

function wbsDueCol(task) {
  if (!task.dueDateTime) return wbsEmptyCol();
  var st  = (typeof getDueStatus === 'function') ? getDueStatus(task.dueDateTime) : '';
  return '<span class="wbs-col set ' + (st || '') + '">' + wbsEsc(wbsFmtDate(task.dueDateTime)) + '</span>';
}

// ── 컬럼 정렬/필터 상태 ──
var _wbsSort = { key: null, dir: 'asc' };      // key: 'item' | 'start' | 'due' | 'status'
var _wbsColFilters = {};                        // { key: { '값': true(제외) } }
var _wbsFilterOpen = null;

function wbsColVal(task, key) {
  if (key === 'start')  return task.startDate ? wbsFmtDate(task.startDate) : '';
  if (key === 'due')    return task.dueDateTime ? wbsFmtDate(task.dueDateTime) : '';
  if (key === 'status') return wbsTaskStatusLabel(task);
  return (task.text || '');
}

function wbsColDisplayVal(task, key) {
  var v = String(wbsColVal(task, key)).trim();
  return v === '' ? '(없음)' : v;
}

function wbsSetSort(key, dir, ev) {
  if (ev) ev.stopPropagation();
  if (_wbsSort.key === key && _wbsSort.dir === dir) _wbsSort = { key: null, dir: 'asc' };
  else _wbsSort = { key: key, dir: dir };
  wbsRefreshTree();
}

function wbsSortTasks(arr) {
  if (!_wbsSort.key) return arr;
  var k = _wbsSort.key, dir = (_wbsSort.dir === 'desc') ? -1 : 1;
  return arr.slice().sort(function(a, b) {
    var va, vb;
    if (k === 'start')      { va = a.startDate ? new Date(a.startDate).getTime() : Infinity; vb = b.startDate ? new Date(b.startDate).getTime() : Infinity; }
    else if (k === 'due')   { va = a.dueDateTime ? new Date(a.dueDateTime).getTime() : Infinity; vb = b.dueDateTime ? new Date(b.dueDateTime).getTime() : Infinity; }
    else if (k === 'status'){ var order = ['대기','진행','중단','완료','취소']; va = order.indexOf(wbsTaskStatusLabel(a)); vb = order.indexOf(wbsTaskStatusLabel(b)); }
    else { va = (a.text || '').toLowerCase(); vb = (b.text || '').toLowerCase(); }
    if (va < vb) return -1 * dir;
    if (va > vb) return  1 * dir;
    return 0;
  });
}

function wbsDistinctVals(key) {
  var set = {};
  (typeof tasks !== 'undefined' ? tasks : []).filter(wbsTaskPassesFilter).forEach(function(t) {
    set[wbsColDisplayVal(t, key)] = true;
  });
  return Object.keys(set).sort(function(a, b) {
    if (a === '(없음)') return 1;
    if (b === '(없음)') return -1;
    return a.localeCompare(b, 'ko');
  });
}

function wbsPassesColFilters(task) {
  var keys = ['start', 'due', 'status'];
  for (var i = 0; i < keys.length; i++) {
    var ex = _wbsColFilters[keys[i]];
    if (ex && ex[wbsColDisplayVal(task, keys[i])]) return false;
  }
  return true;
}

function wbsToggleFilterPanel(key, ev) {
  if (ev) ev.stopPropagation();
  _wbsFilterOpen = (_wbsFilterOpen === key) ? null : key;
  wbsRefreshTree();
}

function wbsToggleFilterVal(key, encVal, ev) {
  if (ev) ev.stopPropagation();
  var val = decodeURIComponent(encVal);
  if (!_wbsColFilters[key]) _wbsColFilters[key] = {};
  if (_wbsColFilters[key][val]) delete _wbsColFilters[key][val];
  else _wbsColFilters[key][val] = true;
  wbsRefreshTree();
}

function wbsFilterAll(key, on, ev) {
  if (ev) ev.stopPropagation();
  if (on) _wbsColFilters[key] = {};
  else {
    _wbsColFilters[key] = {};
    wbsDistinctVals(key).forEach(function(v){ _wbsColFilters[key][v] = true; });
  }
  wbsRefreshTree();
}

function wbsRefreshTree() {
  var root = document.getElementById('wbs-root');
  if (root) root.innerHTML = buildWbsTree();
}

// 헤더 셀: 텍스트 클릭 = 필터 드롭다운, 오른쪽 ▲▼ = 정렬
function wbsHeadCell(key, label, cls, filterable) {
  var upOn = (_wbsSort.key === key && _wbsSort.dir === 'asc');
  var dnOn = (_wbsSort.key === key && _wbsSort.dir === 'desc');
  var filterOn = _wbsColFilters[key] && Object.keys(_wbsColFilters[key]).length > 0;
  var panel = '';
  if (filterable && _wbsFilterOpen === key) {
    var ex = _wbsColFilters[key] || {};
    var items = wbsDistinctVals(key).map(function(v) {
      var checked = ex[v] ? '' : ' checked';
      return '<label class="todo-colpick-item"><input type="checkbox"' + checked
        + ' onclick="event.stopPropagation();" onchange="wbsToggleFilterVal(\'' + key + '\',\'' + encodeURIComponent(v) + '\',event)">'
        + '<span>' + wbsEsc(v) + '</span></label>';
    }).join('');
    panel = '<div class="todo-colpick-panel bd-filter-panel" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();">'
      + '<div class="bd-filter-actions">'
      + '<button onclick="wbsFilterAll(\'' + key + '\',true,event)">전체 선택</button>'
      + '<button onclick="wbsFilterAll(\'' + key + '\',false,event)">전체 해제</button>'
      + '</div>'
      + (items || '<div class="todo-colpick-item" style="color:var(--text-3);">항목 없음</div>')
      + '</div>';
  }
  var labelHtml = filterable
    ? '<span class="bd-th-label' + (filterOn ? ' bd-filter-on' : '') + '" title="클릭: 표시 항목 필터" onclick="wbsToggleFilterPanel(\'' + key + '\',event)">' + label + ' <span class="todo-colpick-arrow">▾</span></span>'
    : '<span>' + label + '</span>';
  return '<span class="' + cls + ' wbs-head-cell" id="wbs-th-' + key + '" style="position:relative;">'
    + labelHtml
    + '<span class="bd-sortbtns">'
    + '<button class="bd-sortbtn' + (upOn ? ' on' : '') + '" title="오름차순" onclick="wbsSetSort(\'' + key + '\',\'asc\',event)">▲</button>'
    + '<button class="bd-sortbtn' + (dnOn ? ' on' : '') + '" title="내림차순" onclick="wbsSetSort(\'' + key + '\',\'desc\',event)">▼</button>'
    + '</span>'
    + panel
    + '</span>';
}

// 컬럼 머리글 행
function wbsHeaderRow() {
  return '<div class="wbs-row wbs-header-row">'
    + '<span class="wbs-tog-empty"></span>'
    + wbsHeadCell('item', '항목', 'wbs-sec-label wbs-head-label', false)
    + wbsHeadCell('start', 'START', 'wbs-colhead', true)
    + wbsHeadCell('due', 'DUE', 'wbs-colhead', true)
    + wbsHeadCell('status', 'STATUS', 'wbs-colhead wbs-colhead-status', true)
    + '<span class="wbs-count-spacer"></span>'
    + '</div>';
}

// 필터 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e) {
  if (_wbsFilterOpen === null) return;
  if (typeof currentMenu !== 'undefined' && currentMenu !== 'wbs') return;
  var th = document.getElementById('wbs-th-' + _wbsFilterOpen);
  if (th && !th.contains(e.target)) {
    _wbsFilterOpen = null;
    wbsRefreshTree();
  }
});

function getTaskStatus(task) {
  if (task.completed) return 'done';                                              // 완료
  if (Array.isArray(task.steps) && task.steps.some(function(s){ return s.completed; })) return 'inprogress';  // TO-DO 일부 완료 = 진행중
  return 'todo';                                                                  // 미시작
}

function wbsBadge(status) {
  var labels = { done: 'DONE', inprogress: 'IN PROGRESS', todo: 'TO DO' };
  return '<span class="wbs-badge ' + status + '">' + (labels[status] || status) + '</span>';
}

// ── STATUS 뱃지 (앱 공통 상태값: 대기/진행/중단/완료/취소) ──
var WBS_STATUS_COLORS = { '대기':'var(--text-2)', '진행':'var(--success)', '중단':'var(--danger)', '완료':'var(--info)', '취소':'var(--text-3)' };

function wbsStatusBadge(label) {
  var c = WBS_STATUS_COLORS[label] || 'var(--text-2)';
  return '<span class="wbs-badge" style="color:' + c + ';border:1px solid color-mix(in srgb, ' + c + ' 40%, transparent);background:color-mix(in srgb, ' + c + ' 13%, transparent);">' + label + '</span>';
}

// TASK 자체 상태값 기준 (완료 체크 우선, 없으면 task.status, 기본 대기)
function wbsTaskStatusLabel(task) {
  return task.completed ? '완료' : (task.status || '대기');
}

// 그룹(SECTION/Section/Project) 롤업: 전부 완료=완료, 일부 진행=진행, 그 외 대기
function wbsRollupStatus(taskArr) {
  var total = taskArr.length;
  if (!total) return '대기';
  var done = 0, active = 0;
  taskArr.forEach(function(t){
    var s = wbsTaskStatusLabel(t);
    if (s === '완료') done++;
    else if (s === '진행' || s === '중단') active++;
  });
  if (done === total) return '완료';
  if (done > 0 || active > 0) return '진행';
  return '대기';
}

// 완료 개수 (롤업 카운트용)
function wbsDoneCount(taskArr) {
  return taskArr.filter(function(t){ return wbsTaskStatusLabel(t) === '완료'; }).length;
}

function wbsEsc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}

// ── 이벤트 위임 ──
// TASK / TO-DO 클릭 → 공통 TASK 상세 패널(openDetailPanel)로 연결

document.addEventListener('click', function(e) {
  // WBS 페이지가 아니면 무시
  if (typeof currentMenu !== 'undefined' && currentMenu !== 'wbs') return;

  // 접기/펼치기
  var togRow = e.target.closest('[data-wbs-toggle]');
  if (togRow && !e.target.closest('[data-wbs-task]') && !e.target.closest('[data-wbs-open]') && !e.target.closest('[data-wbs-step-cb]') && !e.target.closest('[data-wbs-step-edit]')) {
    wbsToggle(togRow.dataset.wbsToggle);
    return;
  }
  // 할 일 체크박스
  var cb = e.target.closest('[data-wbs-task]');
  if (cb) {
    e.stopPropagation();
    var taskId = parseInt(cb.dataset.wbsTask);
    if (typeof toggleComplete === 'function') toggleComplete(taskId);
    renderWbsView();   // STATUS·체크박스·롤업 즉시 갱신
    return;
  }
  // 할 일 텍스트 → 공통 TASK 상세 패널 열기
  var openBtn = e.target.closest('[data-wbs-open]');
  if (openBtn) {
    e.stopPropagation();
    if (typeof openDetailPanel === 'function') openDetailPanel(parseInt(openBtn.dataset.wbsOpen));
    return;
  }
  // 단계 체크박스
  var stepCb = e.target.closest('[data-wbs-step-cb]');
  if (stepCb) {
    e.stopPropagation();
    var parts = stepCb.dataset.wbsStepCb.split(':');
    wbsToggleStep(parseInt(parts[0]), parseInt(parts[1]));
    return;
  }
  // 단계(TO-DO) 텍스트 → 상위 TASK 상세 패널 열기
  var stepEdit = e.target.closest('[data-wbs-step-edit]');
  if (stepEdit) {
    e.stopPropagation();
    var sParts = stepEdit.dataset.wbsStepEdit.split(':');
    if (typeof openDetailPanel === 'function') openDetailPanel(parseInt(sParts[0]));
    return;
  }
});

function wbsToggle(nodeId) {
  _wbsOpen[nodeId] = !_wbsOpen[nodeId];
  var children = document.getElementById(nodeId);
  var tog = document.getElementById('tog-' + nodeId);
  if (!children) return;
  children.style.display = _wbsOpen[nodeId] ? 'block' : 'none';
  if (tog) tog.textContent = _wbsOpen[nodeId] ? '▼' : '▶';
}

function wbsToggleStep(taskId, stepId) {
  if (typeof tasks === 'undefined') return;
  var task = tasks.find(function(t){ return t.id === taskId; });
  if (!task) return;
  var step = task.steps.find(function(s){ return s.id === stepId; });
  if (!step) return;
  // 앱 공통 필드는 step.completed (구버전 step.done도 함께 갱신)
  step.completed = !step.completed;
  step.done = step.completed;
  if (typeof saveTasks === 'function') saveTasks();
  renderWbsView();
}

// ── 트리 빌드 (만다라트 연도별 Section → Project → TASK → TO-DO) ──
//  ▸ 상위 = 만다라트 subGoal(Section), 하위 = action(Project)
//  ▸ 해당 연도 만다라트 순서대로, "항목(Task)이 있는 가지"만 표시
function buildWbsTree() {
  if (typeof tasks === 'undefined' || !tasks.length)
    return '<div class="wbs-empty">✨ 등록된 할 일이 없어요<br><small>TASK에 Section·Project를 설정하면 여기서 트리로 볼 수 있어요.</small></div>';

  var filtered = tasks.filter(function(t) {
    return wbsTaskPassesFilter(t) && wbsMatchesSearch(t) && wbsPassesColFilters(t);
  });
  if (!filtered.length)
    return wbsHeaderRow() + '<div class="wbs-empty">✨ 조건에 맞는 할 일이 없어요</div>';

  // groups[sgKey][actionKey] = [task, ...]  (sgKey = 만다라트 subGoal id, actionKey = action id)
  var groups = {};
  filtered.forEach(function(task) {
    var sgId = wbsTaskSgId(task);
    var sk = (sgId != null) ? String(sgId) : '_';
    var ak = (task.mdtAction && task.mdtAction.actionId) ? String(task.mdtAction.actionId) : '_';
    if (!groups[sk])     groups[sk]     = {};
    if (!groups[sk][ak]) groups[sk][ak] = [];
    groups[sk][ak].push(task);
  });

  // 표시 순서: 해당 연도 만다라트 subGoal 순서 → (없는 sgId는 뒤에 숫자순) → 미분류
  var mdt = wbsLiveMdt();
  var order = [];
  if (mdt && Array.isArray(mdt.subGoals)) {
    mdt.subGoals.forEach(function(sg) { if (groups[String(sg.id)]) order.push(String(sg.id)); });
  }
  Object.keys(groups).filter(function(k){ return k !== '_' && order.indexOf(k) === -1; })
    .sort(function(a,b){ return +a - +b; })
    .forEach(function(k){ order.push(k); });

  var html = wbsHeaderRow();
  order.forEach(function(sk) {
    var sgId = parseInt(sk, 10);
    var lk = sgId - 1;   // subGoal.id = 라이프휠/섹션 인덱스 + 1 (드롭 대상 유지)
    var first = Object.values(groups[sk])[0];
    var firstTask = first ? first[0] : null;
    var stored = (firstTask && firstTask.mdtGoal) ? firstTask.mdtGoal.text : '';
    html += renderWbsCoreGroup('sg-' + sk, wbsGoalText(sgId, stored), groups[sk], lk, sgId);
  });
  if (groups['_']) html += renderWbsCoreGroup('sg-none', '📂 미분류', groups['_'], '_', null);
  return html || '<div class="wbs-empty">✨ 등록된 할 일이 없어요</div>';
}

// 1단계: SECTION
function renderWbsSection(nodeId, label, sgGroups, lk) {
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = true;
  var open = _wbsOpen[nodeId];
  var inner = '';
  // 미분류(Section 없음) 그룹
  if (sgGroups['_']) inner += renderWbsCoreGroup(nodeId + '-none', 'Section 미연결', sgGroups['_'], lk);
  Object.keys(sgGroups).filter(function(k){ return k !== '_'; }).forEach(function(sk) {
    var actionGroups = sgGroups[sk];
    var first = Object.values(actionGroups)[0];
    var firstTask = first ? first[0] : null;
    var stored = (firstTask && firstTask.mdtGoal) ? firstTask.mdtGoal.text : '';
    var coreLabel = wbsGoalText(parseInt(sk), stored);   // 라이브 만다라트 목표명
    inner += renderWbsCoreGroup(nodeId + '-' + sk, coreLabel, actionGroups, lk, parseInt(sk));
  });
  var secTasks = [];
  Object.keys(sgGroups).forEach(function(sk){
    Object.keys(sgGroups[sk]).forEach(function(ak){ secTasks = secTasks.concat(sgGroups[sk][ak]); });
  });
  var secDone = wbsDoneCount(secTasks);
  var secTotal = secTasks.length;
  return '<div class="wbs-section-node">'
    + '<div class="wbs-row wbs-section-row" data-wbs-toggle="' + nodeId + '" data-wbs-drop-lk="' + lk + '">'
    + '<span class="wbs-tog" id="tog-' + nodeId + '">' + (open?'▼':'▶') + '</span>'
    + '<span class="wbs-sec-label">' + wbsEsc(label) + '</span>'
    + wbsEmptyCol() + wbsEmptyCol()
    + wbsStatusBadge(wbsRollupStatus(secTasks))
    + '<span class="wbs-count">' + secDone + '/' + secTotal + '</span>'
    + '</div>'
    + '<div class="wbs-children" id="' + nodeId + '" style="display:' + (open?'block':'none') + ';">'
    + inner + '</div></div>';
}

// 2단계: Section (mandalart subGoal)
function renderWbsCoreGroup(nodeId, label, actionGroups, lk, sgId) {
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = true;
  var open = _wbsOpen[nodeId];
  var inner = '';
  if (actionGroups['_']) inner += renderWbsActionGroup(nodeId + '-none', 'Project 미연결', actionGroups['_'], lk, '_', '');
  Object.keys(actionGroups).filter(function(k){ return k !== '_'; }).forEach(function(ak) {
    var taskArr = actionGroups[ak];
    var first = taskArr[0];
    var stored = (first && first.mdtAction) ? first.mdtAction.text : '';
    var akText = wbsActionText(sgId, parseInt(ak), stored);   // 라이브 만다라트 실행과제명
    inner += renderWbsActionGroup(nodeId + '-' + ak, akText, taskArr, lk, ak, akText);
  });
  var allTasks = [].concat.apply([], Object.values(actionGroups));
  var done  = wbsDoneCount(allTasks);
  var total = allTasks.length;
  return '<div class="wbs-core-node">'
    + '<div class="wbs-row wbs-core-row" data-wbs-toggle="' + nodeId + '" data-wbs-drop-lk="' + lk + '">'
    + '<span class="wbs-tog" id="tog-' + nodeId + '">' + (open ? '▼' : '▶') + '</span>'
    + '<span class="wbs-sg-label">' + wbsEsc(label) + '</span>'
    + wbsEmptyCol() + wbsEmptyCol()
    + wbsStatusBadge(wbsRollupStatus(allTasks))
    + '<span class="wbs-count">' + done + '/' + total + '</span>'
    + '</div>'
    + '<div class="wbs-children" id="' + nodeId + '" style="display:' + (open ? 'block' : 'none') + ';">'
    + inner + '</div></div>';
}

// 3단계: Project (mandalart action)
function renderWbsActionGroup(nodeId, label, taskArr, lk, ak, akText) {
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = true;
  var open = _wbsOpen[nodeId];
  var done  = wbsDoneCount(taskArr);
  var total = taskArr.length;
  var inner = wbsSortTasks(taskArr).map(renderWbsTask).join('');
  return '<div class="wbs-action-node">'
    + '<div class="wbs-row wbs-action-row" data-wbs-toggle="' + nodeId + '" data-wbs-drop-lk="' + lk + '" data-wbs-drop-ak="' + ak + '" data-wbs-drop-ak-text="' + encodeURIComponent(akText || '') + '">'
    + '<span class="wbs-tog" id="tog-' + nodeId + '">' + (open ? '▼' : '▶') + '</span>'
    + '<span class="wbs-sg-label">' + wbsEsc(label) + '</span>'
    + wbsEmptyCol() + wbsEmptyCol()
    + wbsStatusBadge(wbsRollupStatus(taskArr))
    + '<span class="wbs-count">' + done + '/' + total + '</span>'
    + '</div>'
    + '<div class="wbs-children" id="' + nodeId + '" style="display:' + (open ? 'block' : 'none') + ';">'
    + inner + '</div></div>';
}

// 4단계: TASK / 5단계: TO-DO (steps)
function renderWbsTask(task) {
  var nodeId   = 'wbs-t-' + task.id;
  // 검색 중이면: Task 자체가 일치하지 않을 때 일치하는 To Do만 표시 + 자동 펼침
  var visSteps = Array.isArray(task.steps) ? task.steps : [];
  if (_wbsSearch) {
    var q = _wbsSearch.toLowerCase();
    var taskHit = (task.text || '').toLowerCase().indexOf(q) !== -1;
    if (!taskHit) visSteps = visSteps.filter(function(s){ return (s.text || '').toLowerCase().indexOf(q) !== -1; });
  }
  var hasSteps = visSteps.length > 0;
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = false;
  var open = _wbsSearch ? true : _wbsOpen[nodeId];
  var stepsHtml = '';
  if (hasSteps) {
    stepsHtml = '<div class="wbs-children wbs-steps" id="' + nodeId + '" style="display:' + (open ? 'block' : 'none') + ';">'
      + visSteps.map(function(step) {
          var cbKey = task.id + ':' + step.id;
          return '<div class="wbs-row wbs-step-row" draggable="true" data-wbs-drag-step="' + cbKey + '">'
            + '<span class="wbs-step-cb" data-wbs-step-cb="' + cbKey + '">' + (step.completed ? '☑' : '☐') + '</span>'
            + '<span class="wbs-step-text' + (step.completed ? ' done' : '') + '" data-wbs-step-edit="' + cbKey + '" title="클릭해서 편집">' + wbsEsc(step.text) + '</span>'
            + wbsEmptyCol() + wbsEmptyCol()
            + wbsStatusBadge(step.completed ? '완료' : '대기')
            + '<span class="wbs-count-spacer"></span>'
            + '</div>';
        }).join('')
      + '</div>';
  }
  return '<div class="wbs-task-node">'
    + '<div class="wbs-row wbs-task-row" draggable="true" data-wbs-drag-task="' + task.id + '" data-wbs-drop-task="' + task.id + '">'
    + (hasSteps ? '<span class="wbs-tog" id="tog-' + nodeId + '" data-wbs-toggle="' + nodeId + '">' + (open ? '▼' : '▶') + '</span>' : '<span class="wbs-tog-empty"></span>')
    + '<span class="wbs-cb" data-wbs-task="' + task.id + '">' + (task.completed ? '☑' : '☐') + '</span>'
    + '<span class="wbs-task-text' + (task.completed ? ' done' : '') + '" data-wbs-open="' + task.id + '" title="클릭해서 편집">' + wbsEsc(task.text) + '</span>'
    + wbsStartCol(task)
    + wbsDueCol(task)
    + wbsStatusBadge(wbsTaskStatusLabel(task))
    + '<span class="wbs-count-spacer"></span>'
    + '</div>'
    + stepsHtml
    + '</div>';
}

// ── 드래그 앤 드롭 (TASK / TO-DO 이동·복사) ──
// 일반 드래그 = 이동, Ctrl(⌘)+드래그 = 복사

var _wbsDrag = null; // { type:'task', taskId } | { type:'step', taskId, stepId }

function wbsAssignTaskSection(task, lk) {
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  if (lk === null) {
    delete task.lwSection; delete task.lwSectionName; delete task.lwSectionEmoji;
    delete task.mdtGoal;   delete task.mdtAction;
    return;
  }
  var secs = (typeof getLwSections === 'function') ? getLwSections() : [];
  var sec = secs ? secs[lk] : null;
  task.lwSection = lk;
  task.lwSectionName  = sec ? sec.name  : '';
  task.lwSectionEmoji = sec ? sec.emoji : '';
  var year = (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : new Date().getFullYear();
  var mdt  = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (mdt && mdt.subGoals[lk]) {
    var sg = mdt.subGoals[lk];
    task.mdtGoal = { year: year, sgId: sg.id, text: sg.text };
  } else {
    delete task.mdtGoal;
  }
  delete task.mdtAction;
}

function wbsAssignTaskAction(task, lk, actionId, actionText) {
  wbsAssignTaskSection(task, lk);
  if (actionId === null) { delete task.mdtAction; return; }
  var year = (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : new Date().getFullYear();
  var sgId = task.mdtGoal ? task.mdtGoal.sgId : null;
  task.mdtAction = { year: year, sgId: sgId, actionId: actionId, text: actionText || '' };
}

function wbsHandleTaskDrop(taskId, dropEl, isCopy) {
  if (typeof tasks === 'undefined') return;
  var task = tasks.find(function(t){ return t.id === taskId; });
  if (!task) return;
  var lkRaw = dropEl.dataset.wbsDropLk;
  var lk = (lkRaw === '_' || lkRaw === '' || lkRaw === undefined) ? null : parseInt(lkRaw);

  var target = task;
  if (isCopy) {
    target = JSON.parse(JSON.stringify(task));
    target.id = Date.now() + Math.floor(Math.random() * 1000);
    if (Array.isArray(target.steps)) {
      target.steps = target.steps.map(function(s) {
        return Object.assign({}, s, { id: Date.now() + Math.floor(Math.random() * 100000) });
      });
    }
  }

  if (dropEl.dataset.wbsDropAk !== undefined) {
    var akRaw = dropEl.dataset.wbsDropAk;
    var ak = (akRaw === '_' || akRaw === '') ? null : parseInt(akRaw);
    var akText = dropEl.dataset.wbsDropAkText ? decodeURIComponent(dropEl.dataset.wbsDropAkText) : '';
    wbsAssignTaskAction(target, lk, ak, akText);
  } else {
    wbsAssignTaskSection(target, lk);
  }

  if (isCopy) tasks.push(target);
  if (typeof saveTasks === 'function') saveTasks();
  renderWbsView();
}

function wbsHandleStepDrop(taskId, stepId, destTaskId, isCopy) {
  if (typeof tasks === 'undefined' || taskId === destTaskId) return;
  var srcTask  = tasks.find(function(t){ return t.id === taskId; });
  var destTask = tasks.find(function(t){ return t.id === destTaskId; });
  if (!srcTask || !destTask || !Array.isArray(srcTask.steps)) return;
  var step = srcTask.steps.find(function(s){ return s.id === stepId; });
  if (!step) return;
  if (!Array.isArray(destTask.steps)) destTask.steps = [];

  if (isCopy) {
    destTask.steps.push(Object.assign({}, step, { id: Date.now() + Math.floor(Math.random() * 100000) }));
  } else {
    srcTask.steps = srcTask.steps.filter(function(s){ return s.id !== stepId; });
    destTask.steps.push(step);
  }
  if (typeof saveTasks === 'function') saveTasks();
  renderWbsView();
}

document.addEventListener('dragstart', function(e) {
  var stepHandle = e.target.closest('[data-wbs-drag-step]');
  var taskHandle = e.target.closest('[data-wbs-drag-task]');
  if (stepHandle) {
    var parts = stepHandle.dataset.wbsDragStep.split(':');
    _wbsDrag = { type: 'step', taskId: parseInt(parts[0]), stepId: parseInt(parts[1]) };
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', 'wbs-step'); }
    stepHandle.classList.add('wbs-dragging');
    return;
  }
  if (taskHandle) {
    _wbsDrag = { type: 'task', taskId: parseInt(taskHandle.dataset.wbsDragTask) };
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', 'wbs-task'); }
    taskHandle.classList.add('wbs-dragging');
    return;
  }
});

document.addEventListener('dragover', function(e) {
  if (!_wbsDrag) return;
  var dropEl = (_wbsDrag.type === 'task')
    ? e.target.closest('[data-wbs-drop-lk]')
    : e.target.closest('[data-wbs-drop-task]');
  if (dropEl) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
    dropEl.classList.add('wbs-drop-target');
  }
});

document.addEventListener('dragleave', function(e) {
  var el = e.target.closest('[data-wbs-drop-lk], [data-wbs-drop-task]');
  if (el) el.classList.remove('wbs-drop-target');
});

document.addEventListener('drop', function(e) {
  if (!_wbsDrag) return;
  var isCopy = !!(e.ctrlKey || e.metaKey);
  if (_wbsDrag.type === 'task') {
    var dropEl = e.target.closest('[data-wbs-drop-lk]');
    if (dropEl) {
      e.preventDefault();
      dropEl.classList.remove('wbs-drop-target');
      wbsHandleTaskDrop(_wbsDrag.taskId, dropEl, isCopy);
    }
  } else if (_wbsDrag.type === 'step') {
    var dropEl2 = e.target.closest('[data-wbs-drop-task]');
    if (dropEl2) {
      e.preventDefault();
      dropEl2.classList.remove('wbs-drop-target');
      wbsHandleStepDrop(_wbsDrag.taskId, _wbsDrag.stepId, parseInt(dropEl2.dataset.wbsDropTask), isCopy);
    }
  }
  _wbsDrag = null;
});

document.addEventListener('dragend', function() {
  document.querySelectorAll('.wbs-drop-target').forEach(function(el){ el.classList.remove('wbs-drop-target'); });
  document.querySelectorAll('.wbs-dragging').forEach(function(el){ el.classList.remove('wbs-dragging'); });
  _wbsDrag = null;
});
