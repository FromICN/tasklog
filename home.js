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

// 아이젠하워 색상
var EI_COLORS = { DO:'var(--danger)', SCHEDULE:'var(--brand-primary)', DELEGATE:'var(--warning)', DROP:'var(--text-2)' };

// 구글 캘린더 일정 표시 색상
var GCAL_COLOR = '#1A73E8';

// 캘린더 위젯에서 현재 선택된 날짜 (기본: 오늘)
var homeCalSelectedKey = fmtKey(new Date());

function renderHomeView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = buildHomeLayout();
  renderHomeNotif();
  renderHomeCalendar();
  renderHomeMandalartWidget();
  renderHomeHabitWidget();
  renderHomeGanttMini();
  renderHomeLifeWheel();
  buildMemoWidget();
}

// ── 전체 레이아웃 ──────────────────────────
function buildHomeLayout() {
  return '<div class="home-page">'
    + '<div class="home-memo-row">'
    + buildCardShell('memo-widget', null, '', 'memo-body')
    + '</div>'
    + '<div class="home-grid-row1">'
    + buildCardShell('cal-widget', null, null, 'cal-body')
    + buildCardShell('gantt-widget', '📊 Gantt', 'project', 'gantt-body')
    + '</div>'
    + '<div class="home-grid-row2">'
    + buildCardShell('habit-widget', '🌱 Habit Tracker', 'mandalart', 'habit-body')
    + buildCardShell('notif-widget', '🔔 Alarm', null, 'notif-body')
    + buildCardShell('mandalart-widget', '🔮 Mandalart', 'mandalart', 'mandalart-body')
    + buildCardShell('wheel-widget', '🎡 Life Wheel', 'wheel', 'wheel-body')
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
function renderHomeNotif() {
  var el = document.getElementById('notif-body');
  if (!el) return;
  var items = [];
  var today = new Date(); today.setHours(0,0,0,0);

  // 마감 라벨 (하루 전 D-1 → 당일 → 지남)
  function _dueLabel(name, diff) {
    var clean = String(name || '').replace(/^\[\d{6}\]\s*/, '');
    if (diff > 0)  return clean + ' 마감 D-' + diff + '일';
    if (diff === 0) return clean + ' 오늘 마감';
    return clean + ' 마감 ' + Math.abs(diff) + '일 지남';
  }

  // 마감일 하루 전(D-1)부터 알림: 모든 Task + 모든 To Do(하위 단계)
  if (typeof tasks !== 'undefined') {
    tasks.forEach(function(t) {
      // 1) Task 본체
      if (!t.completed && t.dueDateTime) {
        var dueT = new Date(t.dueDateTime); dueT.setHours(0,0,0,0);
        var diffT = Math.round((dueT - today) / 86400000);
        if (diffT <= 1) {
          items.push({ type:'danger', text: _dueLabel(t.text, diffT), taskId: t.id, _d: diffT });
        }
      }
      // 2) 하위 To Do (steps)
      (t.steps || []).forEach(function(s) {
        if (s.completed || !s.dueDateTime) return;
        var dueS = new Date(s.dueDateTime); dueS.setHours(0,0,0,0);
        var diffS = Math.round((dueS - today) / 86400000);
        if (diffS <= 1) {
          items.push({ type:'danger', text: '☑ ' + _dueLabel(s.text, diffS), taskId: t.id, _d: diffS });
        }
      });
    });
    // 급한 순(지난 것 → 오늘 → 내일) 정렬
    items.sort(function(a, b){ return (a._d||0) - (b._d||0); });
  }
  var dow = today.getDay();
  if (dow === 0 || dow >= 4) {
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
    return '<div class="notif-card ' + cls + '" ' + onclick + '>' + hwEsc(item.text) + '</div>';
  }).join('');
}

// ── 2. 캘린더 위젯 ────────────────────────
function renderHomeCalendar() {
  var el = document.getElementById('cal-body');
  if (!el) return;
  var grid = (homeCalView === 'weekly') ? buildWeeklyCalGrid() : buildMonthlyCalGrid();
  el.innerHTML = grid + '<div class="cal-detail" id="cal-detail"></div>';
  renderCalDetail();
}

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
    + '<div class="cal-nav-group">'
    + '<button class="cal-nav' + (homeCalView==='monthly'?' active-view':'') + '" onclick="homeCalSetView(\'monthly\')">월간</button>'
    + '<button class="cal-nav' + (homeCalView==='weekly'?' active-view':'') + '" onclick="homeCalSetView(\'weekly\')">주간</button>'
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
  return '<div class="' + cls + '" onclick="selectCalDate(' + year + ',' + month + ',' + day + ')">'
    + '<span class="cal-num">' + day + '</span>' + dotsHtml + '</div>';
}

