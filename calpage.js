// =============================================================
//  📅 Calendar 페이지 (사이드바 메뉴) — 본문을 구글 캘린더 구성으로
//   · 일·주·월·목록 = FullCalendar 표준판(fullcalendar.min.js, MIT)
//   · 연도 보기·검색 결과 = 이 파일이 직접 그린다.
//     한 해 1000건을 칸마다 글자로 찍으면 읽을 수 없어서, 연도 보기는 양만 칠한다.
//   · Task = Due 날짜에 한 줄 / To Do = 자기 마감일에 한 줄 / 완료는 기본 숨김
//     Task 203건이 모두 Start·Due 를 갖고 있어 막대로 그리면 달력이 덮인다.
//   · Google 일정 = 읽기 전용. 가져오기를 하기 전까지 보기만 한다.
// =============================================================

var CAL_VIEWS = [
  { id: 'day',   label: '일',   fc: 'timeGridDay'  },
  { id: 'week',  label: '주',   fc: 'timeGridWeek' },
  { id: 'month', label: '월',   fc: 'dayGridMonth' },
  { id: 'year',  label: '연',   fc: null           },
  { id: 'list',  label: '목록', fc: 'listYear'     },
];
var CAL_DOW = ['일', '월', '화', '수', '목', '금', '토'];
var CAL_NO_PROJECT_COLOR = 'var(--text-3)';
var CAL_LOCALE_KO = {
  code: 'ko',
  buttonText: { today: '오늘', month: '월', week: '주', day: '일', list: '목록' },
  weekText: '주', allDayText: '종일', moreLinkText: '개', noEventsText: '표시할 항목이 없습니다',
};
var CAL_RESULT_MAX = 200;

var _cal = {
  fc: null,            // FullCalendar 인스턴스 (화면을 떠나면 다음 렌더 때 정리한다)
  ro: null,            // 본문 크기 감시 — 사이드바를 접어도 달력이 따라오게 한다
  view: null,          // 'day' | 'week' | 'month' | 'year' | 'list'
  date: new Date(),    // 지금 보고 있는 날짜 (메뉴를 옮겨도 유지, 앱을 다시 켜면 오늘)
  query: '',
  queryTimer: null,
  results: [],
  menu: null,          // 열려 있는 상단 메뉴: 'mini' | 'show'
  miniY: 0, miniM: 0,
  scrollTo: null,      // 목록 보기에서 맞춰 줄 날짜
};

// ── 작은 도구 ──
function _calPad(n) { return String(n).padStart(2, '0'); }
function _calKey(d) { return d.getFullYear() + '-' + _calPad(d.getMonth() + 1) + '-' + _calPad(d.getDate()); }
function _calEl(id) { return document.getElementById(id); }
function _calEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _calCleanTitle(text) { return String(text || '').replace(/^\[\d{6}\]\s*/, ''); }
function _calProfile() { return (typeof appMenuProfile === 'function') ? appMenuProfile() : 'desktop'; }
function _calLoad(key, fallback) {
  try {
    var v = JSON.parse(localStorage.getItem(key));
    return (v && typeof v === 'object') ? v : fallback;
  } catch (e) { return fallback; }
}
function _calSave(key, val) {
  try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (e) {}
}
function _calFirstDay() { return (typeof appWeekStart === 'function' && appWeekStart() === 'sun') ? 0 : 1; }
function _calViewDef(id) { return CAL_VIEWS.find(function (v) { return v.id === id; }) || CAL_VIEWS[1]; }

// PC 는 주, 폰은 목록이 기본. 마지막에 본 보기를 기기별로 기억한다.
function _calInitialView() {
  var saved = null;
  try { saved = localStorage.getItem('cal-view-' + _calProfile()); } catch (e) {}
  if (CAL_VIEWS.some(function (v) { return v.id === saved; })) return saved;
  return _calProfile() === 'mobile' ? 'list' : 'week';
}

// ── 무엇을 보여 줄지 (기기별) ──
function calShow() {
  var s = _calLoad('cal-show', {});
  return { task: s.task !== false, todo: s.todo !== false, done: s.done === true };
}
function calSetShow(key, on) {
  var s = calShow();
  s[key] = !!on;
  _calSave('cal-show', s);
  calRefresh();
}

