// =============================================================
//  📈 Recap (2026-11-27, 사용자 요청 — 새 메뉴)
//  Home 과 같은 6×5 위젯 격자. 격자 엔진(home.js hw*)을 그대로 쓰고, 판만 바꿔 끼운다(hwUseBoard).
//    · 위젯 배치 · 크기 · 칸 크기는 Home 과 같은 방법으로 바꾼다(우클릭 › 위젯 배치). 저장은 recap-layout-v1 (이 기기 전용).
//  위젯 세 개:
//    · Mandalart     — Home 의 Mandalart 위젯 그대로 (renderHomeMandalartWidget)
//    · Calendar (연) — 예전 Calendar '연' 보기를 위젯으로 옮겼다. 날짜를 누르면 Calendar 주 보기, 달 이름을 누르면 월 보기
//    · Weekly Tracker — 예전 Work Diary 의 52주 칸. 주를 누르면 그 주의 Weekly Review(별점) · Retrospective 를 쓰는 창이 뜬다
//      (사용자 결정 2026-11-27). 저장하는 곳은 예전 그대로 my-tasklog-journal 의 그 주 문서다(손댄 칸만 쓴다).
//  ⚠️ 위젯을 늘리면 RECAP_WIDGETS 의 기본 자리가 서로 겹치지 않게, 격자를 바꾸면 lkey 를 올릴 것.
// =============================================================

var RECAP_WIDGETS = [
  { id: 'mandalart-widget', title: 'Mandalart',      nav: 'mandalart', body: 'mandalart-body', render: 'renderHomeMandalartWidget', def: { c: 1, r: 1, w: 2, h: 5 }, on: true },
  { id: 'rc-year-widget',   title: 'Calendar',       nav: 'calendar',  body: 'rcyear-body',    render: 'renderRecapYearWidget',     def: { c: 3, r: 1, w: 4, h: 3 }, on: true },
  { id: 'rc-track-widget',  title: 'Weekly Tracker', nav: null,        body: 'rctrk-body',     render: 'renderRecapTrackerWidget',  def: { c: 3, r: 4, w: 4, h: 2 }, on: true },
];
var RECAP_BOARD = { id: 'recap', lkey: 'recap-layout-v1', widgets: RECAP_WIDGETS, cols: 6, rows: 5, render: 'renderRecapView' };

function rcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderRecapView() {
  var content = document.getElementById('page-content');
  if (!content || typeof hwUseBoard !== 'function') return;
  hwUseBoard(RECAP_BOARD);
  if (typeof renderHomeEditBtn === 'function') renderHomeEditBtn();
  content.innerHTML = buildHomeLayout().replace('<div class="home-page">', '<div class="home-page recap-page">');
  hwVisibleWidgets().forEach(function (w) {
    var fn = window[w.render];
    if (typeof fn === 'function') { try { fn(); } catch (e) { console.warn('[recap]', w.id, e); } }
  });
  hwInitLayout();
}

// 격자 엔진이 크기를 바꿀 때마다 부른다 (home.js hwSyncResponsive)
function recapSyncResponsive() {
  if (!document.querySelector('.recap-page')) return;
  rcYearFit();
}

