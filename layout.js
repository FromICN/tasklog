// ============================================================
//  🧭 PC 레이아웃 — Gmail 형 (2026-11-26, 사용자 요청)
// ------------------------------------------------------------
//  · 위쪽 막대(#tl-appbar): ☰ 메뉴 · 열린 메뉴 탭 · 상태 알림 · 전체 검색 · 내 계정(아바타 = 계정 + 설정 한 창)
//    2026-11-27 다섯 번째 손질에서 메뉴를 막대에 늘어놓았다가, 같은 날 여섯 번째 손질(사용자 요청)에서
//    왼쪽 끝 ☰ (누르면 메뉴 목록) + 실행 이력 탭으로 바꿨다. 묶음(Life Log · Task Log)은 없앴다 — 아래 '☰ 메뉴 + 열린 메뉴 탭' 절.
//  · 전체 검색: 치는 동안 바로 가기 목록, Enter = 검색 결과 페이지(본문 자리, 2026-11-27 사용자 요청)
//  · 본문(.tl-panes): 기본 화면 | Task 창(#right-panel) — 창은 오른쪽에 붙는다(사용자 결정).
//    11-26 에 만든 To Do 창(Task 창 오른쪽, 3분할)은 2026-11-27 사용자 요청으로 없앴다. To Do 는 Task 창 안에서 고친다.
//  폰(768px 이하)은 예전 화면 그대로다 — 막대는 숨고 하단 탭 + '전체' 판.
//  index.html 에서 script.js 다음, pwa.js 앞에 로드한다.
// ============================================================

function tlEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tlCleanTitle(t) { return String(t || '').replace(/^\[\d{6}\]\s?/, ''); }
function tlTasks() { try { return Array.isArray(tasks) ? tasks : []; } catch (e) { return []; } }
function tlPanelOpen(id) {
  var el = document.getElementById(id);
  return !!(el && el.classList.contains('open'));
}

// 열린 Task 창에 저장 안 한 변경이 있으면 묻는다. 계속해도 되면 true
function tlCanLeavePanel() {
  if (!tlPanelOpen('right-panel') || typeof rpState === 'undefined' || !rpState.dirty) return true;
  if (!confirm('저장하지 않은 변경사항이 있습니다. 닫겠습니까?')) return false;
  rpState.dirty = false;
  return true;
}
// Task 창 열기 (검색 결과 등)
function tlOpenTask(taskId) {
  if (!tlCanLeavePanel()) return;
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
}
// To Do 를 연다 = 그 Task 창을 열고, 그 To Do 줄의 세부(마감 시간 · 수행 시간)를 펼쳐 보여 준다.
//  2026-11-27 사용자 요청으로 Task 창 오른쪽의 To Do 창을 없앴다 — To Do 는 Task 창 안에서 고친다(script.js rpOpenStepDetail).
//  이미 그 Task 가 열려 있으면 Task 창을 다시 만들지 않는다 — 적던 것이 지워지지 않게.
function tlOpenStep(taskId, stepId) {
  if (tlPanelOpen('right-panel') && typeof rpState !== 'undefined' && rpState.taskId === taskId) {
    if (typeof rpOpenStepDetail === 'function') rpOpenStepDetail(stepId);
    return;
  }
  if (!tlCanLeavePanel()) return;
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
  if (typeof rpOpenStepDetail === 'function') setTimeout(function () { rpOpenStepDetail(stepId); }, 0);
}
// 펼쳐 둔 To Do (script.js _rpTimeOpen) — 검색 결과 페이지가 '열린 줄' 을 칠할 때 쓴다
function tlOpenStepId() {
  try { return (tlPanelOpen('right-panel') && _rpTimeOpen != null) ? _rpTimeOpen : null; } catch (e) { return null; }
}

