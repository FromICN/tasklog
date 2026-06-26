// ============================================
//  🗂 WBS 트리 뷰 (Work Breakdown Structure)
// ============================================

var _wbsOpen = {};

// 현재 연도(전역 연도 동기화 — 다른 페이지와 항상 연결)
function wbsYearVal() {
  return (typeof appGetYear === 'function') ? appGetYear() : new Date().getFullYear();
}

function renderWbsView() {
  if (typeof appSyncVars === 'function') appSyncVars();
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  wbsRegisterFilter();
  if (typeof TLFilter !== 'undefined') TLFilter.render('wbs');
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="wbs-wrap" id="wbs-root">' + buildWbsTree() + '</div>';
  applyWbsColResize();
}

// 컬럼 너비 드래그 조정 적용 (WBS — START/DUE/STATUS)
function applyWbsColResize() {
  if (typeof TLColResize === 'undefined') return;
  var root = document.getElementById('wbs-root');
  var header = root ? root.querySelector('.wbs-header-row') : null;
  if (!root || !header) return;
  TLColResize.flex(root, header, 'cr-wbs', [
    { key: 'start',  headSel: '.wbs-colhead-start',  varName: '--wbs-w-start' },
    { key: 'due',    headSel: '.wbs-colhead-due',    varName: '--wbs-w-due' },
    { key: 'status', headSel: '.wbs-colhead-status', varName: '--wbs-w-status' }
  ]);
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

// ── 통합 필터/정렬 (TLFilter) — 연도 선택 통합 + Status/Project 필터, 정렬 ──
function wbsProjectKey(t) {
  return (typeof todoProjectKey === 'function') ? todoProjectKey(t)
    : ((t.mdtAction && t.mdtAction.text) || t.lwSectionName || '프로젝트 없음');
}
// 연도 추정: 만다라트 연결 연도 > 시작/마감일 연도
function wbsFilterYear(t) {
  if (t.mdtAction && t.mdtAction.year) return parseInt(t.mdtAction.year, 10);
  if (t.mdtGoal   && t.mdtGoal.year)   return parseInt(t.mdtGoal.year, 10);
  var d = t.startDate || t.dueDateTime;
  if (d) { var y = new Date(d).getFullYear(); if (!isNaN(y)) return y; }
  return null;
}
function wbsRegisterFilter() {
  if (typeof TLFilter === 'undefined') return;
  TLFilter.register('wbs', {
    items: function(){ return (typeof tasks!=='undefined') ? tasks : []; },
    onChange: function(){ renderWbsView(); },
    filters: [
      { key:'year',     label:'연도',     get:function(t){ return wbsFilterYear(t); }, format:function(v){ return v+'년'; } },
      { key:'status',   label:'Status',   options:function(){ return ['대기','진행','중단','완료','취소']; }, get:function(t){ return t.status||''; } },
      { key:'project',  label:'Project',  get:function(t){ return wbsProjectKey(t); } },
      { key:'coworker', label:'Coworker', get:function(t){ var a=Array.isArray(t.assignees)?t.assignees:(t.assignee?[t.assignee]:[]); return a; } },
      { key:'priority', label:'Priority', options:function(){ return ['DO','SCHEDULE','DELEGATE','DROP']; }, get:function(t){ return t.eisenhower||''; }, format:function(v){ return (typeof RP_EI_NAME!=='undefined'&&RP_EI_NAME[v])?RP_EI_NAME[v]:v; } },
      { key:'linkedPrev', label:'선행 Task', get:function(t){ return (typeof todoLinkedTitles==='function') ? todoLinkedTitles(t.prevTaskIds) : []; } },
      { key:'linkedNext', label:'후행 Task', get:function(t){ return (typeof todoLinkedTitles==='function') ? todoLinkedTitles(t.nextTaskIds) : []; } }
    ],
    sorts: [
      { key:'title',    label:'제목',   get:function(t){ return (t.text||'').replace(/^\[\d{6}\] /,'').toLowerCase(); } },
      { key:'start',    label:'시작일', get:function(t){ return t.startDate ? new Date(t.startDate).getTime() : null; } },
      { key:'due',      label:'마감일', get:function(t){ return t.dueDateTime ? new Date(t.dueDateTime).getTime() : null; } },
      { key:'status',   label:'Status',   get:function(t){ var o=['대기','진행','중단','완료','취소']; var i=o.indexOf(wbsTaskStatusLabel(t)); return i<0?null:i; } },
      { key:'project',  label:'Project',  get:function(t){ return (wbsProjectKey(t)||'').toLowerCase()||null; } },
      { key:'priority', label:'Priority', get:function(t){ var po=['DO','SCHEDULE','DELEGATE','DROP']; var pi=po.indexOf(t.eisenhower); return pi<0?null:pi; } },
      { key:'linkedPrev', label:'선행 수', get:function(t){ return Array.isArray(t.prevTaskIds)?t.prevTaskIds.length:0; } },
      { key:'linkedNext', label:'후행 수', get:function(t){ return Array.isArray(t.nextTaskIds)?t.nextTaskIds.length:0; } }
    ]
  });
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

// 작업의 라이프휠 섹션 인덱스 (드래그·드롭 등 lwSection 기준 로직용)
function wbsTaskSection(task) {
  var sgId = wbsTaskSgId(task);
  if (sgId != null) return sgId - 1;
  if (task.lwSection !== null && task.lwSection !== undefined) return task.lwSection;
  return null;
}

// ── 영역(Section) 키: 만다라트 핵심목표(sgId) 기준으로 통일 ──
//  - WBS 최상위 'Section' 단계는 만다라트 핵심목표 하나로 표현한다.
//    (라이프휠 섹션과 핵심목표가 같은 영역을 두 단계로 중첩 표시하던 문제 제거)
//  - 핵심목표 연결이 없으면 라이프휠 섹션 인덱스를 핵심목표 id(i+1)로 환산해 같은 공간에 매핑.
function wbsTaskArea(task) {
  var sgId = wbsTaskSgId(task);
  if (sgId != null) return sgId;
  if (task.lwSection !== null && task.lwSection !== undefined) return task.lwSection + 1;
  return null;
}

// 영역 라벨: 라이브 만다라트 핵심목표명(이모지 포함) 우선, 없으면 라이프휠 섹션명으로 폴백
function wbsAreaLabel(sgId, stored) {
  var mdt = wbsLiveMdt();
  if (mdt && sgId) {
    var sg = (mdt.subGoals || []).find(function(s){ return s.id === sgId; });
    if (sg && sg.text) return (sg.emoji ? sg.emoji + ' ' : '') + sg.text;
  }
  var lwSecs = (typeof getLwSections === 'function') ? getLwSections() : null;
  var sec = (lwSecs && sgId) ? lwSecs[sgId - 1] : null;
  if (sec && sec.name) return (sec.emoji ? sec.emoji + ' ' : '') + sec.name;
  return stored || ('영역 ' + (sgId || '?'));
}

function wbsGoalText(sgId, fallback) {
  var mdt = wbsLiveMdt();
  if (mdt && sgId) {
    var sg = (mdt.subGoals || []).find(function(s){ return s.id === sgId; });
    if (sg && sg.text) return sg.text;
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
function wbsEmptyCol(role) { return '<span class="wbs-col wbs-col-' + (role || 'start') + '"></span>'; }

// 날짜 표시 형식: yyyy.mm.dd
function wbsFmtDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10).replace(/-/g, '.');
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '.' + m + '.' + day;
}

function wbsStartCol(task) {
  if (!task.startDate) return wbsEmptyCol('start');
  return '<span class="wbs-col wbs-col-start set">' + wbsEsc(wbsFmtDate(task.startDate)) + '</span>';
}

function wbsDueCol(task) {
  if (!task.dueDateTime) return wbsEmptyCol('due');
  var st  = (typeof getDueStatus === 'function') ? getDueStatus(task.dueDateTime) : '';
  return '<span class="wbs-col wbs-col-due set ' + (st || '') + '">' + wbsEsc(wbsFmtDate(task.dueDateTime)) + '</span>';
}

// 컬럼 머리글 행
function wbsHeaderRow() {
  return '<div class="wbs-row wbs-header-row">'
    + '<span class="wbs-tog-empty"></span>'
    + '<span class="wbs-sec-label wbs-head-label">항목</span>'
    + '<span class="wbs-colhead wbs-colhead-start">START</span>'
    + '<span class="wbs-colhead wbs-colhead-due">DUE</span>'
    + '<span class="wbs-colhead wbs-colhead-status">STATUS</span>'
    + '<span class="wbs-count-spacer"></span>'
    + '</div>';
}

function getTaskStatus(task) {
  if (task.completed) return 'done';                                              // 완료
  if (Array.isArray(task.steps) && task.steps.some(function(s){ return s.done; })) return 'inprogress';  // TO-DO 일부 완료 = 진행중
  return 'todo';                                                                  // 미시작
}

function wbsBadge(status) {
  var labels = { done: 'DONE', inprogress: 'IN PROGRESS', todo: 'TO DO' };
  return '<span class="wbs-badge ' + status + '">' + (labels[status] || status) + '</span>';
}

// ── STATUS 뱃지 (앱 공통 상태값: 대기/진행/중단/완료/취소) ──
var WBS_STATUS_COLORS = { '대기':'#9CA3AF', '진행':'#2ecc71', '중단':'#ef4444', '완료':'#4F6EF7', '취소':'#6b7280' };

function wbsStatusBadge(label) {
  var c = WBS_STATUS_COLORS[label] || '#9CA3AF';
  return '<span class="wbs-col wbs-col-status"><span class="wbs-badge" style="color:' + c + ';border:1px solid ' + c + '66;background:' + c + '22;">' + label + '</span></span>';
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
  step.done = !step.done;
  if (typeof saveTasks === 'function') saveTasks();
  renderWbsView();
}

// ── 트리 빌드 (Section[만다라트 핵심목표] → Project[실행과제] → TASK → TO-DO) ──
//   라이프휠 섹션 단계를 제거하고, 만다라트 핵심목표를 단일 Section 단계로 사용한다.
//   (예전: Health[라이프휠] ▸ WORK[핵심목표] ▸ … → 변경: WORK[핵심목표] ▸ …)

function buildWbsTree() {
  if (typeof tasks === 'undefined' || !tasks.length)
    return '<div class="wbs-empty">✨ 등록된 할 일이 없어요<br><small>TASK 추가 시 Section을 설정하면 여기서 트리로 볼 수 있어요.</small></div>';

  var filtered = (typeof TLFilter !== 'undefined') ? TLFilter.apply('wbs', tasks.slice()) : tasks.slice();
  if (!filtered.length)
    return '<div class="wbs-empty">✨ 조건에 맞는 할 일이 없어요</div>';

  // groups[areaKey][actionKey] = [task, ...]   (areaKey = 만다라트 핵심목표 id)
  var groups = {};
  var areaSample = {};
  filtered.forEach(function(task) {
    var sgId = wbsTaskArea(task);
    var ak   = (task.mdtAction && task.mdtAction.actionId) ? String(task.mdtAction.actionId) : '_';
    var areaKey = (sgId != null) ? String(sgId) : '_';
    if (!groups[areaKey])     groups[areaKey]     = {};
    if (!groups[areaKey][ak]) groups[areaKey][ak] = [];
    groups[areaKey][ak].push(task);
    if (!areaSample[areaKey]) areaSample[areaKey] = task;
  });

  var html = wbsHeaderRow();
  Object.keys(groups).filter(function(k){ return k !== '_'; })
    .sort(function(a,b){ return +a - +b; })
    .forEach(function(areaKey) {
      var sgId = parseInt(areaKey);
      var sample = areaSample[areaKey];
      var stored = (sample && sample.mdtGoal) ? sample.mdtGoal.text : '';
      html += renderWbsSection('sg-' + areaKey, wbsAreaLabel(sgId, stored), groups[areaKey], sgId);
    });
  if (groups['_']) html += renderWbsSection('sg-none', '📂 미분류', groups['_'], null);
  return html || '<div class="wbs-empty">✨ 등록된 할 일이 없어요</div>';
}

// 1단계: SECTION (만다라트 핵심목표) — 하위에 Project(실행과제)를 직접 배치
function renderWbsSection(nodeId, label, actionGroups, sgId) {
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = true;
  var open = _wbsOpen[nodeId];
  var lk = (sgId != null) ? (sgId - 1) : '_';   // 드래그·드롭(lwSection) 호환용
  var inner = '';
  // Project(실행과제) 미연결 그룹
  if (actionGroups['_'])
    inner += renderWbsActionGroup(nodeId + '-none', 'Project 미연결', actionGroups['_'], lk, '_', '');
  Object.keys(actionGroups).filter(function(k){ return k !== '_'; }).forEach(function(ak) {
    var taskArr = actionGroups[ak];
    var first = taskArr[0];
    var stored = (first && first.mdtAction) ? first.mdtAction.text : '';
    var akText = wbsActionText(sgId, parseInt(ak), stored);   // 라이브 만다라트 실행과제명
    inner += renderWbsActionGroup(nodeId + '-' + ak, akText, taskArr, lk, ak, akText);
  });
  var secTasks = [].concat.apply([], Object.values(actionGroups));
  var secDone = wbsDoneCount(secTasks);
  var secTotal = secTasks.length;
  return '<div class="wbs-section-node">'
    + '<div class="wbs-row wbs-section-row" data-wbs-toggle="' + nodeId + '" data-wbs-drop-lk="' + lk + '">'
    + '<span class="wbs-tog" id="tog-' + nodeId + '">' + (open?'▼':'▶') + '</span>'
    + '<span class="wbs-sec-label">' + wbsEsc(label) + '</span>'
    + wbsEmptyCol('start') + wbsEmptyCol('due')
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
    + wbsEmptyCol('start') + wbsEmptyCol('due')
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
  var inner = taskArr.map(renderWbsTask).join('');
  return '<div class="wbs-action-node">'
    + '<div class="wbs-row wbs-action-row" data-wbs-toggle="' + nodeId + '" data-wbs-drop-lk="' + lk + '" data-wbs-drop-ak="' + ak + '" data-wbs-drop-ak-text="' + encodeURIComponent(akText || '') + '">'
    + '<span class="wbs-tog" id="tog-' + nodeId + '">' + (open ? '▼' : '▶') + '</span>'
    + '<span class="wbs-sg-label">' + wbsEsc(label) + '</span>'
    + wbsEmptyCol('start') + wbsEmptyCol('due')
    + wbsStatusBadge(wbsRollupStatus(taskArr))
    + '<span class="wbs-count">' + done + '/' + total + '</span>'
    + '</div>'
    + '<div class="wbs-children" id="' + nodeId + '" style="display:' + (open ? 'block' : 'none') + ';">'
    + inner + '</div></div>';
}

// 4단계: TASK / 5단계: TO-DO (steps)
function renderWbsTask(task) {
  var nodeId   = 'wbs-t-' + task.id;
  var hasSteps = Array.isArray(task.steps) && task.steps.length > 0;
  if (_wbsOpen[nodeId] === undefined) _wbsOpen[nodeId] = false;
  var open = _wbsOpen[nodeId];
  var stepsHtml = '';
  if (hasSteps) {
    stepsHtml = '<div class="wbs-children wbs-steps" id="' + nodeId + '" style="display:' + (open ? 'block' : 'none') + ';">'
      + task.steps.map(function(step) {
          var cbKey = task.id + ':' + step.id;
          return '<div class="wbs-row wbs-step-row" draggable="true" data-wbs-drag-step="' + cbKey + '">'
            + '<span class="wbs-step-cb" data-wbs-step-cb="' + cbKey + '">' + (step.done ? '☑' : '☐') + '</span>'
            + '<span class="wbs-step-text' + (step.done ? ' done' : '') + '" data-wbs-step-edit="' + cbKey + '" title="클릭해서 편집">' + wbsEsc(step.text) + '</span>'
            + wbsEmptyCol('start') + wbsEmptyCol('due')
            + wbsStatusBadge(step.done ? '완료' : '대기')
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
