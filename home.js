// ============================================
//  🏠 홈 페이지 — 7위젯 대시보드
// ============================================

var homeCalYear  = new Date().getFullYear();
var homeCalMonth = new Date().getMonth();
var homeCalView  = 'monthly'; // 'monthly' | 'weekly'
var homeCalWeekStart = (function() {
  var d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay()); // 이번 주 일요일
  return d;
})();

// 지침 기준 Section/색상
var HOME_SECTIONS = ['건강','커리어','재정','관계','성장','여가','환경','내면'];
var HOME_SEC_COLORS = ['#22C08B','#4F6EF7','#F5A623','#E05C7A','#A78BFA','#34D399','#38BDF8','#FB923C'];

// 아이젠하워 색상 (SCHEDULE=그린 계열, SOMEDAY(DROP)=기존 SCHEDULE 컬러)
var EI_COLORS = { DO:'var(--danger)', SCHEDULE:'var(--success)', DELEGATE:'var(--warning)', DROP:'var(--brand-primary)' };

// 구글 캘린더 일정 표시 색상
var GCAL_COLOR = '#1A73E8';

// 캘린더 위젯에서 현재 선택된 날짜 (기본: 오늘)
var homeCalSelectedKey = fmtKey(new Date());

// 카드 껍데기 — 배치(place)가 오면 격자 위치를 인라인으로 박아 준다
function buildCardShell(id, title, navTarget, bodyId, place) {
  var header = '';
  if (title) {
    var titleHtml = navTarget
      ? '<span class="card-title card-title-link" onclick="navToMenu(\x27' + navTarget + '\x27)">' + title + '</span>'
      : '<span class="card-title">' + title + '</span>';
    header = '<div class="card-header">' + titleHtml + '</div>';
  }
  var st = place
    ? ' style="grid-column:' + place.c + ' / span ' + place.w + ';grid-row:' + place.r + ' / span ' + place.h + ';"'
    : '';
  return '<div class="card" id="' + id + '"' + st + '>'
    + header
    + '<div id="' + bodyId + '"></div>'
    + '</div>';
}

// ── 1. 알림 위젯 ──────────────────────────
// 마감 알림 시점(D-3/2/1) · 토글 상태
function notifThreshold() {
  var v = parseInt(localStorage.getItem('app-notif-deadline-days'), 10);
  return (v === 1 || v === 2 || v === 3) ? v : 3;
}
function notifDeadlineOn() { return localStorage.getItem('app-notif-deadline') !== '0'; }
function notifJournalOn()  { return localStorage.getItem('app-notif-journal')  !== '0'; }

function renderHomeNotif() {
  var el = document.getElementById('notif-body');
  if (!el) return;
  var items = [];
  var today = new Date(); today.setHours(0,0,0,0);
  var thr = notifThreshold();

  // 이름 정리 + 마감일 M/D 표기
  function _cleanName(name) { return String(name || '').replace(/^\[\d{6}\]\s*/, ''); }
  function _dueMD(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }

  // 마감일 하루 전(D-1)부터 알림: 모든 Task + 모든 To Do(하위 단계)
  if (typeof tasks !== 'undefined' && notifDeadlineOn()) {
    tasks.forEach(function(t) {
      // 1) Task 본체
      if (!t.completed && t.dueDateTime) {
        var dueT = new Date(t.dueDateTime); dueT.setHours(0,0,0,0);
        var diffT = Math.round((dueT - today) / 86400000);
        if (diffT <= thr) {
          items.push({ type:'danger', text: _cleanName(t.text), due: _dueMD(dueT), overdue: diffT < 0, taskId: t.id, _d: diffT });
        }
      }
      // 2) 하위 To Do (steps)
      (t.steps || []).forEach(function(s) {
        if (s.completed || !s.dueDateTime) return;
        var dueS = new Date(s.dueDateTime); dueS.setHours(0,0,0,0);
        var diffS = Math.round((dueS - today) / 86400000);
        if (diffS <= thr) {
          items.push({ type:'danger', text: '☑ ' + _cleanName(s.text), due: _dueMD(dueS), overdue: diffS < 0, taskId: t.id, _d: diffS });
        }
      });
    });
    // 급한 순(지난 것 → 오늘 → 내일) 정렬
    items.sort(function(a, b){ return (a._d||0) - (b._d||0); });
  }
  var dow = today.getDay();
  if (notifJournalOn() && (dow === 0 || dow >= 4)) {
    items.push({ type:'warning', text: '이번 주 업무일지를 작성해보세요', action: "navToMenu('journal')" });
  }
  if (items.length === 0) {
    el.innerHTML = emptyWidget('✓', '현재 알림이 없습니다');
    return;
  }
  el.innerHTML = items.map(function(item) {
    var cls = item.type === 'danger' ? 'notif-danger' : 'notif-warning';
    var onclick = item.taskId
      ? 'onclick="openDetailPanel(' + item.taskId + ')"'
      : (item.action ? 'onclick="' + item.action + '"' : '');
    // 마감일: 오른쪽 정렬 · M/D 표기 · 기한 지남=빨강, 남음=초록
    var dueHtml = item.due
      ? '<span class="notif-due" style="color:' + (item.overdue ? 'var(--danger)' : 'var(--success)') + ';">' + hwEsc(item.due) + '</span>'
      : '';
    return '<div class="notif-card ' + cls + '" ' + onclick + '>'
      + '<span class="notif-text">' + hwEsc(item.text) + '</span>' + dueHtml + '</div>';
  }).join('');
}

// ── 2. 캘린더 위젯 ────────────────────────
//  달력 아래에 있던 '그 날의 일정 목록'은 날짜에 커서를 올리면 뜨는
//  작은 말풍선으로 옮겼다. 그 자리는 아래 Focus On 카드가 이어받는다.
function renderHomeCalendar() {
  var el = document.getElementById('cal-body');
  if (!el) return;
  el.innerHTML = (homeCalView === 'weekly') ? buildWeeklyCalGrid() : buildMonthlyCalGrid();
  calAttachAutoScale();
}

// ── 위젯 크기에 맞춰 달력이 늘고 준다 ──────────────────
//  칸 크기·간격·글자 크기를 고정값으로 두면, 위젯을 넓히면 여백만 커지고
//  좁히면 숫자가 서로 붙는다. 남은 자리를 재서 한 칸의 크기를 먼저 정하고,
//  글자와 간격을 그 칸에 비례해 맞춘다.
var _calRO = null;

function calSyncScale() {
  var body = document.getElementById('cal-body');
  if (!body) return;
  var grid = body.querySelector('.cal-grid');
  if (!grid) return;

  var head = body.querySelector('.cal-header');
  var availW = body.clientWidth;
  var availH = body.clientHeight - (head ? head.offsetHeight : 0);
  if (availW <= 0 || availH <= 0) return;

  // 격자는 요일 한 줄 + 주 N줄. 셀 개수로 몇 주인지 되짚는다.
  var cells = grid.querySelectorAll('.cal-cell').length;
  var weeks = Math.max(1, Math.round(cells / 7));

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 주 행은 남는 높이를 나눠 갖는다(CSS 가 1fr 로 처리). 여기서는 그 한 줄이
  // 몇 px 이 되는지를 먼저 알아야 글자 크기를 거기에 맞출 수 있다.
  // 간격이 높이에 영향을 주고 높이가 다시 간격을 정하므로, 두 번 돌려 수렴시킨다.
  var dowEl = grid.querySelector('.cal-dh');
  var dowH = dowEl ? dowEl.getBoundingClientRect().height : 14;
  var gap = 2, unit = 0, cw = 0, ch = 0;
  for (var pass = 0; pass < 2; pass++) {
    cw = (availW - gap * 6) / 7;
    ch = (availH - dowH - gap * weeks) / weeks;
    unit = Math.max(6, Math.min(cw, ch));
    gap = clamp(unit * 0.05, 1, 5);
  }

  var fsNum = clamp(unit * 0.42, 7, 20);
  var fsDow = clamp(unit * 0.34, 6, 15);
  // 오늘 표시 원이 한 칸보다 크면 삐져나온다 → 칸 크기로도 한 번 더 막는다
  var today = clamp(Math.min(fsNum * 1.55, unit * 0.86), 12, 32);
  var dot   = clamp(unit * 0.09, 2.5, 8);
  var fsHead = clamp(unit * 0.36, 9, 15);

  // 값이 그대로면 손대지 않는다 (ResizeObserver 가 헛돌지 않도록)
  var sig = [gap, fsNum, fsDow, today, dot, fsHead].map(function (n) { return n.toFixed(2); }).join('|');
  if (body.dataset.calSig === sig) return;
  body.dataset.calSig = sig;

  body.style.setProperty('--cal-gap',     gap.toFixed(2) + 'px');
  body.style.setProperty('--cal-fs',      fsNum.toFixed(2) + 'px');
  body.style.setProperty('--cal-fs-dow',  fsDow.toFixed(2) + 'px');
  body.style.setProperty('--cal-today',   today.toFixed(2) + 'px');
  body.style.setProperty('--cal-dot',     dot.toFixed(2) + 'px');
  body.style.setProperty('--cal-fs-head', fsHead.toFixed(2) + 'px');
}

function calAttachAutoScale() {
  var body = document.getElementById('cal-body');
  if (!body) return;
  if (_calRO) { try { _calRO.disconnect(); } catch (e) {} _calRO = null; }
  delete body.dataset.calSig;
  calSyncScale();
  // 창 크기 변경·사이드바 변화 등 어디서 흔들려도 따라오게 한다.
  if (typeof ResizeObserver === 'function') {
    _calRO = new ResizeObserver(function () { calSyncScale(); });
    _calRO.observe(body);
  }
}

// ResizeObserver 는 프레임을 그릴 때 도는데, 창 크기 변경은 그것만 믿기엔
// 늦게 반영되는 환경이 있다(구형 WebView 등) → resize 도 함께 듣는다.
(function watchCalResize() {
  var t = null;
  window.addEventListener('resize', function () {
    if (!document.getElementById('cal-body')) return;
    if (t) clearTimeout(t);
    t = setTimeout(calSyncScale, 100);
  });
})();

// 마감일 dot 맵 (task 본체 + 하위 steps 공용 헬퍼)
// 달력 점 = 구글 캘린더에서 불러온 일정만.
//  Task·To Do 마감은 Web 위젯과 알림이 이미 보여 준다. 여기에까지 찍으면
//  '앱 밖에 잡혀 있는 약속'이 무엇인지 한눈에 안 들어온다.
function collectDueDotsMap(rangeStart, rangeEnd) {
  var dotMap = {};
  if (typeof calendarEvents === 'undefined') return dotMap;

  // Task 가 직접 등록한 일정은 결국 그 Task 라서 뺀다(중복 점 방지)
  var taskEventIds = {};
  if (typeof tasks !== 'undefined') {
    tasks.forEach(function(task) { if (task.calendarEventId) taskEventIds[task.calendarEventId] = true; });
  }
  calendarEvents.forEach(function(ev) {
    if (ev.calendarEventId && taskEventIds[ev.calendarEventId]) return;
    if (!ev.dueDateTime) return;
    var ed = new Date(ev.dueDateTime);
    if (ed >= rangeStart && ed <= rangeEnd) {
      var ek = fmtKey(ed); if (!dotMap[ek]) dotMap[ek] = []; dotMap[ek].push(ev.calColor || GCAL_COLOR);
    }
  });
  return dotMap;
}