// Task 창이 열리고 닫힐 때 검색 결과 페이지의 '열려 있는 줄' 표시를 맞춘다
(function watchTaskPane() {
  function hook() {
    var rp = document.getElementById('right-panel');
    if (!rp || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () { tlspPaintOpen(); }).observe(rp, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();

// ============================================================
//  🔍 전체 검색 (위쪽 막대)
//  Task · To Do · 메모를 찾는다. 띄어 쓴 낱말은 모두 들어 있어야 맞다.
//  Task 는 제목 · 메모, To Do 는 제목 · 상위 Task 제목, 메모는 글.
//  · 치는 동안: 검색칸 아래 바로 가기 목록(묶음마다 8줄). 맨 위 줄 = '검색 결과 모두 보기'.
//    ↑↓ 로 줄을 고르고 Enter. 아무 줄도 고르지 않은 Enter = 검색 결과 페이지.
//    바로 가기 줄을 누르면 Task → Task 창, To Do → Task 창 + To Do 창, 메모 → Web 에서 그 메모를 고치는 칸.
//  · 검색 결과 페이지 (2026-11-27, 사용자 요청 — 아래 '검색 결과 페이지' 절): 본문 자리에 맞는 것 전부를 목록으로.
// ============================================================
var TLS_MAX = 8;   // 바로 가기 목록에서 묶음마다 보여 줄 줄 수
var _tls = { q: '', flat: [], sel: -1, open: false };   // sel -1 = 맨 위 '모두 보기' 줄
var TLS_ALL_ICO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';

function tlsWords(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
function tlsHit(words, hay) {
  hay = String(hay || '').toLowerCase();
  for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
  return true;
}
function tlsMark(text, words) {
  var s = String(text || '');
  if (!words.length) return tlEsc(s);
  var low = s.toLowerCase(), marks = [];
  words.forEach(function (w) {
    var i = 0;
    while (w && (i = low.indexOf(w, i)) >= 0) { marks.push([i, i + w.length]); i += w.length; }
  });
  if (!marks.length) return tlEsc(s);
  marks.sort(function (a, b) { return a[0] - b[0]; });
  var out = '', pos = 0;
  marks.forEach(function (m) {
    if (m[0] < pos) { if (m[1] > pos) { out += '<mark>' + tlEsc(s.slice(pos, m[1])) + '</mark>'; pos = m[1]; } return; }
    out += tlEsc(s.slice(pos, m[0])) + '<mark>' + tlEsc(s.slice(m[0], m[1])) + '</mark>';
    pos = m[1];
  });
  return out + tlEsc(s.slice(pos));
}
function tlsDay(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var now = new Date();
  return (d.getFullYear() !== now.getFullYear() ? String(d.getFullYear()).slice(2) + '.' : '') + (d.getMonth() + 1) + '/' + d.getDate();
}
function tlsProj(t) {
  if (t.mdtAction && t.mdtAction.text) return t.mdtAction.text;
  if (t.mdtGoal && t.mdtGoal.text) return t.mdtGoal.text;
  return t.lwSectionName || '';
}

function tlsCollect(q) {
  var words = tlsWords(q);
  var res = { task: [], step: [], memo: [] };
  if (!words.length) return res;
  tlTasks().forEach(function (t) {
    var title = tlCleanTitle(t.text);
    if (tlsHit(words, title + '\n' + (t.notes || ''))) {
      res.task.push({ kind: 'task', id: t.id, title: title, sub: tlsProj(t), done: !!t.completed,
        when: t.dueDateTime || t.startDate || t.createdAt || '', task: t });
    }
    (t.steps || []).forEach(function (s) {
      var st = tlCleanTitle(s.text);
      if (tlsHit(words, st + '\n' + title)) {
        res.step.push({ kind: 'step', taskId: t.id, id: s.id, title: st, sub: '↳ ' + title, done: !!s.completed,
          when: s.dueDateTime || s.completedAt || '', task: t, step: s });   // 상위 Task 날짜는 쓰지 않는다 — To Do 날짜로 읽힌다
      }
    });
  });
  var memos = [];
  try { memos = (typeof getArchivingNotes === 'function') ? getArchivingNotes() : []; } catch (e) {}
  memos.forEach(function (n) {
    if (tlsHit(words, n.text)) {
      var one = String(n.text || '').replace(/\s*\n+\s*/g, ' ');
      res.memo.push({ kind: 'memo', id: n.id, title: one, sub: '', done: false, when: n.dueDate || n.createdAt || '', note: n });
    }
  });
  // 끝나지 않은 것 먼저, 그 안에서는 날짜가 최근인 것 먼저
  function cmp(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return String(b.when).localeCompare(String(a.when));
  }
  res.task.sort(cmp); res.step.sort(cmp); res.memo.sort(cmp);
  return res;
}

function tlsRender() {
  var pop = document.getElementById('tl-search-pop');
  if (!pop) return;
  var q = _tls.q.trim();
  if (!q) { tlsClose(); return; }
  var words = tlsWords(q);
  var res = tlsCollect(q);
  var total = res.task.length + res.step.length + res.memo.length;
  var groups = [['task', 'Task'], ['step', 'To Do'], ['memo', '메모']];
  var flat = [];
  if (_tls.sel >= total) _tls.sel = -1;
  // 맨 위: 검색 결과 페이지로 (Enter 가 하는 일을 보이게 — 아무 줄도 고르지 않았을 때 칠해진다)
  var html = '<button type="button" class="tls-all' + (_tls.sel < 0 ? ' is-sel' : '') + '" data-i="-1"'
    + ' onmousedown="event.preventDefault()" onclick="tlsSubmit()" onmousemove="tlsHover(-1)">'
    + '<span class="tls-all-ico">' + TLS_ALL_ICO + '</span>'
    + '<span class="tls-all-txt"><b>' + tlEsc(q) + '</b> 검색 결과 모두 보기</span>'
    + '<span class="tls-all-n">' + total + '건</span><kbd class="tls-kbd">Enter</kbd></button>';
  groups.forEach(function (g) {
    var list = res[g[0]];
    if (!list.length) return;
    html += '<div class="tls-group"><div class="tls-group-head">' + g[1] + '<span>' + list.length + '</span></div>';
    list.slice(0, TLS_MAX).forEach(function (it) {
      var i = flat.length;
      flat.push(it);
      html += '<button type="button" class="tls-item' + (i === _tls.sel ? ' is-sel' : '') + (it.done ? ' is-done' : '') + '" data-i="' + i + '"'
        + ' onmousedown="event.preventDefault()" onclick="tlsPick(' + i + ')" onmousemove="tlsHover(' + i + ')">'
        + '<span class="tls-mark tls-mark-' + it.kind + '" aria-hidden="true">' + (it.done ? '✓' : '') + '</span>'
        + '<span class="tls-main"><span class="tls-title">' + tlsMark(it.title, words) + '</span>'
        + (it.sub ? '<span class="tls-sub">' + tlsMark(it.sub, words) + '</span>' : '') + '</span>'
        + '<span class="tls-when">' + tlsDay(it.when) + '</span>'
        + '</button>';
    });
    if (list.length > TLS_MAX) html += '<div class="tls-more">' + (list.length - TLS_MAX) + '건 더 — Enter 로 모두 보기</div>';
    html += '</div>';
  });
  if (!total) html += '<div class="tls-empty">\'' + tlEsc(q) + '\' 에 맞는 Task · To Do · 메모가 없습니다</div>';
  _tls.flat = flat;
  pop.innerHTML = html;
  pop.hidden = false;
  if (!pop._tlsLeave) { pop._tlsLeave = true; pop.addEventListener('mouseleave', function () { tlsHover(-1); }); }
  _tls.open = true;
  var box = document.getElementById('tl-search');
  if (box) box.classList.add('is-open');
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.setAttribute('aria-expanded', 'true');
}

function tlsClose() {
  var pop = document.getElementById('tl-search-pop');
  if (pop) { pop.hidden = true; pop.innerHTML = ''; }
  _tls.open = false;
  var box = document.getElementById('tl-search');
  if (box) box.classList.remove('is-open');
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.setAttribute('aria-expanded', 'false');
}

function tlsInput(el) {
  _tls.q = el.value;
  _tls.sel = -1;
  var clr = document.getElementById('tl-search-clear');
  if (clr) clr.hidden = !el.value;
  tlsRender();
}
function tlsClear() {
  var inp = document.getElementById('tl-search-input');
  if (inp) { inp.value = ''; inp.focus(); tlsInput(inp); }
}
// 좁은 화면에서 검색칸이 돋보기만 남았을 때 — 돋보기를 눌러도 입력칸으로 (theme.css '검색칸 접기')
function tlsBoxDown(e) {
  var t = e.target;
  if (t && t.closest && t.closest('#tl-search-input, #tl-search-clear, #tl-search-pop')) return;
  e.preventDefault();
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.focus();
}
function tlsHover(i) {
  if (i === _tls.sel) return;
  _tls.sel = i;
  document.querySelectorAll('#tl-search-pop .tls-item, #tl-search-pop .tls-all').forEach(function (b) {
    b.classList.toggle('is-sel', +b.dataset.i === i);
  });
}
// -1(모두 보기) · 0 … 끝 을 돌아가며 고른다
function tlsMove(d) {
  var n = _tls.flat.length + 1;
  var k = (_tls.sel + 1 + d + n) % n;
  tlsHover(k - 1);
  var el = document.querySelector('#tl-search-pop [data-i="' + _tls.sel + '"]');
  if (el) try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
}
function tlsKey(e) {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!_tls.open) tlsRender(); else tlsMove(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (_tls.open) tlsMove(-1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (_tls.open && _tls.sel >= 0 && _tls.flat[_tls.sel]) tlsPick(_tls.sel);
    else tlsSubmit(e.target.value);
  }
  else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (_tls.open) tlsClose(); else e.target.blur();
  }
}

function tlsPick(i) {
  var it = _tls.flat[i];
  if (!it) return;
  tlsClose();
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.blur();
  if (it.kind === 'task') { tlOpenTask(it.id); tlspPaintOpen(); return; }
  if (it.kind === 'step') { tlOpenStep(it.taskId, it.id); tlspPaintOpen(); return; }
  if (it.kind === 'memo') {
    // 검색 결과 페이지에 그 메모가 있으면 그 자리에서 고친다
    if (document.querySelector('#tls-page .tlsp-row[data-kind="memo"][data-id="' + it.id + '"]')) {
      if (typeof memoEditOpen === 'function') memoEditOpen(it.id);
      return;
    }
    if (!tlCanLeavePanel()) return;
    if (typeof navToMenu === 'function' && typeof currentMenu !== 'undefined' && currentMenu !== 'cloud') navToMenu('cloud');
    // Web 화면은 그린 뒤 50ms 에 위쪽 입력칸에 포커스한다 — 그다음에 메모를 연다
    setTimeout(function () {
      if (typeof memoEditOpen === 'function') memoEditOpen(it.id);
      var card = document.querySelector('.nb-card-memo[data-note-id="' + it.id + '"]');
      if (card) try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 120);
  }
}

// 바깥을 누르면 검색 창을 닫는다
document.addEventListener('mousedown', function (e) {
  if (!_tls.open) return;
  var box = document.getElementById('tl-search');
  if (box && !box.contains(e.target)) tlsClose();
});

// Esc: 검색 창을 먼저 닫는다 (script.js 의 Esc 는 Task 창을 닫는다)
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || e.isComposing) return;
  if (_tls.open) { tlsClose(); e.stopPropagation(); return; }
}, true);

// ============================================================
//  📄 검색 결과 페이지 (2026-11-27, 사용자 요청)
//  검색칸에서 Enter(또는 '모두 보기')를 누르면 본문 자리에 맞는 Task · To Do · 메모를 모두 목록으로 보여 준다.
//  currentMenu = 'search' 인 화면이다(위쪽 메뉴에는 켜진 칸이 없다). MENU_RENDERERS.search 로 그리므로
//  Task 창 저장 · 동기화로 값이 바뀌면 이 목록도 다시 그려진다(보던 자리는 그대로).
//  · 위: ‹ 돌아가기(검색 전 화면) · 검색어 · 건수 · 종류 칩(전체 · Task · To Do · 메모) · 끝난 것 숨기기
//  · 줄: Task = Section · Project · 상태 · 기간 · To Do 진행, 메모 칸에서 맞았으면 그 부분 / To Do = 상위 Task · 마감 · 수행 시간 · 완료일
//        메모 = 글 네 줄까지
//  · 누르면 Task · To Do 는 오른쪽에 Task 창(+ To Do 창)이 열리고 목록은 그대로 남는다. 메모는 그 자리에서 고친다
//    (notes.js memoEditRerender 가 이 페이지도 다시 그린다).
//  · 다른 메뉴로 가면 위쪽 검색칸을 비운다. 폰에는 검색칸이 없어 이 페이지로 오는 길도 없다.
// ============================================================
var TLSP_STEP = 60;   // 묶음마다 처음 보여 줄 줄 수 — '더 보기' 로 늘린다
var TLSP_KINDS = [['task', 'Task'], ['step', 'To Do'], ['memo', '메모']];
var _tlsPage = { q: '', kind: 'all', prev: '', more: {}, hideDone: false, on: false, fresh: false };

if (typeof MENU_RENDERERS !== 'undefined') MENU_RENDERERS.search = 'renderSearchView';
if (typeof RAIL_LABEL !== 'undefined') RAIL_LABEL.search = '검색 결과';
if (typeof MENU_TITLES !== 'undefined') MENU_TITLES.search = '검색 결과';

function tlsSubmit(q) {
  q = String(q != null ? q : (_tls.q || '')).trim();
  if (!q) return;
  tlsClose();
  var inp = document.getElementById('tl-search-input');
  if (inp) { inp.value = q; inp.blur(); }
  _tls.q = q;
  var here = (typeof currentMenu !== 'undefined' && currentMenu === 'search');
  if (!here && !tlCanLeavePanel()) return;   // 다른 화면에서 오면 navToMenu 가 Task 창을 닫는다
  _tlsPage.q = q; _tlsPage.kind = 'all'; _tlsPage.more = {}; _tlsPage.fresh = true;
  if (here) { renderSearchView(); return; }
  _tlsPage.prev = (typeof currentMenu !== 'undefined') ? currentMenu : '';
  navToMenu('search');
}
function tlsBack() {
  var to = _tlsPage.prev;
  if (!to || to === 'search' || !tlMenuValid(to)) to = (typeof appDefaultMenu === 'function') ? appDefaultMenu() : 'home';
  if (!tlCanLeavePanel()) return;
  navToMenu(to);
}
// 검색 결과 페이지를 떠나면 위쪽 검색칸을 비운다 (tlMenuOnNav 가 부른다)
function tlsLeavePage() {
  if (!_tlsPage.on) return;
  _tlsPage.on = false;
  var inp = document.getElementById('tl-search-input');
  if (inp && document.activeElement !== inp) {
    inp.value = ''; _tls.q = '';
    var clr = document.getElementById('tl-search-clear');
    if (clr) clr.hidden = true;
  }
  tlsClose();
}
function tlsSetKind(k) { _tlsPage.kind = k; _tlsPage.fresh = true; renderSearchView(); }
function tlsSetHideDone(on) { _tlsPage.hideDone = !!on; _tlsPage.fresh = true; renderSearchView(); }
function tlsMore(k) { _tlsPage.more[k] = (_tlsPage.more[k] || TLSP_STEP) + 200; renderSearchView(); }

// 메모 칸 안에서 맞은 곳 앞뒤만 한 줄로
function tlspSnippet(text, words, r) {
  var s = String(text || '').replace(/\s+/g, ' ').trim();
  r = r || 48;
  var low = s.toLowerCase(), at = -1;
  words.forEach(function (w) { var i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; });
  if (at < 0) return '';
  var a = Math.max(0, at - r), b = Math.min(s.length, at + r * 2);
  return (a > 0 ? '…' : '') + s.slice(a, b) + (b < s.length ? '…' : '');
}
function tlspDue(iso, hasTime) {
  if (!iso) return '';
  return tlsDay(iso) + (hasTime && typeof toTimeInputVal === 'function' ? ' ' + toTimeInputVal(iso) : '');
}
// 완료일 [YYMMDD] → 11/20 (다른 해면 25.11/20)
function tlspDoneDay(obj) {
  var m = /^\[(\d{2})(\d{2})(\d{2})\]/.exec((obj && obj.text) || '');
  if (!m) return obj && obj.completedAt ? tlsDay(obj.completedAt) : '';
  return tlsDay('20' + m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00');
}
function tlspChip(k, label, n, cur) {
  var on = k === cur;
  return '<button type="button" class="tlsp-chip' + (on ? ' is-on' : '') + (n ? '' : ' is-zero') + '" role="tab" aria-selected="' + on + '"'
    + ' onclick="tlsSetKind(\'' + k + '\')">' + label + '<span>' + n + '</span></button>';
}
function tlspIsOpen(it) {
  if (!tlPanelOpen('right-panel') || typeof rpState === 'undefined') return false;
  if (it.kind === 'task') return String(rpState.taskId) === String(it.id);
  if (it.kind === 'step') return tlOpenStepId() != null && String(tlOpenStepId()) === String(it.id) && String(rpState.taskId) === String(it.taskId);
  return false;
}

function tlspRowHtml(it, words) {
  var cls = 'tlsp-row tlsp-k-' + it.kind + (it.done ? ' is-done' : '') + (tlspIsOpen(it) ? ' is-open' : '');
  var mark = '<span class="tlsp-mark tlsp-mark-' + it.kind + '" aria-hidden="true">' + (it.done ? '✓' : '') + '</span>';
  var when = '<span class="tlsp-when">' + tlsDay(it.when) + '</span>';
  var meta = [], extra = '', main;
  function tag(txt, c) { return '<span class="tlsp-tag' + (c ? ' ' + c : '') + '">' + txt + '</span>'; }

  if (it.kind === 'memo') {
    var n = it.note;
    if (typeof memoIsEditing === 'function' && memoIsEditing(n.id) && typeof memoEditorHtml === 'function') {
      return '<div class="' + cls + ' is-editing" data-kind="memo" data-id="' + tlEsc(n.id) + '">' + mark
        + '<div class="tlsp-main">' + memoEditorHtml() + '</div></div>';
    }
    if (n.dueDate) meta.push(tag('마감 ' + tlEsc(tlsDay(n.dueDate + 'T12:00:00') + (n.dueTime ? ' ' + n.dueTime : ''))));
    main = '<div class="tlsp-memo">' + tlsMark(n.text, words) + '</div>';
    when = '<span class="tlsp-when" title="적은 날">' + tlsDay(n.createdAt) + '</span>';
    return '<div class="' + cls + '" role="button" tabindex="0" data-kind="memo" data-id="' + tlEsc(n.id) + '" title="눌러서 고치기"'
      + ' onclick="tlspOpen(this, event)" onkeydown="tlspKey(this, event)">' + mark
      + '<div class="tlsp-main">' + main + (meta.length ? '<div class="tlsp-meta">' + meta.join('') + '</div>' : '') + '</div>'
      + when + '</div>';
  }

  var t = it.task;
  if (it.kind === 'task') {
    var L = (typeof mdtLinkOf === 'function') ? mdtLinkOf(t) : null;
    var col = (typeof calTaskColor === 'function') ? calTaskColor(t) : '';
    var sec = L ? ((L.sgEmoji ? L.sgEmoji + ' ' : '') + (L.sgText || '') + (L.actionId != null && L.text ? ' · ' + L.text : '')) : tlsProj(t);
    meta.push(sec ? tag('<i style="background:' + tlEsc(col) + '"></i>' + tlEsc(sec), 'tlsp-tag-sec') : tag('Project 없음', 'is-dim'));
    if (t.status) meta.push(tag(tlEsc(t.status), 'tlsp-tag-st' + (t.status === '완료' ? ' is-done' : '')));
    var a = t.startDate ? tlsDay(t.startDate) : '', b = t.dueDateTime ? tlsDay(t.dueDateTime) : '';
    if (a && b && a !== b) meta.push(tag(tlEsc(a + ' ~ ' + b)));
    else if (a && !b) meta.push(tag('시작 ' + tlEsc(a)));
    var steps = t.steps || [];
    if (steps.length) meta.push(tag('To Do ' + steps.filter(function (s) { return s.completed; }).length + '/' + steps.length));
    if (it.done) { var dd = tlspDoneDay(t); if (dd) meta.push(tag('완료 ' + tlEsc(dd))); }
    // 메모 칸에서 맞은 낱말이 있으면 그 부분을 한 줄로 보여 준다 (제목만 보고는 왜 나왔는지 모른다)
    var nlow = String(t.notes || '').toLowerCase();
    if (nlow && words.some(function (w) { return nlow.indexOf(w) >= 0; })) {
      var snip = tlspSnippet(t.notes, words);
      if (snip) extra = '<div class="tlsp-snip"><span>메모</span>' + tlsMark(snip, words) + '</div>';
    }
    when = '<span class="tlsp-when">' + (b || a || '') + '</span>';
  } else {
    var s = it.step;
    meta.push('<span class="tlsp-parent">↳ ' + tlsMark(tlCleanTitle(t.text), words) + '</span>');
    if (s.dueDateTime) meta.push(tag('마감 ' + tlEsc(tlspDue(s.dueDateTime, s.hasTime))));
    var min = (typeof stepSlotMin === 'function') ? stepSlotMin(s) : 0;
    if (min) meta.push(tag('⏱ ' + fmtWorkMin(min)));
    if (it.done) { var sd = tlspDoneDay(s); if (sd) meta.push(tag('완료 ' + tlEsc(sd))); }
    when = '<span class="tlsp-when">' + (s.dueDateTime ? tlsDay(s.dueDateTime) : (it.done ? tlspDoneDay(s) : '')) + '</span>';
  }
  return '<div class="' + cls + '" role="button" tabindex="0" data-kind="' + it.kind + '" data-id="' + tlEsc(it.id) + '"'
    + (it.kind === 'step' ? ' data-task="' + tlEsc(it.taskId) + '"' : '')
    + ' onclick="tlspOpen(this, event)" onkeydown="tlspKey(this, event)">' + mark
    + '<div class="tlsp-main"><div class="tlsp-title">' + tlsMark(it.title, words) + '</div>'
    + '<div class="tlsp-meta">' + meta.join('') + '</div>' + extra + '</div>'
    + when + '</div>';
}

function renderSearchView() {
  var pc = document.getElementById('page-content');
  if (!pc) return;
  // 다시 그릴 때(Task 저장 · 동기화 · 메모 고치기)는 보던 자리 그대로, 새로 검색했으면 맨 위
  var keep = (!_tlsPage.fresh && document.getElementById('tls-page')) ? pc.scrollTop : 0;
  _tlsPage.fresh = false;
  _tlsPage.on = true;
  var q = String(_tlsPage.q || '').trim();
  var words = tlsWords(q);
  var res = tlsCollect(q);
  var hide = !!_tlsPage.hideDone;
  var lists = {}, doneN = 0;
  TLSP_KINDS.forEach(function (k) {
    doneN += res[k[0]].filter(function (x) { return x.done; }).length;
    lists[k[0]] = hide ? res[k[0]].filter(function (x) { return !x.done; }) : res[k[0]];
  });
  var total = lists.task.length + lists.step.length + lists.memo.length;
  var kind = _tlsPage.kind;
  if (kind !== 'all' && !lists[kind]) kind = _tlsPage.kind = 'all';

  var prev = _tlsPage.prev;
  var prevName = prev ? ((typeof RAIL_LABEL !== 'undefined' && RAIL_LABEL[prev]) || (typeof MENU_TITLES !== 'undefined' && MENU_TITLES[prev]) || prev) : '';
  var html = '<div class="tls-page" id="tls-page">'
    + (prevName && prev !== 'search' ? '<div class="tlsp-top"><button type="button" class="tlsp-back" onclick="tlsBack()" title="검색 전 화면으로">‹ ' + tlEsc(prevName) + '</button></div>' : '')
    + '<div class="tlsp-head">'
    +   '<h1 class="tlsp-title-h">' + (q ? '<span class="tlsp-q">' + tlEsc(q) + '</span> 검색 결과' : '검색') + '</h1>'
    +   (q ? '<span class="tlsp-total">' + total + '건</span>' : '')
    + '</div>';
  if (!q) {
    html += '<div class="tlsp-empty">위쪽 검색칸에 낱말을 적고 Enter 를 누르면 맞는 Task · To Do · 메모가 여기에 모두 나옵니다.</div></div>';
  } else {
    html += '<div class="tlsp-bar"><div class="tlsp-chips" role="tablist" aria-label="종류">'
      + tlspChip('all', '전체', total, kind)
      + TLSP_KINDS.map(function (k) { return tlspChip(k[0], k[1], lists[k[0]].length, kind); }).join('')
      + '</div>'
      + '<label class="tlsp-hide"><input type="checkbox"' + (hide ? ' checked' : '') + ' onchange="tlsSetHideDone(this.checked)"> 끝난 것 숨기기'
      +   (doneN ? ' <span>' + doneN + '</span>' : '') + '</label>'
      + '</div>';
    var shown = 0;
    TLSP_KINDS.forEach(function (k) {
      if (kind !== 'all' && kind !== k[0]) return;
      var list = lists[k[0]];
      if (!list.length) return;
      shown += list.length;
      var lim = _tlsPage.more[k[0]] || TLSP_STEP;
      html += '<section class="tlsp-sec" data-kind="' + k[0] + '">'
        + '<h2 class="tlsp-sec-head">' + k[1] + '<span>' + list.length + '</span></h2>'
        + '<div class="tlsp-list">' + list.slice(0, lim).map(function (it) { return tlspRowHtml(it, words); }).join('') + '</div>'
        + (list.length > lim
            ? '<button type="button" class="tlsp-more" onclick="tlsMore(\'' + k[0] + '\')">' + Math.min(list.length - lim, 200) + '건 더 보기'
              + '<span>' + (list.length - lim) + '건 남음</span></button>'
            : '')
        + '</section>';
    });
    if (!shown) {
      html += '<div class="tlsp-empty">\'' + tlEsc(q) + '\' 에 맞는 ' + (hide ? '끝나지 않은 ' : '')
        + (kind === 'all' ? 'Task · To Do · 메모' : (TLSP_KINDS.filter(function (k) { return k[0] === kind; })[0] || ['', ''])[1]) + '가 없습니다.'
        + (hide && doneN ? ' <button type="button" class="tlsp-link" onclick="tlsSetHideDone(false)">끝난 것 ' + doneN + '건도 보기</button>' : '')
        + '</div>';
    }
    html += '</div>';
  }
  pc.innerHTML = html;
  pc.scrollTop = keep;
  // 위쪽 검색칸에도 검색어를 남긴다 (치던 중이면 건드리지 않는다)
  var inp = document.getElementById('tl-search-input');
  if (inp && document.activeElement !== inp && inp.value !== q) { inp.value = q; _tls.q = q; }
  var clr = document.getElementById('tl-search-clear');
  if (clr && inp) clr.hidden = !inp.value;
  if (typeof memoEditMount === 'function') memoEditMount();
}

function tlspOpen(el, e) {
  if (!el || !el.dataset) return;
  // 글자를 끌어 고른 뒤 손을 뗀 것이면 열지 않는다 (복사하려던 것)
  try { var sel = window.getSelection(); if (sel && !sel.isCollapsed && String(sel).trim()) return; } catch (x) {}
  var kind = el.dataset.kind, id = el.dataset.id;
  if (kind === 'memo') { if (typeof memoEditOpen === 'function') memoEditOpen(id, e); return; }
  var tid = kind === 'step' ? el.dataset.task : id;
  var t = tlTasks().find(function (x) { return String(x.id) === String(tid); });
  if (!t) return;
  if (kind === 'task') tlOpenTask(t.id);
  else {
    var s = (t.steps || []).find(function (x) { return String(x.id) === String(id); });
    if (s) tlOpenStep(t.id, s.id);
  }
  tlspPaintOpen();
}
function tlspKey(el, e) {
  if (e.target !== el) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tlspOpen(el, e); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#tls-page .tlsp-row[tabindex]'));
    var i = rows.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1);
    if (rows[i]) { e.preventDefault(); rows[i].focus(); }
  }
}
// Task 창에 열려 있는 줄(To Do 는 세부를 펼친 줄)을 칠한다
function tlspPaintOpen() {
  var page = document.getElementById('tls-page');
  if (!page) return;
  var rpOpen = tlPanelOpen('right-panel') && typeof rpState !== 'undefined';
  page.querySelectorAll('.tlsp-row').forEach(function (r) {
    var on = false;
    if (rpOpen && r.dataset.kind === 'task') on = String(rpState.taskId) === r.dataset.id;
    else if (rpOpen && r.dataset.kind === 'step') on = tlOpenStepId() != null && String(tlOpenStepId()) === r.dataset.id && String(rpState.taskId) === r.dataset.task;
    r.classList.toggle('is-open', on);
  });
}

// 위쪽 막대 오른쪽 끝의 로그인 정보(아바타) — auth.js updateAuthUI · _syncAvatarInitial 이 부른다.
//  (2026-11-27 왼쪽 레일을 없애면서 레일 맨 위에서 이리로 왔다. 폰 '전체' 판의 #sidebar-avatar 는 auth.js 가 칠한다)
//  사진은 칸에 꽉 맞춘다(100% · cover) — 크기를 정하지 않으면 96px 사진이 작은 칸에서 잘려 확대돼 보인다.
//  이름 · 메일은 마우스를 올리면 보인다(title).
function tlPaintAppbarAccount(user, displayName) {
  var av = document.getElementById('tl-appbar-avatar');
  if (!av) return;
  var name = user ? (displayName || '') : '';
  // 누르면 내 계정 · 설정 창(settings.js) — 2026-11-27 ⚙ 단추와 합쳤다
  var tip = '내 계정 · 설정' + (user ? ' — ' + (name || '프로필') + (user.email ? ' · ' + user.email : '') : ' (로그인 전)');
  av.title = tip;
  av.setAttribute('aria-label', tip);
  if (user && user.picture) {
    if (av.dataset.pic !== user.picture) {
      av.innerHTML = '<img src="' + tlEsc(user.picture) + '" alt="" referrerpolicy="no-referrer">';
      av.dataset.pic = user.picture;
    }
  } else {
    av.dataset.pic = '';
    av.textContent = user ? (name || '?').charAt(0).toUpperCase() : '?';
  }
}

// ============================================================
//  🖱 화면 설정 — 우클릭 메뉴 (2026-11-26, 사용자 요청)
//  PC 에서는 오른쪽 위 줄(#topbar)을 없앴다. 본문 빈 곳이나 위쪽 메뉴의 칸을 우클릭하면
//  그 화면의 내역과 도구가 든 작은 창이 뜬다:
//    · 오늘 날짜(Home) · 표시 기간(Web · WBS · Calendar — 그 자리에서 바꾼다)
//    · 예전 오른쪽 위에 있던 것 전부 — 연도 선택, Web · WBS 검색/필터, Home 위젯 배치, Work Diary 저장
//  예전 도구는 다시 만들지 않고 #topbar-right 를 통째로 이 창에 옮겨 왔다가 닫을 때 돌려놓는다.
//  그래서 각 화면이 그 칸을 다시 그려도(연도 바꾸기 등) 창 안에서 그대로 바뀐다.
//  · 입력칸 · 글자를 고른 상태 · Shift+우클릭은 브라우저 메뉴 그대로(복사 · 붙여넣기)
//  · WBS 제목 글자의 우클릭(추가 메뉴)은 WBS 가 먼저 받는다 — defaultPrevented 면 열지 않는다
//  · 닫기: 바깥 누르기 · Esc · ✕ · 메뉴 이동 · 위젯 배치 · 저장을 누른 뒤
//  폰은 우클릭이 없어 예전 오른쪽 위 줄 그대로다.
// ============================================================
var TL_PM_PERIOD_MENUS = ['cloud', 'wbs', 'calendar'];   // 표시 기간이 걸리는 화면 (settings.js APP_PERIOD_MENUS + Calendar 목록·연도·검색)
function tlPmEnabled() { return typeof appMenuProfile !== 'function' || appMenuProfile() === 'desktop'; }
function tlPmEl() {
  var pm = document.getElementById('tl-pagemenu');
  if (!pm) {
    pm = document.createElement('div');
    pm.id = 'tl-pagemenu';
    pm.className = 'tl-pagemenu';
    pm.setAttribute('role', 'dialog');
    pm.setAttribute('aria-label', '화면 설정');
    pm.hidden = true;
    // 위젯 배치 · 저장은 누르면 할 일이 끝나므로 창을 닫는다
    pm.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.hw-edit-btn, #jnl-save-btn')) setTimeout(tlPmClose, 0);
      else setTimeout(tlPmFit, 0);
    });
    document.body.appendChild(pm);
  }
  return pm;
}
function tlPmIsOpen() { var pm = document.getElementById('tl-pagemenu'); return !!(pm && !pm.hidden); }