// ── Task·To Do → 달력 항목 ──
//  색 = 그 Task 가 걸린 Mandalart Section 의 색. Project 가 없으면 회색.
function calTaskColor(t) {
  var a = t.mdtAction || t.mdtGoal;
  if (!a || a.sgId === null || a.sgId === undefined) return CAL_NO_PROJECT_COLOR;
  var idx = parseInt(a.sgId, 10) - 1;
  if (isNaN(idx) || typeof getSectionThemeColor !== 'function') return CAL_NO_PROJECT_COLOR;
  return getSectionThemeColor(idx, a.year);
}
// Task 를 달력 어디에 놓을지 — Start·Due 의 시간에 따라 정한다.
//  · 같은 날 시작·마감 시간이 다 있으면 그 사이를 칸으로 그린다 (anchor 'both')
//  · 같은 날인데 시작 시간만 있으면, 또는 Due 없이 시작 시간만 있으면 시작 시각에 (anchor 'start')
//  · 나머지는 Due 날짜에 한 줄, Due 에 시간이 있으면 그 시각에 (anchor 'due')
//    날짜가 다른 시작·마감은 막대로 그리지 않는다 — Task 대부분이 며칠짜리라 달력이 덮인다.
function _calTaskPlace(t) {
  var due = t.dueDateTime ? new Date(t.dueDateTime) : null;
  var start = t.startDate ? new Date(t.startDate) : null;
  if (due && isNaN(due.getTime())) due = null;
  if (start && isNaN(start.getTime())) start = null;
  var startTimed = !!(start && t.startHasTime);
  if (!due) return startTimed ? { date: start, hasTime: true, anchor: 'start' } : null;
  if (startTimed && _calKey(start) === _calKey(due)) {
    if (!t.hasTime) return { date: start, hasTime: true, anchor: 'start' };
    if (start < due) return { date: start, end: due, hasTime: true, anchor: 'both' };
  }
  return { date: due, hasTime: !!t.hasTime, anchor: 'due' };
}
function calCollectItems() {
  var out = [];
  mdtAllTasks().forEach(function (t) {
    var color = calTaskColor(t);
    var place = _calTaskPlace(t);
    if (place) {
      out.push({ kind: 'task', taskId: t.id, title: _calCleanTitle(t.text), date: place.date, end: place.end, anchor: place.anchor, hasTime: place.hasTime, done: !!t.completed, color: color });
    }
    (t.steps || []).forEach(function (s) {
      if (!s.dueDateTime) return;
      var sd = new Date(s.dueDateTime);
      if (isNaN(sd.getTime())) return;
      // Task 를 닫았으면 그 아래 To Do 도 끝난 것으로 본다
      out.push({ kind: 'step', taskId: t.id, stepId: s.id, title: _calCleanTitle(s.text), parent: _calCleanTitle(t.text), date: sd, hasTime: !!s.hasTime, done: !!s.completed || !!t.completed, color: color });
    });
  });
  return out;
}
function calItemVisible(it, show) {
  if (it.kind === 'task' && !show.task) return false;
  if (it.kind === 'step' && !show.todo) return false;
  if (it.done && !show.done) return false;
  return true;
}
function _calItemToFc(it) {
  return {
    id: it.kind === 'task' ? ('t' + it.taskId) : ('s' + it.taskId + '_' + it.stepId),
    title: it.title,
    start: it.hasTime ? it.date : _calKey(it.date),
    end: it.end || undefined,
    allDay: !it.hasTime,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    classNames: ['tlc-item', 'tlc-k-' + it.kind].concat(it.done ? ['tlc-is-done'] : []),
    extendedProps: { kind: it.kind, taskId: it.taskId, stepId: it.stepId, parent: it.parent || '', done: it.done, color: it.color, anchor: it.anchor || 'due' },
  };
}

// ── Google 일정 (읽기 전용) ─────────────────────────────────
//  · 공공의 자아와 기본 캘린더만 기본으로 켠다. 나머지는 표시 메뉴에서 켤 수 있다.
//  · 받은 값은 이 기기 localStorage 에만 둔다(동기화·백업 대상이 아니다). 폰은 Google 토큰이
//    금방 끊기므로, 끊긴 동안에도 마지막으로 받은 일정을 보여 주기 위해서다.
var CAL_GCAL_CACHE_KEY = 'cal-gcal-cache-v1';
var CAL_GCAL_TTL = 10 * 60 * 1000;
var CAL_GCAL_RETRY = 60 * 1000;
var CAL_GCAL_DEFAULT_NAMES = ['공공의 자아'];
var CAL_GCAL_KEEP_YEARS = 6;
var _calG = { store: null, listed: false, palette: null, busy: {}, failedAt: {} };

// 한 해에 약 56KB 다. 지난 해들을 넘겨 보다 저장소가 차면 동기화까지 막히므로 최근에 받은 해만 남긴다.
function calGTrimCache() {
  var ev = calGStore().ev, latest = {};
  Object.keys(ev).forEach(function (k) {
    var y = k.split('|').pop();
    latest[y] = Math.max(latest[y] || 0, ev[k].at || 0);
  });
  var old = Object.keys(latest).sort(function (a, b) { return latest[b] - latest[a]; }).slice(CAL_GCAL_KEEP_YEARS);
  if (!old.length) return;
  Object.keys(ev).forEach(function (k) {
    if (old.indexOf(k.split('|').pop()) >= 0) delete ev[k];
  });
}