function buildCalHeader(label) {
  return '<div class="cal-header">'
    + '<div style="display:flex;align-items:center;gap:6px;">'
    + '<button class="cal-arrow" onclick="homeCalPrev()">‹</button>'
    + '<span class="cal-month-label">' + label + '</span>'
    + '<button class="cal-arrow" onclick="homeCalNext()">›</button>'
    + '</div>'
    + '</div>';
}

function buildCalDayCell(dt, todayStr, dotMap, year, month, day) {
  var dow = dt.getDay();
  var key = fmtKey(dt);
  var isToday = key === todayStr;
  var isSelected = key === homeCalSelectedKey;
  var dots = dotMap[key] || [];
  var cls = 'cal-cell' + (isToday?' today':'') + (isSelected?' selected':'') + (dow===0?' sun':dow===6?' sat':'');
  var dotsHtml = '';
  if (dots.length > 0) {
    dotsHtml = '<div class="cal-dots">';
    dots.slice(0,3).forEach(function(c){ dotsHtml += '<div class="cal-dot" style="background:'+c+';"></div>'; });
    if (dots.length>3) dotsHtml += '<span style="font-size:8px;color:var(--text-3);line-height:5px;">+'+(dots.length-3)+'</span>';
    dotsHtml += '</div>';
  }
  return '<div class="' + cls + '" onclick="selectCalDate(' + year + ',' + month + ',' + day + ')"'
    + ' onmouseenter="calHoverShow(event,\'' + key + '\')" onmouseleave="calHoverHide()">'
    + '<span class="cal-num">' + day + '</span>' + dotsHtml + '</div>';
}

function buildMonthlyCalGrid() {
  var year = homeCalYear, month = homeCalMonth;
  var today = new Date();
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var DAY_KO = (typeof weekDayOrder === 'function') ? weekDayOrder() : ['일','월','화','수','목','금','토'];

  var rangeStart = new Date(year, month, 1);
  var rangeEnd   = new Date(year, month+1, 0, 23, 59, 59);
  var dotMap = collectDueDotsMap(rangeStart, rangeEnd);

  var firstDay = new Date(year, month, 1).getDay();
  var lead = (typeof weekLeadOffset === 'function') ? weekLeadOffset(firstDay) : firstDay;
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var prevLast = new Date(year, month, 0).getDate();

  var html = buildCalHeader(year + '년 ' + MONTHS[month]);
  html += '<div class="cal-grid">';

  DAY_KO.forEach(function(d) { html += '<div class="cal-dh">' + d + '</div>'; });

  for (var i = 0; i < lead; i++) {
    html += '<div class="cal-cell dim"><span class="cal-num">' + (prevLast - lead + 1 + i) + '</span></div>';
  }

  var todayStr = fmtKey(today);
  for (var d = 1; d <= daysInMonth; d++) {
    var dt = new Date(year, month, d);
    html += buildCalDayCell(dt, todayStr, dotMap, year, month, d);
  }

  var filled = lead + daysInMonth;
  var remain = (7 - (filled % 7)) % 7;
  for (var j = 1; j <= remain; j++) {
    html += '<div class="cal-cell dim"><span class="cal-num">' + j + '</span></div>';
  }
  html += '</div>';
  return html;
}

