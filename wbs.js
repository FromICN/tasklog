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
  renderWbsTitleYear();
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '<div class="wbs-wrap" id="wbs-root">' + buildWbsTree() + '</div>';
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
  slot.innerHTML = '<select class="year-select" onchange="handleWbsYearSelect(this.value)">' + opts + '</select>';
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
function wbsEmptyCol() { return '<span class="wbs-col"></span>'; }

function wbsStartCol(task) {
  if (!task.startDate) return wbsEmptyCol();
  var txt = (typeof formatDueDate === 'function') ? formatDueDate(task.startDate, false) : String(task.startDate).slice(5, 10);
  return '<span class="wbs-col set">' + wbsEsc(txt) + '</span>';
}

function wbsDueCol(task) {
  if (!task.dueDateTime) return wbsEmptyCol();
  var txt = (typeof formatDueDate === 'function') ? formatDueDate(task.dueDateTime, !!task.hasTime) : String(task.dueDateTime).slice(5, 10);
  var st  = (typeof getDueStatus === 'function') ? getDueStatus(task.dueDateTime) : '';
  return '<span class="wbs-col set ' + (st || '') + '">' + wbsEsc(txt) + '</span>';
}

// 컬럼 머리글 행
function wbsHeaderRow() {
  return '<div class="wbs-row wbs-header-row">'
    + '<span class="wbs-tog-empty"></span>'
    + '<span class="wbs-sec-label wbs-head-label">항목</span>'
    + '<span class="wbs-colhead">START</span>'
    + '<span class="wbs-colhead">DUE</span>'
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
  return '<span class="wbs-badge" style="color:' + c + ';border:1px solid ' + c + '66;background:' + c + '22;">' + label + '</span>';
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

// ── 트리 빌드 (5단계: Section → Project → TASK → TO-DO) ──

function buildWbsTree() {
  if (typeof tasks === 'undefined' || !tasks.length)
    return '<div class="wbs-empty">✨ 등록된 할 일이 없어요<br><small>TASK 추가 시 Section을 설정하면 여기서 트리로 볼 수 있어요.</small></div>';

  var filtered = tasks.filter(wbsTaskPassesFilter);
  if (!filtered.length)
    return '<div class="wbs-empty">✨ 조건에 맞는 할 일이 없어요</div>';

  var lwSecs = (typeof getLwSections === 'function') ? getLwSections() : null;

  // groups[lk][sgKey][actionKey] = [task, ...]
  // 섹션(lk)·목표(sk)는 mdtAction 만 지정된 작업도 sgId 로 역산해 올바른 가지에 연결
  var groups = {};
  filtered.forEach(function(task) {
    var secIdx = wbsTaskSection(task);
    var sgId   = wbsTaskSgId(task);
    var lk  = (secIdx != null) ? String(secIdx) : '_';
    var sk  = (sgId != null)   ? String(sgId)   : '_';
    var ak  = (task.mdtAction && task.mdtAction.actionId) ? String(task.mdtAction.actionId) : '_';
    if (!groups[lk])      groups[lk]      = {};
    if (!groups[lk][sk])  groups[lk][sk]  = {};
    if (!groups[lk][sk][ak]) groups[lk][sk][ak] = [];
    groups[lk][sk][ak].push(task);
  });

  var html = wbsHeaderRow();
  Object.keys(groups).filter(function(k){ return k !== '_'; })
    .sort(function(a,b){ return +a - +b; })
    .forEach(function(lk) {
      html += renderWbsSection('lw-' + lk, wbsSectionLabel(lk, lwSecs), groups[lk], lk);
    });
  if (groups['_']) html += renderWbsSection('lw-none', '📂 미분류', groups['_'], '_');
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
  var inner = taskArr.map(renderWbsTask).join('');
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
            + wbsEmptyCol() + wbsEmptyCol()
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