function calGStore() {
  if (!_calG.store) {
    var s = _calLoad(CAL_GCAL_CACHE_KEY, {});
    _calG.store = { cals: Array.isArray(s.cals) ? s.cals : [], ev: (s.ev && typeof s.ev === 'object') ? s.ev : {} };
  }
  return _calG.store;
}
function calGEnabled(cal) {
  var on = _calLoad('cal-google-on', {});
  if (on[cal.id] === true || on[cal.id] === false) return on[cal.id];
  return !!cal.primary || CAL_GCAL_DEFAULT_NAMES.indexOf(cal.name) >= 0;
}
function calGSetEnabled(calId, on) {
  var s = _calLoad('cal-google-on', {});
  s[calId] = !!on;
  _calSave('cal-google-on', s);
  calRefresh();
}
function calGReady() {
  try {
    return typeof isSignedIn === 'function' && isSignedIn()
      && !!(window.gapi && gapi.client && gapi.client.calendar);
  } catch (e) { return false; }
}
function _calGIsFresh(cal, year) {
  var c = calGStore().ev[cal.id + '|' + year];
  return !!(c && Date.now() - c.at < CAL_GCAL_TTL);
}
async function calGLoadCals() {
  if (_calG.listed) return;
  var resp = await gapi.client.calendar.calendarList.list({ maxResults: 250 });
  var items = (resp.result && resp.result.items) || [];
  calGStore().cals = items.map(function (c) {
    return {
      id: c.id,
      name: c.summaryOverride || c.summary || c.id,
      color: (typeof gcalModernColor === 'function' ? gcalModernColor(c.backgroundColor) : c.backgroundColor) || '#4285f4',
      primary: !!c.primary,
    };
  });
  try {
    var colors = await gapi.client.calendar.colors.get();
    _calG.palette = (colors.result && colors.result.event) || {};
  } catch (e) { _calG.palette = {}; }
  _calG.listed = true;
}
async function calGFetchYear(cal, year) {
  var out = [], token = null, pages = 0;
  do {
    var params = {
      calendarId: cal.id,
      timeMin: new Date(year, 0, 1).toISOString(),
      timeMax: new Date(year + 1, 0, 1).toISOString(),
      singleEvents: true, showDeleted: false, orderBy: 'startTime', maxResults: 2500,
    };
    if (token) params.pageToken = token;
    var resp = await gapi.client.calendar.events.list(params);
    ((resp.result && resp.result.items) || []).forEach(function (ev) {
      if (!ev.start || ev.status === 'cancelled') return;
      var pal = ev.colorId && _calG.palette ? _calG.palette[ev.colorId] : null;
      var color = pal && pal.background ? (typeof gcalModernColor === 'function' ? gcalModernColor(pal.background) : pal.background) : cal.color;
      out.push({
        id: ev.id, cal: cal.id,
        title: ev.summary || '(제목 없음)',
        start: ev.start.dateTime || ev.start.date,
        end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
        allDay: !ev.start.dateTime,
        color: color,
        link: ev.htmlLink || '',
        loc: ev.location || '',
        desc: String(ev.description || '').slice(0, 500),
      });
    });
    token = resp.result && resp.result.nextPageToken;
  } while (token && ++pages < 10);
  return out;
}
async function calGLoadYear(year) {
  var key = 'y' + year;
  if (_calG.busy[key] || !calGReady()) return;
  if (_calG.failedAt[key] && Date.now() - _calG.failedAt[key] < CAL_GCAL_RETRY) return;
  _calG.busy[key] = true;
  var changed = false;
  try {
    var hadList = _calG.listed;
    await calGLoadCals();
    if (!hadList) changed = true;
    var store = calGStore();
    var targets = store.cals.filter(function (c) { return calGEnabled(c) && !_calGIsFresh(c, year); });
    for (var i = 0; i < targets.length; i++) {
      store.ev[targets[i].id + '|' + year] = { at: Date.now(), items: await calGFetchYear(targets[i], year) };
      changed = true;
    }
    delete _calG.failedAt[key];
  } catch (e) {
    _calG.failedAt[key] = Date.now();
    console.warn('Google 일정을 불러오지 못했습니다(마지막으로 받은 값을 보여 줍니다).', e);
  } finally {
    _calG.busy[key] = false;
  }
  if (changed) {
    calGTrimCache();
    _calSave(CAL_GCAL_CACHE_KEY, calGStore());
    if (typeof currentMenu !== 'undefined' && currentMenu === 'calendar') calRefresh();
  }
}
function calGNeed(start, end) {
  var y1 = new Date(end.getTime() - 1).getFullYear();
  for (var y = start.getFullYear(); y <= y1; y++) calGLoadYear(y);
}
// 켜 둔 캘린더의 일정을 겹치지 않게 모은다. Task 가 직접 등록한 일정은 결국 그 Task 라서 뺀다.
function calGItems() {
  var store = calGStore(), on = {}, seen = {}, out = [];
  store.cals.forEach(function (c) { if (calGEnabled(c)) on[c.id] = c; });
  var linked = {};
  mdtAllTasks().forEach(function (t) {
    if (t.calendarEventId) linked[t.calendarEventId] = true;
    (t.steps || []).forEach(function (s) { if (s.calendarEventId) linked[s.calendarEventId] = true; });
  });
  Object.keys(store.ev).forEach(function (k) {
    (store.ev[k].items || []).forEach(function (ev) {
      if (!on[ev.cal] || linked[ev.id]) return;
      var uid = ev.cal + '|' + ev.id;
      if (seen[uid]) return;
      seen[uid] = true;
      out.push(ev);
    });
  });
  return out;
}
// 'YYYY-MM-DD' 를 그대로 new Date 하면 UTC 자정이 된다 → 현지 날짜로 읽는다
function _calParseG(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
}
function _calGSpan(ev) {
  var s = _calParseG(ev.start);
  var e = ev.end ? _calParseG(ev.end) : new Date(s.getTime() + 1);
  return [s, e > s ? e : new Date(s.getTime() + 1)];
}
function _calInk(hex) {
  var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  var n = parseInt(m[1], 16);
  var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.68 ? '#1b1f1c' : '#fff';
}
function _calGToFc(ev) {
  return {
    id: 'g' + ev.cal + '|' + ev.id,
    title: ev.title,
    start: ev.allDay ? ev.start : _calParseG(ev.start),
    end: ev.end ? (ev.allDay ? ev.end : _calParseG(ev.end)) : undefined,
    allDay: !!ev.allDay,
    backgroundColor: ev.color, borderColor: ev.color, textColor: _calInk(ev.color),
    editable: false,
    classNames: ['tlc-google'],
    extendedProps: { kind: 'google', g: ev, color: ev.color },
  };
}