function buildWeeklyCalGrid() {
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var DAY_KO = ['일','월','화','수','목','금','토'];
  var start = new Date(homeCalWeekStart);
  var end = new Date(start); end.setDate(end.getDate()+6); end.setHours(23,59,59,999);
  var today = new Date();
  var todayStr = fmtKey(today);

  var dotMap = collectDueDotsMap(start, end);

  var label;
  if (start.getMonth() === end.getMonth()) {
    label = start.getFullYear() + '년 ' + MONTHS[start.getMonth()] + ' ' + start.getDate() + '–' + end.getDate() + '일';
  } else {
    label = (start.getMonth()+1) + '/' + start.getDate() + ' – ' + (end.getMonth()+1) + '/' + end.getDate();
  }

  var html = buildCalHeader(label);
  html += '<div class="cal-grid cal-grid-weekly">';
  DAY_KO.forEach(function(d) { html += '<div class="cal-dh">' + d + '</div>'; });

  for (var i = 0; i < 7; i++) {
    var dt = new Date(start); dt.setDate(start.getDate()+i);
    html += buildCalDayCell(dt, todayStr, dotMap, dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  html += '</div>';
  return html;
}

function homeCalPrev() {
  if (homeCalView === 'weekly') { homeCalWeekStart.setDate(homeCalWeekStart.getDate()-7); }
  else { homeCalMonth--; if(homeCalMonth<0){homeCalMonth=11;homeCalYear--;} }
  renderHomeCalendar();
}
function homeCalNext() {
  if (homeCalView === 'weekly') { homeCalWeekStart.setDate(homeCalWeekStart.getDate()+7); }
  else { homeCalMonth++; if(homeCalMonth>11){homeCalMonth=0;homeCalYear++;} }
  renderHomeCalendar();
}
function homeCalSetView(v) { homeCalView=v; renderHomeCalendar(); }

// 날짜 클릭 → 선택 표시 + 하단 상세 패널 갱신
function selectCalDate(year, month, day) {
  homeCalSelectedKey = fmtKey(new Date(year, month, day));
  renderHomeCalendar();
}

// 특정 날짜(key)에 해당하는 항목 모으기 (Task + 단계 + 구글 캘린더 일정)
// 표시 순서: ① 구글에서 불러오기만 하는 일정(상단) → ② tasklog 일정(하단)
//   - tasklog 일정 = 앱 Task/단계 + 'TaskLog' 캘린더(양방향 대상)에서 온 일정
function collectDayItems(key) {
  var googleItems = [];   // 구글에서 불러오기만 하는 일정 (상단)
  var taskLogItems = [];  // tasklog 일정 (하단)
  var taskEventIds = {};
  if (typeof tasks !== 'undefined') {
    tasks.forEach(function(t) {
      if (t.calendarEventId) taskEventIds[t.calendarEventId] = true;
      var color = EI_COLORS[t.eisenhower] || 'var(--text-2)';
      if (t.dueDateTime && fmtKey(new Date(t.dueDateTime))===key) {
        taskLogItems.push({ text: t.text, color: color, id: t.id, isCal: false, kind: 'task', time: t.hasTime ? new Date(t.dueDateTime) : null });
      }
      if (Array.isArray(t.steps)) {
        t.steps.forEach(function(step) {
          if (step.dueDateTime && fmtKey(new Date(step.dueDateTime))===key) {
            taskLogItems.push({ text: step.text, color: color, id: t.id, isCal: false, kind: 'todo', time: step.hasTime ? new Date(step.dueDateTime) : null });
          }
        });
      }
    });
  }
  // 구글 캘린더 일정 (Task가 직접 등록한 것은 중복이므로 제외)
  if (typeof calendarEvents !== 'undefined') {
    calendarEvents.forEach(function(ev) {
      if (ev.calendarEventId && taskEventIds[ev.calendarEventId]) return;
      if (ev.dueDateTime && fmtKey(new Date(ev.dueDateTime))===key) {
        var item = { text: ev.text, color: ev.calColor || GCAL_COLOR, id: null, isCal: true, time: ev.hasTime ? new Date(ev.dueDateTime) : null };
        // 'TaskLog' 캘린더에서 온 일정은 tasklog 일정(하단)으로, 그 외는 구글 일정(상단)으로
        if (ev.fromTaskCal) taskLogItems.push(item); else googleItems.push(item);
      }
    });
  }
  return googleItems.concat(taskLogItems);
}

// ── 날짜 hover 말풍선: 구글 캘린더에서 불러온 일정만 ──
//  Task/To Do 는 달력 아래 점과 다른 위젯이 이미 보여 준다.
//  여기서 알고 싶은 건 '앱 밖에 잡혀 있는 약속'뿐이라 그것만 띄운다.
var _calHoverEl = null;

function calGcalDayItems(key) {
  return collectDayItems(key).filter(function(it){ return it.isCal; });
}

function calHoverShow(ev, key) {
  var items = calGcalDayItems(key);
  calHoverHide();
  if (!items.length) return;

  var tip = document.createElement('div');
  tip.className = 'cal-hovertip';
  tip.innerHTML = items.slice(0, 6).map(function(it) {
    var t = it.time
      ? '<span class="cal-hovertip-time">' + String(it.time.getHours()).padStart(2,'0') + ':' + String(it.time.getMinutes()).padStart(2,'0') + '</span>'
      : '';
    return '<div class="cal-hovertip-row">' + t
      + '<span class="cal-hovertip-txt">' + hwEsc(it.text) + '</span></div>';
  }).join('')
  + (items.length > 6 ? '<div class="cal-hovertip-more">+' + (items.length - 6) + '개 더</div>' : '');
  document.body.appendChild(tip);
  _calHoverEl = tip;

  // 셀 아래에 붙이되, 화면 밖으로 나가면 위/안쪽으로 되돌린다
  var r = ev.currentTarget.getBoundingClientRect();
  var tr = tip.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - tr.width - 8);
  var top = (r.bottom + tr.height + 8 > window.innerHeight) ? (r.top - tr.height - 4) : (r.bottom + 4);
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function calHoverHide() {
  if (_calHoverEl) { _calHoverEl.remove(); _calHoverEl = null; }
}

// ── 3. 만다라트 SECTION별 달성 현황 ──────────
function renderHomeMandalartWidget() {
  var el = document.getElementById('mandalart-body');
  if (!el) return;
  if (typeof loadMandalarts === 'function') loadMandalarts();
  if (typeof mandalarts === 'undefined' || !mandalarts.length) {
    el.innerHTML = emptyWidget('🎯', '만다라트가 없습니다.\n만다라트에서 추가해보세요');
    return;
  }
  // 현재 연도(없으면 최신 연도)의 만다라트 사용
  var year = (typeof currentMdtYear !== 'undefined' && currentMdtYear)
    ? currentMdtYear
    : Math.max.apply(null, mandalarts.map(function(m){ return m.year; }));
  var m = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (!m) m = mandalarts[mandalarts.length - 1];
  if (!m || !m.subGoals || !m.subGoals.length) {
    el.innerHTML = emptyWidget('🎯', '등록된 SECTION이 없습니다');
    return;
  }
  var html = m.subGoals.map(function(sg, i) {
    var acts  = (sg.actions || []).filter(function(a){ return a.text && a.text.trim(); });
    var total = acts.length;
    var done  = acts.filter(function(a){ return a.completed; }).length;
    var pct   = total ? Math.round(done / total * 100) : 0;
    var color = sg.color || HOME_SEC_COLORS[i] || '#4F6EF7';
    var name  = (sg.text && sg.text.trim()) ? sg.text : ('Section' + (i + 1));
    var label = (sg.emoji ? hwEsc(sg.emoji) + ' ' : '') + hwEsc(name);
    return '<div class="mda-row" onclick="navToMenu(\'mandalart\')" title="' + hwEsc(name) + ' · ' + done + '/' + total + '">'
      + '<span class="mda-name">' + label + '</span>'
      + '<div class="mda-track"><div class="mda-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>'
      + '<span class="mda-pct">' + pct + '%</span>'
      + '</div>';
  }).join('');
  el.innerHTML = html;
}

// ── 4. HABIT TRACKER ──────────────────────
function renderHomeHabitWidget() {
  var el = document.getElementById('habit-body');
  if (!el) return;
  if (typeof getAllHabitActions !== 'function') {
    el.innerHTML = emptyWidget('🌱', '등록된 습관 목표가 없습니다.\n만다라트에서 추가해보세요');
    return;
  }
  var habits = getAllHabitActions();
  if (!habits || !habits.length) {
    el.innerHTML = emptyWidget('🌱', '등록된 습관 목표가 없습니다.\n만다라트에서 추가해보세요');
    return;
  }
  var today = new Date();
  var DOW = ['일','월','화','수','목','금','토'];
  // 정렬: 가나다순 · 단, 오늘 달성한 습관은 하단으로
  habits = habits.slice().sort(function(x, y) {
    var tk = fmtKey(today);
    var xd = !!(x.a && x.a.habitLog && x.a.habitLog[tk]);
    var yd = !!(y.a && y.a.habitLog && y.a.habitLog[tk]);
    if (xd !== yd) return xd ? 1 : -1;
    return (x.a.text || '').localeCompare(y.a.text || '', 'ko');
  });
  var html = habits.map(function(h) {
    var a = h.a, sg = h.sg, log = a.habitLog || {};
    // 오늘 포함 최근 7일(과거→오늘) 표시 — 모든 칸 클릭 가능
    var base = new Date(today.getTime()); base.setHours(0,0,0,0);
    var dots = '';
    for (var j=6; j>=0; j--) {
      var day=new Date(base.getTime()); day.setDate(base.getDate()-j);
      var dk=fmtKey(day), done=!!log[dk], isToday=(j===0);
      var cls='habit-dot'+(done?' done':'')+(isToday?' today':'');
      var oc=' onclick="hpToggleHabitDay(\''+h.m.year+'\','+sg.id+','+a.id+',\''+dk+'\')"';
      dots += '<div class="'+cls+'"'+oc+'><span class="habit-dot-dow">'+DOW[day.getDay()]+'</span></div>';
    }
    return '<div class="habit-row">'
      + '<div class="habit-info"><div class="habit-name">'+hwEsc(a.text)+'</div></div>'
      + '<div class="habit-week">'+dots+'</div>'
      + '</div>';
  }).join('');
  el.innerHTML = '<div class="habit-2col">' + html + '</div>';
  habitSyncColumns();
}

// 세로로 내려가다 높이가 다 차면 오른쪽에 다음 열을 만든다.
//  flex-wrap 이 줄바꿈은 해 주지만, 각 열의 폭은 우리가 정해 줘야
//  칸이 고르게 나뉜다. 몇 열이 필요한지 → 가로로 몇 열이 들어가는지
//  순서로 계산해 좁은 쪽을 택한다.
var HABIT_MIN_COL = 190;   // 이름 + 요일 칸 7개가 눌리지 않는 최소 폭
function habitSyncColumns() {
  var wrap = document.querySelector('#habit-body .habit-2col');
  if (!wrap) return;
  var rows = wrap.querySelectorAll('.habit-row');
  if (!rows.length) return;

  var availH = wrap.clientHeight, availW = wrap.clientWidth;
  if (availH <= 0 || availW <= 0) return;
  var rowH = rows[0].getBoundingClientRect().height || 1;
  var gap = parseFloat(getComputedStyle(wrap).columnGap) || 0;

  var perCol = Math.max(1, Math.floor(availH / rowH));      // 한 열에 담기는 개수
  var need = Math.ceil(rows.length / perCol);               // 그래서 몇 열이 필요한가
  var fit = Math.max(1, Math.floor((availW + gap) / (HABIT_MIN_COL + gap)));  // 가로로 몇 열이 들어가는가
  var cols = Math.max(1, Math.min(need, fit));

  var w = (availW - gap * (cols - 1)) / cols;
  wrap.style.setProperty('--habit-col-w', w.toFixed(2) + 'px');
}

function hpToggleHabitDay(year, sgId, actId, dateKey) {
  if (typeof toggleHabitDay === 'function') {
    toggleHabitDay(+year, sgId, actId, dateKey);
    if (typeof saveMandalarts === 'function') saveMandalarts();
    renderHomeHabitWidget();
  }
}


// ── Gantt 미니 (Gantt 페이지 수준의 일자/진행률 상세) ──
//  설정에서 켠 사람만 쓰는 위젯이라 기본은 꺼져 있다.
//  GM_* 상수와 gmLeftWidth · buildGanttSubRows 는 gantt.js 가 갖고 있다.
var homeGanttYear  = new Date().getFullYear();
var homeGanttMonth = new Date().getMonth();

function homeGanttPrev() { homeGanttMonth--; if (homeGanttMonth<0) { homeGanttMonth=11; homeGanttYear--; } renderHomeGanttMini(); }
function homeGanttNext() { homeGanttMonth++; if (homeGanttMonth>11) { homeGanttMonth=0; homeGanttYear++; } renderHomeGanttMini(); }
function homeGanttToday() { homeGanttYear=new Date().getFullYear(); homeGanttMonth=new Date().getMonth(); renderHomeGanttMini(); }


// 좌측 라벨 영역 폭 드래그 조정 핸들 부착 (헤더 spacer 오른쪽 경계)
function gmAttachLeftResize() {
  var wrap = document.querySelector('#gantt-body .gm-wrap');
  var spacer = document.querySelector('#gantt-body .gm-left-spacer');
  if (!wrap || !spacer) return;
  if (window.getComputedStyle(spacer).position === 'static') spacer.style.position = 'relative';
  var h = document.createElement('div');
  h.className = 'cr-handle';
  spacer.appendChild(h);
  h.addEventListener('click', function(e){ e.stopPropagation(); });
  h.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    var startX = e.clientX;
    var startW = Math.round(spacer.getBoundingClientRect().width);
    var lastW = startW;
    document.body.classList.add('cr-resizing');
    function mm(ev) {
      lastW = Math.max(80, Math.min(GM_LEFT_MAX, Math.round(startW + (ev.clientX - startX))));
      wrap.style.setProperty('--gm-left', lastW + 'px');
    }
    function mu() {
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
      document.body.classList.remove('cr-resizing');
      try { localStorage.setItem('homeGanttLeftW', String(lastW)); } catch (err) {}
      renderHomeGanttMini();   // 오늘선 위치 등 재계산
    }
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });
}