function tlPmOpen(x, y) {
  if (tlPmIsOpen()) tlPmClose();
  if (typeof tlMdropClose === 'function') tlMdropClose();
  var pm = tlPmEl();
  var id = (typeof currentMenu !== 'undefined') ? currentMenu : '';
  var name = (typeof RAIL_LABEL !== 'undefined' && RAIL_LABEL[id]) || (typeof MENU_TITLES !== 'undefined' && MENU_TITLES[id]) || '';
  var dateTxt = '';
  if (id === 'home') { var d = document.getElementById('topbar-date'); dateTxt = d ? d.textContent : ''; }
  var period = TL_PM_PERIOD_MENUS.indexOf(id) >= 0 && typeof buildPeriodInner === 'function';
  pm.innerHTML = '<div class="tl-pm-head"><span>' + tlEsc(name) + ' 화면</span>'
    +   '<button type="button" class="tl-pm-x" onclick="tlPmClose()" aria-label="닫기">✕</button></div>'
    + (dateTxt ? '<div class="tl-pm-row"><span class="tl-pm-lbl">오늘</span><span class="tl-pm-val">' + tlEsc(dateTxt) + '</span></div>' : '')
    + (period
        ? '<div class="tl-pm-sec"><div class="tl-pm-row"><span class="tl-pm-lbl">표시 기간</span><b class="tl-pm-val" id="tl-pm-period-val">' + tlEsc(appPeriodLabel()) + '</b></div>'
          + '<div class="set-period tl-pm-period" id="tl-pm-period">' + buildPeriodInner() + '</div></div>'
        : '')
    + '<div class="tl-pm-tools" id="tl-pm-tools"></div>'
    + '<div class="tl-pm-empty">이 화면에는 바꿀 것이 없습니다</div>'
    + '<div class="tl-pm-foot"><button type="button" onclick="tlPmClose();openSettings()">설정 열기</button>'
    +   '<span>Shift+우클릭 = 브라우저 메뉴</span></div>';
  // 예전 오른쪽 위 도구를 통째로 옮겨 온다 (이벤트 · 열린 패널 그대로)
  var tr = document.getElementById('topbar-right');
  if (tr) pm.querySelector('#tl-pm-tools').appendChild(tr);
  pm.style.left = x + 'px';
  pm.style.top = y + 'px';
  pm.hidden = false;
  pm.dataset.x = x; pm.dataset.y = y;
  tlPmFit();
}
// 화면 밖으로 나가지 않게 — 내용이 바뀔 때(기간 방식 바꾸기 · 필터 패널 열기)도 다시 맞춘다
function tlPmFit() {
  var pm = document.getElementById('tl-pagemenu');
  if (!pm || pm.hidden) return;
  var x = +pm.dataset.x || 0, y = +pm.dataset.y || 0;
  var w = pm.offsetWidth, h = pm.offsetHeight, M = 8;
  pm.style.left = Math.max(M, Math.min(x, innerWidth - w - M)) + 'px';
  pm.style.top = Math.max(M, Math.min(y, innerHeight - h - M)) + 'px';
}
function tlPmClose() {
  var pm = document.getElementById('tl-pagemenu');
  var tr = document.getElementById('topbar-right'), tb = document.getElementById('topbar');
  if (tr && tb && tr.parentNode !== tb) tb.appendChild(tr);   // 제자리로 (모바일 · 다음 화면이 쓴다)
  if (!pm || pm.hidden) return;
  pm.hidden = true;
  pm.innerHTML = '';
}

