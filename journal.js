// ============================================
//  📓 주간일지 (Weekly Journal)
//  그 주의 업무 실적·성과를 기록하는 페이지
// ============================================

const JOURNAL_KEY = 'my-tasklog-journal';
var journalData = {};      // { 'YYYY-WW': { weekLabel, sections, memo, savedAt } }
var _journalWeek = null;   // 현재 선택된 주차 키 'YYYY-WW'

var JNLW_ROW_H = 40;       // 주간 그리드 시간 행 높이(px)

// ── 주차 유틸 ──────────────────────────────

function getWeekKey(date) {
  var d = new Date(date || Date.now());
  d.setHours(0, 0, 0, 0);
  // ISO 주차 기준
  var day = d.getDay() || 7; // 1=월 ~ 7=일
  d.setDate(d.getDate() + 4 - day);
  var yearStart = new Date(d.getFullYear(), 0, 1);
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

// ISO 주차(YYYY, WW)의 월요일 날짜 (getWeekKey와 일관)
function jnlIsoMonday(year, week) {
  var jan4 = new Date(year, 0, 4);          // 1월 4일은 항상 ISO 1주에 포함
  var day = jan4.getDay() || 7;
  var week1Mon = new Date(year, 0, 4 - (day - 1)); // 1주의 월요일
  return new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
}

// 주차의 "N월 N주" 정보 (목요일 기준 = ISO 대표일)
function jnlWeekMonthInfo(monday) {
  var thu = new Date(monday.getTime() + 3 * 86400000);
  return { year: thu.getFullYear(), month: thu.getMonth() + 1, wom: Math.ceil(thu.getDate() / 7) };
}

function getWeekLabel(key) {
  // 'YYYY-WW' → 'YYYY년 N월 N주 (MM.DD ~ MM.DD)'
  var parts = key.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]);
  var monday = jnlIsoMonday(year, week);
  var sunday = new Date(monday.getTime() + 6 * 86400000);
  function fmt(d) { return (d.getMonth()+1) + '.' + String(d.getDate()).padStart(2,'0'); }
  var mi = jnlWeekMonthInfo(monday);
  return year + '년 ' + mi.month + '월 ' + mi.wom + '주 (' + fmt(monday) + ' ~ ' + fmt(sunday) + ')';
}

function getPrevWeekKey(key) {
  var parts = key.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]);
  if (week <= 1) {
    // 전년도 마지막 주
    var dec28 = new Date(year - 1, 11, 28);
    return getWeekKey(dec28);
  }
  return year + '-W' + String(week - 1).padStart(2, '0');
}

function getNextWeekKey(key) {
  var parts = key.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]);
  // 해당 연도 총 주수
  var dec28 = new Date(year, 11, 28);
  var totalWeeks = parseInt(getWeekKey(dec28).split('-W')[1]);
  if (week >= totalWeeks) {
    return (year + 1) + '-W01';
  }
  return year + '-W' + String(week + 1).padStart(2, '0');
}

// ── 데이터 로드/저장 ───────────────────────

function loadJournal() {
  var saved = localStorage.getItem(JOURNAL_KEY);
  if (saved) { try { journalData = JSON.parse(saved); } catch(e) { journalData = {}; } }
}

function saveJournal() {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(journalData));
}

function getJournalEntry(key) {
  if (!journalData[key]) {
    journalData[key] = {
      weekLabel: getWeekLabel(key),
      sections: {
        achievement: '',  // 주요 성과
        issue: '',        // 이슈 / 어려움
        plan: ''          // 다음 주 계획
      },
      memo: '',           // 기타 메모
      evaluation: { goal: 0, prioritization: 0, timeManagement: 0, problemSolving: 0, collaboration: 0 },
      savedAt: null
    };
  }
  return journalData[key];
}

// ── 렌더 ───────────────────────────────────

function renderJournalView() {
  loadJournal();
  if (!_journalWeek) _journalWeek = getWeekKey();

  var content = document.getElementById('page-content');
  if (!content) return;

  content.innerHTML =
    '<div class="jnl-page">'
    + '<div class="jnl-body">'
    +   '<div class="jnl-left">'
    +     jnlMonthCalPanel()          // 달력(주 선택용)
    +     jnlTrackerSection()
    +     jnlEvalSection()
    +   '</div>'
    +   '<div class="jnl-right">'
    +     '<div class="jnl-week-wrap" id="jnl-week-wrap">'
    +       '<div class="jnl-week-grid-host" id="jnl-week-grid-host">' + jnlBuildWeekGrid() + '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + jnlSection('issue', 'Retrospective', '이번 주를 돌아보며 배운 점과 개선할 점을 기록하세요.')
    + '</div>';

  var slot = document.getElementById('topbar-journal-slot');
  if (slot) slot.innerHTML = '<button class="jnl-save-btn" id="jnl-save-btn" onclick="jnlSave()">저장</button>';

  jnlFillEntry(_journalWeek);
}

// 캘린더 패널 — 일자 클릭 시 해당 주가 그리드에 표시
function jnlMonthCalPanel() {
  return '<div class="jnl-cal-panel">'
    + '<div class="jnl-cal-head">'
    +   '<button class="jnl-cal-navbtn" onclick="jnlCalNav(-1)">\u2039</button>'
    +   '<div class="jnl-cal-title" id="jnl-cal-title"></div>'
    +   '<button class="jnl-cal-navbtn" onclick="jnlCalNav(1)">\u203a</button>'
    + '</div>'
    + '<div class="jnl-cal-grid" id="jnl-cal-grid"></div>'
    + '<div id="jnl-week-label" style="display:none;"></div>'
    + '</div>';
}

// 현재 입력값을 메모리 엔트리에 임시 저장(탭 전환 시 유실 방지)
function jnlCaptureCurrent() {
  if (!_journalWeek) return;
  var entry = getJournalEntry(_journalWeek);
  ['achievement','issue','plan'].forEach(function(k) {
    var el = document.getElementById('jnl-' + k);
    if (!el) return;
    entry.sections[k] = (el.tagName === 'TEXTAREA') ? el.value : el.innerHTML;
  });
  entry.evaluation = Object.assign({}, _jnlEval);
}

function jnlSection(key, title, hint, actionBtn, rich) {
  var field = rich
    ? '<div class="jnl-rta" id="jnl-' + key + '" contenteditable="true" oninput="jnlMarkDirty()"></div>'
    : '<textarea class="jnl-ta" id="jnl-' + key + '" oninput="jnlMarkDirty()"></textarea>';
  return '<div class="jnl-section jnl-sec-' + key + '">'
    + '<div class="jnl-section-head">'
    +   '<div class="jnl-section-title">' + title + '</div>'
    +   (actionBtn || '')
    + '</div>'
    + field
    + '</div>';
}