function renderHomeGanttMini() {
  var el = document.getElementById('gantt-body');
  if (!el) return;

  if (typeof tasks === 'undefined' || typeof getTaskProgress !== 'function') {
    el.innerHTML = emptyWidget('📊', '진행 중인 Task가 없습니다');
    return;
  }

  var MN = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var year = homeGanttYear, month = homeGanttMonth;
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var mS = new Date(year, month, 1);
  var mE = new Date(year, month+1, 0, 23, 59, 59);
  var today = new Date();
  var todayIdx = (today.getFullYear()===year && today.getMonth()===month) ? today.getDate()-1 : null;

  var vis = tasks.filter(function(t) {
    if (t.completed) return false;
    var s = t.startDate   ? new Date(t.startDate)   : null;
    var e = t.dueDateTime ? new Date(t.dueDateTime) : null;
    if (s && e) return s <= mE && e >= mS;
    if (s)      return s >= mS && s <= mE;
    if (e)      return e >= mS && e <= mE;
    return false;
  });

  // 정렬 기준: 완료되지 않은 To Do 중 마감일이 가장 빠른 순.
  // (미완 To Do 마감일이 없으면 Task 자체 마감일, 그것도 없으면 맨 뒤)
  function _earliestOpenTodoDue(t) {
    var steps = t.steps || [];
    var min = Infinity;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.completed || !s.dueDateTime) continue;
      var ms = new Date(s.dueDateTime).getTime();
      if (!isNaN(ms) && ms < min) min = ms;
    }
    if (min === Infinity) min = t.dueDateTime ? new Date(t.dueDateTime).getTime() : Infinity;
    return min;
  }
  vis = vis.slice().sort(function(a, b) {
    return _earliestOpenTodoDue(a) - _earliestOpenTodoDue(b);
  });

  var navHtml = '<div class="gm-nav">'
    + '<button class="gm-arrow" onclick="homeGanttPrev()">‹</button>'
    + '<span class="gm-month-label">'+year+'년 '+MN[month]+'</span>'
    + '<button class="gm-arrow" onclick="homeGanttNext()">›</button>'
    + (todayIdx===null ? '<button class="gm-today-btn" onclick="homeGanttToday()">오늘</button>' : '')
    + '</div>';

  if (!vis.length) {
    el.innerHTML = navHtml + emptyWidget('📊', '이번 달 진행 중인 Task가 없습니다');
    return;
  }

  var leftW = gmLeftWidth(vis.slice(0, GM_MAX_ROWS));

  // 배경 셀(요일/오늘 음영) — 모든 행이 공유하는 퍼센트 기반 칸, 우측 여백 없이 꽉 채움
  var bgCellsHtml = '';
  for (var d2 = 0; d2 < daysInMonth; d2++) {
    var dow2 = new Date(year, month, d2+1).getDay();
    var isT2 = (d2 === todayIdx);
    var cls2 = 'gm-bgcell' + (isT2?' gm-today-col':'') + ((dow2===0||dow2===6)?' gm-weekend-col':'');
    bgCellsHtml += '<div class="'+cls2+'"></div>';
  }

  var hdrCells = '';
  for (var d = 1; d <= daysInMonth; d++) {
    var dow = new Date(year, month, d).getDay();
    var isToday = (d-1 === todayIdx);
    var cls = 'gm-hcell' + (isToday?' gm-today':'') + (dow===0?' gm-sun':dow===6?' gm-sat':'');
    hdrCells += '<div class="'+cls+'">'+d+'</div>';
  }

  var rows = vis.slice(0, GM_MAX_ROWS).map(function(task) {
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
      barLeftPct = (cs.getDate()-1) / daysInMonth * 100;
      barWPct    = Math.max(1/daysInMonth*100, (ce.getDate()-cs.getDate()+1) / daysInMonth * 100);
    }

    var dateLbl = '';
    if (sDate && eDate) dateLbl = (sDate.getMonth()+1)+'/'+sDate.getDate()+' ~ '+(eDate.getMonth()+1)+'/'+eDate.getDate();
    else if (sDate)     dateLbl = (sDate.getMonth()+1)+'/'+sDate.getDate()+' 시작';
    else if (eDate)     dateLbl = (eDate.getMonth()+1)+'/'+eDate.getDate()+' 마감';
    // Project 이모지: 만다라트 연도별 section → 라이프휠 순으로 해석 (todo.js 공용 해석기)
    var _secEmoji = (typeof todoSectionEmoji === 'function') ? todoSectionEmoji(task) : (task.lwSectionEmoji || '');
    if (_secEmoji) dateLbl = _secEmoji + ' ' + dateLbl;

    var _open = (typeof ganttIsOpen === 'function') ? ganttIsOpen(task.id) : (_ganttOpen[task.id] !== false);
    var _hasSteps = (task.steps || []).length > 0;
    var mainRow = '<div class="gm-row" onclick="if(typeof openDetailPanel===\'function\')openDetailPanel('+task.id+')">'
      + '<div class="gm-left">'
      + (_hasSteps ? '<span class="gm-toggle" onclick="ganttToggleTask('+task.id+',event)">'+(_open?'\u25be':'\u25b8')+'</span>' : '<span class="gm-toggle-empty"></span>')
      + progressCircleSvg(pct, color)
      + '<div class="gm-info">'
      + '<div class="gm-name" title="'+hwEsc(label)+'">'+hwEsc(shortLabel)+'</div>'
      + '</div>'
      + '</div>'
      + '<div class="gm-grid">'
      + bgCellsHtml
      + (hasBar
          ? '<div class="gm-bar" style="left:'+barLeftPct.toFixed(3)+'%;width:'+barWPct.toFixed(3)+'%;border-color:'+color+';background:'+color+'25;">'
            + '<div class="gm-bar-fill" style="width:'+pct+'%;background:'+color+';"></div></div>'
          : '')
      + ((!_open && _hasSteps) ? ganttStepMarkers(task, mS, mE, daysInMonth, color) : '')
      + '</div>'
      + '</div>';

    return mainRow + buildGanttSubRows(task, mS, mE, daysInMonth, color, bgCellsHtml);
  }).join('');

  var todayLine = todayIdx !== null
    ? '<div class="gm-today-line" style="left:calc('+leftW+'px + (100% - '+leftW+'px) * '+(((todayIdx+0.5)/daysInMonth).toFixed(4))+');"></div>'
    : '';

  el.innerHTML = navHtml
    + '<div class="gm-wrap" style="--gm-left:'+leftW+'px;">'
    + '<div class="gm-header"><div class="gm-left-spacer"></div>'
    + '<div class="gm-hcells">'+hdrCells+'</div></div>'
    + '<div class="gm-body">' + todayLine + rows + '</div>'
    + '</div>'
    + (vis.length > GM_MAX_ROWS ? '<div class="gm-more">+'+(vis.length-GM_MAX_ROWS)+'개 더 있음 · 전체보기에서 확인</div>' : '');

  gmAttachLeftResize();   // 좌측 텍스트 영역 폭 드래그 조정
}


// ── 5. Web 미니 (Archiving / Task / To Do 내역) ──
//  Web 페이지(notes.js)와 같은 데이터를 그대로 세 칼럼으로 보여준다.
//  카드를 누르면 Web 페이지나 해당 Task 상세로 넘어간다.
function renderHomeWebWidget() {
  var el = document.getElementById('web-body');
  if (!el) return;
  if (typeof loadNotes === 'function') loadNotes();

  var memos = (typeof getArchivingNotes === 'function') ? getArchivingNotes() : [];
  var actTasks = (typeof getActiveTasks === 'function') ? getActiveTasks() : [];
  var actSteps = (typeof getActiveSteps === 'function') ? getActiveSteps() : [];

  function col(title, count, itemsHtml, emptyMsg) {
    return '<div class="hwb-col">'
      + '<div class="hwb-col-head"><span class="hwb-col-title">' + title + '</span>'
      +   '<span class="hwb-col-count">' + count + '</span></div>'
      + '<div class="hwb-col-body">'
      + (count ? itemsHtml : '<div class="hwb-empty">' + hwEsc(emptyMsg) + '</div>')
      + '</div></div>';
  }
  // 마감일 배지 (Task/To Do 공용) — 지난 것은 빨강, 남은 것은 초록
  function dueBadge(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var day = new Date(d); day.setHours(0,0,0,0);
    var today = new Date(); today.setHours(0,0,0,0);
    var over = day < today;
    return '<span class="hwb-due" style="color:' + (over ? 'var(--danger)' : 'var(--success)') + ';">'
      + (d.getMonth()+1) + '/' + d.getDate() + '</span>';
  }
  function cleanName(t) { return String(t || '').replace(/^\[\d{6}\]\s*/, ''); }

  var memoHtml = memos.map(function(n) {
    return '<div class="hwb-item" onclick="navToMenu(\'cloud\')" title="Web 페이지 열기">'
      + '<span class="hwb-strip" style="background:var(--text-3);"></span>'
      + '<span class="hwb-text">' + hwEsc(n.text) + '</span>'
      + '</div>';
  }).join('');

  var taskHtml = actTasks.map(function(t) {
    return '<div class="hwb-item" onclick="openDetailPanel(' + t.id + ')" title="상세 보기">'
      + '<span class="hwb-strip" style="background:var(--success);"></span>'
      + '<span class="hwb-text">' + hwEsc(cleanName(t.text)) + '</span>'
      + dueBadge(t.dueDateTime)
      + '</div>';
  }).join('');

  var stepHtml = actSteps.map(function(e) {
    return '<div class="hwb-item" onclick="openDetailPanel(' + e.task.id + ')" title="상위 Task 상세 보기">'
      + '<span class="hwb-strip" style="background:var(--info);"></span>'
      + '<span class="hwb-text">' + hwEsc(cleanName(e.step.text)) + '</span>'
      + dueBadge(e.step.dueDateTime || e.task.dueDateTime)
      + '</div>';
  }).join('');

  // 위쪽 +Memo — Web 페이지까지 가지 않고 여기서 바로 Archiving 에 넣는다
  var writeHtml = '<div class="hwb-write">'
    + '<input type="text" class="hwb-write-inp" id="hwb-memo-inp" placeholder="메모를 입력하세요..."'
    + ' autocomplete="off" onkeydown="if(event.key===\'Enter\'){hwbAddMemo();}">'
    + '<button class="hwb-write-btn" onclick="hwbAddMemo()">+ Memo</button>'
    + '</div>';

  el.innerHTML = writeHtml
    + '<div class="hwb-board">'
    + col('Archiving', memos.length, memoHtml, '작성한 메모가 없어요')
    + col('Task', actTasks.length, taskHtml, '미완료 Task가 없어요')
    + col('To Do', actSteps.length, stepHtml, '미완료 To Do가 없어요')
    + '</div>';
}

// Web 위젯 상단 +Memo → Archiving 에 저장
function hwbAddMemo() {
  var inp = document.getElementById('hwb-memo-inp');
  if (!inp || !inp.value.trim()) return;
  if (typeof loadNotes === 'function') loadNotes();     // 기존 메모 덮어쓰기 방지
  if (typeof createNote === 'function') createNote(inp.value.trim());
  inp.value = '';
  renderHomeWebWidget();
  // 방금 넣은 메모가 보이도록 입력칸에 다시 포커스
  var again = document.getElementById('hwb-memo-inp');
  if (again) again.focus();
}

// ============================================
//  ⏱ Focus On — To Do 하나를 골라 시간을 잰다
//  --------------------------------------------
//  · 세션은 아직 끝나지 않은 To Do 전체에서 고른다
//  · 시작 / 정지 / 종료 — 누른 시각을 하나도 빠짐없이 기록한다
//  · 종료하면 그 순간에 To Do 가 완료 처리되고, 완료 시각과 집중 시간이
//    Work Diary 주간 그리드에 그대로 얹힌다(completedAt · wdDurMin).
//  · 오늘 끝낸 세션은 아래 목록에 쌓인다. 지우면 그 To Do 는 미완으로 돌아간다.
//
//  진행 중인 세션은 localStorage 에 둔다 — 다른 메뉴에 갔다 와도,
//  새로고침을 해도 재던 시간이 이어진다.
//
//  화면은 넬나 '포커스 온' 다이얼을 본떴다: 분 눈금이 둘린 원판 위에
//  남은/지난 시간을 부채꼴로 칠하고, 가운데에 시간을 적는다.
// ============================================
var FOCUS_KEY = 'tasklog-focus-session';
var _focusTick = null;

function focusLoad() {
  try {
    var raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    return (s && s.taskId != null) ? s : null;
  } catch (e) { return null; }
}
function focusSave(s) {
  try {
    if (s) localStorage.setItem(FOCUS_KEY, JSON.stringify(s));
    else localStorage.removeItem(FOCUS_KEY);
  } catch (e) {}
}

// 아직 끝나지 않은 To Do 전체 (마감일 빠른 순 → 없는 것은 뒤)
function focusOpenTodos() {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return [];
  var out = [];
  tasks.forEach(function(t) {
    (t.steps || []).forEach(function(s) {
      if (s.completed) return;
      out.push({
        taskId: t.id, stepId: s.id, text: s.text, taskText: t.text,
        due: s.dueDateTime || t.dueDateTime || null
      });
    });
  });
  out.sort(function(a, b) {
    var da = a.due ? new Date(a.due).getTime() : Infinity;
    var db = b.due ? new Date(b.due).getTime() : Infinity;
    if (da !== db) return da - db;
    return 0;
  });
  return out;
}

// 누적 집중 시간(초) — 실행 구간의 합. 진행 중이면 지금까지를 더한다.
function focusElapsedSec(s) {
  if (!s || !Array.isArray(s.segments)) return 0;
  var ms = 0, now = Date.now();
  s.segments.forEach(function(seg) {
    var st = new Date(seg.start).getTime();
    var en = seg.end ? new Date(seg.end).getTime() : (s.running ? now : st);
    if (!isNaN(st) && !isNaN(en) && en > st) ms += (en - st);
  });
  return Math.floor(ms / 1000);
}