// ── FullCalendar ──
function calFcEvents(start, end) {
  var show = calShow(), out = [];
  calCollectItems().forEach(function (it) {
    if (!calItemVisible(it, show)) return;
    if (it.date < start || it.date >= end) return;
    out.push(_calItemToFc(it));
  });
  calGItems().forEach(function (ev) {
    var span = _calGSpan(ev);
    if (span[0] < end && span[1] > start) out.push(_calGToFc(ev));
  });
  return out;
}
function _calMarkHtml(kind, color, done) {
  return '<i class="tlc-mark tlc-mark-' + kind + (done ? ' is-done' : '') + '" style="--tlc-c:' + _calEsc(color) + '"></i>';
}
function calEnsureFc() {
  if (_cal.fc) return _cal.fc;
  var el = _calEl('tlc-fc');
  if (!el || typeof FullCalendar === 'undefined') return null;
  _cal.fc = new FullCalendar.Calendar(el, {
    locale: CAL_LOCALE_KO,
    headerToolbar: false,
    initialView: _calViewDef(_cal.view).fc || 'timeGridWeek',
    initialDate: _cal.date,
    firstDay: _calFirstDay(),
    height: '100%',
    nowIndicator: true,
    scrollTime: '07:00:00',
    slotDuration: '00:30:00',
    snapDuration: '00:15:00',
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dayMaxEvents: true,
    fixedWeekCount: false,
    navLinks: true,
    navLinkDayClick: function (date) { calGoDate(_calKey(date), 'day'); },
    editable: true,
    eventDurationEditable: false,
    moreLinkContent: function (arg) { return '+' + arg.num; },
    views: {
      // 종일 칸은 3줄까지만. 위쪽을 다 먹으면 시간 칸이 안 보인다
      timeGrid: { dayMaxEvents: false, dayMaxEventRows: 3 },
      timeGridDay: { titleFormat: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' } },
      // 끝 시각까지 적으면 시간 칸이 폰 폭의 1/3 을 먹는다. 끝 시각은 눌렀을 때 요약에서 본다
      listYear: { listDayFormat: { month: 'long', day: 'numeric', weekday: 'short' }, listDaySideFormat: false, displayEventEnd: false },
    },
    dayHeaderContent: function (arg) {
      // ⚠️ FullCalendar 는 true 를 돌려줘야 기본 내용을 그린다. undefined 면 빈칸이 된다.
      if (arg.view.type.indexOf('list') === 0) return true;   // 목록의 날짜 줄은 listDayFormat 이 그린다
      var label = CAL_DOW[arg.date.getDay()];
      if (arg.view.type === 'dayGridMonth') return label;
      return { html: '<span class="tlc-head-dow">' + label + '</span><span class="tlc-dnum' + (arg.isToday ? ' is-now' : '') + '">' + arg.date.getDate() + '</span>' };
    },
    dayCellContent: function (arg) {
      if (arg.view.type !== 'dayGridMonth') return '';    // 주·일은 머리글이 이미 날짜를 보여 준다
      var d = arg.date;
      var text = (d.getDate() === 1) ? ((d.getMonth() + 1) + '월 1일') : String(d.getDate());
      return { html: '<span class="tlc-dnum' + (arg.isToday ? ' is-now' : '') + (d.getDate() === 1 ? ' is-first' : '') + '">' + text + '</span>' };
    },
    events: function (info, ok) {
      ok(calFcEvents(info.start, info.end));
      calGNeed(info.start, info.end);
    },
    eventContent: function (arg) {
      var p = arg.event.extendedProps, isList = arg.view.type.indexOf('list') === 0;
      if (p.kind === 'google' && !isList) return true;   // 구글 일정은 기본 막대 그대로
      var time = (!isList && arg.timeText) ? '<span class="tlc-time">' + _calEsc(arg.timeText) + '</span>' : '';   // 목록은 시간 칸이 따로 있다
      return { html: '<span class="tlc-ev">' + _calMarkHtml(p.kind, p.color, p.done) + time + '<span class="tlc-tt">' + _calEsc(arg.event.title) + '</span></span>' };
    },
    eventDidMount: function (info) {
      var p = info.event.extendedProps;
      if (p.color) info.el.style.setProperty('--tlc-c', p.color);
      info.el.title = (p.parent ? p.parent + ' › ' : '') + info.event.title;
    },
    eventClick: function (info) {
      info.jsEvent.preventDefault();
      var p = info.event.extendedProps;
      if (p.kind === 'google') calGooglePop(p.g, info.el);
      else calOpenEvent(p.taskId);
    },
    eventDrop: function (info) { if (!calMoveItem(info.event)) info.revert(); },
    datesSet: function () {
      _cal.date = _cal.fc.getDate();
      calSyncTools();
    },
    eventsSet: function () {
      if (_cal.scrollTo) setTimeout(calScrollList, 0);
    },
  });
  _cal.fc.render();
  return _cal.fc;
}
function calDestroyFc() {
  if (_cal.ro) { try { _cal.ro.disconnect(); } catch (e) {} _cal.ro = null; }
  if (_cal.fc) { try { _cal.fc.destroy(); } catch (e) {} _cal.fc = null; }
}
function _calIso(d) { return _calKey(d) + 'T' + _calPad(d.getHours()) + ':' + _calPad(d.getMinutes()) + ':00'; }
// 끌어다 놓기 — Due(To Do 는 마감일)를 옮긴다. 시작 시각에 놓인 Task 는 시작과 마감을 함께 옮긴다.
function _calFindItem(p) {
  var t = mdtAllTasks().find(function (x) { return x.id === p.taskId; });
  if (!t) return null;
  if (p.kind === 'task') return { obj: t, task: t };
  var s = (t.steps || []).find(function (x) { return x.id === p.stepId; });
  return s ? { obj: s, task: t } : null;
}
function calMoveItem(ev) {
  var p = ev.extendedProps;
  var found = _calFindItem(p);
  if (!found) return false;
  var d = ev.start, key = _calKey(d), obj = found.obj;
  if (p.kind === 'task' && (p.anchor === 'start' || p.anchor === 'both')) {
    obj.startDate = ev.allDay ? (key + 'T09:00:00') : _calIso(d);
    obj.startHasTime = !ev.allDay;
    if (obj.dueDateTime) {
      var timedEnd = (!ev.allDay && p.anchor === 'both' && ev.end) ? ev.end : null;
      obj.dueDateTime = timedEnd ? _calIso(timedEnd) : (key + 'T09:00:00');
      obj.hasTime = !!timedEnd;
    }
  } else {
    obj.dueDateTime = ev.allDay ? (key + 'T09:00:00') : _calIso(d);
    obj.hasTime = !ev.allDay;
    // Start 보다 앞으로 옮기면 기간이 뒤집혀 Gantt 막대가 사라진다 → Start 를 따라 당긴다
    if (p.kind === 'task' && obj.startDate && String(obj.startDate).slice(0, 10) > key) {
      obj.startDate = key + String(obj.startDate).slice(10);
    }
  }
  if (typeof saveTasks === 'function') saveTasks();
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
  calRefresh();
  return true;
}
function calOpenEvent(taskId) {
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
}
function calCreate() {
  calCloseMenus();
  if (typeof openNewTaskPanel === 'function') openNewTaskPanel(null);
}
// 목록 보기: 이번 해 전체를 그리므로 오늘(또는 고른 날)로 맞춰 준다
function calScrollList() {
  var key = _cal.scrollTo;
  _cal.scrollTo = null;
  if (!key || !_cal.fc || _cal.fc.view.type.indexOf('list') !== 0) return;
  var root = _calEl('tlc-fc');
  var sc = root && root.querySelector('.fc-scroller');
  if (!sc) return;
  var rows = root.querySelectorAll('.fc-list-day[data-date]');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('data-date') >= key) { sc.scrollTop = rows[i].offsetTop; return; }
  }
  if (rows.length) sc.scrollTop = sc.scrollHeight;
}

