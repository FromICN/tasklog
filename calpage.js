// =============================================================
//  📅 Calendar 페이지 (사이드바 메뉴)
//   · 주간 탭(기본): 시간대별 그리드 + To Do 표시/드래그(시간·일자 변경)
//   · 월간 탭: HOME 캘린더와 연동(동일 상태 재사용)
// =============================================================

var calPageTab = 'weekly';   // 'weekly' | 'month'  — 주간이 기본 표시 탭
var _calDrag = null;         // { type:'task'|'step', taskId, stepId }

// 이번 주 일요일 0시
var calWeekStart = (function () {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
})();

function _calPad(n) { return String(n).padStart(2, '0'); }
function _calDateKey(d) { return d.getFullYear() + '-' + _calPad(d.getMonth() + 1) + '-' + _calPad(d.getDate()); }

// ── 메인 렌더 ──
function renderCalendarView() {
  var content = document.getElementById('page-content');
  if (!content) return;

  var tabs = '<div class="cal-tabs">'
    + '<button class="cal-tab' + (calPageTab === 'weekly' ? ' active' : '') + '" onclick="calSetTab(\'weekly\')">주간</button>'
    + '<button class="cal-tab' + (calPageTab === 'month' ? ' active' : '') + '" onclick="calSetTab(\'month\')">월간</button>'
    + '</div>';

  var body;
  if (calPageTab === 'month') {
    body = '<div class="cal-page-month"><div id="cal-body"></div></div>';
  } else {
    body = buildCalWeekGrid();
  }

  content.innerHTML = '<div class="cal-page">' + tabs + body + '</div>';

  if (calPageTab === 'month') {
    if (typeof renderHomeCalendar === 'function') renderHomeCalendar();   // HOME 캘린더와 동일 엔진/상태
  } else {
    // 주간: 오전 7시가 보이도록 스크롤
    var sc = document.getElementById('calw-scroll');
    if (sc) sc.scrollTop = 7 * (typeof CALW_ROW_H !== 'undefined' ? CALW_ROW_H : 44);
  }
}

function calSetTab(tab) { calPageTab = tab; renderCalendarView(); }

// ── 주간 네비 ──
function calWeekPrev()  { calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendarView(); }
function calWeekNext()  { calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendarView(); }
function calWeekToday() {
  var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
  calWeekStart = d; renderCalendarView();
}

var CALW_ROW_H = 44;  // 시간 행 높이(px)

// ── 이번 주 이벤트 수집 (Task due + To Do(step) due) ──
function calCollectWeekEvents() {
  var start = new Date(calWeekStart); start.setHours(0, 0, 0, 0);
  var end = new Date(start); end.setDate(end.getDate() + 7);
  var evs = [];
  if (typeof tasks === 'undefined') return evs;
  var eiColors = (typeof EI_COLORS !== 'undefined') ? EI_COLORS : {};
  tasks.forEach(function (t) {
    var col = eiColors[t.eisenhower] || 'var(--brand-primary)';
    if (t.dueDateTime) {
      var d = new Date(t.dueDateTime);
      if (d >= start && d < end) evs.push({ type: 'task', taskId: t.id, dt: d, hasTime: !!t.hasTime, text: t.text, color: col, done: !!t.completed });
    }
    if (Array.isArray(t.steps)) {
      t.steps.forEach(function (s) {
        if (s.dueDateTime) {
          var sd = new Date(s.dueDateTime);
          if (sd >= start && sd < end) evs.push({ type: 'step', taskId: t.id, stepId: s.id, dt: sd, hasTime: !!s.hasTime, text: s.text, color: col, done: !!s.completed });
        }
      });
    }
  });
  return evs;
}

function _calEventChip(ev) {
  var timeLbl = ev.hasTime ? (_calPad(ev.dt.getHours()) + ':' + _calPad(ev.dt.getMinutes()) + ' ') : '';
  var icon = ev.type === 'task' ? '📌' : '✓';
  var stepAttr = (ev.type === 'step') ? (',' + ev.stepId) : ',null';
  var safe = (typeof escapeHtml === 'function') ? escapeHtml(ev.text || '') : (ev.text || '');
  return '<div class="calw-ev' + (ev.done ? ' done' : '') + '" draggable="true"'
    + ' style="border-left:3px solid ' + ev.color + ';"'
    + ' title="' + safe + '"'
    + ' ondragstart="calDragStart(event,\'' + ev.type + '\',' + ev.taskId + stepAttr + ')"'
    + ' onclick="event.stopPropagation();calOpenEvent(' + ev.taskId + ')">'
    + '<span class="calw-ev-t">' + timeLbl + '</span><span class="calw-ev-x">' + icon + ' ' + safe + '</span>'
    + '</div>';
}

