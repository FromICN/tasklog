// ============================================
//  🌱 Habit Tracker 페이지
//  --------------------------------------------
//  만다라트에서 '습관형'으로 지정한 실행항목을 한 해 통째로 본다.
//  왼쪽에 습관 목록, 오른쪽에 그 습관의 1~12월 캘린더 12개.
//  날짜를 누르면 실적이 기록된다 — 저장은 만다라트의 toggleHabitDay 를
//  그대로 쓰므로 만다라트·홈 위젯과 같은 데이터를 본다.
// ============================================

// 습관별 선택 상태 (연도 → 'sgId:actId')
var _htSelected = {};

// ── 데이터 ────────────────────────────────
function htYear() {
  if (typeof appGetYear === 'function') { var y = appGetYear(); if (y) return y; }
  if (typeof currentMdtYear !== 'undefined' && currentMdtYear) return currentMdtYear;
  return new Date().getFullYear();
}

// 해당 연도의 습관형 실행항목 목록 (Section 순 → 항목 순)
function htHabits(year) {
  if (typeof loadMandalarts === 'function') loadMandalarts();
  var m = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (!m || !m.subGoals) return [];
  var out = [];
  m.subGoals.forEach(function(sg, i) {
    (sg.actions || []).forEach(function(a) {
      // 습관(주간)은 날짜 체크가 없다 — 날짜 달력을 쓰는 이 화면에는 올리지 않는다.
      if (a.trackingType !== 'habit' || a.habitMode === 'weekly' || !a.text || !a.text.trim()) return;
      out.push({ sg: sg, a: a, secIdx: i });
    });
  });
  return out;
}

function htKeyOf(h) { return h.sg.id + ':' + h.a.id; }

// 선택된 습관 (없거나 사라졌으면 첫 번째)
function htCurrent(year, habits) {
  if (!habits.length) return null;
  var want = _htSelected[year];
  for (var i = 0; i < habits.length; i++) {
    if (htKeyOf(habits[i]) === want) return habits[i];
  }
  return habits[0];
}

function htSelect(year, key) {
  _htSelected[year] = key;
  renderHabitView();
}

function htEsc(text) {
  var d = document.createElement('div');
  d.textContent = (text == null) ? '' : String(text);
  return d.innerHTML;
}

// ── 렌더 ──────────────────────────────────
function renderHabitView() {
  var content = document.getElementById('page-content');
  if (!content) return;
  if (typeof loadMandalarts === 'function') loadMandalarts();
  var year = htYear();

  htRenderYearFilter(year);

  var habits = htHabits(year);
  if (!habits.length) {
    content.innerHTML = '<div class="ht-page">' + htEmptyHtml(year) + '</div>';
    return;
  }

  var cur = htCurrent(year, habits);
  content.innerHTML = '<div class="ht-page">'
    + '<div class="ht-body">'
    +   '<div class="ht-list">' + htListHtml(year, habits, cur) + '</div>'
    +   '<div class="ht-cal-area" id="ht-cal-area">' + htCalAreaHtml(year, cur) + '</div>'
    + '</div>'
    + '</div>';
}

// 오른쪽 위 연도 필터 — 만다라트가 있는 연도만 고른다
function htRenderYearFilter(year) {
  var slot = document.getElementById('topbar-habit-year-slot');
  if (!slot) return;
  var years = [];
  try {
    if (typeof mandalarts !== 'undefined' && mandalarts) {
      years = mandalarts.map(function(m) { return m.year; })
                        .filter(function(y) { return !!y; });
    }
  } catch (e) {}
  if (years.indexOf(year) < 0) years.push(year);
  years.sort(function(a, b) { return b - a; });

  slot.innerHTML = '<select class="year-select" onchange="htSwitchYear(this.value)">'
    + years.map(function(y) {
        return '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '년</option>';
      }).join('')
    + '</select>';
}