// ── 상단 도구 ──
function calToolsHtml() {
  var views = CAL_VIEWS.map(function (v) {
    return '<button type="button" class="tlc-seg-btn" data-view="' + v.id + '" onclick="calSetView(\'' + v.id + '\')">' + v.label + '</button>';
  }).join('');
  return '<div class="tlc-tools">'
    + '<div class="tlc-group tlc-group-nav">'
    +   '<button type="button" class="tlc-btn tlc-create" onclick="calCreate()" aria-label="만들기"><span aria-hidden="true">+</span><span class="tlc-create-label"> 만들기</span></button>'
    +   '<button type="button" class="tlc-btn" onclick="calToday()">오늘</button>'
    +   '<button type="button" class="tlc-btn tlc-icon" onclick="calStep(-1)" aria-label="이전">‹</button>'
    +   '<button type="button" class="tlc-btn tlc-icon" onclick="calStep(1)" aria-label="다음">›</button>'
    +   '<span class="tlc-menu-wrap">'
    +     '<button type="button" class="tlc-title" id="tlc-title" onclick="calToggleMenu(\'mini\')" aria-label="날짜 고르기"></button>'
    +     '<div class="tlc-menu" id="tlc-menu-mini" hidden></div>'
    +   '</span>'
    + '</div>'
    + '<div class="tlc-group tlc-group-side">'
    +   '<label class="tlc-search">'
    +     '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
    +     '<input type="search" id="tlc-search" placeholder="검색" aria-label="일정 검색" oninput="calSearchInput(this.value)">'
    +   '</label>'
    +   '<span class="tlc-menu-wrap">'
    +     '<button type="button" class="tlc-btn" onclick="calToggleMenu(\'show\')">표시 ▾</button>'
    +     '<div class="tlc-menu tlc-menu-right" id="tlc-menu-show" hidden></div>'
    +   '</span>'
    +   '<div class="tlc-seg" role="group" aria-label="보기">' + views + '</div>'
    + '</div>'
    + '</div>';
}
function calSyncTools() {
  var title = _calEl('tlc-title');
  if (title) {
    var text;
    if (_cal.query) text = '검색 결과';
    else if (_cal.view === 'year') text = _cal.date.getFullYear() + '년';
    else if (_cal.view === 'list') text = _cal.date.getFullYear() + '년 목록';
    else text = _cal.fc ? _cal.fc.view.title : '';
    title.textContent = text + ' ▾';
  }
  document.querySelectorAll('.tlc-seg-btn').forEach(function (b) {
    b.classList.toggle('is-on', !_cal.query && b.getAttribute('data-view') === _cal.view);
  });
}
function calSetView(id) {
  calCloseMenus();
  _cal.view = _calViewDef(id).id;
  _calSave('cal-view-' + _calProfile(), _cal.view);
  _cal.scrollTo = (_cal.view === 'list') ? _calKey(_cal.date) : null;
  _calClearSearch();
  calRefresh();
}
function calStep(dir) {
  calCloseMenus();
  _calClearSearch();
  if (_cal.view === 'year') {
    _cal.date = new Date(_cal.date.getFullYear() + dir, _cal.date.getMonth(), 1);
    calRefresh();
    return;
  }
  var fc = calEnsureFc();
  if (!fc) return;
  calSyncBody();
  if (dir < 0) fc.prev(); else fc.next();
}
function calToday() {
  calCloseMenus();
  _calClearSearch();
  _cal.date = new Date();
  if (_cal.view === 'list') _cal.scrollTo = _calKey(_cal.date);
  if (_cal.fc) _cal.fc.gotoDate(_cal.date);
  calRefresh();
}
function calGoDate(key, view) {
  calCloseMenus();
  _calClearSearch();
  var p = key.split('-');
  _cal.date = new Date(+p[0], +p[1] - 1, +p[2]);
  if (view) { _cal.view = view; _calSave('cal-view-' + _calProfile(), view); }
  if (_cal.view === 'list') _cal.scrollTo = key;
  if (_cal.fc) _cal.fc.gotoDate(_cal.date);
  calRefresh();
}