// ── 주간 그리드 ──
function buildCalWeekGrid() {
  var DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var MON = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var start = new Date(calWeekStart);
  var end = new Date(start); end.setDate(end.getDate() + 6);
  var todayKey = _calDateKey(new Date());

  var evs = calCollectWeekEvents();
  // 버킷: byCell[dayIdx][hour] = [], allday[dayIdx] = []
  var byCell = [], allday = [];
  for (var i = 0; i < 7; i++) { byCell.push({}); allday.push([]); }
  evs.forEach(function (ev) {
    var di = Math.floor((ev.dt - start) / 86400000);
    if (di < 0 || di > 6) return;
    if (ev.hasTime) {
      var h = ev.dt.getHours();
      (byCell[di][h] = byCell[di][h] || []).push(ev);
    } else {
      allday[di].push(ev);
    }
  });

  var label;
  if (start.getMonth() === end.getMonth()) label = start.getFullYear() + '년 ' + MON[start.getMonth()] + ' ' + start.getDate() + '–' + end.getDate() + '일';
  else label = (start.getMonth()+1) + '/' + start.getDate() + ' – ' + (end.getMonth()+1) + '/' + end.getDate();

  var nav = '<div class="calw-nav">'
    + '<button class="cal-arrow" onclick="calWeekPrev()">‹</button>'
    + '<span class="calw-label">' + label + '</span>'
    + '<button class="cal-arrow" onclick="calWeekNext()">›</button>'
    + '<button class="gm-today-btn" onclick="calWeekToday()">오늘</button>'
    + '</div>';

  // 헤더 행
  var head = '<div class="calw-row calw-headrow"><div class="calw-tgutter"></div>';
  for (var d = 0; d < 7; d++) {
    var dt = new Date(start); dt.setDate(start.getDate() + d);
    var isToday = _calDateKey(dt) === todayKey;
    head += '<div class="calw-dayhead' + (isToday ? ' today' : '') + (d===0?' sun':d===6?' sat':'') + '">'
      + '<span class="calw-dow">' + DAY_KO[d] + '</span> <span class="calw-dnum">' + dt.getDate() + '</span></div>';
  }
  head += '</div>';

  // 종일 행
  var allRow = '<div class="calw-row calw-alldayrow"><div class="calw-tgutter calw-tlabel">종일</div>';
  for (var d2 = 0; d2 < 7; d2++) {
    var chips = allday[d2].map(_calEventChip).join('');
    allRow += '<div class="calw-allday-cell" data-day="' + d2 + '"'
      + ' ondragover="calDragOver(event)" ondragleave="calDragLeave(event)" ondrop="calDrop(event,' + d2 + ',-1)">'
      + chips + '</div>';
  }
  allRow += '</div>';

  // 시간 행 (0~23)
  var rows = '';
  for (var h = 0; h < 24; h++) {
    rows += '<div class="calw-row calw-hourrow" style="height:' + CALW_ROW_H + 'px;">'
      + '<div class="calw-tgutter calw-tlabel">' + _calPad(h) + ':00</div>';
    for (var dd = 0; dd < 7; dd++) {
      var cellEvs = (byCell[dd][h] || []).map(_calEventChip).join('');
      rows += '<div class="calw-cell" data-day="' + dd + '" data-hour="' + h + '"'
        + ' ondragover="calDragOver(event)" ondragleave="calDragLeave(event)" ondrop="calDrop(event,' + dd + ',' + h + ')">'
        + cellEvs + '</div>';
    }
    rows += '</div>';
  }

  return nav
    + '<div class="calw">'
    + head
    + allRow
    + '<div class="calw-scroll" id="calw-scroll">' + rows + '</div>'
    + '</div>';
}

// ── 드래그 앤 드롭 ──
function calDragStart(e, type, taskId, stepId) {
  _calDrag = { type: type, taskId: taskId, stepId: (stepId === null || stepId === undefined) ? null : stepId };
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'calev'); } catch (err) {} }
}
function calDragOver(e) {
  if (!_calDrag) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  var cell = e.target.closest('.calw-cell, .calw-allday-cell');
  if (cell) cell.classList.add('calw-drop-hover');
}
function calDragLeave(e) {
  var cell = e.target.closest('.calw-cell, .calw-allday-cell');
  if (cell) cell.classList.remove('calw-drop-hover');
}

function _calFindItem(drag) {
  if (typeof tasks === 'undefined') return null;
  var t = tasks.find(function (x) { return x.id === drag.taskId; });
  if (!t) return null;
  if (drag.type === 'task') return { obj: t, task: t };
  var s = (t.steps || []).find(function (x) { return x.id === drag.stepId; });
  return s ? { obj: s, task: t } : null;
}

function calDrop(e, dayIdx, hour) {
  e.preventDefault();
  var cell = e.target.closest('.calw-cell, .calw-allday-cell');
  if (cell) cell.classList.remove('calw-drop-hover');
  if (!_calDrag) return;
  var found = _calFindItem(_calDrag);
  _calDrag = null;
  if (!found) return;
  var obj = found.obj;

  var base = new Date(calWeekStart);
  base.setDate(base.getDate() + dayIdx);

  if (hour === -1) {
    // 종일: 날짜만 지정(시간 없음)
    obj.dueDateTime = _calDateKey(base) + 'T09:00:00';
    obj.hasTime = false;
  } else {
    // 드롭 위치(상/하)로 00/30분 스냅
    var min = 0;
    try {
      var host = e.target.closest('.calw-cell');
      if (host) { var r = host.getBoundingClientRect(); min = (e.clientY - r.top) > (r.height / 2) ? 30 : 0; }
    } catch (err) {}
    obj.dueDateTime = _calDateKey(base) + 'T' + _calPad(hour) + ':' + _calPad(min) + ':00';
    obj.hasTime = true;
  }

  if (typeof saveTasks === 'function') saveTasks();
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
  renderCalendarView();
}

// 이벤트 클릭 → Task 상세 열기
function calOpenEvent(taskId) {
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
  else if (typeof openTaskPanel === 'function') openTaskPanel(taskId);
}
