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
  { id: 'list',  label: '목록', fc: 'listPeriod'   },
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
  return { event: s.event !== false, task: s.task !== false, todo: s.todo !== false, done: s.done === true, filter: calFilter() };
}
function calSetShow(key, on) {
  var s = _calLoad('cal-show', {});
  s[key] = !!on;
  _calSave('cal-show', s);
  calRefresh();
}

// ── Section·Project 필터 (이 기기 전용) ──
//  { s:{'2026:3':true}, p:{'2026:3:12':true}, none:true } = 숨긴 것들. 기본은 다 보인다.
//  키에 연도를 넣는다 — 같은 번호의 Section 이라도 해마다 다른 만다라트다.
function calFilter() {
  var f = _calLoad('cal-filter', {});
  return { s: f.s || {}, p: f.p || {}, none: f.none === true };
}
function calFilterActive() {
  var f = calFilter();
  return f.none || Object.keys(f.s).length > 0 || Object.keys(f.p).length > 0;
}
function _calFilterSave(f) {
  _calSave('cal-filter', f);
  calRefresh();
}
function _calItemKeys(t) {
  var a = t.mdtAction || t.mdtGoal;
  if (!a || a.sgId === null || a.sgId === undefined) return { none: true };
  var s = a.year + ':' + a.sgId;
  var act = t.mdtAction;
  return { s: s, p: (act && act.actionId !== null && act.actionId !== undefined) ? (s + ':' + act.actionId) : null };
}
function _calFilterHides(keys, f) {
  if (keys.none) return f.none;
  return !!(f.s[keys.s] || (keys.p && f.p[keys.p]));
}
// Section 을 켜면 그 아래 숨겨 둔 Project 도 함께 켠다 — 안 그러면 켰는데도 일부가 안 보인다
function calFilterSection(key, on) {
  var f = calFilter();
  if (on) {
    delete f.s[key];
    Object.keys(f.p).forEach(function (k) { if (k.indexOf(key + ':') === 0) delete f.p[k]; });
  } else {
    f.s[key] = true;
  }
  _calFilterSave(f);
}
function calFilterProject(key, on) {
  var f = calFilter();
  if (on) delete f.p[key]; else f.p[key] = true;
  _calFilterSave(f);
}
function calFilterNone(on) {
  var f = calFilter();
  f.none = !on;
  _calFilterSave(f);
}
function calFilterReset() {
  _calFilterSave({ s: {}, p: {}, none: false });
}
function calFilterToggleOpen(key) {
  _cal.filterOpen = _cal.filterOpen || {};
  _cal.filterOpen[key] = !_cal.filterOpen[key];
  calRenderShowMenu();
}
// 필터 목록에 보여 줄 해: 지금 보는 범위에 걸치면서 만다라트가 있는 해
function calFilterYears() {
  var from, to;
  if (_cal.view === 'year') { from = to = calYearShown(); }
  else if (_cal.view === 'list') {
    var b = calPeriodBounds();
    from = b.start.getFullYear(); to = new Date(b.end.getTime() - 1).getFullYear();
  } else if (_cal.fc) {
    from = _cal.fc.view.activeStart.getFullYear(); to = new Date(_cal.fc.view.activeEnd.getTime() - 1).getFullYear();
  } else { from = to = _cal.date.getFullYear(); }
  var out = [];
  for (var y = to; y >= from; y--) if (typeof getMdt === 'function' && getMdt(y)) out.push(y);
  return out;
}
function calFilterHtml() {
  var f = calFilter(), years = calFilterYears(), open = _cal.filterOpen || {}, html = '';
  if (!years.length) html += '<div class="tlc-menu-note">이 기간의 만다라트가 없습니다</div>';
  years.forEach(function (y) {
    if (years.length > 1) html += '<div class="tlc-f-year">' + y + '년</div>';
    (getMdt(y).subGoals || []).forEach(function (sg) {
      var acts = (sg.actions || []).filter(function (a) { return a.text && String(a.text).trim(); });
      var key = y + ':' + sg.id;
      var hiddenP = acts.filter(function (a) { return f.p[key + ':' + a.id]; }).length;
      var color = getSectionThemeColor(sg.id - 1, y);
      html += '<div class="tlc-f-row">'
        + '<label class="tlc-check"><input type="checkbox"' + (f.s[key] ? '' : ' checked') + (!f.s[key] && hiddenP ? ' data-mixed="1"' : '')
        +   ' onchange="calFilterSection(\'' + key + '\',this.checked)">'
        +   _calMarkHtml('event', color, true) + '<span class="tlc-f-name">' + _calEsc(sg.text || ('Section ' + sg.id)) + '</span></label>'
        + (acts.length ? '<button type="button" class="tlc-f-arrow" aria-label="Project 펼치기" onclick="calFilterToggleOpen(\'' + key + '\')">' + (open[key] ? '▾' : '▸') + '</button>' : '')
        + '</div>';
      if (open[key]) {
        acts.forEach(function (a) {
          var pk = key + ':' + a.id;
          html += '<label class="tlc-check tlc-f-proj"><input type="checkbox"' + ((f.s[key] || f.p[pk]) ? '' : ' checked') + (f.s[key] ? ' disabled' : '')
            + ' onchange="calFilterProject(\'' + pk + '\',this.checked)"><span class="tlc-f-name">' + _calEsc(a.text) + '</span></label>';
        });
      }
    });
  });
  html += '<label class="tlc-check"><input type="checkbox"' + (f.none ? '' : ' checked') + ' onchange="calFilterNone(this.checked)">'
    + _calMarkHtml('event', CAL_NO_PROJECT_COLOR, true) + '<span class="tlc-f-name">Project 없음</span></label>';
  return html;
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
// 일정은 시작~끝을 그대로 막대로 그린다. 종일의 끝은 FullCalendar 규칙대로 다음 날 0시(포함 안 함)다.
function _calEventSpan(t) {
  var s = new Date(t.startDate || t.dueDateTime), e = new Date(t.dueDateTime || t.startDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  if (t.hasTime || t.startHasTime) {
    return { date: s, end: e > s ? e : new Date(s.getTime() + 3600000), hasTime: true };
  }
  var endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  return { date: new Date(s.getFullYear(), s.getMonth(), s.getDate()), end: endDay, hasTime: false };
}
// from·to(끝 미포함)를 주면 반복의 앞날 회차까지 펼친다. 안 주면 문서가 있는 것만 — 범위를 재는 calPeriodBounds 용이다.
function calCollectItems(from, to) {
  var out = [];
  var fromKey = from ? _calKey(from) : null, toKey = to ? _calKey(new Date(to.getTime() - 1)) : null;
  mdtAllTasks().forEach(function (t) {
    var color = calTaskColor(t), keys = _calItemKeys(t);
    var recur = recurIs(t), occ = recur ? recurKeyOf(t) : null;
    function push(doc, key) {
      var title = _calCleanTitle(t.text), base = { taskId: t.id, title: title, color: color, keys: keys, occ: key, recur: recur };
      if (t.kind === 'event') {
        var span = _calEventSpan(doc);
        if (span) out.push(Object.assign(base, { kind: 'event', date: span.date, end: span.end, hasTime: span.hasTime, done: !!doc.completed }));
      } else {
        var place = _calTaskPlace(doc);
        if (place) out.push(Object.assign(base, { kind: 'task', date: place.date, end: place.end, anchor: place.anchor, hasTime: place.hasTime, done: !!doc.completed }));
      }
    }
    push(t, occ);
    if (recur && fromKey) {
      // 여러 날짜에 걸치는 회차는 범위 앞에서 시작해 걸칠 수 있다
      recurOccurrences(t, recurAdd(fromKey, -recurSpanDays(t)), toKey).forEach(function (k) { push(recurOccLite(t, k), k); });
    }
    (t.steps || []).forEach(function (s) {
      if (!s.dueDateTime) return;
      var sd = new Date(s.dueDateTime);
      if (isNaN(sd.getTime())) return;
      // Task 를 닫았으면 그 아래 To Do 도 끝난 것으로 본다
      out.push({ kind: 'step', taskId: t.id, stepId: s.id, title: _calCleanTitle(s.text), parent: _calCleanTitle(t.text), date: sd, hasTime: !!s.hasTime, done: !!s.completed || !!t.completed, color: color, keys: keys });
    });
  });
  return out;
}
function calItemVisible(it, show) {
  if (_calFilterHides(it.keys, show.filter)) return false;
  // ⚠️ 일정은 끝나면 저절로 완료되므로 '완료 숨김'을 걸지 않는다 — 걸면 지난 일정이 달력에서 사라진다
  if (it.kind === 'event') return show.event;
  if (it.kind === 'task' && !show.task) return false;
  if (it.kind === 'step' && !show.todo) return false;
  if (it.done && !show.done) return false;
  return true;
}
function _calItemToFc(it) {
  var occId = it.recur ? ('_' + it.occ) : '';
  if (it.kind === 'event') {
    return {
      id: 'e' + it.taskId + occId,
      title: it.title,
      start: it.hasTime ? it.date : _calKey(it.date),
      end: it.hasTime ? it.end : _calKey(it.end),
      allDay: !it.hasTime,
      backgroundColor: it.color, borderColor: it.color, textColor: _calInk(it.color),
      durationEditable: true,
      classNames: ['tlc-event'].concat(it.done ? ['tlc-is-done'] : []),
      extendedProps: { kind: 'event', taskId: it.taskId, done: it.done, color: it.color, occ: it.occ, recur: it.recur },
    };
  }
  return {
    id: it.kind === 'task' ? ('t' + it.taskId + occId) : ('s' + it.taskId + '_' + it.stepId),
    title: it.title,
    start: it.hasTime ? it.date : _calKey(it.date),
    end: it.end || undefined,
    allDay: !it.hasTime,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    durationEditable: it.anchor === 'both',   // 시작~마감이 칸으로 그려지는 Task 만 길이를 바꾼다
    classNames: ['tlc-item', 'tlc-k-' + it.kind].concat(it.done ? ['tlc-is-done'] : []),
    extendedProps: { kind: it.kind, taskId: it.taskId, stepId: it.stepId, parent: it.parent || '', done: it.done, color: it.color, anchor: it.anchor || 'due', occ: it.occ, recur: it.recur },
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

// 한 해에 약 56KB 다. 저장소가 차면 동기화까지 막히므로 저장할 때는 최근에 받은 해만 담는다.
// ⚠️ 메모리에서는 지우지 않는다. 표시 기간이 6년을 넘을 때 지운 해를 다시 받고 또 지우기를 반복하게 된다.
function calGCacheForSave() {
  var store = calGStore(), ev = store.ev, latest = {}, out = {};
  Object.keys(ev).forEach(function (k) {
    var y = k.split('|').pop();
    latest[y] = Math.max(latest[y] || 0, ev[k].at || 0);
  });
  var keep = Object.keys(latest).sort(function (a, b) { return latest[b] - latest[a]; }).slice(0, CAL_GCAL_KEEP_YEARS);
  Object.keys(ev).forEach(function (k) {
    if (keep.indexOf(k.split('|').pop()) >= 0) out[k] = ev[k];
  });
  return { cals: store.cals, ev: out };
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
    _calSave(CAL_GCAL_CACHE_KEY, calGCacheForSave());
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

// ── 표시 기간 (설정 > 화면) ──
//  목록·연도·검색에만 건다. 일·주·월 칸은 보는 날짜를 그대로 보여 준다 — 2015년으로 넘어갔는데
//  칸이 비어 있으면 고장처럼 보인다.
function _calInPeriod(s, e) {            // e 는 포함하지 않는 끝
  return appPeriodHit([_calKey(s), _calKey(new Date(e.getTime() - 1))]);
}
function _calItemEnd(it) { return it.end || new Date(it.date.getTime() + 1); }
// 목록 보기의 범위. 끝이 열려 있거나 전체면 가진 데이터의 연도까지 넓힌다.
function calPeriodBounds() {
  var rs = appPeriodRanges();
  var from = rs ? rs.reduce(function (a, r) { return r[0] < a ? r[0] : a; }, rs[0][0]) : '0000-01-01';
  var to   = rs ? rs.reduce(function (a, r) { return r[1] > a ? r[1] : a; }, rs[0][1]) : '9999-12-31';
  var y = new Date().getFullYear(), minY = y, maxY = y;
  if (from === '0000-01-01' || to === '9999-12-31') {
    calCollectItems().forEach(function (it) {
      minY = Math.min(minY, it.date.getFullYear());
      maxY = Math.max(maxY, _calItemEnd(it).getFullYear());
    });
    calGItems().forEach(function (ev) {
      var span = _calGSpan(ev);
      minY = Math.min(minY, span[0].getFullYear());
      maxY = Math.max(maxY, span[1].getFullYear());
    });
    if (from === '0000-01-01') from = minY + '-01-01';
    if (to === '9999-12-31') to = maxY + '-12-31';
  }
  var p = from.split('-'), q = to.split('-');
  return { start: new Date(+p[0], +p[1] - 1, +p[2]), end: new Date(+q[0], +q[1] - 1, +q[2] + 1) };
}
// 연도 보기에서 갈 수 있는 해 (오름차순). 끝이 열려 있거나 전체면 null = 어디든.
function calYearAllowed() {
  var p = appPeriod();
  if (p.mode === 'year') return [new Date().getFullYear()];
  if (p.mode === 'years') return p.years;
  if (p.mode === 'range' && p.from && p.to) {
    var out = [];
    for (var y = +p.from.slice(0, 4); y <= +p.to.slice(0, 4); y++) out.push(y);
    return out;
  }
  return null;
}
function calYearShown() {
  var y = _cal.date.getFullYear(), a = calYearAllowed();
  if (!a || a.indexOf(y) >= 0) return y;
  return a.reduce(function (best, v) { return Math.abs(v - y) < Math.abs(best - y) ? v : best; }, a[0]);
}
function calYearStep(dir) {
  var y = calYearShown(), a = calYearAllowed();
  if (!a) return y + dir;
  var i = a.indexOf(y) + dir;
  return (i >= 0 && i < a.length) ? a[i] : null;
}

// ── FullCalendar ──
function calFcEvents(start, end) {
  var show = calShow(), out = [], listing = _cal.view === 'list';
  calCollectItems(start, end).forEach(function (it) {
    if (!calItemVisible(it, show)) return;
    var itEnd = _calItemEnd(it);
    if (it.date >= end || itEnd <= start) return;
    if (listing && !_calInPeriod(it.date, itEnd)) return;
    out.push(_calItemToFc(it));
  });
  calGItems().forEach(function (ev) {
    var span = _calGSpan(ev);
    if (span[0] >= end || span[1] <= start) return;
    if (listing && !_calInPeriod(span[0], span[1])) return;
    out.push(_calGToFc(ev));
  });
  return out;
}
function _calMarkHtml(kind, color, done) {
  return '<i class="tlc-mark tlc-mark-' + kind + (done ? ' is-done' : '') + '" style="--tlc-c:' + _calEsc(color) + '"></i>';
}
// 여러 해를 함께 볼 때는 날짜 줄에 연도까지 적는다
function _calListDayFormat() {
  var b = calPeriodBounds();
  var multi = b.start.getFullYear() !== new Date(b.end.getTime() - 1).getFullYear();
  return multi ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
               : { month: 'long', day: 'numeric', weekday: 'short' };
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
    eventDurationEditable: false,        // 길이는 일정·시간 칸 Task 만 항목별로 켠다
    selectable: true,
    selectMirror: true,
    selectLongPressDelay: 400,
    unselectCancel: '.tlc-pop',
    select: function (info) { _cal.selectAt = Date.now(); calQuickFromRange(info.start, info.end, info.allDay, info.jsEvent); },
    // 터치에서는 탭이 select 가 되지 않는다(길게 눌러야 한다). 마우스는 select 가 먼저 와서 여기서 거른다
    dateClick: function (info) {
      if (Date.now() - (_cal.selectAt || 0) < 400) return;
      var end = new Date(info.date.getTime() + (info.allDay ? 86400000 : 1800000));
      calQuickFromRange(info.date, end, info.allDay, info.jsEvent);
    },
    eventResize: function (info) { calDropItem(info); },
    moreLinkContent: function (arg) { return '+' + arg.num; },
    views: {
      // 종일 칸은 3줄까지만. 위쪽을 다 먹으면 시간 칸이 안 보인다
      timeGrid: { dayMaxEvents: false, dayMaxEventRows: 3 },
      timeGridDay: { titleFormat: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' } },
      // 끝 시각까지 적으면 시간 칸이 폰 폭의 1/3 을 먹는다. 끝 시각은 눌렀을 때 요약에서 본다
      // 범위는 표시 기간을 따른다. 기간을 바꾸면 인스턴스를 다시 만든다(calSyncBody)
      listPeriod: {
        type: 'list',
        visibleRange: calPeriodBounds,
        listDayFormat: _calListDayFormat(),
        listDaySideFormat: false,
        displayEventEnd: false,
      },
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
      if ((p.kind === 'google' || p.kind === 'event') && !isList) return true;   // 일정은 기본 막대 그대로
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
      else calItemPop(p, info.el);
    },
    eventDrop: function (info) { calDropItem(info); },
    datesSet: function () {
      // 목록은 표시 기간에 맞춰 날짜를 끌어당긴다. 받아 적으면 달력 칸으로 돌아왔을 때 엉뚱한 해로 간다
      if (_cal.view !== 'list') _cal.date = _cal.fc.getDate();
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
  if (p.kind !== 'step') return { obj: t, task: t };   // Task·일정은 문서 자체다
  var s = (t.steps || []).find(function (x) { return x.id === p.stepId; });
  return s ? { obj: s, task: t } : null;
}
// 시각을 문서에 적는다. start·end·allDay 는 달력에서 놓은 값이다.
function _calApplyMove(obj, p, d, end, allDay) {
  var key = _calKey(d);
  if (p.kind === 'event') {
    if (allDay) {
      // 종일의 끝은 포함하지 않는 다음 날 0시다 → 마지막 날로 되돌린다. 시간 칸에서 끌어온 것은 끝이 없다.
      var lastDay = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1) : d;
      obj.startDate = key + 'T09:00:00';
      obj.dueDateTime = _calKey(lastDay) + 'T09:00:00';
    } else {
      obj.startDate = _calIso(d);
      obj.dueDateTime = _calIso(end || new Date(d.getTime() + 3600000));
    }
    obj.startHasTime = !allDay;
    obj.hasTime = !allDay;
    eventAfterTimeChange(obj);
  } else if (p.kind === 'task' && (p.anchor === 'start' || p.anchor === 'both')) {
    obj.startDate = allDay ? (key + 'T09:00:00') : _calIso(d);
    obj.startHasTime = !allDay;
    if (obj.dueDateTime) {
      var timedEnd = (!allDay && p.anchor === 'both' && end) ? end : null;
      obj.dueDateTime = timedEnd ? _calIso(timedEnd) : (key + 'T09:00:00');
      obj.hasTime = !!timedEnd;
    }
  } else {
    obj.dueDateTime = allDay ? (key + 'T09:00:00') : _calIso(d);
    obj.hasTime = !allDay;
    // Start 보다 앞으로 옮기면 기간이 뒤집혀 Gantt 막대가 사라진다 → Start 를 따라 당긴다
    if (p.kind === 'task' && obj.startDate && String(obj.startDate).slice(0, 10) > key) {
      obj.startDate = key + String(obj.startDate).slice(10);
    }
  }
}
function _calAfterMove() {
  autoCompletePastEvents();
  if (typeof saveTasks === 'function') saveTasks();
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
  calRefresh();
}
function calMoveItem(ev) {
  var p = ev.extendedProps;
  var found = _calFindItem(p);
  if (!found) return false;
  _calApplyMove(found.obj, p, ev.start, ev.end, ev.allDay);
  _calAfterMove();
  return true;
}
// 끌어 옮기기·길이 조절. 반복 회차는 어디까지 바꿀지 먼저 묻는다.
function calDropItem(info) {
  var p = info.event.extendedProps, found = _calFindItem(p);
  if (p.kind !== 'step' && p.recur && found && recurIs(found.task)) {
    var noun = recurNoun(found.task);
    recurAskScope({ title: '반복 ' + noun + ' 수정', noun: noun, scopes: recurScopesFor(found.task, p.occ, true) }, function (scope) {
      if (!scope) { info.revert(); return; }
      calMoveRecurring(info.event, scope);
    });
    return;
  }
  if (!calMoveItem(info.event)) info.revert();
}
function calMoveRecurring(ev, scope) {
  var p = ev.extendedProps, found = _calFindItem(p);
  if (!found) return;
  var m = found.task, key = p.occ, cur = recurKeyOf(m), target = m, d = ev.start, end = ev.end;
  if (scope === 'this') target = recurDetach(m, key);
  else if (scope === 'following' && key !== cur) target = recurSplit(m, key);
  else if (key !== cur) {
    // 다른 회차를 끌었으면 옮긴 만큼을 지금 회차에 적용한다
    var off = recurDays(cur) - recurDays(key);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, d.getHours(), d.getMinutes());
    if (end) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + off, end.getHours(), end.getMinutes());
  }
  var before = recurKeyOf(target);
  _calApplyMove(target, p, d, end, ev.allDay);
  recurAfterMove(target, before);
  _calAfterMove();
}
function calOpenEvent(taskId, occ) {
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId, occ);
}

// ── 빠른 입력 (달력 빈칸) ───────────────────────────────────
//  제목·시간·Project 만 받는다. 나머지는 '옵션 더보기'로 오른쪽 패널에 이어서 적는다.
function _calPointRect(jsEvent) {
  var t = jsEvent && (jsEvent.changedTouches ? jsEvent.changedTouches[0] : jsEvent);
  var x = t && t.clientX != null ? t.clientX : window.innerWidth / 2;
  var y = t && t.clientY != null ? t.clientY : window.innerHeight / 3;
  return { left: x, right: x, top: y, bottom: y };
}
function calQuickFromRange(start, end, allDay, jsEvent) {
  // 메뉴를 닫으려고 바깥을 누른 것이면 새 일정 창까지 열지 않는다.
  // 터치는 이쪽이 먼저 오고(가짜 mousedown 이 뒤에 온다), 마우스는 mousedown 으로 닫힌 직후에 온다.
  if (_cal.menu || Date.now() - (_cal.menuClosedAt || 0) < 500) {
    calCloseMenus();
    if (_cal.fc) { try { _cal.fc.unselect(); } catch (e) {} }
    return;
  }
  var v;
  if (allDay) {
    v = { sd: _calKey(start), st: '', dd: _calKey(new Date(end.getTime() - 1)), dt: '' };
  } else {
    // 한 칸만 눌렀으면 구글처럼 30분 단위에 맞춰 1시간으로 잡는다. 끌어서 고른 범위는 그대로 둔다
    var e = end;
    if (end - start <= 1800000) {
      start = new Date(start);
      start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
      e = new Date(start.getTime() + 3600000);
    }
    v = {
      sd: _calKey(start), st: _calPad(start.getHours()) + ':' + _calPad(start.getMinutes()),
      dd: _calKey(e), dt: _calPad(e.getHours()) + ':' + _calPad(e.getMinutes()),
    };
  }
  calQuickOpen(v, allDay, _calPointRect(jsEvent));
}
function calQuickOpen(v, allDay, rect) {
  // 적던 제목이 있으면 다른 칸을 눌러도 날짜만 바꾼다
  var prevName = _calEl('tlc-q-name');
  var keepName = prevName ? prevName.value : '';
  if (!prevName) { _cal.qKind = 'event'; _cal.qProject = null; }
  _cal.qAllDay = !!allDay;
  var html = '<div class="tlc-q-head">'
    +   '<div class="tlc-q-kind" role="group" aria-label="유형">'
    +     '<button type="button" data-kind="event" onclick="calQuickSetKind(\'event\')">일정</button>'
    +     '<button type="button" data-kind="task" onclick="calQuickSetKind(\'task\')">Task</button>'
    +   '</div>'
    +   '<button type="button" class="tlc-q-x" onclick="calQuickClose()" aria-label="닫기">×</button>'
    + '</div>'
    + '<input class="field-input tlc-q-name" id="tlc-q-name" placeholder="제목" autocomplete="off" value="' + _calEsc(keepName) + '"'
    +   ' oninput="this.style.outline=\'\'" onkeydown="if(event.key===\'Enter\'){event.preventDefault();calQuickSave();}">'
    + '<div class="tlc-q-row"><span class="tlc-q-lbl">Start</span>' + _calQDate('tlc-q-sd', v.sd) + _calQTime('tlc-q-st', v.st) + '</div>'
    + '<div class="tlc-q-row"><span class="tlc-q-lbl" id="tlc-q-endlbl">End</span>' + _calQDate('tlc-q-dd', v.dd) + _calQTime('tlc-q-dt', v.dt) + '</div>'
    + '<label class="rp-allday"><input type="checkbox" id="tlc-q-allday" onchange="calQuickSetAllDay(this.checked)">종일</label>'
    + buildProjectDropdown('tlc-q-proj', _cal.qProject)
    + '<div class="tlc-q-foot">'
    +   '<button type="button" class="tlc-btn" onclick="calQuickMore()">옵션 더보기</button>'
    +   '<button type="button" class="tlc-btn tlc-create" onclick="calQuickSave()">저장</button>'
    + '</div>';
  var el = _calPopShow(html, rect, 'tlc-quick');
  _projDDCallbacks['tlc-q-proj'] = function (sel) { _cal.qProject = sel; };
  calQuickSync();
  var nameEl = _calEl('tlc-q-name');
  if (nameEl) { try { nameEl.focus({ preventScroll: true }); } catch (e) { nameEl.focus(); } }
  return el;
}
function _calQDate(id, val) {
  return '<input class="field-input rp-dtinput" id="' + id + '" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" value="' + _calEsc(val) + '"'
    + ' oninput="nbDateMask(this);this.style.outline=\'\'" onfocus="try{this.select()}catch(e){}">';
}
function _calQTime(id, val) {
  return '<input class="field-input rp-dtinput rp-tminput" id="' + id + '" inputmode="numeric" placeholder="시간" value="' + _calEsc(val) + '"'
    + ' oninput="rpTmMask(this)" onblur="rpTmBlur(this)" onfocus="try{this.select()}catch(e){}">';
}
function calQuickSync() {
  var pop = document.querySelector('.tlc-pop.tlc-quick');
  if (!pop) return;
  pop.classList.toggle('is-allday', !!_cal.qAllDay);
  var check = _calEl('tlc-q-allday');
  if (check) check.checked = !!_cal.qAllDay;
  var lbl = _calEl('tlc-q-endlbl');
  if (lbl) lbl.textContent = _cal.qKind === 'event' ? 'End' : 'Due';
  pop.querySelectorAll('.tlc-q-kind button').forEach(function (b) {
    b.classList.toggle('is-on', b.getAttribute('data-kind') === _cal.qKind);
  });
}
function calQuickSetKind(kind) {
  _cal.qKind = kind;
  calQuickSync();
}
// 시간 칸이 비어 있으면 9시~10시로 채운다. 오늘이면 다음 정시부터.
function calQuickSetAllDay(on) {
  _cal.qAllDay = !!on;
  var st = _calEl('tlc-q-st'), dt = _calEl('tlc-q-dt');
  if (!on && st && dt && !st.value && !dt.value) {
    var sd = _calEl('tlc-q-sd'), dd = _calEl('tlc-q-dd');
    var today = _calKey(new Date()), day = sd.value || today;
    var s = (day === today) ? new Date() : new Date(day + 'T09:00:00');
    if (day === today) { s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); }
    var e = new Date(s.getTime() + 3600000);
    sd.value = _calKey(s);
    st.value = _calPad(s.getHours()) + ':' + _calPad(s.getMinutes());
    if (!dd.value || dd.value <= _calKey(e)) dd.value = _calKey(e);
    dt.value = _calPad(e.getHours()) + ':' + _calPad(e.getMinutes());
  }
  calQuickSync();
}
// 입력칸의 값을 읽어 저장할 모양으로 정리한다. 잘못됐으면 { bad:id } 를 돌려준다.
function _calQuickRead() {
  var val = function (id) { return ((_calEl(id) || {}).value || '').trim(); };
  var sd = val('tlc-q-sd'), dd = val('tlc-q-dd');
  if (sd && !nbDateValid(sd)) return { bad: 'tlc-q-sd' };
  if (dd && !nbDateValid(dd)) return { bad: 'tlc-q-dd' };
  var st = _cal.qAllDay ? null : rpTmParse(val('tlc-q-st'));
  var dt = _cal.qAllDay ? null : rpTmParse(val('tlc-q-dt'));
  if (_cal.qKind === 'event') {
    var n = rpNormalizeEvent(sd, st, dd, dt);
    if (n.error) return { bad: n.error === 'rp-due-dt' ? 'tlc-q-dd' : 'tlc-q-sd' };
    sd = n.sd; st = n.st; dd = n.dd; dt = n.dt;
  }
  return { sd: sd, st: st, dd: dd, dt: dt };
}
function _calQuickMark(id) {
  var el = _calEl(id);
  if (el) { el.style.outline = '2px solid var(--danger)'; el.focus(); }
}
function calQuickSave() {
  var nameEl = _calEl('tlc-q-name');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { _calQuickMark('tlc-q-name'); return; }
  var r = _calQuickRead();
  if (r.bad) { _calQuickMark(r.bad); return; }
  var doc = newTaskDoc({
    text: name,
    kind: _cal.qKind === 'event' ? 'event' : null,
    startDate: r.sd ? (r.sd + 'T' + (r.st || '09:00') + ':00') : null,
    startHasTime: !!(r.sd && r.st),
    dueDateTime: r.dd ? (r.dd + 'T' + (r.dt || '09:00') + ':00') : null,
    hasTime: !!(r.dd && r.dt),
    mdtAction: _cal.qProject,
  });
  tasks.push(doc);
  if (doc.kind === 'event') autoCompletePastEvents();
  saveTasks();
  if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
  calQuickClose(true);
  calRefresh();
}
function calQuickMore() {
  var nameEl = _calEl('tlc-q-name');
  var val = function (id) { return ((_calEl(id) || {}).value || '').trim(); };
  var opts = {
    kind: _cal.qKind, allDay: _cal.qAllDay, name: nameEl ? nameEl.value.trim() : '', mdtAction: _cal.qProject,
    values: { sd: val('tlc-q-sd'), st: rpTmParse(val('tlc-q-st')) || '', dd: val('tlc-q-dd'), dt: rpTmParse(val('tlc-q-dt')) || '' },
  };
  calQuickClose(true);
  openNewTaskPanel(null, opts);
}
function calQuickClose(force) {
  calPopClose(force === true);
}
// 빠른 입력의 연도에 맞는 Project 만 고른다
function calQuickYears() {
  var val = function (id) { return ((_calEl(id) || {}).value || '').trim(); };
  return taskDateYears(val('tlc-q-sd'), val('tlc-q-dd'));
}

// ── 요약창 (Task · 일정 · To Do) ──
function _calFmtWhen(iso, timed) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + CAL_DOW[d.getDay()] + ')'
    + (timed ? ' ' + _calPad(d.getHours()) + ':' + _calPad(d.getMinutes()) : '');
}
function _calItemWhen(p, found) {
  var o = found.obj;
  if (p.kind === 'step') return _calFmtWhen(o.dueDateTime, o.hasTime);
  var s = o.startDate ? _calFmtWhen(o.startDate, o.startHasTime) : '';
  var e = o.dueDateTime ? _calFmtWhen(o.dueDateTime, o.hasTime) : '';
  if (s && e) {
    if (s === e) return s;
    if (_calKey(new Date(o.startDate)) === _calKey(new Date(o.dueDateTime)) && o.hasTime) {
      var de = new Date(o.dueDateTime);
      return s + ' – ' + _calPad(de.getHours()) + ':' + _calPad(de.getMinutes());
    }
    return s + ' – ' + e;
  }
  return s || e;
}
function _calProjectLine(t) {
  var a = t.mdtAction;
  if (!a || !a.text) return '';
  var sec = '';
  try {
    var m = getMdt(parseInt(a.year, 10));
    var sg = m && (m.subGoals || []).find(function (x) { return x.id === a.sgId; });
    if (sg && sg.text) sec = sg.text + ' › ';
  } catch (e) {}
  return sec + a.text;
}
function calItemPop(p, anchor) {
  var found = _calFindItem(p);
  if (!found) return;
  var t = found.task, o = found.obj, isStep = p.kind === 'step';
  // 반복의 앞날 회차는 문서가 없다 — 그 회차의 사본으로 보여 준다
  var occ = (!isStep && recurIs(t)) ? (p.occ || recurKeyOf(t)) : null;
  if (occ && occ !== recurKeyOf(t)) { o = recurOccDoc(t, occ); found = { obj: o, task: t }; }
  var done = !!o.completed;
  var kindLabel = isStep ? 'To Do' : (t.kind === 'event' ? '일정' : 'Task');
  var rows = '<div class="tlc-pop-row">' + _calEsc(_calItemWhen(p, found)) + '</div>';
  if (occ) rows += '<div class="tlc-pop-row tlc-pop-dim"><span class="recur-mark">↻</span>' + _calEsc(recurDescribe(t.rrule, occ)) + '</div>';
  if (!isStep && alertHas(o)) rows += '<div class="tlc-pop-row tlc-pop-dim">알림 ' + _calEsc(alertLabel(o)) + '</div>';
  var proj = _calProjectLine(t);
  if (proj) rows += '<div class="tlc-pop-row tlc-pop-dim">' + _calEsc(proj) + '</div>';
  if (isStep) rows += '<div class="tlc-pop-row tlc-pop-dim">' + _calEsc(_calCleanTitle(t.text)) + '</div>';
  if (!isStep && t.location) rows += '<div class="tlc-pop-row">' + _calEsc(t.location) + '</div>';
  if (!isStep && t.notes) rows += '<div class="tlc-pop-row tlc-pop-desc">' + _calEsc(String(t.notes).slice(0, 500)) + '</div>';
  if (!isStep && (o.steps || []).length) {
    var finished = o.steps.filter(function (s) { return s.completed; }).length;
    rows += '<div class="tlc-pop-row tlc-pop-dim">To Do ' + finished + '/' + o.steps.length + '</div>';
  }
  var occArg = occ ? ",'" + occ + "'" : '';
  var ids = t.id + ',' + (isStep ? o.id : 'null') + occArg;
  var html = '<div class="tlc-pop-title">' + _calMarkHtml(p.kind, p.color || calTaskColor(t), done)
    + '<span class="' + (done ? 'tlc-pop-done' : '') + '">' + _calEsc(_calCleanTitle(o.text)) + '</span></div>'
    + '<div class="tlc-pop-kind">' + kindLabel + (done ? ' · 완료' : '') + '</div>'
    + rows
    + '<div class="tlc-pop-actions">'
    +   '<button type="button" class="tlc-btn" onclick="calPopDone(' + ids + ')">' + (done ? '완료 취소' : '완료') + '</button>'
    +   '<button type="button" class="tlc-btn" onclick="calPopEdit(' + t.id + occArg + ')">수정</button>'
    +   '<button type="button" class="tlc-btn tlc-pop-del" onclick="calPopDelete(' + ids + ')">삭제</button>'
    + '</div>';
  _calPopShow(html, anchor.getBoundingClientRect());
}
function calPopDone(taskId, stepId, occ) {
  calPopClose(true);
  if (stepId !== null) { toggleStep(taskId, stepId); return; }
  var m = occ ? mdtAllTasks().find(function (x) { return x.id === taskId; }) : null;
  if (m && recurIs(m) && occ !== recurKeyOf(m)) {
    // 앞날 회차를 미리 끝낸다 — 그 회차만 떼어 내서 완료한다
    toggleComplete(recurDetach(m, occ).id);
    return;
  }
  toggleComplete(taskId);
}
function calPopEdit(taskId, occ) {
  calPopClose(true);
  calOpenEvent(taskId, occ);
}
function calPopDelete(taskId, stepId, occ) {
  var m = (occ && stepId === null) ? mdtAllTasks().find(function (x) { return x.id === taskId; }) : null;
  if (m && recurIs(m)) {
    calPopClose(true);
    recurAskDelete(m, occ, function () {
      if (typeof renderTasks === 'function') renderTasks();
      if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
      calRefresh();
    });
    return;
  }
  if (!confirm(stepId === null ? '이 항목을 삭제하시겠습니까?' : '이 To Do 를 삭제하시겠습니까?')) return;
  calPopClose(true);
  if (stepId === null) deleteTaskLinked(taskId);
  else deleteStep(taskId, stepId);
}

function calCreate() {
  calCloseMenus();
  if (typeof openNewTaskPanel === 'function') openNewTaskPanel(null, { kind: 'event', date: _calKey(_cal.date) });
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
    +   '<button type="button" class="tlc-btn tlc-icon" id="tlc-prev" onclick="calStep(-1)" aria-label="이전">‹</button>'
    +   '<button type="button" class="tlc-btn tlc-icon" id="tlc-next" onclick="calStep(1)" aria-label="다음">›</button>'
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
    +     '<button type="button" class="tlc-btn" id="tlc-show-btn" onclick="calToggleMenu(\'show\')">표시 ▾</button>'
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
    else if (_cal.view === 'year') text = calYearShown() + '년';
    else if (_cal.view === 'list') text = appPeriodLabel() + ' 목록';
    else text = _cal.fc ? _cal.fc.view.title : '';
    title.textContent = text + ' ▾';
  }
  // 뭔가 숨겨 두었으면 버튼에 표시한다 — 안 보이는 이유를 찾아 헤매지 않게
  var showBtn = _calEl('tlc-show-btn');
  if (showBtn) {
    var sh = calShow();
    showBtn.classList.toggle('is-filtering', calFilterActive() || !sh.event || !sh.task || !sh.todo);
  }
  // 연도 보기는 표시 기간 밖으로 나가지 않는다
  var inYear = !_cal.query && _cal.view === 'year';
  var prev = _calEl('tlc-prev'), next = _calEl('tlc-next');
  if (prev) prev.disabled = inYear && calYearStep(-1) === null;
  if (next) next.disabled = inYear && calYearStep(1) === null;
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
    var nextYear = calYearStep(dir);
    if (nextYear === null) return;
    _cal.date = new Date(nextYear, _cal.date.getMonth(), 1);
    calRefresh();
    return;
  }
  if (_cal.view === 'list') {
    // 목록은 표시 기간 전체를 한 번에 그린다 → 화살표는 앞뒤 달로 스크롤한다
    var target = new Date(_cal.date.getFullYear(), _cal.date.getMonth() + dir, 1);
    var bounds = calPeriodBounds();
    if (target >= bounds.end || new Date(target.getFullYear(), target.getMonth() + 1, 1) <= bounds.start) return;
    _cal.date = target;
    _cal.scrollTo = _calKey(target);
    calScrollList();
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
  var keepScroll = el.scrollTop;   // 체크할 때마다 다시 그리므로 보던 자리를 지킨다
  el.innerHTML = '<div class="tlc-menu-h">TaskLog</div>'
    + row(show.event, 'calSetShow(\'event\',this.checked)', _calMarkHtml('event', 'var(--text-2)', false), '일정')
    + row(show.task, 'calSetShow(\'task\',this.checked)', _calMarkHtml('task', 'var(--text-2)', false), 'Task')
    + row(show.todo, 'calSetShow(\'todo\',this.checked)', _calMarkHtml('step', 'var(--text-2)', false), 'To Do')
    + row(show.done, 'calSetShow(\'done\',this.checked)', _calMarkHtml('task', 'var(--text-2)', true), '완료 항목')
    + '<div class="tlc-menu-h tlc-f-head"><span>Section · Project</span>'
    +   (calFilterActive() ? '<button type="button" class="tlc-f-reset" onclick="calFilterReset()">전체 보기</button>' : '')
    + '</div>' + calFilterHtml()
    + '<div class="tlc-menu-h">Google 캘린더 (읽기 전용)</div>' + google;
  el.querySelectorAll('input[data-mixed]').forEach(function (i) { i.indeterminate = true; });
  el.scrollTop = keepScroll;
}