function jnlFillEntry(key) {
  var entry = getJournalEntry(key);
  var label = document.getElementById('jnl-week-label');
  if (label) label.textContent = entry.weekLabel;

  ['achievement','issue','plan'].forEach(function(k) {
    var el = document.getElementById('jnl-' + k);
    if (!el) return;
    var val = entry.sections[k] || '';
    if (el.tagName === 'TEXTAREA') el.value = val;
    else el.innerHTML = jnlNormalizeRich(val);
  });

  var mon = jnlWeekMonday(key);
  _jnlCalMonth = new Date(mon.getFullYear(), mon.getMonth(), 1);
  jnlBuildCalendar();
  jnlBuildTracker();
  jnlRefreshWeekGrid();   // 주간 탭이면 그리드/네비 라벨 갱신
  _jnlEval = Object.assign({ goal: 0, prioritization: 0, timeManagement: 0, problemSolving: 0, collaboration: 0 }, entry.evaluation || {});
  jnlRenderEvalState();
  jnlUpdateSavedAt(entry.savedAt);
  jnlClearDirty();
}

function jnlMarkDirty() {
  var btn = document.getElementById('jnl-save-btn');
  if (btn) { btn.textContent = '저장 *'; btn.style.opacity = '1'; }
}

function jnlClearDirty() {
  var btn = document.getElementById('jnl-save-btn');
  if (btn) { btn.textContent = '저장'; btn.style.opacity = '0.6'; }
}

