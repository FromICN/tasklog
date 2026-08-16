// ============================================
//  📊 Gantt 차트 뷰
//  gm-* 클래스 기반 렌더링 엔진.
//  - 진행률 원 / 일자 바 / 하위 to-do 서브로우 / 오늘 세로선
//  - 연도 선택은 타이틀 영역(전역 연도, appSetYear)으로 이동
//
//  아래 gm* 상수·헬퍼는 예전에 home.js 의 Gantt 미니 위젯이 갖고 있었다.
//  홈이 Web 위젯으로 바뀌면서 쓰는 곳이 여기뿐이라 이리로 옮겼다.
// ============================================

var GM_LEFT = 136;
var GM_LEFT_MAX = 400;
var GM_MAX_ROWS = 14;
var GM_MAX_SUBROWS = 4;

// 좌측 라벨 영역 폭: 사용자가 드래그로 조정한 값(저장) 우선, 없으면 이름 길이 기반 자동
function gmLeftWidth(taskList) {
  var saved = parseInt(localStorage.getItem('homeGanttLeftW') || '', 10);
  if (saved && saved >= 80) return Math.min(GM_LEFT_MAX, saved);
  var maxLen = 0;
  (taskList || []).forEach(function(t) {
    var l = (t.text || '').replace(/^\[\d{6}\] /, '').length;
    if (l > maxLen) maxLen = l;
  });
  var w = GM_LEFT + Math.max(0, maxLen - 13) * 8;
  return Math.round(Math.min(204, Math.max(GM_LEFT, w)));
}

// 하위 to-do(task.steps)를 GANTT 미니 그리드에 서브로우로 표시
function buildGanttSubRows(task, mS, mE, daysInMonth, color, bgCellsHtml) {
  var steps = task.steps || [];
  if (!steps.length) return '';
  if (typeof ganttIsOpen === 'function' ? !ganttIsOpen(task.id)
      : (typeof _ganttOpen !== 'undefined' && _ganttOpen[task.id] === false)) return '';   // 기본 펼침
  var shown = steps.slice(0, GM_MAX_SUBROWS);
  var html = shown.map(function(step) {
    var sd = step.dueDateTime ? new Date(step.dueDateTime) : null;
    var hasDot = !!(sd && sd >= mS && sd <= mE);
    var leftPct = hasDot ? ((sd.getDate()-1+0.5) / daysInMonth * 100) : 0;
    var label = step.text || '';
    var shortLabel = label.length > 16 ? label.substring(0,16) + '…' : label;
    return '<div class="gm-row gm-subrow" onclick="if(typeof openDetailPanel===\'function\')openDetailPanel('+task.id+')">'
      + '<div class="gm-left gm-sub-left">'
      + '<span class="gm-sub-check'+(step.completed?' done':'')+'">'+(step.completed?'✓':'')+'</span>'
      + '<div class="gm-info"><div class="gm-name gm-sub-name'+(step.completed?' done':'')+'" title="'+hwEsc(label)+'">'+hwEsc(shortLabel)+'</div></div>'
      + '</div>'
      + '<div class="gm-grid">'
      + bgCellsHtml
      + (hasDot
          ? (step.completed
              ? '<div class="gm-sub-dot done" style="left:'+leftPct.toFixed(3)+'%;color:'+color+';" title="'+hwEsc(label)+'">✓</div>'
              : '<div class="gm-sub-dot" style="left:'+leftPct.toFixed(3)+'%;background:'+color+';"></div>')
          : '')
      + '</div>'
      + '</div>';
  }).join('');
  if (steps.length > GM_MAX_SUBROWS) {
    html += '<div class="gm-row gm-subrow gm-subrow-more">'
      + '<div class="gm-left gm-sub-left"><span class="gm-sub-more">+'+(steps.length-GM_MAX_SUBROWS)+'개 항목 더</span></div>'
      + '<div class="gm-grid">'+bgCellsHtml+'</div>'
      + '</div>';
  }
  return html;
}

var ganttMonth = new Date().getMonth();

var GANTT_COLORS = [
  '#3b82f6','#ef4444','#f59e0b','#10b981',
  '#06b6d4','#f97316','#8b5cf6','#14b8a6','#6b7280'
];