// ── 날짜 칸 (미니 달력 · 연도 보기 공용) ──
function calMonthGridHtml(y, m, opts) {
  var todayKey = _calKey(new Date());
  var lead = (typeof weekLeadOffset === 'function') ? weekLeadOffset(new Date(y, m, 1).getDay()) : new Date(y, m, 1).getDay();
  var days = new Date(y, m + 1, 0).getDate();
  var heads = ((typeof weekDayOrder === 'function') ? weekDayOrder() : CAL_DOW).map(function (d) {
    return '<span class="tlc-mg-dow">' + d + '</span>';
  }).join('');
  var cells = '';
  for (var i = 0; i < lead; i++) cells += '<span></span>';
  for (var d = 1; d <= days; d++) {
    var key = y + '-' + _calPad(m + 1) + '-' + _calPad(d);
    var n = opts.counts ? (opts.counts[key] || 0) : 0;
    var lvl = n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
    cells += '<button type="button" class="tlc-mg-d' + (lvl ? ' lvl-' + lvl : '')
      + (key === todayKey ? ' is-now' : '') + (key === opts.selected ? ' is-sel' : '') + '"'
      + (n ? ' title="' + (m + 1) + '월 ' + d + '일 · ' + n + '건"' : '')
      + ' onclick="' + opts.onclick + '(\'' + key + '\')">' + d + '</button>';
  }
  return '<div class="tlc-mg">' + heads + cells + '</div>';
}

// ── 상단 메뉴: 미니 달력 / 표시 ──
function calCloseMenus() {
  _cal.menu = null;
  ['mini', 'show'].forEach(function (k) { var el = _calEl('tlc-menu-' + k); if (el) el.hidden = true; });
}
function calToggleMenu(name) {
  var was = _cal.menu;
  calCloseMenus();
  if (was === name) return;
  _cal.menu = name;
  if (name === 'mini') { _cal.miniY = _cal.date.getFullYear(); _cal.miniM = _cal.date.getMonth(); calRenderMini(); }
  else calRenderShowMenu();
  var el = _calEl('tlc-menu-' + name);
  if (el) el.hidden = false;
}
function calRenderMini() {
  var el = _calEl('tlc-menu-mini');
  if (!el) return;
  el.innerHTML = '<div class="tlc-mini-head">'
    + '<button type="button" class="tlc-btn tlc-icon" onclick="calMiniStep(-1)" aria-label="이전 달">‹</button>'
    + '<span>' + _cal.miniY + '년 ' + (_cal.miniM + 1) + '월</span>'
    + '<button type="button" class="tlc-btn tlc-icon" onclick="calMiniStep(1)" aria-label="다음 달">›</button>'
    + '</div>' + calMonthGridHtml(_cal.miniY, _cal.miniM, { selected: _calKey(_cal.date), onclick: 'calMiniPick' });
}
function calMiniStep(dir) {
  var d = new Date(_cal.miniY, _cal.miniM + dir, 1);
  _cal.miniY = d.getFullYear();
  _cal.miniM = d.getMonth();
  calRenderMini();
}
function calMiniPick(key) { calGoDate(key, _cal.view === 'year' ? 'day' : null); }
function calRenderShowMenu() {
  var el = _calEl('tlc-menu-show');
  if (!el) return;
  var show = calShow();
  function row(checked, onchange, mark, label) {
    return '<label class="tlc-check"><input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="' + onchange + '">' + mark + '<span>' + label + '</span></label>';
  }
  var cals = calGStore().cals;
  var google = cals.length
    ? cals.map(function (c) {
        return row(calGEnabled(c), 'calGSetEnabled(\'' + _calEsc(c.id) + '\',this.checked)', _calMarkHtml('google', c.color, true), _calEsc(c.name));
      }).join('')
    : '<div class="tlc-menu-note">Google 로그인 후 표시됩니다</div>';
  el.innerHTML = '<div class="tlc-menu-h">TaskLog</div>'
    + row(show.task, 'calSetShow(\'task\',this.checked)', _calMarkHtml('task', 'var(--text-2)', false), 'Task')
    + row(show.todo, 'calSetShow(\'todo\',this.checked)', _calMarkHtml('step', 'var(--text-2)', false), 'To Do')
    + row(show.done, 'calSetShow(\'done\',this.checked)', _calMarkHtml('task', 'var(--text-2)', true), '완료 항목')
    + '<div class="tlc-menu-h">Google 캘린더 (읽기 전용)</div>' + google;
}

