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

function renderHomeView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = buildHomeLayout();
  renderHomeCalendar();
  renderFocusWidget();
  renderHomeMandalartWidget();
  renderHomeHabitWidget();
  renderHomeWebWidget();
  renderHomeLifeWheel();
  hwInitLayout();
}

// ── 전체 레이아웃 ──────────────────────────
//  모든 위젯이 같은 자격의 카드다. 머리글을 끌어 윗줄·아랫줄 어느 자리로든
//  옮길 수 있다(자리 맞바꿈이라 줄별 개수는 그대로 유지된다).
function buildHomeLayout() {
  return '<div class="home-page">'
    + '<div class="home-grid-row1">'
    + buildCardShell('cal-widget', 'Calendar', null, 'cal-body')
    + buildCardShell('web-widget', 'Web', 'cloud', 'web-body')
    + '</div>'
    + '<div class="home-grid-row2">'
    + buildCardShell('focus-widget', 'Focus On', null, 'focus-body')
    + buildCardShell('habit-widget', 'Habit Tracker', 'habit', 'habit-body')
    + buildCardShell('mandalart-widget', 'Mandalart', 'mandalart', 'mandalart-body')
    + buildCardShell('wheel-widget', 'Life Wheel', 'wheel', 'wheel-body')
    + '</div>'
    + '</div>';
}