// ── 연도 보기 ──
function calYearCounts(year) {
  var show = calShow(), counts = {};
  function add(d) {
    var k = _calKey(d);
    if (appPeriodHit([k, k])) counts[k] = (counts[k] || 0) + 1;
  }
  calCollectItems(new Date(year, 0, 1), new Date(year + 1, 0, 1)).forEach(function (it) {
    if (!calItemVisible(it, show)) return;
    if (it.kind !== 'event') { if (it.date.getFullYear() === year) add(it.date); return; }
    var day = new Date(it.date.getFullYear(), it.date.getMonth(), it.date.getDate());
    for (var n = 0; day < it.end && n < 92; n++) {
      if (day.getFullYear() === year) add(day);
      day.setDate(day.getDate() + 1);
    }
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
  var y = calYearShown();
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
    if (!_cal.query) _cal.queryAll = false;
    calRefresh();
  }, 150);
}
function calSearchToggleAll() {
  _cal.queryAll = !_cal.queryAll;
  calRefresh();
}
function _calClearSearch() {
  if (_cal.queryTimer) { clearTimeout(_cal.queryTimer); _cal.queryTimer = null; }
  _cal.query = '';
  _cal.queryAll = false;
  var s = _calEl('tlc-search');
  if (s) s.value = '';
}
function calRenderResults() {
  var el = _calEl('tlc-results');
  if (!el) return;
  var q = _cal.query.toLowerCase();
  // 검색은 숨겨 둔 완료 항목까지 찾는다 — '그거 언제 했더라' 를 찾으려고 쓰는 것이다
  var bounds = calPeriodBounds();   // 반복의 앞날 회차는 표시 기간 안만 펼친다 (끝이 없는 규칙이 있다)
  var rows = calCollectItems(bounds.start, bounds.end).filter(function (it) { return it.title.toLowerCase().indexOf(q) >= 0; });
  calGItems().forEach(function (ev) {
    if (ev.title.toLowerCase().indexOf(q) >= 0) {
      var span = _calGSpan(ev);
      rows.push({ kind: 'google', g: ev, title: ev.title, date: span[0], end: span[1], hasTime: !ev.allDay, done: false, color: ev.color });
    }
  });
  // 표시 기간 안만 보여 주고, 밖에 더 있으면 그 수를 알려 넓힐 수 있게 한다
  var inside = rows.filter(function (r) { return _calInPeriod(r.date, _calItemEnd(r)); });
  var outside = rows.length - inside.length;
  if (!_cal.queryAll) rows = inside;
  var outsideNote = outside
    ? ('<button type="button" class="tlc-res-more" onclick="calSearchToggleAll()">'
        + (_cal.queryAll ? '표시 기간(' + _calEsc(appPeriodLabel()) + ') 안만 보기' : '표시 기간 밖 ' + outside + '건 더 보기') + '</button>')
    : '';
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
    el.innerHTML = '<div class="tlc-empty">표시 기간(' + _calEsc(appPeriodLabel()) + ')에 검색 결과가 없습니다' + (outsideNote ? '<br>' + outsideNote : '') + '</div>';
    return;
  }
  var todayKey = _calKey(new Date()), lastKey = '', html = '';
  html += '<div class="tlc-res-sum">' + total + '건' + (total > CAL_RESULT_MAX ? ' · 오늘에서 가까운 ' + CAL_RESULT_MAX + '건만 표시' : '') + outsideNote + '</div>';
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
  else calItemPop({ kind: r.kind, taskId: r.taskId, stepId: r.stepId, color: r.color, occ: r.occ }, btn);
}