document.addEventListener('contextmenu', function (e) {
  var pm = document.getElementById('tl-pagemenu');
  if (pm && !pm.hidden && pm.contains(e.target)) { e.preventDefault(); return; }   // 창 안의 우클릭은 무시
  if (e.defaultPrevented || e.shiftKey || !tlPmEnabled()) return;
  var t = e.target;
  if (!t || !t.closest) return;
  var tab = t.closest('#tl-otabs .tl-otab, #tl-mdrop .tl-mdrop-item');
  var main = document.getElementById('main-content');
  if (!tab && !(main && main.contains(t))) return;
  if (t.closest('input, textarea, select, [contenteditable="true"], a[href]')) return;
  try { var sel = window.getSelection(); if (sel && !sel.isCollapsed && String(sel).trim()) return; } catch (err) {}
  e.preventDefault();
  // 다른 메뉴를 우클릭하면 그 화면으로 간 뒤 연다
  if (tab && tab.dataset.menu && typeof currentMenu !== 'undefined' && tab.dataset.menu !== currentMenu) navToMenu(tab.dataset.menu);
  tlPmOpen(e.clientX, e.clientY);
});
// 바깥을 누르면 닫는다 (설정 · 프로필 창처럼 그 위에 뜬 것은 제외)
document.addEventListener('mousedown', function (e) {
  if (!tlPmIsOpen() || e.button === 2) return;
  var t = e.target;
  if (t && t.closest && t.closest('#tl-pagemenu, #settings-overlay, #profile-modal-overlay')) return;
  tlPmClose();
}, true);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && tlPmIsOpen() && !e.isComposing) { e.stopPropagation(); tlPmClose(); }
}, true);
window.addEventListener('resize', function () { if (tlPmIsOpen()) { if (tlPmEnabled()) tlPmFit(); else tlPmClose(); } });