function buildCardShell(id, title, navTarget, bodyId) {
  var header = '';
  if (title) {
    var titleHtml = navTarget
      ? '<span class="card-title card-title-link" onclick="navToMenu(\'' + navTarget + '\')">' + title + '</span>'
      : '<span class="card-title">' + title + '</span>';
    header = '<div class="card-header">' + titleHtml + '</div>';
  }
  return '<div class="card" id="' + id + '">'
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

  var cw = availW / 7;               // 한 칸 너비
  var ch = availH / (weeks + 1);     // 한 칸 높이(요일 줄 포함)
  var unit = Math.min(cw, ch);       // 정사각형에 가까운 쪽을 기준으로

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var gap   = clamp(unit * 0.05, 1, 5);
  var fsNum = clamp(unit * 0.42, 8, 20);
  var fsDow = clamp(unit * 0.34, 7, 15);
  var today = clamp(fsNum * 1.55, 14, 32);
  var dot   = clamp(unit * 0.09, 3, 8);
  var cellH = Math.max(14, ch - gap);

  // 값이 그대로면 손대지 않는다 (ResizeObserver 가 헛돌지 않도록)
  var sig = [gap, fsNum, fsDow, today, dot, cellH].map(function (n) { return n.toFixed(2); }).join('|');
  if (body.dataset.calSig === sig) return;
  body.dataset.calSig = sig;

  body.style.setProperty('--cal-gap',    gap.toFixed(2) + 'px');
  body.style.setProperty('--cal-fs',     fsNum.toFixed(2) + 'px');
  body.style.setProperty('--cal-fs-dow', fsDow.toFixed(2) + 'px');
  body.style.setProperty('--cal-today',  today.toFixed(2) + 'px');
  body.style.setProperty('--cal-dot',    dot.toFixed(2) + 'px');
  body.style.setProperty('--cal-cell-h', cellH.toFixed(2) + 'px');
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
function collectDueDotsMap(rangeStart, rangeEnd) {
  var dotMap = {};
  var taskEventIds = {};   // Task가 이미 캘린더에 등록한 이벤트 id (중복 점 방지)
  if (typeof tasks !== 'undefined') {
    tasks.forEach(function(task) {
      if (task.calendarEventId) taskEventIds[task.calendarEventId] = true;
      var eiColor = EI_COLORS[task.eisenhower] || 'var(--text-2)';
      if (task.dueDateTime) {
        var d = new Date(task.dueDateTime);
        if (d >= rangeStart && d <= rangeEnd) {
          var k = fmtKey(d); if (!dotMap[k]) dotMap[k]=[]; dotMap[k].push(eiColor);
        }
      }
      if (Array.isArray(task.steps)) {
        task.steps.forEach(function(step) {
          if (step.dueDateTime) {
            var sd = new Date(step.dueDateTime);
            if (sd >= rangeStart && sd <= rangeEnd) {
              var sk = fmtKey(sd); if (!dotMap[sk]) dotMap[sk]=[]; dotMap[sk].push(eiColor);
            }
          }
        });
      }
    });
  }
  // 구글 캘린더에서 가져온 일정 (Task가 직접 등록한 것은 제외)
  if (typeof calendarEvents !== 'undefined') {
    calendarEvents.forEach(function(ev) {
      if (ev.calendarEventId && taskEventIds[ev.calendarEventId]) return;
      if (!ev.dueDateTime) return;
      var ed = new Date(ev.dueDateTime);
      if (ed >= rangeStart && ed <= rangeEnd) {
        var ek = fmtKey(ed); if (!dotMap[ek]) dotMap[ek]=[]; dotMap[ek].push(ev.calColor || GCAL_COLOR);
      }
    });
  }
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
}

function hpToggleHabitDay(year, sgId, actId, dateKey) {
  if (typeof toggleHabitDay === 'function') {
    toggleHabitDay(+year, sgId, actId, dateKey);
    if (typeof saveMandalarts === 'function') saveMandalarts();
    renderHomeHabitWidget();
  }
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
//  홈 위젯 레이아웃 — 크기 조정 / 위치 변경 (스크롤 없이 이웃이 보정)
// ============================================
// v6 — 위젯 구성이 바뀌면(개수·순서) 저장된 열 너비가 어긋나므로 키를 올린다.
//      (세로 묶음을 없애고 Focus On 이 2행의 독립 카드가 됐다 — 1행 2개 · 2행 4개)
var HW_LKEY = 'home-layout-v6';
var _hwDrag = null;
function hwLoadLayout() { try { return JSON.parse(localStorage.getItem(HW_LKEY)) || {}; } catch (e) { return {}; } }
function hwSaveLayout(o) { try { localStorage.setItem(HW_LKEY, JSON.stringify(o)); } catch (e) {} }
function hwRowCards(row) {
  return Array.prototype.filter.call(row.children, function (c) {
    return c.classList && c.classList.contains('card');
  });
}
function hwOrder(row) { return hwRowCards(row).map(function (c) { return c.id; }); }
// 저장된 순서대로 카드를 옮긴다. 다른 줄에 있던 카드도 이 줄로 데려온다
// (윗줄 ↔ 아랫줄 교체를 저장해 두려면 줄을 넘는 이동이 가능해야 한다).
function hwApplyOrder(row, order) {
  if (!order || !order.length) return;
  order.forEach(function (id) { var el = document.getElementById(id); if (el) row.appendChild(el); });
}

function hwInitLayout() {
  var row1 = document.querySelector('.home-grid-row1');
  var row2 = document.querySelector('.home-grid-row2');
  var page = document.querySelector('.home-page');
  if (!row1 || !row2 || !page) return;
  var L = hwLoadLayout();
  if (L.order1) hwApplyOrder(row1, L.order1);
  if (L.order2) hwApplyOrder(row2, L.order2);
  if (L.row1cols) row1.style.gridTemplateColumns = L.row1cols;
  if (L.row2cols) row2.style.gridTemplateColumns = L.row2cols;
  if (L.row2h) row2.style.height = L.row2h + 'px';

  hwAddColHandles(row1, 'row1cols');
  hwAddColHandles(row2, 'row2cols');
  hwAddRowHandle(row1, row2, page);
  hwAddReorder(row1);
  hwAddReorder(row2);
}

// ── 가로 크기 조정 (이웃 열이 반대로 보정 → 총 너비 유지) ──
function hwAddColHandles(row, key) {
  var cards = hwRowCards(row);
  cards.forEach(function (card, i) {
    if (i === cards.length - 1) return;
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    var h = document.createElement('div');
    h.className = 'hw-resize-x';
    h.title = '드래그해 너비 조정';
    card.appendChild(h);
    h.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var widths = cards.map(function (c) { return c.getBoundingClientRect().width; });
      var startX = e.clientX, MIN = 90;
      function mm(ev) {
        var d = ev.clientX - startX;
        var nd = Math.max(MIN - widths[i], Math.min(widths[i + 1] - MIN, d));
        var w = widths.slice(); w[i] += nd; w[i + 1] -= nd;
        row.style.gridTemplateColumns = w.map(function (x) { return x + 'px'; }).join(' ');
        calSyncScale();   // 끄는 동안 달력이 같이 늘고 준다
      }
      function mu() {
        document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
        document.body.classList.remove('hw-resizing');
        var Ly = hwLoadLayout(); Ly[key] = row.style.gridTemplateColumns; hwSaveLayout(Ly);
      }
      document.body.classList.add('hw-resizing');
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });
  });
}