// ── 떠 있는 창 (요약 · 빠른 입력) ──
//  force 가 아니면 빠른 입력에 적던 제목이 있을 때 닫지 않는다 — 바깥을 잘못 눌러 날아가면 안 된다.
function calPopClose(force) {
  var name = _calEl('tlc-q-name');
  if (!force && name && name.value.trim()) return;
  document.querySelectorAll('.tlc-pop').forEach(function (el) { el.remove(); });
  if (_cal.fc) { try { _cal.fc.unselect(); } catch (e) {} }
}
function _calPopShow(html, rect, cls) {
  var old = document.querySelector('.tlc-pop');
  if (old) old.remove();
  var el = document.createElement('div');
  el.className = 'tlc-pop' + (cls ? ' ' + cls : '');
  el.innerHTML = html;
  document.body.appendChild(el);
  _cal.popAt = Date.now();
  var w = el.offsetWidth, h = el.offsetHeight, x, y;
  if (window.innerWidth <= 768) {
    // 폰: 누른 자리 옆에 띄우면 자판에 가려진다 → 화면 위쪽 가운데
    x = (window.innerWidth - w) / 2;
    y = Math.max(8, Math.min(window.innerHeight - h - 8, Math.round(window.innerHeight * 0.08)));
  } else {
    x = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
    y = rect.bottom + 6;
    if (y + h > window.innerHeight - 8) y = Math.max(8, rect.top - h - 6);
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  return el;
}

// ── 구글 일정 요약 (읽기 전용) ──
function calGooglePop(ev, anchor) {
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
  _calPopShow('<div class="tlc-pop-title">' + _calMarkHtml('google', ev.color, true) + '<span>' + _calEsc(ev.title) + '</span></div>'
    + '<div class="tlc-pop-row">' + _calEsc(when) + '</div>'
    + (cal ? '<div class="tlc-pop-row tlc-pop-dim">' + _calEsc(cal.name) + ' · 읽기 전용</div>' : '')
    + (ev.loc ? '<div class="tlc-pop-row">' + _calEsc(ev.loc) + '</div>' : '')
    + (ev.desc ? '<div class="tlc-pop-row tlc-pop-desc">' + _calEsc(ev.desc) + '</div>' : '')
    + (link ? '<a class="tlc-pop-link" href="' + _calEsc(link) + '" target="_blank" rel="noopener">Google 캘린더에서 열기</a>' : ''),
    anchor.getBoundingClientRect());
}

// ── 본문 전환 ──
function calSyncBody() {
  var fcEl = _calEl('tlc-fc'), yearEl = _calEl('tlc-year'), resEl = _calEl('tlc-results');
  if (!fcEl || !yearEl || !resEl) return;
  var mode = _cal.query ? 'search' : (_cal.view === 'year' ? 'year' : 'fc');
  fcEl.hidden = mode !== 'fc';
  yearEl.hidden = mode !== 'year';
  resEl.hidden = mode !== 'search';
  // 표시 기간이 바뀌면 목록 범위가 달라지므로 인스턴스를 다시 만든다
  var sig = JSON.stringify(appPeriod());
  if (_cal.fc && _cal.periodSig !== sig) {
    try { _cal.fc.destroy(); } catch (e) {}
    _cal.fc = null;
    if (_cal.view === 'list') _cal.scrollTo = _calKey(new Date());
  }
  _cal.periodSig = sig;
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
// 폰: 좌우로 밀어 앞뒤 기간으로. 목록은 한 줄로 이어지므로 밀 일이 없다.
//  항목을 끌려면 길게 눌러야 하므로 빠르게 미는 것과 겹치지 않는다.
function calWatchSwipe() {
  var body = _calEl('tlc-body');
  if (!body) return;
  var sx = null, sy = 0, st = 0;
  body.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  body.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var c = e.changedTouches[0], dx = c.clientX - sx, dy = c.clientY - sy, fromEdge = sx < 24 || sx > window.innerWidth - 24, quick = Date.now() - st < 600;
    sx = null;
    if (window.innerWidth > 768 || fromEdge || !quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (_cal.view === 'list' || _cal.query || _cal.menu || document.querySelector('.tlc-pop, .fc-event-dragging')) return;
    calStep(dx < 0 ? 1 : -1);
  }, { passive: true });
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
  calPopClose(true);
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
  calWatchSwipe();
  calSyncBody();
}

// 상단 메뉴·요약 창은 바깥을 누르면 닫는다
document.addEventListener('mousedown', function (e) {
  if (!e.target || !e.target.closest) return;
  // 터치는 탭이 끝나고 나서 가짜 mousedown 이 한 번 더 온다. 방금 연 창을 그것으로 닫지 않는다.
  if (!e.target.closest('.tlc-pop') && Date.now() - (_cal.popAt || 0) > 500) calPopClose();
  if (_cal.menu && !e.target.closest('.tlc-menu-wrap')) { calCloseMenus(); _cal.menuClosedAt = Date.now(); }
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  calPopClose(true);      // Esc 는 분명한 취소다 — 적던 제목이 있어도 닫는다
  if (_cal.menu) calCloseMenus();
});

// ── 단축키 (구글 캘린더와 같은 글자) ──
//  ⚠️ e.key 가 아니라 e.code 로 본다. 한글 입력 상태에서는 e.key 가 'ㅇ' 이나 'Process' 로 와서 아무것도 안 눌린다.
var CAL_KEYS = {
  KeyD: function () { calSetView('day'); }, KeyW: function () { calSetView('week'); }, KeyM: function () { calSetView('month'); },
  KeyY: function () { calSetView('year'); }, KeyA: function () { calSetView('list'); },
  KeyT: function () { calToday(); }, KeyJ: function () { calStep(1); }, KeyN: function () { calStep(1); },
  KeyK: function () { calStep(-1); }, KeyP: function () { calStep(-1); }, KeyC: function () { calCreate(); },
};
var CAL_KEY_HELP = [['T', '오늘'], ['D · W · M · Y · A', '일 · 주 · 월 · 연 · 목록'], ['J · N', '다음'], ['K · P', '이전'], ['C', '만들기'], ['/', '검색'], ['?', '이 도움말'], ['Esc', '닫기']];
function calKeyHelp() {
  var html = '<div class="tlc-pop-title"><span>단축키</span></div>'
    + CAL_KEY_HELP.map(function (k) { return '<div class="tlc-key-row"><span class="tlc-key">' + k[0] + '</span><span>' + k[1] + '</span></div>'; }).join('');
  var x = window.innerWidth / 2 - 130;
  _calPopShow(html, { left: x, right: x, top: 90, bottom: 90 });
}
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !_calEl('tlc-body')) return;
  var t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  // 다른 창이 떠 있으면 그 창이 먼저다
  if (document.getElementById('recur-dlg') || document.getElementById('settings-overlay')) return;
  var panel = document.getElementById('right-panel');
  if (panel && panel.classList.contains('open')) return;
  if (e.code === 'Slash' || e.key === '/' || e.key === '?') {
    e.preventDefault();
    if (e.shiftKey || e.key === '?') { calKeyHelp(); return; }
    var box = _calEl('tlc-search');
    if (box) box.focus();
    return;
  }
  var fn = e.shiftKey ? null : CAL_KEYS[e.code];
  if (!fn) return;
  e.preventDefault();
  calPopClose(true);
  fn();
});