// 섹션(라이프휠/만다라트) 기본 테마 컬러 — 만다라트 subGoal 팔레트와 동일
var SECTION_THEME_COLORS = [
  '#e74c3c','#3498db','#f39c12','#2ecc71',
  '#16a085','#e67e22','#8e44ad','#1abc9c'
];

// 섹션 인덱스 → 그 섹션의 "테마 컬러"
//  우선순위 (사용자가 보는 만다라트 섹션 색을 그대로 따라감)
//  1) 만다라트 subGoal(해당 섹션)의 color  ← 만다라트 섹션 테마 컬러
//  2) 라이프휠 섹션에 지정한 color
//  3) 기본 팔레트 색 (만다라트 기본값과 동일)
function getSectionThemeColor(idx, year) {
  if (idx === null || idx === undefined || idx < 0) return '#3b82f6';
  // 1) 만다라트 subGoal 색
  try {
    if (typeof getMdt === 'function') {
      var y = parseInt(year, 10);
      if (isNaN(y) && typeof appGetYear === 'function') y = appGetYear();
      var mdt = getMdt(y);
      if (mdt && mdt.subGoals) {
        // 섹션은 배열 위치가 아니라 id 로 찾는다(재정렬돼도 색 일치). subGoal.id = idx+1
        var _sg = mdt.subGoals.find(function(s){ return s.id === (idx + 1); });
        if (_sg && _sg.color) return _sg.color;
      }
    }
  } catch (e) {}
  // 2) 라이프휠 섹션 색
  try {
    if (typeof getLwSections === 'function') {
      var secs = getLwSections();
      if (secs && secs[idx] && secs[idx].color) return secs[idx].color;
    }
  } catch (e) {}
  // 3) 기본 팔레트
  return SECTION_THEME_COLORS[idx % SECTION_THEME_COLORS.length];
}

// task가 속한 (만다라트) 연도 추출 — 없으면 전역 연도
function ganttTaskYear(task) {
  if (task) {
    if (task.mdtAction && task.mdtAction.year) return parseInt(task.mdtAction.year, 10);
    if (task.mdtGoal   && task.mdtGoal.year)   return parseInt(task.mdtGoal.year, 10);
  }
  return (typeof appGetYear === 'function') ? appGetYear() : new Date().getFullYear();
}

// task가 속한 섹션 인덱스(0~7) 결정
//  1) lwSection 이 직접 지정돼 있으면 그 값
//  2) 프로젝트(만다라트)만 연결된 경우 sgId 로 역산 (subGoals[i].id = i+1)
function ganttSectionIdx(task) {
  if (!task) return null;
  if (task.lwSection !== null && task.lwSection !== undefined) return task.lwSection;
  var sgId = (task.mdtAction && task.mdtAction.sgId) ||
             (task.mdtGoal   && task.mdtGoal.sgId)   || null;
  if (sgId) return parseInt(sgId, 10) - 1;
  return null;
}

// Gantt task(=상위 프로젝트) 컬러 = 그 프로젝트가 속한 섹션의 테마 컬러
function getGanttColor(task) {
  var idx = ganttSectionIdx(task);
  if (idx !== null && idx !== undefined && idx >= 0)
    return getSectionThemeColor(idx, ganttTaskYear(task));
  return '#3b82f6';
}

// 현재 연도(전역 연도 동기화)
function ganttYearVal() {
  return (typeof appGetYear === 'function') ? appGetYear() : new Date().getFullYear();
}

// ── 월 이동 (연 경계는 전역 연도로 전환) ──
function ganttPrev() {
  ganttMonth--;
  if (ganttMonth < 0) {
    ganttMonth = 11;
    if (typeof appSetYear === 'function') { appSetYear(ganttYearVal() - 1); return; }
  }
  renderGanttView();
}
function ganttNext() {
  ganttMonth++;
  if (ganttMonth > 11) {
    ganttMonth = 0;
    if (typeof appSetYear === 'function') { appSetYear(ganttYearVal() + 1); return; }
  }
  renderGanttView();
}
function ganttToday() {
  ganttMonth = new Date().getMonth();
  var ty = new Date().getFullYear();
  if (typeof appSetYear === 'function' && ganttYearVal() !== ty) { appSetYear(ty); return; }
  renderGanttView();
}