// (Work Diary 의 Ctrl+S 저장은 2026-11-27 Work Diary 를 없애면서 뺐다 — 주간 회고는 Recap 의 쓰기 창이 Ctrl+S 를 받는다)

// 처음 그릴 때도 한 번 — 로그인 전이면 '로그인', 로그인 정보는 auth.js 가 오는 대로 다시 칠한다
document.addEventListener('DOMContentLoaded', function () {
  try { tlPaintAppbarAccount(typeof currentUser !== 'undefined' ? currentUser : null, typeof getDisplayName === 'function' ? getDisplayName() : ''); } catch (e) {}
});

// ============================================================
//  ☰ 메뉴 + 열린 메뉴 탭 (2026-11-27 여섯 번째 손질, 사용자 요청)
//  위쪽 막대 왼쪽 끝 ☰ 를 누르면 메뉴 목록(아이콘 + 이름)이 내려온다. 묶음(Life Log · Task Log)은 없앴다.
//  메뉴를 열 때마다 그 오른쪽에 탭이 하나씩 생긴다(실행 이력) — 11/26 의 '열린 메뉴 탭' 으로 되돌렸다.
//    · 탭을 누르면 그 메뉴, ✕ · 가운데 클릭으로 닫는다. 지금 메뉴의 탭을 닫으면 오른쪽(없으면 왼쪽) 탭으로 간다.
//    · 탭이 하나뿐이면 ✕ 가 없다. 숨긴 메뉴는 탭에서도 빠진다(폰 폭에서는 저장된 목록을 건드리지 않는다).
//    · 목록은 이 기기에만 둔다(app-open-tabs — 동기화 · 백업 대상 아님).
//  순서 · 표시는 설정 › 메뉴(데스크탑) 그대로다. 폰은 예전 그대로(하단 탭 + '전체' 판) — 이 막대는 폰에서 숨는다.
//  클래스는 tl-otab* 다 — 폰 하단 탭이 tl-tab* 을 쓴다.
// ============================================================
var TL_TABS_KEY = 'app-open-tabs';
var _tlTabs = null;
function tlMenuValid(id) {
  if (typeof MENUS === 'undefined' || !MENUS.some(function (m) { return m.id === id; })) return false;
  return typeof isMenuVisible !== 'function' || isMenuVisible(id);
}
function tlMenuName(id) {
  return (typeof RAIL_LABEL !== 'undefined' && RAIL_LABEL[id]) || (typeof MENU_TITLES !== 'undefined' && MENU_TITLES[id]) || id;
}
function tlTabsLoad() {
  if (_tlTabs) return _tlTabs;
  _tlTabs = [];
  try { var v = JSON.parse(localStorage.getItem(TL_TABS_KEY) || '[]'); if (Array.isArray(v)) _tlTabs = v; } catch (e) {}
  return _tlTabs;
}
function tlTabsSave() { try { localStorage.setItem(TL_TABS_KEY, JSON.stringify(_tlTabs || [])); } catch (e) {} }