// 화면에서 '마지막 저장' 줄을 걷어냈다(그 높이는 본문이 가져갔다).
// 저장 시각을 다시 보여 주고 싶으면 #jnl-saved-at 만 되살리면 된다.
function jnlUpdateSavedAt(iso) {
  var el = document.getElementById('jnl-saved-at');
  if (!el) return;
  if (!iso) { el.textContent = ''; return; }
  var d = new Date(iso);
  el.textContent = '마지막 저장: ' + d.toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

// ── 저장 ───────────────────────────────────

function jnlSave() {
  if (!_journalWeek) return;
  var entry = getJournalEntry(_journalWeek);
  ['achievement','issue','plan'].forEach(function(k) {
    var el = document.getElementById('jnl-' + k);
    if (!el) return;
    entry.sections[k] = (el.tagName === 'TEXTAREA') ? el.value : el.innerHTML;
  });
  entry.evaluation = Object.assign({}, _jnlEval);
  entry.savedAt = new Date().toISOString();
  entry.weekLabel = getWeekLabel(_journalWeek);
  saveJournal();
  jnlUpdateSavedAt(entry.savedAt);
  jnlClearDirty();
  showJnlToast('저장되었습니다');
}

// ── 주차 이동 ───────────────────────────────

function jnlPrevWeek() {
  _journalWeek = getPrevWeekKey(_journalWeek);
  jnlFillEntry(_journalWeek);
}

function jnlNextWeek() {
  var next = getNextWeekKey(_journalWeek);
  var thisWeek = getWeekKey();
  // 미래 주차는 이번 주까지만 허용
  if (next > thisWeek) return;
  _journalWeek = next;
  jnlFillEntry(_journalWeek);
}

function jnlGoThisWeek() {
  _journalWeek = getWeekKey();
  jnlFillEntry(_journalWeek);
}

// ── 주간 완료 To Do 그리드 (일자 × 시간대) ─────
//   · 완료된 Task / To Do 를 그 주의 요일(월~일) × 시간대에 배치
//   · 드래그로 일자 이동 및 시간대 조정 (완료일 접두사도 동기화)

function jnlPad2(n) { return String(n).padStart(2, '0'); }
function jnlDayKey(d) { return d.getFullYear() + '-' + jnlPad2(d.getMonth() + 1) + '-' + jnlPad2(d.getDate()); }

// 월간 달력에서 일자 클릭 → 그 주의 주간 보기로 이동
function jnlPickDate(dayKey) {
  var parts = (dayKey || '').split('-');
  if (parts.length !== 3) return;
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  var wk = getWeekKey(d);
  if (wk > getWeekKey()) return;   // 미래 주는 이동 불가
  jnlCaptureCurrent();
  _journalWeek = wk;
  renderJournalView();
}

// 주간 탭 이전/다음 주
function jnlWeekStep(delta) {
  if (delta < 0) jnlPrevWeek(); else jnlNextWeek();
}

// Task / Step 객체 찾기
function jnlFindObj(taskId, stepId) {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return null;
  var t = tasks.find(function (x) { return x.id === taskId; });
  if (!t) return null;
  if (stepId === null || stepId === undefined) return t;
  return (t.steps || []).find(function (s) { return s.id === stepId; }) || null;
}

// 완료일 [YYMMDD] 접두사를 특정 날짜로 지정/치환
function jnlSetCompletedDatePrefix(text, date) {
  var p = '[' + String(date.getFullYear()).slice(2) + jnlPad2(date.getMonth() + 1) + jnlPad2(date.getDate()) + '] ';
  if (/^\[\d{6}\]\s*/.test(text || '')) return (text || '').replace(/^\[\d{6}\]\s*/, p);
  return p + (text || '');
}

// 항목의 그리드 배치 정보 { date, timed }
//   · 일자(day)는 완료일([YYMMDD] 접두사)이 권위 — Task 편집에서 완료일을 바꾸면 그리드에 반영
//   · 시간(time)은 그리드에서만 조정하는 wdLogAt 사용(wdTimed일 때)
function jnlItemLogInfo(obj) {
  var pd = jnlParseCompletedDate(obj ? obj.text : '');
  if (!pd) return { date: null, timed: false };
  if (obj && obj.wdTimed && obj.wdLogAt) {
    var w = new Date(obj.wdLogAt);
    if (!isNaN(w.getTime())) {
      return { date: new Date(pd.getFullYear(), pd.getMonth(), pd.getDate(), w.getHours(), w.getMinutes(), 0, 0), timed: true };
    }
  }
  // 그리드에서 별도로 옮기지 않았으면 완료 시각(completedAt)을 그대로 사용
  //  → To Do 완료 즉시 그 시각에 자동 배치(완료 ↔ Work Diary 정보 동기화)
  if (obj && obj.completedAt) {
    var ca = new Date(obj.completedAt);
    if (!isNaN(ca.getTime())) {
      return { date: new Date(pd.getFullYear(), pd.getMonth(), pd.getDate(), ca.getHours(), ca.getMinutes(), 0, 0), timed: true };
    }
  }
  return { date: new Date(pd.getFullYear(), pd.getMonth(), pd.getDate(), 12, 0, 0, 0), timed: false };
}

// 07:00 기준 선형 분(0=07:00 … 1439=06:59 다음날)
var JNLW_WIN_START = 7;      // 그리드 최상단 시각(07:00)
var JNLW_SNAP = 10;         // 스냅 단위(분) — 지속시간/이동 10분 단위
var JNLW_MIN_DUR = 10;      // 최소 지속시간(분)
function jnlwClockToLin(h, m) { return (((h * 60 + m) - JNLW_WIN_START * 60) % 1440 + 1440) % 1440; }
function jnlwLinToClock(lin) { var c = (JNLW_WIN_START * 60 + lin) % 1440; return { h: Math.floor(c / 60), m: c % 60 }; }
function jnlwFmtLin(lin) { var c = jnlwLinToClock(lin); return jnlPad2(c.h) + ':' + jnlPad2(c.m); }

// 선택된 주차에 완료된 Task + To Do 를 그리드 배치정보와 함께 수집
// (그리드는 To Do만 사용하지만, Load Data용으로 Task도 함께 수집)
function jnlCollectWeekGridItems(weekKey) {
  var out = [];
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return out;
  var r = getWeekRange(weekKey);
  var mondayMid = new Date(r.start); mondayMid.setHours(0, 0, 0, 0);
  var eiColors = (typeof EI_COLORS !== 'undefined') ? EI_COLORS : {};
  function place(obj, type, task) {
    if (!obj || !obj.completed) return;         // 완료된 항목만 대상
    var info = jnlItemLogInfo(obj);
    if (!info.date) return;
    var day0 = new Date(info.date); day0.setHours(0, 0, 0, 0);
    var di = Math.round((day0 - mondayMid) / 86400000);
    if (di < 0 || di > 6) return;
    var rec = {
      type: type, taskId: task.id, stepId: (type === 'todo') ? obj.id : null,
      text: jnlCleanText(obj.text),
      taskText: (type === 'todo') ? jnlCleanText(task.text) : '',   // 상위 Task명
      // 왼쪽 컬러: task 우선순위 색이 아니라, 상위 project 의 section 테마 색
      color: (typeof getGanttColor === 'function')
        ? getGanttColor(task)
        : (eiColors[task.eisenhower] || 'var(--brand-primary)'),
      day: di, timed: info.timed, hour: info.date.getHours(), min: info.date.getMinutes(), dt: info.date
    };
    if (info.timed) {
      rec.startLin = jnlwClockToLin(rec.hour, rec.min);
      rec.durMin = Math.max(JNLW_MIN_DUR, obj.wdDurMin || 60);
      rec.endLin = Math.min(1440, rec.startLin + rec.durMin);
    }
    out.push(rec);
  }
  tasks.forEach(function (t) {
    place(t, 'task', t);
    (t.steps || []).forEach(function (s) { place(s, 'todo', t); });
  });
  return out;
}

// 하루치 timed 항목 레인 배치(겹침 나란히)
function jnlwLayoutDay(dayItems) {
  dayItems.sort(function (a, b) { return a.startLin - b.startLin || a.endLin - b.endLin; });
  var clusters = [], cur = [], curMaxEnd = -1;
  dayItems.forEach(function (it) {
    if (cur.length && it.startLin >= curMaxEnd) { clusters.push(cur); cur = []; curMaxEnd = -1; }
    cur.push(it); curMaxEnd = Math.max(curMaxEnd, it.endLin);
  });
  if (cur.length) clusters.push(cur);
  clusters.forEach(function (cl) {
    var lanesEnd = [];
    cl.forEach(function (it) {
      var l = 0;
      for (; l < lanesEnd.length; l++) { if (it.startLin >= lanesEnd[l]) break; }
      it.lane = l; lanesEnd[l] = it.endLin;
    });
    cl.forEach(function (it) { it.lanes = lanesEnd.length; });
  });
}

// timed 블록 HTML
function jnlwBlockHTML(it, totalH) {
  var topPx = it.startLin / 1440 * totalH;
  var hPx = Math.max((it.endLin - it.startLin) / 1440 * totalH, 20);
  var w = 100 / (it.lanes || 1);
  var left = (it.lane || 0) * w;
  var safe = jnlEscape(it.text || '');
  var parent = jnlEscape(it.taskText || '');
  var sid = (it.stepId == null) ? 'null' : it.stepId;
  var tip = (parent ? parent + ' › ' : '') + safe;
  return '<div class="jnlw-ev" data-task="' + it.taskId + '" data-step="' + sid + '"'
    + ' style="top:' + topPx.toFixed(1) + 'px;height:' + hPx.toFixed(1) + 'px;left:calc(' + left + '% + 1px);width:calc(' + w + '% - 3px);'
    + 'border-left:3px solid ' + it.color + ';"'
    + ' title="' + tip + '"'
    + ' onpointerdown="jnlwEvDown(event,' + it.taskId + ',' + sid + ',false)">'
    + '<div class="jnlw-ev-rz jnlw-ev-rz-top" onpointerdown="jnlwRzDown(event,\'top\',' + it.taskId + ',' + sid + ')"></div>'
    + '<div class="jnlw-ev-in">'
    // 그리드에는 To Do 만 올라오므로 'ToDo' 배지는 늘 같은 말이다 → 자리만 차지해서 뺐다
    + '<span class="jnlw-ev-head"><span class="jnlw-ev-txt">' + safe + '</span></span>'
    + (parent ? '<span class="jnlw-ev-parent">' + parent + '</span>' : '')
    + '</div>'
    + '<div class="jnlw-ev-rz jnlw-ev-rz-bot" onpointerdown="jnlwRzDown(event,\'bot\',' + it.taskId + ',' + sid + ')"></div>'
    + '</div>';
}

// 종일 칩 HTML (텍스트만)
function jnlwAlldayChip(it) {
  var safe = jnlEscape(it.text || '');
  var sid = (it.stepId == null) ? 'null' : it.stepId;
  return '<div class="jnlw-chip" data-task="' + it.taskId + '" data-step="' + sid + '"'
    + ' style="border-left:3px solid ' + it.color + ';" title="' + safe + '"'
    + ' onpointerdown="jnlwEvDown(event,' + it.taskId + ',' + sid + ',true)">'
    + '<span class="jnlw-chip-head"><span class="jnlw-chip-x">' + safe + '</span></span>'
    + '</div>';
}

// 주간 그리드 HTML (시간 07:00~06:00, 종일은 최하단, 내부 스크롤)
function jnlBuildWeekGrid() {
  var r = getWeekRange(_journalWeek);
  var start = new Date(r.start); start.setHours(0, 0, 0, 0);
  var todayKey = jnlDayKey(new Date());
  var totalH = 24 * JNLW_ROW_H;
  // 주말은 적을 일이 적다 — 토·일을 평일의 절반으로 줄이고 그만큼 월~금을 넓힌다.
  // (열 순서: 거터 · 월 화 수 목 금 · 토 일)
  var cols = '52px repeat(5, minmax(0, 1fr)) repeat(2, minmax(0, 0.5fr))';

  var items = jnlCollectWeekGridItems(_journalWeek).filter(function (it) { return it.type === 'todo'; });
  var timedByDay = [], alldayByDay = [];
  for (var i = 0; i < 7; i++) { timedByDay.push([]); alldayByDay.push([]); }
  items.forEach(function (it) { (it.timed ? timedByDay[it.day] : alldayByDay[it.day]).push(it); });
  timedByDay.forEach(jnlwLayoutDay);

  // 헤더 (요일명 제거, 날짜만 · 주말 음영)
  var head = '<div class="jnlw-head" style="grid-template-columns:' + cols + ';"><div class="jnlw-gutcell"></div>';
  for (var d = 0; d < 7; d++) {
    var dt = new Date(start.getTime() + d * 86400000);
    var isToday = jnlDayKey(dt) === todayKey;
    var wknd = (d === 5 || d === 6);
    head += '<div class="jnlw-dayhead' + (isToday ? ' today' : '') + (d === 5 ? ' sat' : d === 6 ? ' sun' : '') + (wknd ? ' jnlw-wknd' : '') + '">'
      + '<span class="jnlw-dnum">' + dt.getDate() + '</span></div>';
  }
  head += '</div>';

  // 시간 거터(07:00→06:00)
  var gutter = '<div class="jnlw-gutter" style="height:' + totalH + 'px;">';
  for (var r2 = 0; r2 < 24; r2++) {
    var hh = (JNLW_WIN_START + r2) % 24;
    gutter += '<div class="jnlw-hlabel" style="height:' + JNLW_ROW_H + 'px;">' + jnlPad2(hh) + ':00</div>';
  }
  gutter += '</div>';

  // 요일 컬럼(절대배치 블록) — 주말 컬럼 음영
  var lineBg = 'repeating-linear-gradient(to bottom, transparent 0, transparent ' + (JNLW_ROW_H - 1) + 'px, var(--border) ' + (JNLW_ROW_H - 1) + 'px, var(--border) ' + JNLW_ROW_H + 'px)';
  var daycols = '';
  for (var dd = 0; dd < 7; dd++) {
    var blocks = timedByDay[dd].map(function (it) { return jnlwBlockHTML(it, totalH); }).join('');
    var wk2 = (dd === 5 || dd === 6) ? ' jnlw-wknd' : '';
    daycols += '<div class="jnlw-daycol' + wk2 + '" data-day="' + dd + '" style="height:' + totalH + 'px;background-image:' + lineBg + ';">' + blocks + '</div>';
  }

  var canvas = '<div class="jnlw-canvas" style="grid-template-columns:' + cols + ';">' + gutter + daycols + '</div>';

  // 종일(최하단)
  var allday = '<div class="jnlw-allday" style="grid-template-columns:' + cols + ';"><div class="jnlw-gutcell jnlw-allday-lbl">종일</div>';
  for (var d3 = 0; d3 < 7; d3++) {
    var wk3 = (d3 === 5 || d3 === 6) ? ' jnlw-wknd' : '';
    allday += '<div class="jnlw-allday-cell' + wk3 + '" data-day="' + d3 + '">' + alldayByDay[d3].map(jnlwAlldayChip).join('') + '</div>';
  }
  allday += '</div>';

  return '<div class="jnlw">'
    + '<div class="jnlw-scroll" id="jnlw-scroll">'
    +   head
    +   canvas
    +   allday
    + '</div>'
    + '</div>';
}

// 그리드만 다시 그리기(입력 내용 보존) + 주간 네비 라벨 갱신
function jnlRefreshWeekGrid() {
  var host = document.getElementById('jnl-week-grid-host');
  if (host) {
    var prev = document.getElementById('jnlw-scroll');
    var st = prev ? prev.scrollTop : 0;
    host.innerHTML = jnlBuildWeekGrid();
    var sc = document.getElementById('jnlw-scroll');
    if (sc) sc.scrollTop = st;
  }
  var lbl = document.getElementById('jnl-week-nav-label');
  if (lbl) lbl.textContent = getWeekLabel(_journalWeek);
}

// ── 포인터 기반 이동 / 리사이즈 엔진 ───────────
var _jnlwPtr = null;

function jnlwSnap(v, lo, hi) { v = Math.round(v / JNLW_SNAP) * JNLW_SNAP; return Math.max(lo, Math.min(hi, v)); }
function jnlwDaycols() { return Array.prototype.slice.call(document.querySelectorAll('#jnl-week-grid-host .jnlw-daycol')); }
function jnlwLinAt(colRect, clientY) { return (clientY - colRect.top) / colRect.height * 1440; }

// 값이 위치한 요일/종일 판정
function jnlwHitTest(clientX, clientY) {
  var acells = document.querySelectorAll('#jnl-week-grid-host .jnlw-allday-cell');
  for (var i = 0; i < acells.length; i++) {
    var rc = acells[i].getBoundingClientRect();
    if (clientX >= rc.left && clientX <= rc.right && clientY >= rc.top && clientY <= rc.bottom)
      return { kind: 'allday', day: parseInt(acells[i].getAttribute('data-day'), 10) };
  }
  var cols = jnlwDaycols();
  for (var j = 0; j < cols.length; j++) {
    var r = cols[j].getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right) {
      var lin = jnlwSnap(jnlwLinAt(r, clientY), 0, 1440 - JNLW_SNAP);
      return { kind: 'timed', day: parseInt(cols[j].getAttribute('data-day'), 10), lin: lin, rect: r };
    }
  }
  return null;
}