function getTaskProgress(task) {
  var steps = task.steps || [];
  if (steps.length === 0) return task.completed ? 100 : 0;
  return Math.round(steps.filter(function(s){ return s.completed; }).length / steps.length * 100);
}

// ── Gantt: Task별 to-do 펼침 상태 (기본 펼침) ──
var _ganttOpen = {};
// 기본값은 '펼침'. 명시적으로 false 로 저장된 경우에만 접힘.
function ganttIsOpen(id) { return _ganttOpen[id] !== false; }
function ganttToggleTask(id, ev) {
  if (ev) ev.stopPropagation();
  _ganttOpen[id] = ganttIsOpen(id) ? false : true;
  if (document.getElementById('gantt-body') && typeof renderHomeGanttMini === 'function') renderHomeGanttMini();
  if (document.querySelector('.gantt-page') && typeof renderGanttView === 'function') renderGanttView();
}

// 접힌 Task 행에 겹쳐 그릴 to-do 마커: 마감일=점, 완료=체크. 커서 올리면 이름(title).
function ganttStepMarkers(task, mS, mE, daysInMonth, color) {
  var steps = task.steps || [];
  return steps.map(function(step) {
    var sd = step.dueDateTime ? new Date(step.dueDateTime) : null;
    if (!(sd && sd >= mS && sd <= mE)) return '';
    var leftPct = (sd.getDate() - 1 + 0.5) / daysInMonth * 100;
    var nm = (typeof hwEsc === 'function') ? hwEsc(step.text || '') : (step.text || '');
    if (step.completed) {
      return '<div class="gm-step-mark done" style="left:' + leftPct.toFixed(3) + '%;" title="' + nm + '">\u2713</div>';
    }
    return '<div class="gm-step-mark" style="left:' + leftPct.toFixed(3) + '%;background:' + color + ';" title="' + nm + '"></div>';
  }).join('');
}

// 진행률 원 (테마 대응: 트랙/텍스트 색은 CSS 변수)
function progressCircleSvg(pct, color) {
  var r = 13, circ = 2 * Math.PI * r, dash = circ * pct / 100;
  return '<svg width="15" height="15" viewBox="0 0 30 30" style="flex-shrink:0;">'
    + '<circle cx="15" cy="15" r="' + r + '" fill="none" style="stroke:var(--border)" stroke-width="3"/>'
    + '<circle cx="15" cy="15" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="3"'
    + ' stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"'
    + ' stroke-linecap="round" transform="rotate(-90 15 15)"/>'
    + '<text x="15" y="19" text-anchor="middle" font-size="8" style="fill:var(--text-2)">'
    + (pct === 100 ? '✓' : pct) + '</text>'
    + '</svg>';
}

// (연도 드롭박스는 제거했다 — 연도 이동은 월 화살표가 겸한다.
//  그 자리에는 아래의 검색·섹션 필터가 들어간다.)

// ============================================
//  🔍 Gantt 검색 · 섹션 필터 (Web · WBS 와 같은 방식)
// --------------------------------------------
//  연도 드롭박스는 없앴다. 간트는 어차피 '월'을 좌우 화살표로 넘겨 보는 화면이라
//  연도 선택이 따로 있으면 이동 수단이 둘로 갈렸다. 연도는 월을 넘기면 따라간다.
// ============================================
var _ganttSearch = '';
var _ganttSearchOpen = false;
var _ganttSecFilter = {};   // { sectionKey: true(숨김) }

function ganttMatchesSearch(text) {
  if (!_ganttSearch) return true;
  return String(text || '').toLowerCase().indexOf(_ganttSearch.toLowerCase()) !== -1;
}
function ganttTaskSectionKey(task) {
  if (typeof wbsTaskSectionKey === 'function') return wbsTaskSectionKey(task);
  var sg = (task.mdtGoal && task.mdtGoal.sgId) || (task.mdtAction && task.mdtAction.sgId) || null;
  return (sg != null) ? String(sg) : '_';
}
function ganttSectionLabel(task) {
  var sg = (task.mdtGoal && task.mdtGoal.sgId) || (task.mdtAction && task.mdtAction.sgId) || null;
  var yr = (task.mdtGoal && task.mdtGoal.year) || (task.mdtAction && task.mdtAction.year) || null;
  if (sg != null && typeof wbsGoalText === 'function') return wbsGoalText(sg, task.lwSectionName || 'Section', yr);
  return task.lwSectionName || '📂 미분류';
}
function ganttTaskPassesSecFilter(task) { return !_ganttSecFilter[ganttTaskSectionKey(task)]; }