// ── Calendar (연) 위젯 ─────────────────────────────────
var _rcYear = new Date().getFullYear();
function rcYearCounts(year) {
  var counts = {};
  if (typeof calCollectItems !== 'function') return counts;
  var show = (typeof calShow === 'function') ? calShow() : null;
  function add(d) { var k = _calKey(d); counts[k] = (counts[k] || 0) + 1; }
  calCollectItems().forEach(function (it) {
    if (show && typeof calItemVisible === 'function' && !calItemVisible(it, show)) return;
    if (it.anchor !== 'bar') { if (it.date.getFullYear() === year) add(it.date); return; }
    var day = new Date(it.date);
    for (var n = 0; day < it.end && n < 366; n++) {
      if (day.getFullYear() === year) add(day);
      day.setDate(day.getDate() + 1);
    }
  });
  return counts;
}
function renderRecapYearWidget() {
  var el = document.getElementById('rcyear-body');
  if (!el) return;
  if (typeof calMonthGridHtml !== 'function') { el.innerHTML = emptyWidget('', 'Calendar 를 불러오지 못했습니다'); return; }
  var y = _rcYear, counts = rcYearCounts(y);
  var total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);
  var months = '';
  for (var m = 0; m < 12; m++) {
    months += '<section class="tlc-ymonth">'
      + '<button type="button" class="tlc-ymonth-t" onclick="rcYearMonth(' + y + ',' + m + ')" title="Calendar 월 보기">' + (m + 1) + '월</button>'
      + calMonthGridHtml(y, m, { counts: counts, onclick: 'rcYearPick' })
      + '</section>';
  }
  el.innerHTML = '<div class="rcw-head">'
    + '<button type="button" class="rcw-nav" onclick="rcYearStep(-1)" aria-label="이전 해">‹</button>'
    + '<span class="rcw-title">' + y + '</span>'
    + '<button type="button" class="rcw-nav" onclick="rcYearStep(1)" aria-label="다음 해">›</button>'
    + (y !== new Date().getFullYear() ? '<button type="button" class="rcw-today" onclick="rcYearStep(0)">올해</button>' : '')
    + '<span class="rcw-sum">' + total + '건</span>'
    + '</div>'
    + '<div class="rcy-wrap"><div class="tlc-year-grid rcy-grid">' + months + '</div></div>';
  rcYearFit();
}
function rcYearStep(d) { _rcYear = d ? _rcYear + d : new Date().getFullYear(); renderRecapYearWidget(); }
function rcYearPick(key) { navToMenu('calendar'); if (typeof calGoDate === 'function') calGoDate(key, 'week'); }
function rcYearMonth(y, m) { navToMenu('calendar'); if (typeof calGoDate === 'function') calGoDate(y + '-' + String(m + 1).padStart(2, '0') + '-01', 'month'); }
// 12달을 위젯 칸에 꽉 맞춘다 — Calendar 연 보기(calYearFit)와 같은 계산, 간격만 작다
var RCY_GX = 12, RCY_GY = 8, RCY_CG = 2, RCY_MIN = 9;
function rcYearFit() {
  var wrap = document.querySelector('#rcyear-body .rcy-wrap');
  var grid = wrap ? wrap.querySelector('.rcy-grid') : null;
  if (!grid) return;
  grid.classList.remove('rcy-fit');
  grid.style.gridTemplateColumns = grid.style.gridTemplateRows = '';
  var W = wrap.clientWidth, H = wrap.clientHeight;
  if (W < 80 || H < 60) return;
  var title = grid.querySelector('.tlc-ymonth-t'), dow = grid.querySelector('.tlc-mg-dow');
  var titleH = title ? title.offsetHeight + (parseFloat(getComputedStyle(title).marginBottom) || 0) : 18;
  var dowH = dow ? dow.offsetHeight : 12;
  var best = null;
  for (var cols = 1; cols <= 6; cols++) {
    var rows = Math.ceil(12 / cols);
    var mw = (W - RCY_GX * (cols - 1)) / cols, mh = (H - RCY_GY * (rows - 1)) / rows;
    var s = Math.min((mw - RCY_CG * 6) / 7, (mh - titleH - dowH - RCY_CG * 6) / 6);
    var score = s + (12 % cols === 0 ? 0.5 : 0);
    if (!best || score > best.score) best = { cols: cols, rows: rows, s: s, score: score };
  }
  if (!best || best.s < RCY_MIN) return;   // 너무 작다 — 스크롤로 둔다
  grid.classList.add('rcy-fit');
  grid.style.gridTemplateColumns = 'repeat(' + best.cols + ', minmax(0, 1fr))';
  grid.style.gridTemplateRows = 'repeat(' + best.rows + ', minmax(0, 1fr))';
  grid.style.setProperty('--tlc-yfs', Math.max(8, Math.min(13, best.s * 0.45)).toFixed(1) + 'px');
}