// 리사이즈 중 시간 표시 툴팁
function jnlwTip(show, clientX, clientY, text) {
  var t = document.getElementById('jnlw-tip');
  if (!show) { if (t && t.parentNode) t.parentNode.removeChild(t); return; }
  if (!t) { t = document.createElement('div'); t.id = 'jnlw-tip'; t.className = 'jnlw-tip'; document.body.appendChild(t); }
  t.textContent = text;
  t.style.left = clientX + 'px';
  t.style.top = clientY + 'px';
}

// 이동 미리보기 고스트 (투명도 80%)
function jnlwPreview(hit, p) {
  var g = document.getElementById('jnlw-ghost');
  if (!hit) { if (g && g.parentNode) g.parentNode.removeChild(g); return; }
  if (!g) { g = document.createElement('div'); g.id = 'jnlw-ghost'; g.className = 'jnlw-ghost'; document.body.appendChild(g); }
  g.style.borderColor = p.color;
  g.style.background = 'color-mix(in srgb, ' + p.color + ' 24%, var(--surface))';
  var safe = jnlEscape(jnlCleanText(p.obj.text));
  if (hit.kind === 'timed') {
    var rect = hit.rect;
    var startLin = jnlwSnap(hit.lin - (p.srcAllday ? 0 : p.grabLin), 0, 1440 - JNLW_SNAP);
    var endLin = Math.min(1440, startLin + p.durMin);
    g.style.left = rect.left + 'px';
    g.style.width = rect.width + 'px';
    g.style.top = (rect.top + startLin / 1440 * rect.height) + 'px';
    g.style.height = Math.max((endLin - startLin) / 1440 * rect.height, 18) + 'px';
    g.innerHTML = '<span class="jnlw-ghost-t">' + jnlwFmtLin(startLin) + '</span> ' + safe;
  } else {
    var cell = document.querySelector('#jnl-week-grid-host .jnlw-allday-cell[data-day="' + hit.day + '"]');
    if (!cell) { if (g.parentNode) g.parentNode.removeChild(g); return; }
    var rc = cell.getBoundingClientRect();
    g.style.left = rc.left + 'px'; g.style.width = rc.width + 'px';
    g.style.top = rc.top + 'px'; g.style.height = Math.min(rc.height - 2, 24) + 'px';
    g.innerHTML = '<span class="jnlw-ghost-t">종일</span> ' + safe;
  }
}