// ── 연도 보기 ──
function calYearCounts(year) {
  var show = calShow(), counts = {};
  function add(d) { var k = _calKey(d); counts[k] = (counts[k] || 0) + 1; }
  calCollectItems().forEach(function (it) {
    if (it.date.getFullYear() === year && calItemVisible(it, show)) add(it.date);
  });
  calGItems().forEach(function (ev) {
    var span = _calGSpan(ev), d = new Date(span[0]);
    d.setHours(0, 0, 0, 0);
    for (var i = 0; d < span[1] && i < 92; i++) {
      if (d.getFullYear() === year) add(d);
      d.setDate(d.getDate() + 1);
    }
  });
  return counts;
}
function calRenderYear() {
  var el = _calEl('tlc-year');
  if (!el) return;
  var y = _cal.date.getFullYear();
  var counts = calYearCounts(y), html = '';
  for (var m = 0; m < 12; m++) {
    html += '<section class="tlc-ymonth">'
      + '<button type="button" class="tlc-ymonth-t" onclick="calGoDate(\'' + y + '-' + _calPad(m + 1) + '-01\',\'month\')">' + (m + 1) + '월</button>'
      + calMonthGridHtml(y, m, { counts: counts, onclick: 'calYearPick' })
      + '</section>';
  }
  el.innerHTML = '<div class="tlc-year-grid">' + html + '</div>';
  calGLoadYear(y);
}
function calYearPick(key) { calGoDate(key, 'day'); }

// ── 검색 ──
function calSearchInput(v) {
  if (_cal.queryTimer) clearTimeout(_cal.queryTimer);
  _cal.queryTimer = setTimeout(function () {
    _cal.query = String(v || '').trim();
    calRefresh();
  }, 150);
}
function _calClearSearch() {
  if (_cal.queryTimer) { clearTimeout(_cal.queryTimer); _cal.queryTimer = null; }
  _cal.query = '';
  var s = _calEl('tlc-search');
  if (s) s.value = '';
}
function calRenderResults() {
  var el = _calEl('tlc-results');
  if (!el) return;
  var q = _cal.query.toLowerCase();
  // 검색은 숨겨 둔 완료 항목까지 찾는다 — '그거 언제 했더라' 를 찾으려고 쓰는 것이다
  var rows = calCollectItems().filter(function (it) { return it.title.toLowerCase().indexOf(q) >= 0; });
  calGItems().forEach(function (ev) {
    if (ev.title.toLowerCase().indexOf(q) >= 0) {
      rows.push({ kind: 'google', g: ev, title: ev.title, date: _calGSpan(ev)[0], hasTime: !ev.allDay, done: false, color: ev.color });
    }
  });
  rows.sort(function (a, b) { return a.date - b.date; });
  var total = rows.length;
  if (total > CAL_RESULT_MAX) {
    // 넘치면 오늘에서 가까운 것부터 남긴다
    var now = Date.now();
    rows = rows.slice().sort(function (a, b) { return Math.abs(a.date - now) - Math.abs(b.date - now); })
      .slice(0, CAL_RESULT_MAX).sort(function (a, b) { return a.date - b.date; });
  }
  _cal.results = rows;
  if (!rows.length) {
    el.innerHTML = '<div class="tlc-empty">검색 결과가 없습니다</div>';
    return;
  }
  var todayKey = _calKey(new Date()), lastKey = '', html = '';
  html += '<div class="tlc-res-sum">' + total + '건' + (total > CAL_RESULT_MAX ? ' · 오늘에서 가까운 ' + CAL_RESULT_MAX + '건만 표시' : '') + '</div>';
  rows.forEach(function (r, i) {
    var key = _calKey(r.date);
    if (key !== lastKey) {
      html += '<div class="tlc-res-day" data-date="' + key + '">' + r.date.getFullYear() + '년 ' + (r.date.getMonth() + 1) + '월 ' + r.date.getDate() + '일 (' + CAL_DOW[r.date.getDay()] + ')</div>';
      lastKey = key;
    }
    var time = r.hasTime ? (_calPad(r.date.getHours()) + ':' + _calPad(r.date.getMinutes())) : '종일';
    html += '<button type="button" class="tlc-res' + (r.done ? ' tlc-is-done' : '') + '" onclick="calResultClick(' + i + ',this)">'
      + '<span class="tlc-res-time">' + time + '</span>'
      + _calMarkHtml(r.kind, r.color, r.done)
      + '<span class="tlc-tt">' + _calEsc(r.title) + '</span>'
      + (r.parent ? '<span class="tlc-res-parent">' + _calEsc(r.parent) + '</span>' : '')
      + '</button>';
  });
  el.innerHTML = html;
  var days = el.querySelectorAll('.tlc-res-day');
  for (var d = 0; d < days.length; d++) {
    if (days[d].getAttribute('data-date') >= todayKey) { el.scrollTop = days[d].offsetTop - el.offsetTop; break; }
  }
}
function calResultClick(i, btn) {
  var r = _cal.results[i];
  if (!r) return;
  if (r.kind === 'google') calGooglePop(r.g, btn);
  else calOpenEvent(r.taskId);
}