function focusFmtDur(sec) {
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  return (h > 0 ? String(h).padStart(2, '0') + ':' : '')
    + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
}
function focusFmtClock(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function focusCleanText(t) { return String(t || '').replace(/^\[\d{6}\]\s*/, ''); }

// 버튼을 누른 시각을 기록에 남긴다 — 이 목록이 '다 기록된다'의 실체다
function focusLog(s, action) {
  if (!s.log) s.log = [];
  s.log.push({ at: new Date().toISOString(), action: action });
}

var FOCUS_ACTION_LABEL = { start: '시작', pause: '정지', resume: '재개', end: '종료' };

// ── 조작 ──────────────────────────────────
function focusPickSession(val) {
  var s = focusLoad();
  if (s && s.running) return;              // 재는 중에는 세션을 바꾸지 않는다
  if (!val) { focusSave(null); renderFocusWidget(); return; }
  var p = String(val).split(':');
  var taskId = Number(p[0]), stepId = p[1];
  var found = focusOpenTodos().find(function(e) {
    return e.taskId === taskId && String(e.stepId) === String(stepId);
  });
  if (!found) return;
  focusSave({
    taskId: found.taskId, stepId: found.stepId, text: found.text, taskText: found.taskText,
    running: false, segments: [], log: []
  });
  renderFocusWidget();
}

function focusStart() {
  var s = focusLoad();
  if (!s || s.running) return;
  var now = new Date().toISOString();
  focusLog(s, s.segments.length ? 'resume' : 'start');
  s.segments.push({ start: now, end: null });
  s.running = true;
  focusSave(s);
  renderFocusWidget();
}

function focusPause() {
  var s = focusLoad();
  if (!s || !s.running) return;
  var now = new Date().toISOString();
  focusLog(s, 'pause');
  var last = s.segments[s.segments.length - 1];
  if (last && !last.end) last.end = now;
  s.running = false;
  focusSave(s);
  renderFocusWidget();
}

// 종료 = '지금' 이 To Do 를 끝냈다는 뜻.
//  완료 체크 + 완료 시각 + 집중 시간(분)을 함께 남겨 Work Diary 가 바로 받는다.
function focusEnd() {
  var s = focusLoad();
  if (!s) return;
  var nowIso = new Date().toISOString();
  focusLog(s, 'end');
  var last = s.segments[s.segments.length - 1];
  if (last && !last.end) last.end = nowIso;
  s.running = false;
  var sec = focusElapsedSec(s);

  var task = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === s.taskId; }) : null;
  var step = task && task.steps ? task.steps.find(function(x){ return String(x.id) === String(s.stepId); }) : null;
  if (step) {
    step.completed = true;
    if (typeof applyDonePrefix === 'function') step.text = applyDonePrefix(step.text, true);
    // 완료 '그 순간'의 시각 — Work Diary 그리드가 이 값으로 자리를 잡는다
    step.completedAt = nowIso;
    delete step.wdTimed; delete step.wdLogAt;
    // 집중한 만큼을 블록 길이로 (Work Diary 최소 단위 10분)
    step.wdDurMin = Math.max(10, Math.round(sec / 60));
    // 이 세션의 버튼 기록을 To Do 에 붙여 둔다 — 목록에서 지울 때도 이걸 본다
    if (!Array.isArray(step.focusSessions)) step.focusSessions = [];
    step.focusSessions.push({ endedAt: nowIso, durSec: sec, log: s.log });
    if (typeof saveTasks === 'function') saveTasks();
  }

  focusSave(null);
  focusRefreshSiblings();
}

// 오늘 끝낸 세션 모으기 — To Do 에 붙여 둔 focusSessions 에서 읽는다
function focusTodaySessions() {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return [];
  var todayKey = fmtKey(new Date());
  var out = [];
  tasks.forEach(function(t) {
    (t.steps || []).forEach(function(s) {
      (s.focusSessions || []).forEach(function(f, i) {
        if (!f.endedAt || fmtKey(new Date(f.endedAt)) !== todayKey) return;
        out.push({ taskId: t.id, stepId: s.id, idx: i, text: s.text, endedAt: f.endedAt, durSec: f.durSec || 0 });
      });
    });
  });
  out.sort(function(a, b){ return new Date(b.endedAt) - new Date(a.endedAt); });
  return out;
}

// 세션 삭제 = 그 완료를 되돌린다. To Do 는 미완으로 돌아간다.
function focusDeleteSession(taskId, stepId, idx) {
  var task = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === taskId; }) : null;
  var step = task && task.steps ? task.steps.find(function(x){ return String(x.id) === String(stepId); }) : null;
  if (!step || !Array.isArray(step.focusSessions)) return;
  step.focusSessions.splice(idx, 1);
  // 남은 세션이 없으면 '완료' 자체를 되돌린다.
  // (한 To Do 를 여러 번 나눠 잰 경우, 마지막 기록을 지울 때만 미완으로 간다)
  if (!step.focusSessions.length) {
    step.completed = false;
    if (typeof applyDonePrefix === 'function') step.text = applyDonePrefix(step.text, false);
    delete step.completedAt; delete step.wdTimed; delete step.wdLogAt; delete step.wdDurMin;
    delete step.focusSessions;
  }
  if (typeof saveTasks === 'function') saveTasks();
  focusRefreshSiblings();
}

// 완료 여부가 바뀌면 같이 움직여야 하는 화면들
function focusRefreshSiblings() {
  renderFocusWidget();
  if (typeof renderHomeWebWidget === 'function') renderHomeWebWidget();
  if (typeof renderHomeNotif === 'function') renderHomeNotif();
}

// ── 다이얼 ────────────────────────────────
//  넬나 '포커스 온'을 그대로 옮겼다. 바깥에서 안쪽으로:
//    얇은 회색 링 → 분 눈금(5분마다 굵게) → 5분 단위 숫자 → 진녹색 부채꼴 → 황토색 노브
//  한 바퀴 = 60분. 넘어가면 두 바퀴째를 이어서 칠한다.
var FOCUS_DIAL_MIN = 60;

function focusDialSvg(sec, running) {
  var CX = 50, CY = 50;
  var R_FACE = 47;    // 원판 테두리
  var R_TICK = 45.6;  // 눈금 바깥 끝
  var R_TICK_L = 41.6, R_TICK_S = 43.4;   // 긴 눈금 / 짧은 눈금 안쪽 끝
  var R_NUM = 35.5;   // 숫자가 앉는 자리
  var R_FILL = 31;    // 부채꼴 반지름 — 실물처럼 숫자 안쪽까지 차오른다
  var R_KNOB = 8.4;

  var mins = sec / 60;
  var frac = (mins % FOCUS_DIAL_MIN) / FOCUS_DIAL_MIN;
  if (mins >= FOCUS_DIAL_MIN && frac === 0) frac = 1;   // 딱 한 바퀴면 꽉 찬 상태로

  var svg = '<svg class="fw-dial" viewBox="0 0 100 100" aria-hidden="true">';
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" class="fw-dial-face"/>';

  // 분 눈금 60개 — 5분마다 길고 굵게
  for (var i = 0; i < 60; i++) {
    var a = (i * 6 - 90) * Math.PI / 180;
    var lng = (i % 5 === 0);
    var ri = lng ? R_TICK_L : R_TICK_S;
    svg += '<line x1="' + (CX + ri * Math.cos(a)).toFixed(2) + '" y1="' + (CY + ri * Math.sin(a)).toFixed(2) + '"'
      + ' x2="' + (CX + R_TICK * Math.cos(a)).toFixed(2) + '" y2="' + (CY + R_TICK * Math.sin(a)).toFixed(2) + '"'
      + ' class="fw-dial-tick' + (lng ? ' is-long' : '') + '"/>';
  }

  // 5분 단위 숫자 (0 · 5 · 10 … 55)
  for (var n = 0; n < 60; n += 5) {
    var an = (n * 6 - 90) * Math.PI / 180;
    svg += '<text x="' + (CX + R_NUM * Math.cos(an)).toFixed(2) + '" y="' + (CY + R_NUM * Math.sin(an)).toFixed(2) + '"'
      + ' class="fw-dial-num">' + n + '</text>';
  }

  // 지난 시간 = 0 에서 시계 방향으로 칠한 부채꼴
  if (frac > 0) {
    var sweep = frac * 360;
    if (sweep >= 359.9) {
      svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FILL + '" class="fw-dial-fill"/>';
    } else {
      var a2 = (sweep - 90) * Math.PI / 180;
      svg += '<path class="fw-dial-fill" d="M' + CX + ' ' + CY + ' L' + CX + ' ' + (CY - R_FILL)
        + ' A' + R_FILL + ' ' + R_FILL + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 '
        + (CX + R_FILL * Math.cos(a2)).toFixed(2) + ' ' + (CY + R_FILL * Math.sin(a2)).toFixed(2) + ' Z"/>';
    }
  }

  // 가운데 손잡이 — 실물의 돌리는 노브. 위쪽에 짧은 홈이 하나 파여 있다.
  svg += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_KNOB + '" class="fw-dial-knob"/>';
  svg += '<line x1="' + CX + '" y1="' + (CY - 3.4) + '" x2="' + CX + '" y2="' + (CY + 1.2) + '" class="fw-dial-knob-line"/>';

  // 실물에는 이 자리에 'Great things take time.' 이 적혀 있다.
  // 우리에겐 지금 얼마나 쟀는지가 더 급하므로, 같은 자리에 같은 색으로 시간을 적는다.
  //  30분을 넘기면 부채꼴이 이 글자 자리(정중앙 아래)를 덮는다 →
  //  그때는 진녹색 위의 흰 글씨로 뒤집어야 읽힌다.
  var covered = (frac * 360) > 180;
  svg += '<text x="' + CX + '" y="68.5" class="fw-dial-time'
    + (running ? ' is-running' : '') + (covered ? ' is-over' : '') + '">'
    + focusFmtDur(sec) + '</text>';

  svg += '</svg>';
  return svg;
}