// 값의 그리드 값을 확정하고 완료일(일자/시간)과 동기화
function jnlwApply(obj, day, timed, startLin, durMin) {
  var r = getWeekRange(_journalWeek);
  var base = new Date(r.start); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + day);
  if (timed) {
    var c = jnlwLinToClock(startLin);
    base.setHours(c.h, c.m, 0, 0);
    obj.wdLogAt = base.toISOString(); obj.wdTimed = true;
    obj.wdDurMin = Math.max(JNLW_MIN_DUR, durMin || obj.wdDurMin || 60);
  } else {
    base.setHours(12, 0, 0, 0);
    obj.wdLogAt = base.toISOString(); obj.wdTimed = false;
  }
  // 그리드에서 세팅한 일자를 완료일([YYMMDD])과 동기화
  obj.text = jnlSetCompletedDatePrefix(obj.text, base);
  // 그리드 배치 일시를 To Do 완료시각(completedAt)에도 반영 → Task 수정 표시([MMDD]·툴팁)와 상호 동기화
  obj.completedAt = base.toISOString();
  if (typeof saveTasks === 'function') saveTasks();
  jnlRefreshWeekGrid();
}

// 이동 시작 (블록 본문 / 종일 칩 공통)
function jnlwEvDown(e, taskId, stepId, srcAllday) {
  if (e.button != null && e.button !== 0) return;
  var obj = jnlFindObj(taskId, (stepId === 'null') ? null : stepId);
  if (!obj) return;
  var el = e.currentTarget;
  var grabLin = 0, origStartLin = 0;
  if (!srcAllday) {
    var col = el.closest('.jnlw-daycol');
    if (col) {
      // 시작 위치(분)는 실제 배치정보로 계산 — wdLogAt이 없을 수 있음(완료 직후/Task에서 완료일 수정 → completedAt만 존재)
      var infoD = jnlItemLogInfo(obj);
      var eff = (infoD && infoD.date) ? infoD.date : (obj.wdLogAt ? new Date(obj.wdLogAt) : null);
      origStartLin = eff ? jnlwClockToLin(eff.getHours(), eff.getMinutes()) : 0;
      grabLin = jnlwLinAt(col.getBoundingClientRect(), e.clientY) - origStartLin;
    }
  }
  _jnlwPtr = { mode: 'move', taskId: taskId, stepId: (stepId === 'null') ? null : stepId, obj: obj, el: el,
    x0: e.clientX, y0: e.clientY, moved: false, srcAllday: srcAllday,
    durMin: (obj.wdTimed ? (obj.wdDurMin || 60) : 60), grabLin: grabLin,
    color: (el && el.style && el.style.borderLeftColor) || 'var(--brand-primary)' };
  try { el.setPointerCapture(e.pointerId); } catch (err) {}
  document.addEventListener('pointermove', jnlwPtrMove);
  document.addEventListener('pointerup', jnlwPtrUp);
  e.preventDefault();
}

// 리사이즈 시작
function jnlwRzDown(e, edge, taskId, stepId) {
  e.stopPropagation();
  if (e.button != null && e.button !== 0) return;
  var obj = jnlFindObj(taskId, (stepId === 'null') ? null : stepId);
  var info = obj ? jnlItemLogInfo(obj) : null;
  if (!obj || !info || !info.timed || !info.date) return;   // completedAt로 timed인 항목도 리사이즈 허용
  var block = e.currentTarget.closest('.jnlw-ev');
  var col = block ? block.closest('.jnlw-daycol') : null;
  if (!col) return;
  var d = info.date;                                         // wdLogAt이 없어도 실제 배치 시각 사용
  var startLin = jnlwClockToLin(d.getHours(), d.getMinutes());
  var endLin = Math.min(1440, startLin + Math.max(JNLW_MIN_DUR, obj.wdDurMin || 60));
  _jnlwPtr = { mode: 'resize', edge: edge, taskId: taskId, stepId: (stepId === 'null') ? null : stepId, obj: obj,
    el: block, col: col, startLin: startLin, endLin: endLin, day: parseInt(col.getAttribute('data-day'), 10) };
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  document.addEventListener('pointermove', jnlwPtrMove);
  document.addEventListener('pointerup', jnlwPtrUp);
  e.preventDefault();
}