// ── 세로 크기 조정 (두 행 경계 · row1은 flex로 자동 보정) ──
function hwAddRowHandle(row1, row2, page) {
  if (getComputedStyle(row2).position === 'static') row2.style.position = 'relative';
  var h = document.createElement('div');
  h.className = 'hw-resize-y';
  h.title = '드래그해 높이 조정';
  row2.appendChild(h);
  h.addEventListener('mousedown', function (e) {
    e.preventDefault(); e.stopPropagation();
    var startY = e.clientY, startH = row2.getBoundingClientRect().height;
    var pageH = page.getBoundingClientRect().height;
    function mm(ev) {
      var d = ev.clientY - startY;
      var nh = Math.max(140, Math.min(pageH - 200, startH - d));
      row2.style.height = nh + 'px';
      calSyncScale();
    }
    function mu() {
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
      document.body.classList.remove('hw-resizing');
      var Ly = hwLoadLayout(); Ly.row2h = Math.round(parseFloat(row2.style.height)); hwSaveLayout(Ly);
    }
    document.body.classList.add('hw-resizing');
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });
}

// ── 위치 변경 (헤더 드래그로 위젯 자리 교체) ──
//  같은 줄 안에서도, 윗줄 ↔ 아랫줄 사이에서도 바꿀 수 있다.
//  '교체(swap)'라서 두 줄의 위젯 개수는 그대로다 — 저장된 열 너비가 어긋나지 않는다.
//  (부모가 다른 두 요소를 맞바꾸므로 자리 표시자를 하나 끼워 안전하게 옮긴다)
function hwSwap(a, b) {
  if (a === b) return;
  var ph = document.createElement('span');
  a.parentNode.insertBefore(ph, a);      // a 자리에 표시자
  b.parentNode.insertBefore(a, b);       // a → b 자리
  ph.parentNode.insertBefore(b, ph);     // b → a 가 있던 자리
  ph.parentNode.removeChild(ph);
}

// 두 줄의 순서를 함께 저장한다 (줄을 넘나들면 양쪽이 다 바뀐다)
function hwSaveBothOrders() {
  var row1 = document.querySelector('.home-grid-row1');
  var row2 = document.querySelector('.home-grid-row2');
  if (!row1 || !row2) return;
  var Ly = hwLoadLayout();
  Ly.order1 = hwOrder(row1);
  Ly.order2 = hwOrder(row2);
  hwSaveLayout(Ly);
}

function hwAddReorder(row) {
  hwRowCards(row).forEach(function (card) {
    var head = card.querySelector('.card-header');
    if (!head) return;
    head.setAttribute('draggable', 'true');
    head.classList.add('hw-drag-head');
    head.addEventListener('dragstart', function (e) {
      _hwDrag = { id: card.id };
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', card.id); } catch (_) {} }
      setTimeout(function () { card.classList.add('hw-dragging'); }, 0);
    });
    head.addEventListener('dragend', function () { card.classList.remove('hw-dragging'); _hwDrag = null; });
    card.addEventListener('dragover', function (e) {
      if (!_hwDrag || _hwDrag.id === card.id) return;
      var src = document.getElementById(_hwDrag.id);
      if (!src) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('drop', function (e) {
      if (!_hwDrag) return;
      var src = document.getElementById(_hwDrag.id);
      _hwDrag = null;
      if (!src || src === card) return;
      e.preventDefault(); e.stopPropagation();
      var crossRow = (src.parentNode !== card.parentNode);
      hwSwap(src, card);
      hwSaveBothOrders();
      // 줄을 넘어간 경우엔 폭 조절 손잡이가 엉뚱한 카드에 붙어 있다 → 통째로 다시 그린다
      if (crossRow) renderHomeView();
    });
  });
}