// ── 구글 일정 요약 (읽기 전용) ──
function calPopClose() {
  document.querySelectorAll('.tlc-pop').forEach(function (el) { el.remove(); });
}
function calGooglePop(ev, anchor) {
  calPopClose();
  var span = _calGSpan(ev), s = span[0], e = span[1];
  function day(d) { return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + CAL_DOW[d.getDay()] + ')'; }
  function hm(d) { return _calPad(d.getHours()) + ':' + _calPad(d.getMinutes()); }
  var when;
  if (ev.allDay) {
    var last = new Date(e.getTime() - 86400000);
    when = (!ev.end || last <= s) ? day(s) : (day(s) + ' – ' + day(last));
  } else {
    when = day(s) + ' ' + hm(s) + (ev.end ? (' – ' + (_calKey(s) === _calKey(e) ? '' : day(e) + ' ') + hm(e)) : '');
  }
  var cal = calGStore().cals.find(function (c) { return c.id === ev.cal; });
  var link = /^https:\/\//.test(ev.link || '') ? ev.link : '';
  var el = document.createElement('div');
  el.className = 'tlc-pop';
  el.innerHTML = '<div class="tlc-pop-title">' + _calMarkHtml('google', ev.color, true) + '<span>' + _calEsc(ev.title) + '</span></div>'
    + '<div class="tlc-pop-row">' + _calEsc(when) + '</div>'
    + (cal ? '<div class="tlc-pop-row tlc-pop-dim">' + _calEsc(cal.name) + ' · 읽기 전용</div>' : '')
    + (ev.loc ? '<div class="tlc-pop-row">' + _calEsc(ev.loc) + '</div>' : '')
    + (ev.desc ? '<div class="tlc-pop-row tlc-pop-desc">' + _calEsc(ev.desc) + '</div>' : '')
    + (link ? '<a class="tlc-pop-link" href="' + _calEsc(link) + '" target="_blank" rel="noopener">Google 캘린더에서 열기</a>' : '');
  document.body.appendChild(el);
  var r = anchor.getBoundingClientRect();
  var w = el.offsetWidth, h = el.offsetHeight;
  var y = r.bottom + 6;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
  el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
  el.style.top = y + 'px';
}

// ── 본문 전환 ──
function calSyncBody() {
  var fcEl = _calEl('tlc-fc'), yearEl = _calEl('tlc-year'), resEl = _calEl('tlc-results');
  if (!fcEl || !yearEl || !resEl) return;
  var mode = _cal.query ? 'search' : (_cal.view === 'year' ? 'year' : 'fc');
  fcEl.hidden = mode !== 'fc';
  yearEl.hidden = mode !== 'year';
  resEl.hidden = mode !== 'search';
  if (mode === 'fc') {
    var had = !!_cal.fc;
    var fc = calEnsureFc();
    if (fc) {
      var want = _calViewDef(_cal.view).fc;
      if (fc.getOption('firstDay') !== _calFirstDay()) fc.setOption('firstDay', _calFirstDay());
      if (had) {
        fc.updateSize();
        if (fc.view.type !== want) fc.changeView(want, _cal.date);
        // ⚠️ changeView 만으로는 다시 읽지 않는다. 연도 보기·검색 중에 저장한 항목이 안 보인다
        fc.refetchEvents();
      }
    }
  } else if (mode === 'year') {
    calRenderYear();
  } else {
    calRenderResults();
  }
  calSyncTools();
}
// 저장·원격 반영 뒤에 부른다. 인스턴스를 다시 만들지 않으므로 보던 날짜·스크롤이 그대로다.
function calRefresh() {
  if (!_calEl('tlc-body')) return;
  calSyncBody();
  if (_cal.menu === 'show') calRenderShowMenu();
}
function calWatchSize() {
  var body = _calEl('tlc-body');
  if (!body || typeof ResizeObserver !== 'function') return;
  var t = null, lastW = 0, lastH = 0;
  _cal.ro = new ResizeObserver(function () {
    if (body.clientWidth === lastW && body.clientHeight === lastH) return;
    lastW = body.clientWidth; lastH = body.clientHeight;
    if (t) clearTimeout(t);
    t = setTimeout(function () {
      var el = _calEl('tlc-fc');              // 그사이 다른 메뉴로 옮겼으면 없다
      if (_cal.fc && el && !el.hidden) _cal.fc.updateSize();
    }, 60);
  });
  _cal.ro.observe(body);
}

// ── 메인 렌더 ──
function renderCalendarView() {
  var content = _calEl('page-content');
  if (!content) return;
  if (_calEl('tlc-body')) { calRefresh(); return; }

  calDestroyFc();
  calPopClose();
  _cal.menu = null;
  if (!_cal.view) {
    _cal.view = _calInitialView();
    if (_cal.view === 'list') _cal.scrollTo = _calKey(new Date());
  }
  content.innerHTML = '<div class="tlc-page">' + calToolsHtml()
    + '<div class="tlc-body" id="tlc-body">'
    +   '<div class="tlc-fc" id="tlc-fc"></div>'
    +   '<div class="tlc-year" id="tlc-year" hidden></div>'
    +   '<div class="tlc-results" id="tlc-results" hidden></div>'
    + '</div></div>';
  var search = _calEl('tlc-search');
  if (search) search.value = _cal.query;
  calWatchSize();
  calSyncBody();
}

// 상단 메뉴·요약 창은 바깥을 누르면 닫는다
document.addEventListener('mousedown', function (e) {
  if (!e.target || !e.target.closest) return;
  if (!e.target.closest('.tlc-pop')) calPopClose();
  if (_cal.menu && !e.target.closest('.tlc-menu-wrap')) calCloseMenus();
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  calPopClose();
  if (_cal.menu) calCloseMenus();
});