function jnlwPtrMove(e) {
  if (!_jnlwPtr) return;
  var p = _jnlwPtr;
  if (p.mode === 'move') {
    if (!p.moved && (Math.abs(e.clientX - p.x0) > 4 || Math.abs(e.clientY - p.y0) > 4)) {
      p.moved = true; if (p.el) p.el.classList.add('jnlw-dragging');
    }
    if (!p.moved) return;
    document.querySelectorAll('.jnlw-drop-hl').forEach(function (n) { n.classList.remove('jnlw-drop-hl'); });
    var hit = jnlwHitTest(e.clientX, e.clientY);
    if (hit) {
      var sel = (hit.kind === 'allday')
        ? document.querySelector('#jnl-week-grid-host .jnlw-allday-cell[data-day="' + hit.day + '"]')
        : document.querySelector('#jnl-week-grid-host .jnlw-daycol[data-day="' + hit.day + '"]');
      if (sel) sel.classList.add('jnlw-drop-hl');
    }
    jnlwPreview(hit, p);          // 이동 후 위치 미리보기(투명도 80%)
  } else if (p.mode === 'resize') {
    var totalH = 24 * JNLW_ROW_H;
    var lin = jnlwLinAt(p.col.getBoundingClientRect(), e.clientY);
    var edgeLin;
    if (p.edge === 'bot') {
      var ne = jnlwSnap(lin, p.startLin + JNLW_SNAP, 1440);
      p.newEnd = ne; p.newStart = p.startLin; edgeLin = ne;
      p.el.style.top = (p.startLin / 1440 * totalH) + 'px';
      p.el.style.height = Math.max((ne - p.startLin) / 1440 * totalH, 20) + 'px';
    } else {
      var ns = jnlwSnap(lin, 0, p.endLin - JNLW_SNAP);
      p.newStart = ns; p.newEnd = p.endLin; edgeLin = ns;
      p.el.style.top = (ns / 1440 * totalH) + 'px';
      p.el.style.height = Math.max((p.endLin - ns) / 1440 * totalH, 20) + 'px';
    }
    jnlwTip(true, e.clientX, e.clientY, jnlwFmtLin(edgeLin));   // 끌고 있는 선의 시간 표시
  }
}

function jnlwPtrUp(e) {
  document.removeEventListener('pointermove', jnlwPtrMove);
  document.removeEventListener('pointerup', jnlwPtrUp);
  var p = _jnlwPtr; _jnlwPtr = null;
  document.querySelectorAll('.jnlw-drop-hl').forEach(function (n) { n.classList.remove('jnlw-drop-hl'); });
  jnlwTip(false);            // 시간 툴팁 제거
  jnlwPreview(null);        // 미리보기 고스트 제거
  if (!p) return;

  if (p.mode === 'move') {
    if (!p.moved) { jnlwOpen(p.taskId); return; }     // 이동 없으면 상세 열기
    var hit = jnlwHitTest(e.clientX, e.clientY);
    if (!hit) { jnlRefreshWeekGrid(); return; }
    if (hit.kind === 'allday') {
      jnlwApply(p.obj, hit.day, false);
    } else {
      var startLin = jnlwSnap(hit.lin - (p.srcAllday ? 0 : p.grabLin), 0, 1440 - JNLW_SNAP);
      jnlwApply(p.obj, hit.day, true, startLin, p.durMin);
    }
  } else if (p.mode === 'resize') {
    var start = (p.newStart != null) ? p.newStart : p.startLin;
    var end = (p.newEnd != null) ? p.newEnd : p.endLin;
    jnlwApply(p.obj, p.day, true, start, Math.max(JNLW_MIN_DUR, end - start));
  }
}

// 칩/블록 클릭 → Task 상세
function jnlwOpen(taskId) {
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
  else if (typeof openTaskPanel === 'function') openTaskPanel(taskId);
}

// ── TASK·TO DO 불러오기 ────────────────────

// 주차 키 → { start: 월요일 00:00, end: 일요일 23:59 }
function getWeekRange(key) {
  var parts = key.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]);
  var monday = jnlIsoMonday(year, week);
  monday.setHours(0, 0, 0, 0);
  var sunday = new Date(monday.getTime() + 6 * 86400000);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

// 완료 제목의 [YYMMDD] 접두사 → Date (없으면 null)
function jnlParseCompletedDate(text) {
  var m = /^\[(\d{2})(\d{2})(\d{2})\]/.exec(text || '');
  if (!m) return null;
  var d = new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  d.setHours(12, 0, 0, 0);
  return d;
}

// 표시용: [YYMMDD] 접두사 제거 + 공백 정리
function jnlCleanText(text) {
  return (text || '').replace(/^\[\d{6}\]\s*/, '').trim();
}

function jnlFmtMD(d) {
  return (d.getMonth() + 1) + '.' + String(d.getDate()).padStart(2, '0');
}