// ── 렌더 ──────────────────────────────────
function renderFocusWidget() {
  var el = document.getElementById('focus-body');
  if (_focusTick) { clearInterval(_focusTick); _focusTick = null; }
  if (!el) return;

  var s = focusLoad();
  var todos = focusOpenTodos();
  var curKey = s ? (s.taskId + ':' + s.stepId) : '';

  var opts = '<option value="">To Do 선택…</option>'
    + todos.map(function(e) {
        var k = e.taskId + ':' + e.stepId;
        return '<option value="' + k + '"' + (k === curKey ? ' selected' : '') + '>'
          + hwEsc(focusCleanText(e.text)) + '</option>';
      }).join('');
  // 진행 중인 세션의 To Do 가 목록에 없을 수 있다(다른 곳에서 완료 처리 등) → 직접 넣어 준다
  if (s && todos.every(function(e){ return (e.taskId + ':' + e.stepId) !== curKey; })) {
    opts += '<option value="' + curKey + '" selected>' + hwEsc(focusCleanText(s.text)) + '</option>';
  }

  var running = !!(s && s.running);
  var sec = focusElapsedSec(s);
  var sessions = focusTodaySessions();

  if (!todos.length && !s && !sessions.length) {
    el.innerHTML = '<div class="fw-wrap">' + emptyWidget('⏱', '아직 남은 To Do가 없습니다') + '</div>';
    return;
  }

  var sessionHtml = sessions.length
    ? sessions.map(function(f) {
        return '<div class="fw-sess">'
          + '<span class="fw-sess-time">' + focusFmtClock(f.endedAt) + '</span>'
          + '<span class="fw-sess-txt" title="' + hwEsc(focusCleanText(f.text)) + '">' + hwEsc(focusCleanText(f.text)) + '</span>'
          + '<span class="fw-sess-dur">' + focusFmtDur(f.durSec) + '</span>'
          + '<button class="fw-sess-del" title="기록 삭제 — 이 To Do는 미완으로 돌아갑니다"'
          + ' onclick="focusDeleteSession(' + f.taskId + ',\'' + f.stepId + '\',' + f.idx + ')">✕</button>'
          + '</div>';
      }).join('')
    : '<div class="fw-sess-empty">오늘 끝낸 세션이 없습니다</div>';

  // 시계는 원이라 좌우에 빈 공간이 남는다 → 오른쪽 빈자리에 버튼을 세로로 세운다.
  el.innerHTML = '<div class="fw-wrap">'
    + '<div class="fw-main">'
    +   '<div class="fw-dial-wrap" id="fw-dial-wrap">' + focusDialSvg(sec, running) + '</div>'
    +   '<div class="fw-btns">'
    +     '<button class="fw-btn fw-btn-start" ' + (!s || running ? 'disabled' : '') + ' onclick="focusStart()">시작</button>'
    +     '<button class="fw-btn fw-btn-pause" ' + (running ? '' : 'disabled') + ' onclick="focusPause()">정지</button>'
    +     '<button class="fw-btn fw-btn-end" ' + (s && s.log && s.log.length ? '' : 'disabled') + ' onclick="focusEnd()">종료</button>'
    +   '</div>'
    + '</div>'
    + '<select class="fw-select" ' + (running ? 'disabled title="정지한 뒤에 바꿀 수 있어요"' : '')
    +   ' onchange="focusPickSession(this.value)">' + opts + '</select>'
    + '<div class="fw-sess-head">오늘 완료 <span class="fw-sess-count">' + sessions.length + '</span></div>'
    + '<div class="fw-sess-list">' + sessionHtml + '</div>'
    + '</div>';

  if (running) {
    _focusTick = setInterval(function() {
      var wrap = document.getElementById('fw-dial-wrap');
      // 홈을 벗어나면 그릴 곳이 없다 → 타이머만 멈추고 세션은 그대로 둔다
      if (!wrap) { clearInterval(_focusTick); _focusTick = null; return; }
      wrap.innerHTML = focusDialSvg(focusElapsedSec(focusLoad()), true);
    }, 1000);
  }
}

// ── 6. 인생의 수레바퀴 ────────────────────
function renderHomeLifeWheel() {
  var el = document.getElementById('wheel-body');
  if (!el) return;
  var scores = [0,0,0,0,0,0,0,0];
  var labels = HOME_SECTIONS.slice();
  var colors = HOME_SEC_COLORS.slice();
  if (typeof loadLifeWheel === 'function') {
    loadLifeWheel();
    // 현재 연도 라이프휠 우선, 없으면 최신(lwCurrentYear) 연도로 폴백
    var curY = new Date().getFullYear();
    var yr = (typeof getLwYear === 'function')
      ? (getLwYear(curY) || (typeof lwCurrentYear !== 'undefined' ? getLwYear(lwCurrentYear) : null))
      : null;
    if (yr && Array.isArray(yr.sections)) {
      yr.sections.forEach(function(s, i) {
        if (i >= 8) return;
        scores[i] = s.score || 0;
        var def = (typeof LW_SECTION_DEFAULTS !== 'undefined' && LW_SECTION_DEFAULTS[i]) || {};
        var nm = s.name || def.name;
        if (nm) labels[i] = nm;
        if (s.color) colors[i] = s.color;
      });
    }
  }
  el.innerHTML = '<div class="wheel-wrap">' + buildWheelSVG(scores, labels, colors) + '</div>';
  wheelSyncLabelSize(el);
}

// SVG 글자는 viewBox 배율만큼 커져 보인다 — 카드 폭이 달라지면 크기도 달라진다.
// 다른 위젯 본문(12px)과 같아 보이도록, 그린 뒤 실제 배율을 재서 되돌려 준다.
var WHEEL_LABEL_PX = 12;
function wheelSyncLabelSize(root) {
  var svg = root.querySelector('.wheel-wrap svg');
  if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return;
  var w = svg.getBoundingClientRect().width;
  var vb = svg.viewBox.baseVal.width;
  if (!w || !vb) return;
  var units = WHEEL_LABEL_PX / (w / vb);
  svg.querySelectorAll('.wheel-label').forEach(function(t) {
    t.style.fontSize = units.toFixed(2) + 'px';
  });
}

function buildWheelSVG(scores, labels, colors) {
  if (!labels) labels = HOME_SECTIONS;
  if (!colors) colors = HOME_SEC_COLORS;
  // viewBox 안에 라벨 여백을 포함시켜 컨테이너에 꽉 차게 확대(여백 최소화, 텍스트 안 짤림)
  var CX=100,CY=100,R=82,N=8,LR=R+7;
  var pts=scores.map(function(s,i){ var a=((360/N)*i-90)*Math.PI/180,r=(s/10)*R; return (CX+r*Math.cos(a)).toFixed(1)+','+(CY+r*Math.sin(a)).toFixed(1); });
  var path='M'+pts.join('L')+'Z';
  var spokes=scores.map(function(_,i){ var a=((360/N)*i-90)*Math.PI/180; return {x:CX+R*Math.cos(a),y:CY+R*Math.sin(a)}; });
  var lbls=labels.map(function(s,i){
    var a=((360/N)*i-90)*Math.PI/180, dx=Math.cos(a), dy=Math.sin(a);
    var anchor=(Math.abs(dx)<0.3)?'middle':(dx>0?'end':'start');
    return {x:(CX+LR*dx).toFixed(1),y:(CY+LR*dy).toFixed(1),anchor:anchor,label:s,color:colors[i]};
  });
  var svg='<svg viewBox="9 9 182 182" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;">';
  [2,4,6,8,10].forEach(function(n){ svg+='<circle cx="'+CX+'" cy="'+CY+'" r="'+((n/10)*R).toFixed(1)+'" fill="none" stroke="var(--border)" stroke-width="1.1"'+(n===10?'':' stroke-dasharray="3.5,2.5"')+'/>'; });
  spokes.forEach(function(s){ svg+='<line x1="'+CX+'" y1="'+CY+'" x2="'+s.x.toFixed(1)+'" y2="'+s.y.toFixed(1)+'" stroke="var(--border)" stroke-width="1.1"/>'; });
  svg+='<path d="'+path+'" fill="rgba(79,110,247,0.12)" stroke="#4F6EF7" stroke-width="2.2" stroke-linejoin="round"/>';
  pts.forEach(function(p,i){ var c=p.split(','); svg+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="3" fill="'+colors[i]+'" stroke="var(--surface)" stroke-width="1"/>'; });
  // 라벨 글자 크기는 다른 위젯 본문(--fs-base 13px)에 맞춘다.
  // SVG 는 viewBox 기준으로 늘어나므로, 13px 로 보이도록 뷰박스 배율을 계산해 준다.
  lbls.forEach(function(l){ svg+='<text x="'+l.x+'" y="'+l.y+'" text-anchor="'+l.anchor+'" dominant-baseline="middle" class="wheel-label" fill="'+l.color+'" font-weight="600">'+l.label+'</text>'; });
  svg+='</svg>';
  return svg;
}

// ── 7. 빠른 메모 ──────────────────────────
function buildMemoWidget() {
  var el = document.getElementById('memo-body');
  if (!el) return;
  el.innerHTML = '<div class="qm-bar">'
    + '<span class="qm-circle" title="메모 저장" onclick="saveQuickMemo()"></span>'
    + '<input type="text" class="qm-input" id="quick-memo-ta" placeholder="추가" autocomplete="off"'
    + ' onkeydown="if(event.key===\'Enter\'){ saveQuickMemo(); }">'
    + '<div class="qm-icons">'
    + '<button type="button" class="qm-icon" id="qm-date-btn" title="날짜 설정" onclick="qmPickDate()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>'
    + '<span class="qm-icon-val" id="qm-date-val"></span>'
    + '</button>'
    + '<input type="date" id="qm-date" class="qm-native" onchange="qmSyncLabels()" aria-label="날짜">'
    + '</div>'
    + '</div>';
}

// 빠른 메모 바: 날짜/시간 네이티브 피커 열기 + 라벨 갱신
function qmPickDate() {
  var i = document.getElementById('qm-date');
  if (!i) return;
  if (typeof i.showPicker === 'function') { try { i.showPicker(); return; } catch (e) {} }
  i.focus();
}
function qmPickTime() {
  var i = document.getElementById('qm-time');
  if (!i) return;
  if (typeof i.showPicker === 'function') { try { i.showPicker(); return; } catch (e) {} }
  i.focus();
}
function qmSyncLabels() {
  var d = document.getElementById('qm-date'), t = document.getElementById('qm-time');
  var dBtn = document.getElementById('qm-date-btn'), tBtn = document.getElementById('qm-time-btn');
  var dVal = document.getElementById('qm-date-val'), tVal = document.getElementById('qm-time-val');
  if (d && dVal && dBtn) {
    if (d.value) { var p = d.value.split('-'); dVal.textContent = parseInt(p[1], 10) + '/' + parseInt(p[2], 10); dBtn.classList.add('is-set'); }
    else { dVal.textContent = ''; dBtn.classList.remove('is-set'); }
  }
  if (t && tVal && tBtn) {
    if (t.value) { tVal.textContent = t.value; tBtn.classList.add('is-set'); }
    else { tVal.textContent = ''; tBtn.classList.remove('is-set'); }
  }
}

function saveQuickMemo() {
  var ta = document.getElementById('quick-memo-ta');
  if (!ta || !ta.value.trim()) return;
  // 날짜/시간 아이콘 값 수집
  var dEl = document.getElementById('qm-date'), tEl = document.getElementById('qm-time');
  var dueDate = (dEl && dEl.value) ? dEl.value : null;
  var dueTime = (tEl && tEl.value) ? tEl.value : null;
  // notes.js의 createNote()로 저장 → 클라우드 페이지에서 바로 보임
  if (typeof createNote === 'function') {
    if (typeof loadNotes === 'function') loadNotes(); // 기존 메모 덮어쓰기 방지
    createNote(ta.value.trim(), dueDate, dueTime);
  } else {
    var memos = JSON.parse(localStorage.getItem('my-tasklog-notes')||'[]');
    memos.unshift({ id: Date.now()+Math.random(), text: ta.value.trim(), type:'memo', taskId:null, dueDate: dueDate, dueTime: dueTime, createdAt: new Date().toISOString() });
    localStorage.setItem('my-tasklog-notes', JSON.stringify(memos));
  }
  ta.value = '';
  // 저장 확인 토스트 (alert 제거)
  var old = document.getElementById('nb-toast');
  if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'nb-toast'; t.className = 'nb-toast'; t.textContent = '✅ 메모가 저장됐어요';
  document.body.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 300); }, 2200);

  // 홈 메모 위젯 새로고침
  if (typeof buildMemoWidget === 'function') buildMemoWidget();
  if (typeof renderHomeNotesWidget === 'function') renderHomeNotesWidget();
}