function buildMonthlyCalGrid() {
  var year = homeCalYear, month = homeCalMonth;
  var today = new Date();
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var DAY_KO = ['일','월','화','수','목','금','토'];

  var rangeStart = new Date(year, month, 1);
  var rangeEnd   = new Date(year, month+1, 0, 23, 59, 59);
  var dotMap = collectDueDotsMap(rangeStart, rangeEnd);

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var prevLast = new Date(year, month, 0).getDate();

  var html = buildCalHeader(year + '년 ' + MONTHS[month]);
  html += '<div class="cal-grid">';

  DAY_KO.forEach(function(d) { html += '<div class="cal-dh">' + d + '</div>'; });

  for (var i = 0; i < firstDay; i++) {
    html += '<div class="cal-cell dim"><span class="cal-num">' + (prevLast - firstDay + 1 + i) + '</span></div>';
  }

  var todayStr = fmtKey(today);
  for (var d = 1; d <= daysInMonth; d++) {
    var dt = new Date(year, month, d);
    html += buildCalDayCell(dt, todayStr, dotMap, year, month, d);
  }

  var filled = firstDay + daysInMonth;
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
        taskLogItems.push({ text: t.text, color: color, id: t.id, isCal: false, time: t.hasTime ? new Date(t.dueDateTime) : null });
      }
      if (Array.isArray(t.steps)) {
        t.steps.forEach(function(step) {
          if (step.dueDateTime && fmtKey(new Date(step.dueDateTime))===key) {
            taskLogItems.push({ text: '→ ' + step.text, color: color, id: t.id, isCal: false, time: step.hasTime ? new Date(step.dueDateTime) : null });
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

// 하단 상세 패널 렌더 (선택된 날짜의 일정 목록)
function renderCalDetail() {
  var el = document.getElementById('cal-detail');
  if (!el) return;
  var p = homeCalSelectedKey.split('-');
  var dt = new Date(+p[0], +p[1]-1, +p[2]);
  var dayStr = (dt.getMonth()+1)+'월 '+dt.getDate()+'일 ('+['일','월','화','수','목','금','토'][dt.getDay()]+')';

  var items = collectDayItems(homeCalSelectedKey);
  var html = '<div class="cal-detail-header">' + dayStr + '</div>';
  if (!items.length) {
    html += '<div class="cal-detail-empty">예정된 항목이 없습니다</div>';
  } else {
    html += items.map(function(item) {
      var timeStr = item.time
        ? '<span class="cal-detail-time">' + String(item.time.getHours()).padStart(2,'0') + ':' + String(item.time.getMinutes()).padStart(2,'0') + '</span>'
        : '';
      var badge = item.isCal ? '<span class="cal-detail-gbadge">G</span>' : '';
      var oc = item.isCal ? '' : ' onclick="openDetailPanel(' + item.id + ')"';
      var cls = 'cal-detail-item' + (item.isCal ? ' is-cal' : '');
      return '<div class="' + cls + '" style="border-left-color:' + item.color + ';"' + oc + '>'
        + timeStr + badge + '<span class="cal-detail-text">' + hwEsc(item.text) + '</span></div>';
    }).join('');
  }
  el.innerHTML = html;
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
  var html = habits.map(function(h) {
    var a = h.a, sg = h.sg, log = a.habitLog || {};
    var streak = 0;
    for (var i=0; i<365; i++) {
      var d=new Date(today.getTime()); d.setDate(d.getDate()-i);
      if (log[fmtKey(d)]) streak++; else if (i>0) break;
    }
    // 오늘 포함 최근 7일(과거→오늘) 표시 — 모든 칸 클릭 가능
    var base = new Date(today.getTime()); base.setHours(0,0,0,0);
    var dots = '';
    for (var j=6; j>=0; j--) {
      var day=new Date(base.getTime()); day.setDate(base.getDate()-j);
      var dk=fmtKey(day), done=!!log[dk], isToday=(j===0);
      var cls='habit-dot'+(done?' done':'')+(isToday?' today':'');
      var oc=' onclick="hpToggleHabitDay(\''+h.m.year+'\','+sg.id+','+a.id+',\''+dk+'\')"';
      dots += '<div class="'+cls+'"'+oc+'><span style="font-size:8px;">'+DOW[day.getDay()]+'</span></div>';
    }
    return '<div class="habit-row">'
      + '<div class="habit-info"><div class="habit-name">'+hwEsc(a.text)+'</div>'
      + '<div class="habit-meta">🔥 '+streak+'일 연속</div></div>'
      + '<div class="habit-week">'+dots+'</div>'
      + '</div>';
  }).join('');
  el.innerHTML = html;
}

function hpToggleHabitDay(year, sgId, actId, dateKey) {
  if (typeof toggleHabitDay === 'function') {
    toggleHabitDay(+year, sgId, actId, dateKey);
    if (typeof saveMandalarts === 'function') saveMandalarts();
    renderHomeHabitWidget();
  }
}

// ── 5. GANTT 미니 (GANTT 페이지 수준의 일자/진행률 상세) ──
var homeGanttYear  = new Date().getFullYear();
var homeGanttMonth = new Date().getMonth();

function homeGanttPrev() { homeGanttMonth--; if (homeGanttMonth<0) { homeGanttMonth=11; homeGanttYear--; } renderHomeGanttMini(); }
function homeGanttNext() { homeGanttMonth++; if (homeGanttMonth>11) { homeGanttMonth=0; homeGanttYear++; } renderHomeGanttMini(); }
function homeGanttToday() { homeGanttYear=new Date().getFullYear(); homeGanttMonth=new Date().getMonth(); renderHomeGanttMini(); }

var GM_LEFT = 136;
var GM_LEFT_MAX = 204;   // 최대 1.5배
var GM_MAX_ROWS = 14;
var GM_MAX_SUBROWS = 4;

// task 이름 길이에 따라 좌측 라벨 영역 폭을 동적으로 계산 (136 ~ 204px)
// 헤더/본문 정렬을 위해 모든 행에 동일 폭(--gm-left)을 적용한다.
function gmLeftWidth(taskList) {
  var maxLen = 0;
  (taskList || []).forEach(function(t) {
    var l = (t.text || '').replace(/^\[\d{6}\] /, '').length;
    if (l > maxLen) maxLen = l;
  });
  var w = GM_LEFT + Math.max(0, maxLen - 13) * 8;
  return Math.round(Math.min(GM_LEFT_MAX, Math.max(GM_LEFT, w)));
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
    if (task.lwSectionEmoji) dateLbl = task.lwSectionEmoji + ' ' + dateLbl;

    var mainRow = '<div class="gm-row" onclick="if(typeof openDetailPanel===\'function\')openDetailPanel('+task.id+')">'
      + '<div class="gm-left">'
      + progressCircleSvg(pct, color)
      + '<div class="gm-info">'
      + '<div class="gm-name" title="'+hwEsc(label)+'">'+hwEsc(shortLabel)+'</div>'
      + '<div class="gm-date">'+hwEsc(dateLbl)+'</div>'
      + '</div>'
      + '</div>'
      + '<div class="gm-grid">'
      + bgCellsHtml
      + (hasBar
          ? '<div class="gm-bar" style="left:'+barLeftPct.toFixed(3)+'%;width:'+barWPct.toFixed(3)+'%;border-color:'+color+';background:'+color+'25;">'
            + '<div class="gm-bar-fill" style="width:'+pct+'%;background:'+color+';"></div></div>'
          : '')
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
}

// 하위 to-do(task.steps)를 GANTT 미니 그리드에 서브로우로 표시
function buildGanttSubRows(task, mS, mE, daysInMonth, color, bgCellsHtml) {
  var steps = task.steps || [];
  if (!steps.length) return '';
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
      + (hasDot ? '<div class="gm-sub-dot" style="left:'+leftPct.toFixed(3)+'%;background:'+color+';"></div>' : '')
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
  var svg='<svg viewBox="4 4 192 192" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;">';
  [2,4,6,8,10].forEach(function(n){ svg+='<circle cx="'+CX+'" cy="'+CY+'" r="'+((n/10)*R).toFixed(1)+'" fill="none" stroke="var(--border)" stroke-width="1.1"'+(n===10?'':' stroke-dasharray="3.5,2.5"')+'/>'; });
  spokes.forEach(function(s){ svg+='<line x1="'+CX+'" y1="'+CY+'" x2="'+s.x.toFixed(1)+'" y2="'+s.y.toFixed(1)+'" stroke="var(--border)" stroke-width="1.1"/>'; });
  svg+='<path d="'+path+'" fill="rgba(79,110,247,0.12)" stroke="#4F6EF7" stroke-width="2.2" stroke-linejoin="round"/>';
  pts.forEach(function(p,i){ var c=p.split(','); svg+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="3" fill="'+colors[i]+'" stroke="var(--surface)" stroke-width="1"/>'; });
  lbls.forEach(function(l){ svg+='<text x="'+l.x+'" y="'+l.y+'" text-anchor="'+l.anchor+'" dominant-baseline="middle" font-size="11" fill="'+l.color+'" font-weight="600" font-family="Pretendard,sans-serif">'+l.label+'</text>'; });
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