// HTML 이스케이프
function jnlEscape(s) {
  return (s || '').replace(/[&<>"]/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}

// TASK / ToDo 배지 HTML
function jnlBadge(type) {
  var label = (type === 'task') ? 'TASK' : 'ToDo';
  return '<span class="jnl-badge jnl-badge-' + type + '" contenteditable="false">' + label + '</span>';
}

// 한 항목(배지 + [시간 라벨] + 텍스트)을 한 줄(div)로
function jnlItemHTML(item) {
  var lbl = item.label
    ? '<span class="jnl-line-time" contenteditable="false">' + jnlEscape(item.label) + '</span> '
    : '';
  var key = (item.type || '') + '|' + (item.text || '');
  return '<div class="jnl-line jnl-line-' + item.type + '" data-key="' + jnlEscape(key) + '">'
    + jnlBadge(item.type) + ' ' + lbl + jnlEscape(item.text) + '</div>';
}

// 저장된 값(구버전 평문 또는 HTML)을 rich 영역용 HTML로 정규화
function jnlNormalizeRich(val) {
  if (!val) return '';
  if (/<(div|span|br)/i.test(val)) return val; // 이미 HTML
  return val.split('\n').map(function(l) {
    return '<div>' + jnlEscape(l) + '</div>';
  }).join('');
}

// 줄에서 배지를 뺀 순수 텍스트 (중복 판정용)
function jnlLineText(lineEl) {
  var clone = lineEl.cloneNode(true);
  var b = clone.querySelector('.jnl-badge');
  if (b) b.remove();
  return clone.textContent.trim();
}

// 이번 주(선택된 주차)에 완료한 TASK + 하위 TO DO 항목
//   → 주간 그리드 목록을 기반으로 (요일 → 시간 순) 정렬해 반환
//   각 항목에 'MM.DD(요일) HH:MM' 라벨을 붙여 실적처럼 불러온다
function jnlCollectCompleted(weekKey) {
  var items = jnlCollectWeekGridItems(weekKey);
  items.sort(function (a, b) {
    if (a.day !== b.day) return a.day - b.day;
    if (a.timed !== b.timed) return a.timed ? -1 : 1;         // 시간 지정 항목 먼저
    if (a.timed) return (a.hour * 60 + a.min) - (b.hour * 60 + b.min);
    return 0;
  });
  var DAY_KO = ['월', '화', '수', '목', '금', '토', '일'];
  var r = getWeekRange(weekKey);
  var mondayMid = new Date(r.start); mondayMid.setHours(0, 0, 0, 0);
  return items.map(function (it) {
    var dayDate = new Date(mondayMid.getTime() + it.day * 86400000);
    var lbl = jnlFmtMD(dayDate) + '(' + DAY_KO[it.day] + ')' + (it.timed ? (' ' + jnlPad2(it.hour) + ':' + jnlPad2(it.min)) : '');
    return { type: it.type, text: it.text, label: lbl };
  });
}

// 다음 주(선택된 주차의 다음 주)에 예정된 TASK + 하위 TO DO 항목
function jnlCollectPlanned(weekKey) {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return [];
  var nextKey = getNextWeekKey(weekKey);
  var r = getWeekRange(nextKey);
  var items = [];
  tasks.forEach(function(t) {
    var taskDue = t.dueDateTime ? new Date(t.dueDateTime) : null;
    var taskIn = !t.completed && taskDue && taskDue >= r.start && taskDue <= r.end;
    var stepItems = [];
    (t.steps || []).forEach(function(s) {
      if (s.completed) return;
      var sd = s.dueDateTime ? new Date(s.dueDateTime) : null;
      if (sd && sd >= r.start && sd <= r.end) {
        stepItems.push({ type: 'todo', text: jnlCleanText(s.text) + ' (' + jnlFmtMD(sd) + ')' });
      }
    });
    if (taskIn || stepItems.length) {
      items.push({ type: 'task', text: jnlCleanText(t.text) + (taskIn ? ' (' + jnlFmtMD(taskDue) + ')' : '') });
      stepItems.forEach(function(si) { items.push(si); });
    }
  });
  return items;
}

// 생성된 항목을 rich 영역에 배지와 함께 (중복 제외) 추가
function jnlInsertItems(elId, items, emptyMsg) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!items.length) { showJnlToast(emptyMsg); return; }
  var existing = {};
  el.querySelectorAll('.jnl-line').forEach(function(ln) {
    var k = ln.getAttribute('data-key');
    if (k) existing[k] = true;
    existing['x|' + jnlLineText(ln)] = true;   // 구버전(라벨 없는) 줄 호환
  });
  var added = 0;
  items.forEach(function(it) {
    var k = (it.type || '') + '|' + (it.text || '');
    if (existing[k] || existing['x|' + it.text]) return;
    el.insertAdjacentHTML('beforeend', jnlItemHTML(it));
    existing[k] = true;
    added++;
  });
  if (!added) { showJnlToast('이미 모두 불러와 있어요'); return; }
  jnlMarkDirty();
  showJnlToast(added + '개 항목을 불러왔어요');
}

function jnlPullCompleted() {
  jnlInsertItems('jnl-achievement', jnlCollectCompleted(_journalWeek),
    '이번 주에 완료한 항목이 없어요');
}

function jnlPullPlanned() {
  jnlInsertItems('jnl-plan', jnlCollectPlanned(_journalWeek),
    '다음 주에 예정된 항목이 없어요');
}

// ── 주간 목록 네비게이터 (좌측 패널) ──────────
// 해당 연도의 주차를 'N월 N주'로 나열, 클릭 시 그 주로 이동

var _jnlNavYear = null;

// 해당 연도(ISO 기준)의 모든 주차 목록
function jnlYearWeeks(year) {
  var weeks = [];
  var d = new Date(year, 0, 1);
  var day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1)); // 1월 1일이 속한 주의 월요일
  while (true) {
    var thu = new Date(d.getTime() + 3 * 86400000);
    if (thu.getFullYear() > year) break;
    if (thu.getFullYear() === year) {
      var sun = new Date(d.getTime() + 6 * 86400000);
      var mi = jnlWeekMonthInfo(d);
      weeks.push({
        key: getWeekKey(d),
        month: mi.month,
        wom: mi.wom,
        range: jnlFmtMD(d) + ' ~ ' + jnlFmtMD(sun)
      });
    }
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function jnlBuildWeekNav() {
  var body = document.getElementById('jnl-wknav-body');
  var yearEl = document.getElementById('jnl-wknav-year');
  if (!body) return;
  if (_jnlNavYear == null) _jnlNavYear = parseInt(_journalWeek.split('-W')[0]);
  if (yearEl) yearEl.textContent = _jnlNavYear + '년';

  var thisWeek = getWeekKey();
  var weeks = jnlYearWeeks(_jnlNavYear);
  var html = '';
  var lastMonth = null;
  weeks.forEach(function(w) {
    if (w.month !== lastMonth) {
      html += '<div class="jnl-wknav-month">' + w.month + '월</div>';
      lastMonth = w.month;
    }
    var isSel = (w.key === _journalWeek);
    var isFuture = (w.key > thisWeek);
    var cls = 'jnl-wknav-item' + (isSel ? ' sel' : '') + (isFuture ? ' future' : '');
    var click = isFuture ? '' : ' onclick="jnlGoToWeek(\'' + w.key + '\')"';
    html += '<div class="' + cls + '"' + click + '>'
      + '<span class="jnl-wknav-wk">' + w.wom + '주</span>'
      + '<span class="jnl-wknav-rng">' + w.range + '</span>'
      + '</div>';
  });
  body.innerHTML = html;
  var sel = body.querySelector('.jnl-wknav-item.sel');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

function jnlGoToWeek(key) {
  _journalWeek = key;
  jnlFillEntry(key); // 내부에서 _jnlNavYear 동기화 + 네비 재생성
}

function jnlNavYear(delta) {
  if (_jnlNavYear == null) _jnlNavYear = parseInt(_journalWeek.split('-W')[0]);
  _jnlNavYear += delta;
  jnlBuildWeekNav();
}

// ── 주간 작성 트래커 (1년 52주) ───────────────
function jnlTrackerSection() {
  return '<div class="jnl-tracker">'
    + '<div class="jnl-tracker-head">Weekly Tracker</div>'
    + '<div class="jnl-tracker-grid" id="jnl-tracker-grid"></div>'
    + '</div>';
}
function jnlEntryWritten(e) {
  if (!e) return false;
  if (e.savedAt) return true;
  var s = e.sections || {};
  return !!(s.achievement || s.plan || s.issue);
}
function jnlBuildTracker() {
  var grid = document.getElementById('jnl-tracker-grid');
  if (!grid) return;
  var year = parseInt(_journalWeek.split('-W')[0], 10);
  var thisWeek = getWeekKey();
  var html = '';
  for (var w = 1; w <= 52; w++) {
    var key = year + '-W' + String(w).padStart(2, '0');
    var written = jnlEntryWritten(journalData[key]);
    var isSel = (key === _journalWeek);
    var isFuture = (key > thisWeek);
    var cls = 'jnl-tracker-btn' + (written ? ' done' : '') + (isSel ? ' sel' : '') + (isFuture ? ' future' : '');
    html += '<button class="' + cls + '"' + (isFuture ? ' disabled' : ' onclick="jnlGoToWeek(\'' + key + '\')"')
      + ' title="' + w + '주">' + (written ? '\u2713' : w) + '</button>';
  }
  grid.innerHTML = html;
}

// ── 캘린더(주 선택) ─────────────────────────
var _jnlCalMonth = null;   // 표시 중인 달 (1일)

function jnlWeekMonday(key) {
  var p = key.split('-W');
  return jnlIsoMonday(parseInt(p[0], 10), parseInt(p[1], 10));
}
function jnlIsSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function jnlBuildCalendar() {
  var grid = document.getElementById('jnl-cal-grid');
  var titleEl = document.getElementById('jnl-cal-title');
  if (!grid) return;
  if (!_jnlCalMonth) { var mon0 = jnlWeekMonday(_journalWeek); _jnlCalMonth = new Date(mon0.getFullYear(), mon0.getMonth(), 1); }
  var y = _jnlCalMonth.getFullYear(), m = _jnlCalMonth.getMonth();
  if (titleEl) titleEl.textContent = y + '년 ' + (m + 1) + '월';

  var thisWeek = getWeekKey();
  var today = new Date();
  var dows = ['월', '화', '수', '목', '금', '토', '일'];
  var html = '<div class="jnl-cal-dow-row">'
    + dows.map(function(d, i) { return '<div class="jnl-cal-dow' + (i === 5 ? ' sat' : (i === 6 ? ' sun' : '')) + '">' + d + '</div>'; }).join('')
    + '</div>';

  var first = new Date(y, m, 1);
  var day = first.getDay() || 7;                 // 1(월)~7(일)
  var cur = new Date(y, m, 1 - (day - 1));        // 그 주의 월요일
  var monthEnd = new Date(y, m + 1, 0);
  for (var w = 0; w < 6; w++) {
    var wkKey = getWeekKey(cur);
    var isFuture = (wkKey > thisWeek);
    var isSel = (wkKey === _journalWeek);
    html += '<div class="jnl-cal-week' + (isSel ? ' sel' : '') + (isFuture ? ' future' : '') + '">';
    for (var i = 0; i < 7; i++) {
      var dd = new Date(cur.getTime() + i * 86400000);
      var out = (dd.getMonth() !== m);
      var isToday = jnlIsSameDay(dd, today);
      var cellClick = isFuture ? '' : ' onclick="jnlPickDate(\'' + jnlDayKey(dd) + '\')"';
      html += '<div class="jnl-cal-cell' + (out ? ' out' : '') + (isToday ? ' today' : '')
        + (isFuture ? '' : ' clickable') + (i === 5 ? ' sat' : (i === 6 ? ' sun' : '')) + '"'
        + cellClick + '>' + dd.getDate() + '</div>';
    }
    html += '</div>';
    cur = new Date(cur.getTime() + 7 * 86400000);
    if (cur > monthEnd) break;
  }
  grid.innerHTML = html;
}
function jnlCalNav(delta) {
  if (!_jnlCalMonth) { var mon0 = jnlWeekMonday(_journalWeek); _jnlCalMonth = new Date(mon0.getFullYear(), mon0.getMonth(), 1); }
  _jnlCalMonth = new Date(_jnlCalMonth.getFullYear(), _jnlCalMonth.getMonth() + delta, 1);
  jnlBuildCalendar();
  jnlBuildTracker();
}

// ── Weekly Review (별점) ─────────────────────
var _jnlEval = { goal: 0, prioritization: 0, timeManagement: 0, problemSolving: 0, collaboration: 0 };

function jnlEvalSection() {
  function starRow(k) {
    var s = '<div class="jnl-stars" data-k="' + k + '">';
    for (var i = 1; i <= 5; i++) s += '<span class="jnl-star" onclick="jnlEvalStar(\'' + k + '\',' + i + ')">\u2605</span>';
    return s + '</div>';
  }
  function block(k, q) {
    return '<div class="jnl-eval-block">'
      + '<span class="jnl-eval-q">' + q + '</span>'
      + starRow(k)
      + '</div>';
  }
  return '<div class="jnl-section jnl-sec-eval">'
    + '<div class="jnl-section-head"><div class="jnl-section-title">Weekly Review</div></div>'
    + '<div class="jnl-eval">'
    + block('goal', 'Goal Achievement Rate')
    + block('prioritization', 'Prioritization')
    + block('timeManagement', 'Time Management')
    + block('problemSolving', 'Problem-Solving')
    + block('collaboration', 'Collaboration')
    + '</div>'
    + '</div>';
}
function jnlEvalStar(k, v) { if (_jnlEval[k] === v) v = 0; _jnlEval[k] = v; jnlMarkDirty(); jnlPaintStars(k); }
function jnlPaintStars(k) {
  var wrap = document.querySelector('.jnl-stars[data-k="' + k + '"]');
  if (!wrap) return;
  var stars = wrap.querySelectorAll('.jnl-star');
  for (var i = 0; i < stars.length; i++) {
    if ((i + 1) <= _jnlEval[k]) stars[i].classList.add('on'); else stars[i].classList.remove('on');
  }
}
function jnlRenderEvalState() { ['goal', 'prioritization', 'timeManagement', 'problemSolving', 'collaboration'].forEach(jnlPaintStars); }

// ── 토스트 ─────────────────────────────────

function showJnlToast(msg) {
  var old = document.getElementById('jnl-toast');
  if (old) old.remove();
  var toast = document.createElement('div');
  toast.id = 'jnl-toast';
  toast.className = 'nb-toast'; // 기존 토스트 스타일 재사용
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, 2200);
}