// 구글 로고 SVG (캘린더 상세에서 구글 일정 표시용)
function googleLogoSvg() {
  return '<span class="cal-detail-glogo" aria-hidden="true">'
    + '<svg width="12" height="12" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">'
    + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
    + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
    + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
    + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
    + '</svg></span>';
}

// HTML 이스케이프 (홈/위젯 공용 헬퍼)
function hwEsc(text) {
  var d = document.createElement('div');
  d.textContent = (text == null) ? '' : String(text);
  return d.innerHTML;
}

// 오늘 날짜 짧은 표기 (홈 위젯 카드 액션용)
function fmtTodayShort() {
  var d = new Date();
  var days = ['일','월','화','수','목','금','토'];
  return (d.getMonth()+1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ')';
}

// 홈 위젯 빈 상태 플레이스홀더 (아이콘 + 메시지)
function emptyWidget(icon, message) {
  var msg = String(message == null ? '' : message).split('\n').map(function(line) {
    return hwEsc(line);
  }).join('<br>');
  return '<div class="hw-empty">'
    + '<div style="font-size:24px;margin-bottom:6px;opacity:0.7;">' + (icon || '') + '</div>'
    + '<div>' + msg + '</div>'
    + '</div>';
}

// 날짜 → 'YYYY-MM-DD' 로컬 키 (캘린더/습관 로그 공용)
function fmtKey(d) {
  d = (d instanceof Date) ? d : new Date(d);
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}


// ============================================
//  🏠 홈 위젯 배치 — 6열 × 4행 격자
//  --------------------------------------------
//  위젯마다 { c, r, w, h } (왼쪽 열 · 윗 행 · 가로 칸수 · 세로 칸수)를 갖는다.
//  · 머리글을 끌어 다른 칸으로 옮긴다. 빈자리면 그냥 가고,
//    크기가 같은 위젯이 있으면 서로 자리를 바꾼다. 겹치는 배치는 만들지 않는다.
//  · 오른쪽 아래 손잡이를 끌어 칸 단위로 크기를 바꾼다.
//    작게 줄여 빈칸(여백)을 남겨 두는 것도 배치의 하나로 본다.
//  · 어떤 위젯을 띄울지는 설정 > 메뉴에서 고른다.
// ============================================
var HW_COLS = 6, HW_ROWS = 4;

// v8 — 격자가 4×3 에서 6×4 로 넓어졌다. 예전 자리·트랙 값은 칸 수가 달라 쓸 수 없다.
var HW_LKEY = 'home-layout-v8';

// 홈에 놓을 수 있는 위젯 목록 (기본 배치 · 기본 표시 여부 포함)
var HOME_WIDGETS = [
  { id:'cal-widget',       title:'Calendar',      nav:null,        body:'cal-body',        render:'renderHomeCalendar',        def:{c:1,r:1,w:2,h:2}, on:true  },
  { id:'web-widget',       title:'Web',           nav:'cloud',     body:'web-body',        render:'renderHomeWebWidget',       def:{c:3,r:1,w:2,h:2}, on:true  },
  { id:'focus-widget',     title:'Focus On',      nav:null,        body:'focus-body',      render:'renderFocusWidget',         def:{c:5,r:1,w:2,h:2}, on:true  },
  { id:'habit-widget',     title:'Habit Tracker', nav:'habit',     body:'habit-body',      render:'renderHomeHabitWidget',     def:{c:1,r:3,w:3,h:2}, on:true  },
  { id:'mandalart-widget', title:'Mandalart',     nav:'mandalart', body:'mandalart-body',  render:'renderHomeMandalartWidget', def:{c:4,r:3,w:2,h:2}, on:true  },
  { id:'wheel-widget',     title:'Life Wheel',    nav:'wheel',     body:'wheel-body',      render:'renderHomeLifeWheel',       def:{c:6,r:3,w:1,h:1}, on:true  },
  { id:'gantt-widget',     title:'Gantt',         nav:'project',   body:'gantt-body',      render:'renderHomeGanttMini',       def:{c:6,r:4,w:1,h:1}, on:false },
];

function hwDef(id) { return HOME_WIDGETS.find(function (w) { return w.id === id; }); }

function hwLoadLayout() { try { return JSON.parse(localStorage.getItem(HW_LKEY)) || {}; } catch (e) { return {}; } }
function hwSaveLayout(o) { try { localStorage.setItem(HW_LKEY, JSON.stringify(o)); } catch (e) {} }

// ── 표시 여부 ──
function hwVisible(id) {
  var L = hwLoadLayout();
  if (L.visible && typeof L.visible[id] === 'boolean') return L.visible[id];
  var d = hwDef(id);
  return d ? d.on : false;
}
function hwVisibleWidgets() { return HOME_WIDGETS.filter(function (w) { return hwVisible(w.id); }); }

function hwSetVisible(id, on) {
  var L = hwLoadLayout();
  if (!L.visible) L.visible = {};
  L.visible[id] = !!on;
  if (on) {
    // 새로 켠 위젯이 남의 자리에 겹치지 않도록, 빈 곳을 찾아 앉힌다
    if (!L.place) L.place = {};
    var d = hwDef(id);
    var spot = hwFindFreeSpot(L, id, d ? d.def.w : 1, d ? d.def.h : 1);
    if (spot) L.place[id] = spot;
  }
  hwSaveLayout(L);
  if (typeof currentMenu !== 'undefined' && currentMenu === 'home') renderHomeView();
}

// ── 배치 ──
function hwPlace(id) {
  var L = hwLoadLayout();
  var p = (L.place && L.place[id]) || (hwDef(id) || {}).def || { c:1, r:1, w:1, h:1 };
  return { c: p.c, r: p.r, w: p.w, h: p.h };
}
function hwSetPlace(id, p) {
  var L = hwLoadLayout();
  if (!L.place) L.place = {};
  L.place[id] = { c: p.c, r: p.r, w: p.w, h: p.h };
  hwSaveLayout(L);
}

// 격자 점유표 — exceptId 는 비워 둔 것으로 친다
function hwOccupancy(exceptId) {
  var grid = [];
  for (var r = 0; r <= HW_ROWS; r++) grid.push(new Array(HW_COLS + 1).fill(null));
  hwVisibleWidgets().forEach(function (w) {
    if (w.id === exceptId) return;
    var p = hwPlace(w.id);
    for (var rr = p.r; rr < p.r + p.h; rr++)
      for (var cc = p.c; cc < p.c + p.w; cc++)
        if (rr <= HW_ROWS && cc <= HW_COLS) grid[rr][cc] = w.id;
  });
  return grid;
}

function hwFits(p) {
  return p.c >= 1 && p.r >= 1 && p.w >= 1 && p.h >= 1
    && p.c + p.w - 1 <= HW_COLS && p.r + p.h - 1 <= HW_ROWS;
}
// 그 자리에 놓을 수 있는가 (격자 밖으로 나가지 않고, 남과 겹치지 않는가)
function hwAreaFree(p, exceptId) {
  if (!hwFits(p)) return false;
  var g = hwOccupancy(exceptId);
  for (var r = p.r; r < p.r + p.h; r++)
    for (var c = p.c; c < p.c + p.w; c++)
      if (g[r][c]) return false;
  return true;
}
// 그 칸을 차지하고 있는 위젯 id
function hwAt(c, r, exceptId) { return hwOccupancy(exceptId)[r] ? hwOccupancy(exceptId)[r][c] : null; }

// 켤 때 앉힐 빈자리 찾기 — 원하는 크기부터 시작해 안 되면 점점 줄인다
function hwFindFreeSpot(L, id, w, h) {
  var tries = [[w,h],[1,h],[w,1],[1,1]];
  for (var t = 0; t < tries.length; t++) {
    for (var r = 1; r <= HW_ROWS; r++) {
      for (var c = 1; c <= HW_COLS; c++) {
        var p = { c:c, r:r, w:tries[t][0], h:tries[t][1] };
        if (hwAreaFree(p, id)) return p;
      }
    }
  }
  return null;   // 자리가 없으면 저장된(또는 기본) 자리를 그대로 쓴다
}

// ── 그리기 ──────────────────────────────────
function buildHomeLayout() {
  var cards = hwVisibleWidgets().map(function (w) {
    var p = hwPlace(w.id);
    return buildCardShell(w.id, w.title, w.nav, w.body, p);
  }).join('');
  return '<div class="home-page"><div class="home-grid" id="home-grid">' + cards + '</div></div>';
}

function renderHomeView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = buildHomeLayout();
  hwVisibleWidgets().forEach(function (w) {
    var fn = window[w.render];
    if (typeof fn === 'function') { try { fn(); } catch (e) {} }
  });
  hwInitLayout();
}

// 위젯 하나만 다시 그린다 (배치가 바뀌면 내부 크기도 다시 맞춰야 한다)
function hwRerender(id) {
  var w = hwDef(id);
  if (!w) return;
  var fn = window[w.render];
  if (typeof fn === 'function') { try { fn(); } catch (e) {} }
}

// ── 배치 적용 · 손잡이 부착 ──────────────────
function hwApplyPlace(el, p) {
  el.style.gridColumn = p.c + ' / span ' + p.w;
  el.style.gridRow    = p.r + ' / span ' + p.h;
}

function hwInitLayout() {
  var grid = document.getElementById('home-grid');
  if (!grid) return;
  hwApplyTracks(grid);
  hwVisibleWidgets().forEach(function (w) {
    var el = document.getElementById(w.id);
    if (!el) return;
    hwApplyPlace(el, hwPlace(w.id));
    hwAddMoveHandle(el, w.id);
    hwAddResizeGrip(el, w.id);
  });
  hwAddGridDrop(grid);
  hwAddTrackHandles(grid);
  hwSyncResponsive();
}