// 연도 전환은 전역 연도(appSetYear)를 태운다 — 만다라트·라이프휠과 함께 움직인다
function htSwitchYear(val) {
  var y = parseInt(val, 10);
  if (isNaN(y)) return;
  if (typeof appSetYear === 'function') appSetYear(y);
  else { if (typeof currentMdtYear !== 'undefined') currentMdtYear = y; renderHabitView(); }
}

function htEmptyHtml(year) {
  return '<div class="ht-empty">'
    + '<div class="ht-empty-icon">🌱</div>'
    + '<div class="ht-empty-title">' + year + '년에 등록된 습관이 없습니다</div>'
    + '<div class="ht-empty-desc">Mandalart 의 실행항목을 <b>습관형</b>으로 지정하면<br>여기에서 한 해 실적을 관리할 수 있습니다.</div>'
    + '<button class="ht-empty-btn" onclick="navToMenu(\'mandalart\')">Mandalart 열기</button>'
    + '</div>';
}

// ── 왼쪽: 습관 목록 ────────────────────────
function htListHtml(year, habits, cur) {
  var curKey = cur ? htKeyOf(cur) : '';
  var todayKey = (typeof fmtHabitKey === 'function') ? fmtHabitKey(new Date()) : '';

  var rows = habits.map(function(h) {
    var a = h.a, sg = h.sg;
    var key = htKeyOf(h);
    var stat = htStat(a, year);
    var color = sg.color || 'var(--brand-primary)';
    var doneToday = !!(a.habitLog && a.habitLog[todayKey]);
    var freq = '주 ' + Math.max(1, +a.habitWeeklyTarget || 1) + '회';

    return '<button class="ht-item' + (key === curKey ? ' active' : '') + '"'
      + ' onclick="htSelect(' + year + ',\'' + key + '\')">'
      + '<span class="ht-item-bar" style="background:' + htEsc(color) + ';"></span>'
      + '<span class="ht-item-main">'
      +   '<span class="ht-item-name">' + htEsc(a.text) + '</span>'
      +   '<span class="ht-item-sub">' + htEsc(sg.text || '') + ' · ' + freq + '</span>'
      + '</span>'
      + '<span class="ht-item-right">'
      +   '<span class="ht-item-rate">' + stat.rate + '%</span>'
      +   '<span class="ht-item-today' + (doneToday ? ' on' : '') + '" title="오늘 달성">' + (doneToday ? '✓' : '') + '</span>'
      + '</span>'
      + '</button>';
  }).join('');

  return '<div class="ht-list-head">Habit <span class="ht-list-count">' + habits.length + '</span></div>'
    + '<div class="ht-list-body">' + rows + '</div>';
}

// '주 N회 이상' 을 채운 주 기준.
// 판정 기준은 만다라트(실적관리)와 같아야 한다 — 같은 습관이 두 화면에서
// 다른 달성률로 보이면 어느 쪽을 믿어야 할지 알 수 없다.
function htStat(a, year) {
  var st = (typeof mdtHabitYearWeeks === 'function') ? mdtHabitYearWeeks(a, year) : null;
  if (!st) st = { done: 0, total: 0, rate: 0 };
  st.unit = '주';
  return st;
}