// ── Weekly Tracker 위젯 ────────────────────────────────
var _rcTrackYear = new Date().getFullYear();
function rcJournal() {
  if (typeof loadJournal === 'function') loadJournal();
  return (typeof journalData !== 'undefined' && journalData) ? journalData : {};
}
function renderRecapTrackerWidget() {
  var el = document.getElementById('rctrk-body');
  if (!el) return;
  if (typeof jnlYearWeeks !== 'function') { el.innerHTML = emptyWidget('', 'Weekly Tracker 를 불러오지 못했습니다'); return; }
  var data = rcJournal(), y = _rcTrackYear, thisWeek = getWeekKey();
  var weeks = jnlYearWeeks(y), byMonth = {}, written = 0;
  weeks.forEach(function (w) { (byMonth[w.month] = byMonth[w.month] || []).push(w); });
  var html = '';
  for (var m = 1; m <= 12; m++) {
    var list = byMonth[m] || [];
    var cells = list.map(function (w) {
      var done = jnlEntryWritten(data[w.key]);
      if (done) written++;
      var future = w.key > thisWeek, now = w.key === thisWeek;
      var tip = m + '월 ' + w.wom + '주 (' + w.range + ')' + (done ? ' · 작성함' : future ? '' : ' · 누르면 작성');
      return '<button type="button" class="rct-wk' + (done ? ' done' : '') + (now ? ' is-now' : '') + (future ? ' future' : '') + '"'
        + (future ? ' disabled' : ' onclick="rcWeekOpen(\'' + w.key + '\')"') + ' title="' + rcEsc(tip) + '" aria-label="' + rcEsc(tip) + '">'
        + (done ? '✓' : w.wom) + '</button>';
    }).join('');
    for (var pad = list.length; pad < 5; pad++) cells += '<span class="rct-wk is-pad" aria-hidden="true"></span>';
    html += '<div class="rct-month"><span class="rct-mlbl">' + m + '월</span>' + cells + '</div>';
  }
  el.innerHTML = '<div class="rcw-head">'
    + '<button type="button" class="rcw-nav" onclick="rcTrackStep(-1)" aria-label="이전 해">‹</button>'
    + '<span class="rcw-title">' + y + '</span>'
    + '<button type="button" class="rcw-nav" onclick="rcTrackStep(1)" aria-label="다음 해">›</button>'
    + (y !== new Date().getFullYear() ? '<button type="button" class="rcw-today" onclick="rcTrackStep(0)">올해</button>' : '')
    + '<span class="rcw-sum">작성 ' + written + ' / ' + weeks.length + '주</span>'
    + '</div>'
    + '<div class="rct-grid">' + html + '</div>';
}
function rcTrackStep(d) { _rcTrackYear = d ? _rcTrackYear + d : new Date().getFullYear(); renderRecapTrackerWidget(); }