// ── 칸 경계선 끌어 열 너비 · 행 높이 조정 ──────────────────
//  경계마다 얇은 손잡이를 얹는다. 격자 위에 절대 위치로 올리므로
//  칸 배치에는 끼어들지 않는다. 트랙 크기가 바뀌면 다시 놓는다.
var HW_TRACK_MIN = 60;   // 한 칸이 이보다 좁아지면 안쪽 내용이 못 버틴다

function hwAddTrackHandles(grid) {
  Array.prototype.forEach.call(grid.querySelectorAll('.hw-track'), function (el) { el.remove(); });
  var t = hwTracks(grid);
  var pos;

  pos = 0;
  for (var i = 0; i < t.cols.length - 1; i++) {
    pos += t.cols[i];
    grid.appendChild(hwMakeTrackHandle('col', i, pos + t.gapC / 2));
    pos += t.gapC;
  }
  pos = 0;
  for (var j = 0; j < t.rows.length - 1; j++) {
    pos += t.rows[j];
    grid.appendChild(hwMakeTrackHandle('row', j, pos + t.gapR / 2));
    pos += t.gapR;
  }
}

function hwMakeTrackHandle(kind, idx, offset) {
  var h = document.createElement('div');
  h.className = 'hw-track hw-track-' + kind;
  h.title = (kind === 'col') ? '드래그해 열 너비 조정' : '드래그해 행 높이 조정';
  h.style[kind === 'col' ? 'left' : 'top'] = offset + 'px';
  h.addEventListener('mousedown', function (e) { hwTrackDrag(e, kind, idx); });
  return h;
}

function hwTrackDrag(e, kind, idx) {
  e.preventDefault(); e.stopPropagation();
  var grid = document.getElementById('home-grid');
  if (!grid) return;
  var isCol = (kind === 'col');
  var t = hwTracks(grid);
  var sizes = (isCol ? t.cols : t.rows).slice();
  var start = isCol ? e.clientX : e.clientY;
  var a0 = sizes[idx], b0 = sizes[idx + 1];
  var totalPx = sizes.reduce(function (s, v) { return s + v; }, 0);
  var frs = hwTrackFr(isCol ? 'cols' : 'rows');
  var totalFr = frs.reduce(function (s, v) { return s + v; }, 0);
  var moved = sizes.slice();

  function mm(ev) {
    var d = (isCol ? ev.clientX : ev.clientY) - start;
    d = Math.max(HW_TRACK_MIN - a0, Math.min(b0 - HW_TRACK_MIN, d));
    moved = sizes.slice();
    moved[idx] = a0 + d;
    moved[idx + 1] = b0 - d;
    // 끄는 동안은 px 로 바로 반영 (fr 로 환산하면 반올림이 눈에 띈다)
    grid.style[isCol ? 'gridTemplateColumns' : 'gridTemplateRows'] =
      moved.map(function (v) { return v + 'px'; }).join(' ');
    hwSyncResponsive();
  }
  function mu() {
    document.removeEventListener('mousemove', mm);
    document.removeEventListener('mouseup', mu);
    document.body.classList.remove('hw-resizing');
    // px → fr 로 되돌려 저장한다. 창 크기가 달라져도 비율이 유지된다.
    hwSetTrackFr(isCol ? 'cols' : 'rows', moved.map(function (v) { return v / totalPx * totalFr; }));
    hwApplyTracks(grid);
    hwAddTrackHandles(grid);
    hwSyncResponsive();
  }
  document.body.classList.add('hw-resizing');
  document.addEventListener('mousemove', mm);
  document.addEventListener('mouseup', mu);
}

// ── 격자 칸 크기 (열 너비 · 행 높이) ──────────────────────
//  칸을 모두 똑같이 두지 않는다. 열마다 · 행마다 몫(fr)을 따로 갖고,
//  경계선을 끌어 그 몫을 옮긴다. 화면 폭이 달라져도 비율이 유지되도록
//  px 이 아니라 fr 로 저장한다.
function hwTrackFr(kind) {
  var L = hwLoadLayout();
  var n = (kind === 'cols') ? HW_COLS : HW_ROWS;
  var a = L[kind];
  if (Array.isArray(a) && a.length === n && a.every(function (v) { return typeof v === 'number' && v > 0; })) return a.slice();
  return new Array(n).fill(1);
}
function hwSetTrackFr(kind, arr) {
  var L = hwLoadLayout();
  L[kind] = arr.map(function (v) { return Math.round(v * 1000) / 1000; });
  hwSaveLayout(L);
}
function hwApplyTracks(grid) {
  grid.style.gridTemplateColumns = hwTrackFr('cols').map(function (f) { return f + 'fr'; }).join(' ');
  grid.style.gridTemplateRows    = hwTrackFr('rows').map(function (f) { return f + 'fr'; }).join(' ');
}

// 지금 그려진 트랙의 실제 픽셀 크기
function hwTracks(grid) {
  var cs = getComputedStyle(grid);
  return {
    cols: cs.gridTemplateColumns.split(' ').map(parseFloat),
    rows: cs.gridTemplateRows.split(' ').map(parseFloat),
    gapC: parseFloat(cs.columnGap) || 0,
    gapR: parseFloat(cs.rowGap) || 0,
    rect: grid.getBoundingClientRect()
  };
}

// 화면 좌표가 몇 번째 칸인지 (칸 크기가 제각각이므로 트랙을 훑어 찾는다)
function hwCellAt(grid, x, y) {
  var t = hwTracks(grid);
  function pick(pos, sizes, gap) {
    var acc = 0;
    for (var i = 0; i < sizes.length; i++) {
      acc += sizes[i];
      if (pos <= acc) return i + 1;
      acc += gap;
    }
    return sizes.length;
  }
  return {
    c: Math.max(1, Math.min(HW_COLS, pick(x - t.rect.left, t.cols, t.gapC))),
    r: Math.max(1, Math.min(HW_ROWS, pick(y - t.rect.top,  t.rows, t.gapR)))
  };
}

// ── 옮기기 (머리글 드래그) ──
var _hwDrag = null;
function hwAddMoveHandle(card, id) {
  var head = card.querySelector('.card-header');
  if (!head) return;
  head.setAttribute('draggable', 'true');
  head.classList.add('hw-drag-head');
  head.addEventListener('dragstart', function (e) {
    _hwDrag = { id: id };
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (_) {} }
    setTimeout(function () { card.classList.add('hw-dragging'); }, 0);
  });
  head.addEventListener('dragend', function () {
    card.classList.remove('hw-dragging');
    _hwDrag = null;
    hwClearGhost();
  });
}

function hwGhost(grid) {
  var g = grid.querySelector('.hw-ghost');
  if (!g) { g = document.createElement('div'); g.className = 'hw-ghost'; grid.appendChild(g); }
  return g;
}
function hwClearGhost() {
  var g = document.querySelector('.hw-ghost');
  if (g) g.remove();
}

// 옮길 목적지 계산: 커서가 가리키는 칸을 새 왼쪽·위 모서리로 삼되,
// 격자 밖으로 나가면 안쪽으로 당긴다.
function hwTargetPlace(grid, id, x, y) {
  var cur = hwPlace(id);
  var cell = hwCellAt(grid, x, y);
  var p = { c: cell.c, r: cell.r, w: cur.w, h: cur.h };
  p.c = Math.min(p.c, HW_COLS - p.w + 1);
  p.r = Math.min(p.r, HW_ROWS - p.h + 1);
  return p;
}

function hwAddGridDrop(grid) {
  grid.addEventListener('dragover', function (e) {
    if (!_hwDrag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    var p = hwTargetPlace(grid, _hwDrag.id, e.clientX, e.clientY);
    var ok = hwAreaFree(p, _hwDrag.id) || !!hwSwapTarget(_hwDrag.id, p);
    var g = hwGhost(grid);
    hwApplyPlace(g, p);
    g.classList.toggle('is-bad', !ok);
  });
  grid.addEventListener('drop', function (e) {
    if (!_hwDrag) return;
    e.preventDefault();
    var id = _hwDrag.id; _hwDrag = null;
    hwClearGhost();
    var p = hwTargetPlace(grid, id, e.clientX, e.clientY);
    hwMoveTo(id, p);
  });
}

// 목적지에 있는 '크기가 같은' 위젯 — 있으면 서로 자리를 바꾼다
function hwSwapTarget(id, p) {
  var other = hwAt(p.c, p.r, id);
  if (!other) return null;
  var op = hwPlace(other);
  return (op.w === p.w && op.h === p.h) ? other : null;
}

function hwMoveTo(id, p) {
  var cur = hwPlace(id);
  if (cur.c === p.c && cur.r === p.r) return;
  if (hwAreaFree(p, id)) {
    hwSetPlace(id, p);
  } else {
    var other = hwSwapTarget(id, p);
    if (!other) return;             // 겹치는 배치는 만들지 않는다
    hwSetPlace(other, { c: cur.c, r: cur.r, w: p.w, h: p.h });
    hwSetPlace(id, p);
  }
  renderHomeView();
}

// ── 크기 조정 (오른쪽 아래 손잡이) ──
function hwAddResizeGrip(card, id) {
  if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
  var grip = document.createElement('div');
  grip.className = 'hw-grip';
  grip.title = '드래그해 칸 단위로 크기 조정';
  card.appendChild(grip);

  grip.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var grid = document.getElementById('home-grid');
    if (!grid) return;
    var start = hwPlace(id);
    var last = { c:start.c, r:start.r, w:start.w, h:start.h };

    function mm(ev) {
      var cell = hwCellAt(grid, ev.clientX, ev.clientY);
      var p = { c:start.c, r:start.r, w: cell.c - start.c + 1, h: cell.r - start.r + 1 };
      p.w = Math.max(1, Math.min(HW_COLS - start.c + 1, p.w));
      p.h = Math.max(1, Math.min(HW_ROWS - start.r + 1, p.h));
      if (p.w === last.w && p.h === last.h) return;
      if (!hwAreaFree(p, id)) return;      // 남의 자리를 먹지 않는다
      last = p;
      hwApplyPlace(card, p);
    }
    function mu() {
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
      document.body.classList.remove('hw-resizing');
      if (last.w !== start.w || last.h !== start.h) {
        hwSetPlace(id, last);
        hwRerender(id);       // 안쪽 내용(달력 눈금 등)을 새 크기에 맞춘다
      }
      hwSyncResponsive();
    }
    document.body.classList.add('hw-resizing');
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });
}

// ── 크기에 반응하는 위젯들 한꺼번에 갱신 ──
function hwSyncResponsive() {
  if (typeof calSyncScale === 'function') calSyncScale();
  if (typeof habitSyncColumns === 'function') habitSyncColumns();
}

// 창 크기가 바뀌어도 안쪽이 따라오게 한다
(function watchHomeResize() {
  var t = null;
  window.addEventListener('resize', function () {
    if (!document.getElementById('home-grid')) return;
    if (t) clearTimeout(t);
    t = setTimeout(hwSyncResponsive, 100);
  });
})();