// Task 본체 또는 하위 To Do 중 하나라도 검색어에 걸리면 표시한다
function ganttTaskPassesSearch(task) {
  if (!_ganttSearch) return true;
  if (ganttMatchesSearch(task.text)) return true;
  return (task.steps || []).some(function(s){ return ganttMatchesSearch(s.text); });
}

// 지금 이 달에 걸치는 Task 들이 속한 섹션 목록
function ganttDistinctSections(baseTasks) {
  var present = {};
  (baseTasks || []).forEach(function(t){ present[ganttTaskSectionKey(t)] = ganttSectionLabel(t); });
  var keys = Object.keys(present);
  keys.sort(function(a, b){
    if (a === '_') return 1; if (b === '_') return -1;
    return (+a) - (+b);
  });
  return keys.map(function(k){ return { key: k, label: (k === '_') ? '📂 미분류' : present[k] }; });
}

function ganttSetSearch(val) { _ganttSearch = (val || '').trim(); renderGanttView(); }
function ganttToggleSearch(ev) {
  if (ev) ev.stopPropagation();
  _ganttSearchOpen = !_ganttSearchOpen;
  renderGanttTools();
  if (_ganttSearchOpen) setTimeout(function(){ var i = document.getElementById('gantt-search-inp'); if (i) i.focus(); }, 30);
}
function ganttToggleSecFilterVal(key, ev) {
  if (ev) ev.stopPropagation();
  if (_ganttSecFilter[key]) delete _ganttSecFilter[key];
  else _ganttSecFilter[key] = true;
  renderGanttView();
}
function ganttSecFilterAll(on, ev) {
  if (ev) ev.stopPropagation();
  _ganttSecFilter = {};
  if (!on) ganttDistinctSections(_ganttMonthTasks).forEach(function(s){ _ganttSecFilter[s.key] = true; });
  renderGanttView();
}

// 이번 달에 걸치는 Task (필터 적용 전) — 섹션 목록을 만들 때 쓴다
var _ganttMonthTasks = [];

function ganttSecFilterPanelHtml() {
  var secs = ganttDistinctSections(_ganttMonthTasks);
  if (!secs.length) return '';
  var esc = (typeof escNb === 'function') ? escNb : function(s){ return String(s == null ? '' : s); };
  var items = secs.map(function(s){
    var checked = _ganttSecFilter[s.key] ? '' : ' checked';
    return '<label class="todo-colpick-item"><input type="checkbox"' + checked
      + ' onclick="event.stopPropagation();" onchange="ganttToggleSecFilterVal(\'' + s.key + '\',event)">'
      + '<span>' + esc(s.label) + '</span></label>';
  }).join('');
  return '<div class="wbs-titlefilter">'
    + '<div class="wbs-titlefilter-head"><span>표시 항목(Section)</span>'
    +   '<span class="wbs-tf-actions">'
    +     '<button onclick="ganttSecFilterAll(true,event)">전체</button>'
    +     '<button onclick="ganttSecFilterAll(false,event)">해제</button>'
    +   '</span></div>'
    + '<div class="wbs-titlefilter-list">' + items + '</div>'
    + '</div>';
}