// ── 주간 회고 쓰기 창 ──
//  Weekly Review 별점 4개(journal.js JNL_EVAL_ITEMS) + Retrospective(sections.issue).
//  저장은 손댄 칸만 쓴다(동기화 규칙 v3 — 다른 기기가 그사이 고친 칸을 되돌리지 않게).
var _rcW = null;   // { key, eval:{}, eval0:{}, text0:'' }
function rcWeekOpen(key) {
  if (_rcW && !rcWeekLeaveOk()) return;
  var data = rcJournal(), e = data[key] || null;
  var ev = (typeof jnlNormEval === 'function') ? jnlNormEval(e && e.evaluation) : {};
  _rcW = { key: key, eval: Object.assign({}, ev), eval0: Object.assign({}, ev), text0: (e && e.sections && e.sections.issue) || '' };
  var ov = document.getElementById('rcw-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'rcw-overlay';
    ov.className = 'rcwk-overlay';
    ov.addEventListener('mousedown', function (ev2) { if (ev2.target === ov) rcWeekClose(); });
    document.body.appendChild(ov);
  }
  var mon = jnlWeekMonday(key), sun = new Date(mon.getTime() + 6 * 86400000), mi = jnlWeekMonthInfo(mon);
  var stars = JNL_EVAL_ITEMS.map(function (it) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<button type="button" class="rcwk-star" data-k="' + it.k + '" data-v="' + i + '" onclick="rcWeekStar(\'' + it.k + '\',' + i + ')" aria-label="' + rcEsc(it.q) + ' ' + i + '점">★</button>';
    return '<div class="rcwk-eval"><span class="rcwk-q">' + rcEsc(it.q) + '</span><span class="rcwk-stars">' + s + '</span></div>';
  }).join('');
  var prevKey = getPrevWeekKey(key), nextKey = getNextWeekKey(key), canNext = nextKey <= getWeekKey();
  ov.innerHTML = '<div class="rcwk" role="dialog" aria-modal="true" aria-labelledby="rcwk-title">'
    + '<div class="rcwk-head">'
    +   '<button type="button" class="rcw-nav" onclick="rcWeekOpen(\'' + prevKey + '\')" aria-label="이전 주">‹</button>'
    +   '<div class="rcwk-title" id="rcwk-title">' + mon.getFullYear() + '년 ' + mi.month + '월 ' + mi.wom + '주'
    +     '<small>' + (mon.getMonth() + 1) + '.' + mon.getDate() + ' ~ ' + (sun.getMonth() + 1) + '.' + sun.getDate() + '</small></div>'
    +   '<button type="button" class="rcw-nav" ' + (canNext ? 'onclick="rcWeekOpen(\'' + nextKey + '\')"' : 'disabled') + ' aria-label="다음 주">›</button>'
    +   '<button type="button" class="rcwk-x" onclick="rcWeekClose()" aria-label="닫기">✕</button>'
    + '</div>'
    + '<section class="rcwk-sec"><div class="rcwk-h">Weekly Review</div>' + stars + '</section>'
    + '<section class="rcwk-sec"><div class="rcwk-h">Retrospective</div>'
    +   '<textarea class="rcwk-ta" id="rcwk-issue" aria-label="Retrospective" oninput="rcWeekPaint()"></textarea></section>'
    + '<div class="rcwk-foot"><span class="rcwk-saved" id="rcwk-saved">' + rcEsc(rcWeekSavedText(e)) + '</span>'
    +   '<button type="button" class="btn-secondary" onclick="rcWeekClose()">닫기</button>'
    +   '<button type="button" class="btn-primary" id="rcwk-save" onclick="rcWeekSave()">저장</button></div>'
    + '</div>';
  var ta = document.getElementById('rcwk-issue');
  if (ta) ta.value = _rcW.text0;
  rcWeekPaint();
  if (ta) ta.focus();
}
function rcWeekSavedText(e) {
  if (!e || !e.savedAt) return '';
  var d = new Date(e.savedAt);
  return isNaN(d.getTime()) ? '' : '저장 ' + d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function rcWeekStar(k, v) {
  if (!_rcW) return;
  _rcW.eval[k] = (_rcW.eval[k] === v) ? 0 : v;   // 같은 별을 다시 누르면 지운다(예전 Work Diary 와 같다)
  rcWeekPaint();
}
function rcWeekDirty() {
  if (!_rcW) return false;
  var ta = document.getElementById('rcwk-issue');
  if (ta && ta.value !== _rcW.text0) return true;
  return JNL_EVAL_ITEMS.some(function (it) { return (_rcW.eval[it.k] || 0) !== (_rcW.eval0[it.k] || 0); });
}
function rcWeekPaint() {
  if (!_rcW) return;
  document.querySelectorAll('#rcw-overlay .rcwk-star').forEach(function (b) {
    b.classList.toggle('on', +b.dataset.v <= (_rcW.eval[b.dataset.k] || 0));
  });
  var btn = document.getElementById('rcwk-save');
  if (btn) btn.classList.toggle('is-dirty', rcWeekDirty());
}
function rcWeekSave() {
  if (!_rcW) return;
  var data = rcJournal(), key = _rcW.key;
  var ta = document.getElementById('rcwk-issue'), text = ta ? ta.value : _rcW.text0;
  var entry = (typeof getJournalEntry === 'function') ? getJournalEntry(key) : data[key];
  if (text !== _rcW.text0) entry.sections.issue = text;
  var changed = {};
  JNL_EVAL_ITEMS.forEach(function (it) { if ((_rcW.eval[it.k] || 0) !== (_rcW.eval0[it.k] || 0)) changed[it.k] = _rcW.eval[it.k] || 0; });
  entry.evaluation = Object.assign(jnlNormEval(entry.evaluation), changed);
  entry.savedAt = new Date().toISOString();
  entry.weekLabel = getWeekLabel(key);
  saveJournal();
  _rcW.text0 = text;
  _rcW.eval0 = jnlNormEval(entry.evaluation);
  _rcW.eval = Object.assign({}, _rcW.eval0);
  rcWeekPaint();
  var sv = document.getElementById('rcwk-saved');
  if (sv) sv.textContent = rcWeekSavedText(entry);
  if (document.getElementById('rctrk-body')) renderRecapTrackerWidget();
  if (typeof showNbToast === 'function') showNbToast('저장되었습니다');
}
function rcWeekLeaveOk() { return !rcWeekDirty() || confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 닫을까요?'); }
function rcWeekClose() {
  if (!rcWeekLeaveOk()) return;
  _rcW = null;
  var ov = document.getElementById('rcw-overlay');
  if (ov) ov.remove();
}
document.addEventListener('keydown', function (e) {
  if (!_rcW || !document.getElementById('rcw-overlay') || e.isComposing) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); rcWeekClose(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyS' || String(e.key).toLowerCase() === 's')) { e.preventDefault(); rcWeekSave(); }
}, true);