// navToMenu 가 부른다
function tlMenuOnNav(id) {
  // 우클릭 메뉴가 열려 있으면 닫는다 — 오른쪽 위 도구를 제자리(#topbar)로 돌려놓은 뒤에 새 화면이 그것을 채운다
  if (typeof tlPmClose === 'function') tlPmClose();
  tlMdropClose();
  if (id !== 'search') tlsLeavePage();
  var t = tlTabsLoad();
  if (tlMenuValid(id) && t.indexOf(id) < 0) { t.push(id); tlTabsSave(); }
  tlTabsRender();
}
function tlTabClose(id, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  var t = tlTabsLoad();
  var shown = t.filter(tlMenuValid);
  var i = shown.indexOf(id);
  if (i < 0 || shown.length <= 1) return;
  t.splice(t.indexOf(id), 1);
  shown.splice(i, 1);
  tlTabsSave();
  if (typeof currentMenu !== 'undefined' && currentMenu === id) navToMenu(shown[Math.min(i, shown.length - 1)]);
  else tlTabsRender();
}
function tlTabsRender() {
  var bar = document.getElementById('tl-otabs');
  if (!bar) return;
  var t = tlTabsLoad();
  // 숨긴 메뉴 · 없어진 메뉴(예: Work Diary)는 뺀다. 폰 폭에서는 메뉴 구성이 달라(Home 등이 꺼져 있다)
  //  저장된 목록은 건드리지 않는다 — 창을 잠깐 좁혔다고 PC 탭이 사라지면 안 된다.
  var keep = t.filter(tlMenuValid);
  var desk = (typeof appMenuProfile !== 'function') || appMenuProfile() === 'desktop';
  if (keep.length !== t.length && desk) { _tlTabs = keep; tlTabsSave(); }
  t = keep;
  var cur = (typeof currentMenu !== 'undefined') ? currentMenu : '';
  var solo = t.length <= 1;
  bar.innerHTML = t.map(function (id) {
    var m = MENUS.find(function (x) { return x.id === id; });
    var label = tlMenuName(id);
    var on = id === cur;
    return '<div class="tl-otab' + (on ? ' is-on' : '') + '" role="presentation" data-menu="' + id + '"'
      + ' onauxclick="if(event.button===1)tlTabClose(\'' + id + '\',event)">'
      + '<button type="button" class="tl-otab-main" role="tab" aria-selected="' + on + '"'
      +   (on ? ' aria-current="page"' : '') + ' onclick="navToMenu(\'' + id + '\')">'
      +   '<span class="tl-otab-ico" aria-hidden="true">' + (m ? m.icon : '') + '</span>'
      +   '<span class="tl-otab-lbl">' + tlEsc(label) + '</span>'
      + '</button>'
      + (solo ? '' : '<button type="button" class="tl-otab-x" aria-label="' + tlEsc(label) + ' 탭 닫기" title="닫기"'
          + ' onclick="tlTabClose(\'' + id + '\',event)">✕</button>')
      + '</div>';
  }).join('');
  var act = bar.querySelector('.tl-otab.is-on');
  if (act && bar.scrollWidth > bar.clientWidth + 1) {
    var br = bar.getBoundingClientRect(), ar = act.getBoundingClientRect();
    if (ar.left < br.left) bar.scrollLeft -= (br.left - ar.left) + 12;
    else if (ar.right > br.right) bar.scrollLeft += (ar.right - br.right) + 12;
  }
  if (tlMdropIsOpen()) tlMdropRender();
}
// initSidebar 가 부른다 (메뉴 표시 · 순서가 바뀔 때)
function tlMenuRender() { tlTabsRender(); }