function renderGanttTools() {
  var slot = document.getElementById('topbar-mdt-year-slot');
  if (!slot) return;
  var esc = (typeof escNb === 'function') ? escNb : function(s){ return String(s == null ? '' : s); };
  var _icon = (typeof BD_FILTER_ICON !== 'undefined') ? BD_FILTER_ICON : '🔍';
  var _active = _ganttSearchOpen || _ganttSearch || Object.keys(_ganttSecFilter).length > 0;
  var _sval = esc(_ganttSearch).replace(/"/g, '&quot;');
  slot.innerHTML = '<div class="wbs-title-tools" style="position:relative;">'
    + '<button class="bd-colpick-btn' + (_active ? ' on' : '') + '" id="gantt-search-btn" title="검색 · 필터" onclick="ganttToggleSearch(event)">'
    + _icon + '</button>'
    + (_ganttSearchOpen
        ? '<div class="bd-colpick-panel" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();">'
          + '<div class="bd-colpick-search-wrap"><input type="text" class="bd-colpick-search" id="gantt-search-inp" placeholder="Task · To Do 검색"'
          + ' value="' + _sval + '" oninput="ganttSetSearch(this.value)" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();"></div>'
          + ganttSecFilterPanelHtml()
          + '</div>'
        : '')
    + '</div>';
}

document.addEventListener('click', function(e) {
  if (!_ganttSearchOpen) return;
  var btn = document.getElementById('gantt-search-btn');
  var pnl = document.querySelector('#topbar-mdt-year-slot .bd-colpick-panel');
  if ((btn && btn.contains(e.target)) || (pnl && pnl.contains(e.target))) return;
  _ganttSearchOpen = false;
  renderGanttTools();
});

// ── 본문 렌더 (홈 Gantt 미니와 동일 엔진, 전체보기) ──
function renderGanttView() {
  var content = document.getElementById('page-content');
  if (!content) return;

  if (typeof tasks === 'undefined' || typeof getTaskProgress !== 'function') {
    content.innerHTML = '<div class="gantt-page">' + emptyWidget('📊', '진행 중인 Task가 없습니다') + '</div>';
    return;
  }

  var MN = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var year = ganttYearVal(), month = ganttMonth;
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var mS = new Date(year, month, 1);
  var mE = new Date(year, month + 1, 0, 23, 59, 59);
  var today = new Date();
  var todayIdx = (today.getFullYear() === year && today.getMonth() === month) ? today.getDate() - 1 : null;

  // 이번 달에 걸치는 진행 중 TASK (홈과 동일: 완료 항목 제외)
  var monthTasks = tasks.filter(function(t) {
    if (t.completed) return false;
    var s = t.startDate   ? new Date(t.startDate)   : null;
    var e = t.dueDateTime ? new Date(t.dueDateTime) : null;
    if (s && e) return s <= mE && e >= mS;
    if (s)      return s >= mS && s <= mE;
    if (e)      return e >= mS && e <= mE;
    return false;
  });
  // 섹션 필터 목록은 '이번 달에 있는 것' 기준으로 만든다 (필터로 가려진 것도 계속 보이게)
  _ganttMonthTasks = monthTasks;
  renderGanttTools();

  var vis = monthTasks.filter(function(t) {
    return ganttTaskPassesSecFilter(t) && ganttTaskPassesSearch(t);
  });

  var navHtml = '<div class="gm-nav">'
    + '<button class="gm-arrow" onclick="ganttPrev()">‹</button>'
    + '<span class="gm-month-label">' + MN[month] + '</span>'
    + '<button class="gm-arrow" onclick="ganttNext()">›</button>'
    + (todayIdx === null ? '<button class="gm-today-btn" onclick="ganttToday()">오늘</button>' : '')
    + '</div>';

  if (!vis.length) {
    content.innerHTML = '<div class="gantt-page">' + navHtml
      + emptyWidget('📊', '이번 달 진행 중인 Task가 없습니다') + '</div>';
    return;
  }

  var leftW = (typeof gmLeftWidth === 'function') ? gmLeftWidth(vis) : GM_LEFT;

  // 배경 셀(요일/오늘 음영)
  var bgCellsHtml = '';
  for (var d2 = 0; d2 < daysInMonth; d2++) {
    var dow2 = new Date(year, month, d2 + 1).getDay();
    var isT2 = (d2 === todayIdx);
    var cls2 = 'gm-bgcell' + (isT2 ? ' gm-today-col' : '') + ((dow2 === 0 || dow2 === 6) ? ' gm-weekend-col' : '');
    bgCellsHtml += '<div class="' + cls2 + '"></div>';
  }

  // 헤더 일자
  var hdrCells = '';
  for (var d = 1; d <= daysInMonth; d++) {
    var dow = new Date(year, month, d).getDay();
    var isToday = (d - 1 === todayIdx);
    var cls = 'gm-hcell' + (isToday ? ' gm-today' : '') + (dow === 0 ? ' gm-sun' : dow === 6 ? ' gm-sat' : '');
    hdrCells += '<div class="' + cls + '">' + d + '</div>';
  }

  // 행 (전체 표시 — 행 제한 없음)
  var rows = vis.map(function(task) {
    var pct = getTaskProgress(task);
    var color = getGanttColor(task);
    var label = task.text.replace(/^\[\d{6}\] /, '');
    var shortLabel = label;

    var sDate = task.startDate   ? new Date(task.startDate)   : null;
    var eDate = task.dueDateTime ? new Date(task.dueDateTime) : null;
    var barLeftPct = 0, barWPct = 0, hasBar = false;
    if (sDate || eDate) {
      hasBar = true;
      var cs = sDate ? (sDate < mS ? mS : sDate) : (eDate < mS ? mS : eDate);
      var ce = eDate ? (eDate > mE ? mE : eDate) : cs;
      barLeftPct = (cs.getDate() - 1) / daysInMonth * 100;
      barWPct    = Math.max(1 / daysInMonth * 100, (ce.getDate() - cs.getDate() + 1) / daysInMonth * 100);
    }

    var dateLbl = '';
    if (sDate && eDate) dateLbl = (sDate.getMonth()+1)+'/'+sDate.getDate()+' ~ '+(eDate.getMonth()+1)+'/'+eDate.getDate();
    else if (sDate)     dateLbl = (sDate.getMonth()+1)+'/'+sDate.getDate()+' 시작';
    else if (eDate)     dateLbl = (eDate.getMonth()+1)+'/'+eDate.getDate()+' 마감';
    // Project 이모지: 만다라트 연도별 section → 라이프휠 순으로 해석 (todo.js 공용 해석기)
    var _secEmoji = (typeof todoSectionEmoji === 'function') ? todoSectionEmoji(task) : (task.lwSectionEmoji || '');
    if (_secEmoji) dateLbl = _secEmoji + ' ' + dateLbl;

    var _open = ganttIsOpen(task.id);
    var _hasSteps = (task.steps || []).length > 0;
    var mainRow = '<div class="gm-row" onclick="if(typeof openDetailPanel===\'function\')openDetailPanel(' + task.id + ')">'
      + '<div class="gm-left">'
      + (_hasSteps ? '<span class="gm-toggle" onclick="ganttToggleTask(' + task.id + ',event)">' + (_open ? '\u25be' : '\u25b8') + '</span>' : '<span class="gm-toggle-empty"></span>')
      + progressCircleSvg(pct, color)
      + '<div class="gm-info">'
      + '<div class="gm-name" title="' + hwEsc(label) + '">' + hwEsc(shortLabel) + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="gm-grid">'
      + bgCellsHtml
      + (hasBar
          ? '<div class="gm-bar" style="left:' + barLeftPct.toFixed(3) + '%;width:' + barWPct.toFixed(3) + '%;border-color:' + color + ';background:' + color + '25;">'
            + '<div class="gm-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>'
          : '')
      + ((!_open && _hasSteps) ? ganttStepMarkers(task, mS, mE, daysInMonth, color) : '')
      + '</div>'
      + '</div>';

    // 하위 to-do 서브로우 (홈과 동일 함수 재사용)
    var subRows = (typeof buildGanttSubRows === 'function')
      ? buildGanttSubRows(task, mS, mE, daysInMonth, color, bgCellsHtml)
      : '';
    return mainRow + subRows;
  }).join('');

  var todayLine = todayIdx !== null
    ? '<div class="gm-today-line" style="left:calc(' + leftW + 'px + (100% - ' + leftW + 'px) * ' + (((todayIdx + 0.5) / daysInMonth).toFixed(4)) + ');"></div>'
    : '';

  content.innerHTML = '<div class="gantt-page">'
    + navHtml
    + '<div class="gm-wrap" style="--gm-left:' + leftW + 'px;">'
    + '<div class="gm-header"><div class="gm-left-spacer"></div>'
    + '<div class="gm-hcells">' + hdrCells + '</div></div>'
    + '<div class="gm-body">' + todayLine + rows + '</div>'
    + '</div>'
    + '</div>';
}
