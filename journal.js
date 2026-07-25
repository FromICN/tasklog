// ============================================
//  📓 주간일지 (Weekly Journal)
//  그 주의 업무 실적·성과를 기록하는 페이지
// ============================================

const JOURNAL_KEY = 'my-tasklog-journal';
var journalData = {};      // { 'YYYY-WW': { weekLabel, sections, memo, savedAt } }
var _journalWeek = null;   // 현재 선택된 주차 키 'YYYY-WW'

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
      evaluation: { goal: null, highImpact: false, deadline: false, proactive: false, communication: false },
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
    +   '<div class="jnl-cal-panel">'
    +     '<div class="jnl-cal-head">'
    +       '<button class="jnl-cal-navbtn" onclick="jnlCalNav(-1)">\u2039</button>'
    +       '<div class="jnl-cal-title" id="jnl-cal-title"></div>'
    +       '<button class="jnl-cal-navbtn" onclick="jnlCalNav(1)">\u203a</button>'
    +     '</div>'
    +     '<div class="jnl-cal-grid" id="jnl-cal-grid"></div>'
    +     '<div class="jnl-cal-weeklabel" id="jnl-week-label"></div>'
    +   '</div>'
    +   '<div class="jnl-right">'
    +     '<div class="jnl-top-row">'
    +       jnlSection('achievement', '주요 성과', '이번 주에 완료하거나 달성한 것들을 기록하세요.',
          '<button class="jnl-pull-btn" onclick="jnlPullCompleted()">이번 주 완료 실적 불러오기</button>', true)
    +       jnlSection('plan', '다음 주 계획', '다음 주에 예정된 일을 기록하세요.',
          '<button class="jnl-pull-btn" onclick="jnlPullPlanned()">다음 주 예정 업무 불러오기</button>', true)
    +     '</div>'
    +     jnlSection('issue', '회고', '이번 주를 돌아보며 배운 점과 개선할 점을 기록하세요.')
    +     jnlEvalSection()
    +   '</div>'
    + '</div>'
    + '<div class="jnl-footer" id="jnl-saved-at"></div>'
    + '</div>';

  var slot = document.getElementById('topbar-journal-slot');
  if (slot) slot.innerHTML = '<button class="jnl-save-btn" id="jnl-save-btn" onclick="jnlSave()">저장</button>';

  jnlFillEntry(_journalWeek);
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
  _jnlEval = Object.assign({ goal: null, highImpact: false, deadline: false, proactive: false, communication: false }, entry.evaluation || {});
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

// 한 항목(배지 + 텍스트)을 한 줄(div)로
function jnlItemHTML(item) {
  return '<div class="jnl-line jnl-line-' + item.type + '">'
    + jnlBadge(item.type) + ' ' + jnlEscape(item.text) + '</div>';
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
// (완료 항목은 [YYMMDD] 접두사를 그대로 유지)
function jnlCollectCompleted(weekKey) {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return [];
  var r = getWeekRange(weekKey);
  var items = [];
  tasks.forEach(function(t) {
    if (!t.completed) return;
    var cd = jnlParseCompletedDate(t.text);
    if (!cd || cd < r.start || cd > r.end) return;
    items.push({ type: 'task', text: (t.text || '').trim() });
    (t.steps || []).forEach(function(s) {
      if (s.completed) items.push({ type: 'todo', text: (s.text || '').trim() });
    });
  });
  return items;
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
  el.querySelectorAll('.jnl-line').forEach(function(ln) { existing[jnlLineText(ln)] = true; });
  var added = 0;
  items.forEach(function(it) {
    if (existing[it.text]) return;
    el.insertAdjacentHTML('beforeend', jnlItemHTML(it));
    existing[it.text] = true;
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
    html += '<div class="jnl-cal-week' + (isSel ? ' sel' : '') + (isFuture ? ' future' : '') + '"'
      + (isFuture ? '' : ' onclick="jnlGoToWeek(\'' + wkKey + '\')"') + '>';
    for (var i = 0; i < 7; i++) {
      var dd = new Date(cur.getTime() + i * 86400000);
      var out = (dd.getMonth() !== m);
      var isToday = jnlIsSameDay(dd, today);
      html += '<div class="jnl-cal-cell' + (out ? ' out' : '') + (isToday ? ' today' : '')
        + (i === 5 ? ' sat' : (i === 6 ? ' sun' : '')) + '">' + dd.getDate() + '</div>';
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
}

// ── 한 주 업무 평가 ─────────────────────────
var _jnlEval = { goal: null, highImpact: false, deadline: false, proactive: false, communication: false };

function jnlEvalSection() {
  function goalOpt(v, desc) {
    return '<label class="jnl-eval-score">'
      + '<input type="radio" name="jnl-eval-goal" value="' + v + '" onchange="jnlEvalSet(\'goal\',' + v + ')">'
      + '<span class="jnl-eval-pt">' + v + '점</span>'
      + '<span class="jnl-eval-desc">' + desc + '</span></label>';
  }
  function checkOpt(k, label) {
    return '<label class="jnl-eval-check">'
      + '<input type="checkbox" id="jnl-eval-' + k + '" onchange="jnlEvalToggle(\'' + k + '\',this.checked)">'
      + '<span>' + label + '</span></label>';
  }
  return '<div class="jnl-section jnl-sec-eval">'
    + '<div class="jnl-section-head"><div class="jnl-section-title">한 주 업무 평가</div></div>'
    + '<div class="jnl-eval">'
    +   '<div class="jnl-eval-block">'
    +     '<div class="jnl-eval-q">목표 달성률 (Plan vs. Actual)</div>'
    +     '<div class="jnl-eval-scores">'
    +       goalOpt(5, '계획된 핵심 과제를 100% 이상 완수하고 기대 이상의 성과 창출')
    +       goalOpt(3, '계획된 핵심 과제의 80~90%를 완수함 (일반적 수준)')
    +       goalOpt(1, '주요 과제 달성률이 50% 미만이며, 사유 공유가 미흡함')
    +     '</div>'
    +   '</div>'
    +   '<div class="jnl-eval-block">'
    +     '<div class="jnl-eval-q">업무의 우선순위 설정 및 시간 관리</div>'
    +     checkOpt('highImpact', '중요한 과제(High-impact)에 집중했는가?')
    +     checkOpt('deadline', '기한(Deadline)을 준수했는가?')
    +   '</div>'
    +   '<div class="jnl-eval-block">'
    +     '<div class="jnl-eval-q">문제 해결 및 협업 능력</div>'
    +     checkOpt('proactive', '장애 요인을 사전에 공유하고 해결책을 모색했는가?')
    +     checkOpt('communication', '팀원/타 부서와의 소통이 원활했는가?')
    +   '</div>'
    + '</div>'
    + '</div>';
}
function jnlEvalSet(k, v) { _jnlEval[k] = v; jnlMarkDirty(); }
function jnlEvalToggle(k, on) { _jnlEval[k] = !!on; jnlMarkDirty(); }
function jnlRenderEvalState() {
  ['5', '3', '1'].forEach(function(v) {
    var r = document.querySelector('input[name="jnl-eval-goal"][value="' + v + '"]');
    if (r) r.checked = (String(_jnlEval.goal) === v);
  });
  ['highImpact', 'deadline', 'proactive', 'communication'].forEach(function(k) {
    var c = document.getElementById('jnl-eval-' + k);
    if (c) c.checked = !!_jnlEval[k];
  });
}

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