// 오늘 기준 연속 달성일 (연도와 무관 — 지금 이어지고 있는 길이)
function htStreak(a) {
  var log = a.habitLog || {};
  var fmt = (typeof fmtHabitKey === 'function') ? fmtHabitKey : null;
  if (!fmt) return 0;
  var streak = 0, today = new Date();
  for (var i = 0; i < 366; i++) {
    var d = new Date(today.getTime()); d.setDate(d.getDate() - i);
    if (log[fmt(d)]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ── 오른쪽: 12개월 캘린더 ───────────────────
function htCalAreaHtml(year, h) {
  if (!h) return '';
  var a = h.a, sg = h.sg;
  var stat = htStat(a, year);
  var thr = a.successThreshold || 80;

  var head = '<div class="ht-cal-head">'
    + '<div class="ht-cal-title">'
    +   '<span class="ht-cal-dot" style="background:' + htEsc(sg.color || 'var(--brand-primary)') + ';"></span>'
    +   '<span class="ht-cal-name">' + htEsc(a.text) + '</span>'
    +   '<span class="ht-cal-sec">' + htEsc(sg.text || '') + '</span>'
    + '</div>'
    + '<div class="ht-cal-stats">'
    +   htStatChip('달성', stat.done + stat.unit + ' / ' + stat.total + stat.unit)
    +   htStatChip('달성률', stat.rate + '%', stat.rate >= thr ? 'ok' : '')
    +   htStatChip('연속', htStreak(a) + '일')
    + '</div>'
    + '</div>';

  var months = '';
  for (var mo = 0; mo < 12; mo++) months += htMonthHtml(year, h, mo);

  return head + '<div class="ht-months">' + months + '</div>';
}

function htStatChip(label, value, cls) {
  return '<span class="ht-chip' + (cls ? ' ' + cls : '') + '">'
    + '<span class="ht-chip-label">' + label + '</span>'
    + '<span class="ht-chip-value">' + htEsc(value) + '</span>'
    + '</span>';
}

var HT_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function htMonthHtml(year, h, mo) {
  var a = h.a, log = a.habitLog || {};
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var daysInMonth = new Date(year, mo + 1, 0).getDate();
  var firstDowSun = new Date(year, mo, 1).getDay();

  // 주 시작 요일 설정(월/일)을 따른다 — 앱의 다른 캘린더와 첫 열을 맞춘다
  var dows = (typeof weekDayOrder === 'function') ? weekDayOrder() : ['일','월','화','수','목','금','토'];
  var lead = (typeof weekLeadOffset === 'function') ? weekLeadOffset(firstDowSun) : firstDowSun;

  var doneInMonth = 0;
  var cells = '';
  for (var i = 0; i < lead; i++) cells += '<div class="ht-cell is-blank"></div>';

  for (var d = 1; d <= daysInMonth; d++) {
    var cellDate = new Date(year, mo, d);
    var dKey = year + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isFuture = cellDate > today;
    var isDone   = !!log[dKey];
    var isToday  = cellDate.getTime() === today.getTime();
    if (isDone) doneInMonth++;

    var cls = 'ht-cell'
      + (isDone   ? ' is-done'   : '')
      + (isToday  ? ' is-today'  : '')
      + (isFuture ? ' is-future' : '');
    var oc = isFuture ? ''
      : ' onclick="htToggle(' + year + ',' + h.sg.id + ',' + a.id + ',\'' + dKey + '\')"';
    cells += '<div class="' + cls + '"' + oc + '>' + d + '</div>';
  }

  var dowRow = dows.map(function(x, idx) {
    var realDow = (typeof weekColDow === 'function') ? weekColDow(idx) : idx;
    var wcls = realDow === 0 ? ' sun' : (realDow === 6 ? ' sat' : '');
    return '<div class="ht-dow' + wcls + '">' + x + '</div>';
  }).join('');

  return '<div class="ht-month">'
    + '<div class="ht-month-head">'
    +   '<span class="ht-month-name">' + HT_MONTHS[mo] + '</span>'
    +   '<span class="ht-month-count">' + doneInMonth + '</span>'
    + '</div>'
    + '<div class="ht-grid">' + dowRow + cells + '</div>'
    + '</div>';
}

// 날짜 클릭 → 실적 기록/해제. 저장·홈 위젯 갱신은 만다라트 쪽이 처리한다.
function htToggle(year, sgId, actId, dateKey) {
  if (typeof toggleHabitDay !== 'function') return;
  toggleHabitDay(+year, sgId, actId, dateKey);
  // 목록의 달성률·오늘 표시와 오른쪽 통계까지 함께 바뀐다 → 페이지를 다시 그린다
  renderHabitView();
}