// ── ☰ 메뉴 목록 ──
function tlMdropIsOpen() { var d = document.getElementById('tl-mdrop'); return !!(d && !d.hidden); }
function tlMdropRender() {
  var d = document.getElementById('tl-mdrop');
  if (!d || typeof orderedMenus !== 'function' || typeof getMenuVis !== 'function') return;
  var vis = getMenuVis('desktop');
  var cur = (typeof currentMenu !== 'undefined') ? currentMenu : '';
  d.innerHTML = orderedMenus('desktop').filter(function (m) { return vis[m.id] !== false; }).map(function (m) {
    var on = m.id === cur;
    var full = (typeof MENU_TITLES !== 'undefined' && MENU_TITLES[m.id]) || m.label;
    var lbl = tlMenuName(m.id);
    return '<button type="button" class="tl-mdrop-item' + (on ? ' is-on' : '') + '" role="menuitem" data-menu="' + m.id + '"'
      + (full !== lbl ? ' title="' + tlEsc(full) + '"' : '') + ' onclick="tlMdropPick(\'' + m.id + '\')">'
      + '<span class="tl-mdrop-ico" aria-hidden="true">' + m.icon + '</span>'
      + '<span class="tl-mdrop-lbl">' + tlEsc(lbl) + '</span>'
      + '</button>';
  }).join('');
}
function tlMdropToggle(ev) {
  if (ev) ev.stopPropagation();
  if (tlMdropIsOpen()) { tlMdropClose(); return; }
  var d = document.getElementById('tl-mdrop'), b = document.getElementById('tl-hamb');
  if (!d) return;
  tlMdropRender();
  d.hidden = false;
  if (b) b.setAttribute('aria-expanded', 'true');
  var on = d.querySelector('.tl-mdrop-item.is-on') || d.querySelector('.tl-mdrop-item');
  if (on) try { on.focus({ preventScroll: true }); } catch (e) {}
}
function tlMdropClose() {
  var d = document.getElementById('tl-mdrop'), b = document.getElementById('tl-hamb');
  if (d) d.hidden = true;
  if (b) b.setAttribute('aria-expanded', 'false');
}
function tlMdropPick(id) { tlMdropClose(); navToMenu(id); }
document.addEventListener('mousedown', function (e) {
  if (!tlMdropIsOpen()) return;
  if (e.target && e.target.closest && e.target.closest('#tl-mdrop, #tl-hamb')) return;
  tlMdropClose();
}, true);
document.addEventListener('keydown', function (e) {
  if (!tlMdropIsOpen() || e.isComposing) return;
  if (e.key === 'Escape') { e.stopPropagation(); tlMdropClose(); var b = document.getElementById('tl-hamb'); if (b) b.focus(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  var items = Array.prototype.slice.call(document.querySelectorAll('#tl-mdrop .tl-mdrop-item'));
  if (!items.length) return;
  e.preventDefault();
  var i = items.indexOf(document.activeElement);
  i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[i].focus();
}, true);

// 탭 줄이 넘칠 때는 마우스 휠로 옆으로 민다
(function () {
  function hook() {
    var bar = document.getElementById('tl-otabs');
    if (!bar) return;
    bar.addEventListener('wheel', function (e) {
      if (bar.scrollWidth <= bar.clientWidth + 1 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      bar.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
