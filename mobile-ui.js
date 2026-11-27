/* ============================================================
   TaskLog — 모바일 UI 보강 (mobile-ui.js)
   ------------------------------------------------------------
   순수 CSS로 풀 수 없는 세 가지만 처리한다.

     1) Web(메모 보드)  3컬럼 칸반 → 세그먼트 탭 + 단일 컬럼
     2) Work Diary      월 달력 패널 접기/펼치기
     3) Mandalart       핵심 3×3만 보기 ↔ 전체 9×9 보기 전환
     (+ 넓은 표에 가로 스크롤 안내 한 줄)

   설계 원칙
     · 기존 렌더 함수(notes.js·journal.js·mandalart.js)를 건드리지 않는다.
       화면이 그려진 뒤 DOM을 관찰해 덧붙이는 방식(progressive enhancement).
       → 문제가 생기면 index.html에서 이 <script> 한 줄만 빼면 원상복구된다.
     · 769px 이상에서는 아무것도 하지 않는다.
     · 삽입한 요소는 모두 .tlm- 접두사를 쓴다.
   ============================================================ */
(function () {
  'use strict';

  var MQ = window.matchMedia ? window.matchMedia('(max-width: 768px)') : null;
  function isMobile() { return MQ ? MQ.matches : window.innerWidth <= 768; }

  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }

  var observer = null;
  var applying = false;

  /* 우리가 DOM을 고치는 동안에는 관찰을 멈춘다 (무한 루프 방지) */
  function mutate(fn) {
    if (applying) { fn(); return; }
    applying = true;
    if (observer) observer.disconnect();
    try { fn(); } finally {
      if (observer) startObserving();
      applying = false;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  1. Web — 세그먼트 탭
  // ══════════════════════════════════════════════════════════
  var NB_COLS = [
    { id: 'memo', label: 'Archiving' },
    { id: 'task', label: 'Task' },
    { id: 'step', label: 'To Do' },
  ];
  var NB_KEY = 'tasklog-m-nbtab';

  function nbSelect(board, id) {
    NB_COLS.forEach(function (c) {
      var col = board.querySelector('#nbcol-' + c.id);
      if (col) col.classList.toggle('tlm-active', c.id === id);
      var tab = document.getElementById('tlm-nbtab-' + c.id);
      if (tab) {
        tab.classList.toggle('tlm-active', c.id === id);
        tab.setAttribute('aria-selected', c.id === id ? 'true' : 'false');
      }
    });
    ls(NB_KEY, id);
  }

  function enhanceNotes() {
    var board = document.querySelector('.nb-board');
    if (!board) return;

    var current = ls(NB_KEY) || 'memo';
    if (!NB_COLS.some(function (c) { return c.id === current; })) current = 'memo';

    var tabs = document.getElementById('tlm-nbtabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'tlm-tabs';
      tabs.id = 'tlm-nbtabs';
      tabs.setAttribute('role', 'tablist');

      NB_COLS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tlm-tab';
        b.id = 'tlm-nbtab-' + c.id;
        b.setAttribute('role', 'tab');
        b.innerHTML = c.label + '<span class="tlm-tab-count" id="tlm-nbcnt-' + c.id + '"></span>';
        b.addEventListener('click', function () { mutate(function () { nbSelect(board, c.id); }); });
        tabs.appendChild(b);
      });
      board.parentNode.insertBefore(tabs, board);
    }

    board.classList.add('tlm-tabbed');

    // 개수 동기화 (원본 카운터를 그대로 읽는다)
    NB_COLS.forEach(function (c) {
      var src = document.getElementById('nbcount-' + c.id);
      var dst = document.getElementById('tlm-nbcnt-' + c.id);
      if (src && dst) {
        var t = (src.textContent || '').trim();
        if (dst.textContent !== t) dst.textContent = t;
      }
    });

    if (!board.querySelector('.nb-col.tlm-active')) nbSelect(board, current);
  }

  // ══════════════════════════════════════════════════════════
  //  2. Work Diary — 월 달력 접기
  // ══════════════════════════════════════════════════════════
  var JNL_KEY = 'tasklog-m-jnlcal';

  function enhanceJournal() {
    var panel = document.querySelector('.jnl-cal-panel');
    if (!panel) return;
    var head = panel.querySelector('.jnl-cal-head');
    if (!head || head.querySelector('.tlm-toggle')) return;

    // 기본값: 접힘 (주간 그리드에 세로 공간을 양보)
    var collapsed = ls(JNL_KEY) !== 'open';
    panel.classList.toggle('tlm-collapsed', collapsed);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tlm-toggle';
    btn.style.marginLeft = 'auto';
    function label() { btn.textContent = panel.classList.contains('tlm-collapsed') ? '달력 펼치기' : '달력 접기'; }
    label();
    btn.addEventListener('click', function () {
      mutate(function () {
        var nowCollapsed = !panel.classList.contains('tlm-collapsed');
        panel.classList.toggle('tlm-collapsed', nowCollapsed);
        ls(JNL_KEY, nowCollapsed ? 'closed' : 'open');
        label();
      });
    });
    head.appendChild(btn);
  }

  // ══════════════════════════════════════════════════════════
  //  3. Mandalart — 핵심 3×3 ↔ 전체 9×9
  // ══════════════════════════════════════════════════════════
  var MDT_KEY = 'tasklog-m-mdtfull';

  function enhanceMandalart() {
    var page = document.querySelector('.mdt-page');
    if (!page || !page.querySelector('.mdt-grid')) return;
    if (page.querySelector('.tlm-toggle-row')) return;

    var full = ls(MDT_KEY) === '1';
    page.classList.toggle('tlm-mdt-full', full);

    var row = document.createElement('div');
    row.className = 'tlm-toggle-row';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tlm-toggle';
    function label() { btn.textContent = page.classList.contains('tlm-mdt-full') ? '핵심만 보기' : '전체 그리드 보기'; }
    label();
    btn.addEventListener('click', function () {
      mutate(function () {
        var nowFull = !page.classList.contains('tlm-mdt-full');
        page.classList.toggle('tlm-mdt-full', nowFull);
        ls(MDT_KEY, nowFull ? '1' : '0');
        label();
        if (typeof window.mdtAutoFitText === 'function') {
          setTimeout(window.mdtAutoFitText, 0);
        }
      });
    });

    row.appendChild(btn);
    page.insertBefore(row, page.firstChild);
  }

  // ══════════════════════════════════════════════════════════
  //  4. 데스크톱에서 저장된 크기 무력화  ★ 겹침의 주원인
  //     · home.js  hwInitLayout()   → 행에 인라인 grid-template-columns/height
  //     · colresize.js TLColResize  → 표에 <colgroup> + 인라인 width, CSS 변수
  //     이 값들이 폰에도 그대로 적용돼 카드/열이 데스크톱 크기로 고정되고,
  //     내용이 넘쳐 아래 요소와 겹쳐 보인다. 모바일에서는 걷어낸다.
  // ══════════════════════════════════════════════════════════
  function neutralizeDesktopSizing() {
    // (1) Home 행 — 인라인 열 너비/높이 제거
    ['.home-grid-row1', '.home-grid-row2'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (el.style.gridTemplateColumns) el.style.removeProperty('grid-template-columns');
      if (el.style.height) el.style.removeProperty('height');
    });

    // (2) 표 — 저장된 열 너비(colgroup + 인라인 width) 제거
    ['.todo-table', '.lw-table'].forEach(function (sel) {
      var tbl = document.querySelector(sel);
      if (!tbl) return;
      var cg = tbl.querySelector('colgroup.cr-cg');
      if (cg) cg.parentNode.removeChild(cg);
      if (tbl.style.width) tbl.style.removeProperty('width');
      if (tbl.style.tableLayout) tbl.style.removeProperty('table-layout');
    });

    // (3) WBS 열 너비 CSS 변수 제거 (CSS 기본값으로 되돌림)
    var wbsRoot = document.getElementById('wbs-root');
    if (wbsRoot) {
      ['--wbs-w-start', '--wbs-w-due', '--wbs-w-status'].forEach(function (v) {
        if (wbsRoot.style.getPropertyValue(v)) wbsRoot.style.removeProperty(v);
      });
    }

    // (4) 드래그 리사이즈 핸들 — 터치에서는 쓸 수 없고 오작동만 한다
    var handles = document.querySelectorAll('#page-content .cr-handle, .hw-resize-x, .hw-resize-y');
    for (var i = 0; i < handles.length; i++) handles[i].parentNode.removeChild(handles[i]);
  }

  // ══════════════════════════════════════════════════════════
  //  5. 넓은 표 — 가로 스크롤 안내
  // ══════════════════════════════════════════════════════════
  var HINT_TARGETS = ['.todo-table-wrap', '.lw-table-wrap', '.gm-wrap', '.wbs-wrap'];

  function enhanceScrollHints() {
    HINT_TARGETS.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var scrollable = el.scrollWidth - el.clientWidth > 8;
      var existing = el.parentNode && el.parentNode.querySelector('.tlm-scroll-hint');
      if (scrollable && !existing) {
        var hint = document.createElement('div');
        hint.className = 'tlm-scroll-hint';
        hint.textContent = '← 좌우로 밀면 나머지 항목이 보입니다';
        el.parentNode.insertBefore(hint, el.nextSibling);
      } else if (!scrollable && existing) {
        existing.parentNode.removeChild(existing);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  //  적용 루프
  // ══════════════════════════════════════════════════════════
  var queued = false;

  function apply() {
    queued = false;
    if (!isMobile()) return;
    mutate(function () {
      // 크기 무력화가 먼저 — 이후 계산(스크롤 여부 등)이 올바른 값을 보게 한다
      try { neutralizeDesktopSizing(); } catch (e) { console.warn('[mobile-ui] 크기 보정:', e); }
      try { enhanceNotes(); }        catch (e) { console.warn('[mobile-ui] Web 탭:', e); }
      try { enhanceJournal(); }      catch (e) { console.warn('[mobile-ui] WD 달력:', e); }
      try { enhanceMandalart(); }    catch (e) { console.warn('[mobile-ui] 만다라트:', e); }
      try { enhanceScrollHints(); }  catch (e) { console.warn('[mobile-ui] 스크롤 안내:', e); }
    });
  }

  function schedule() {
    if (queued || applying) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { setTimeout(apply, 30); }, 0);
  }

  function startObserving() {
    var target = document.getElementById('page-content');
    if (!target || !observer) return;
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    var target = document.getElementById('page-content');
    if (!target) return;
    if (window.MutationObserver) {
      observer = new MutationObserver(schedule);
      startObserving();
    }
    schedule();

    // 화면 크기가 바뀌면(회전 등) 다시 판단
    if (MQ) {
      var onChange = function () {
        if (isMobile()) schedule();
        else mutate(cleanup);
      };
      try { MQ.addEventListener('change', onChange); }
      catch (e) { if (MQ.addListener) MQ.addListener(onChange); }
    }
  }

  /* 데스크톱 폭으로 넘어가면 삽입물을 걷어낸다 (CSS로도 숨지만 DOM까지 정리) */
  function cleanup() {
    var nodes = document.querySelectorAll('.tlm-tabs, .tlm-toggle-row, .tlm-scroll-hint, .tlm-toggle');
    for (var i = 0; i < nodes.length; i++) nodes[i].parentNode.removeChild(nodes[i]);
    var board = document.querySelector('.nb-board');
    if (board) board.classList.remove('tlm-tabbed');
    var cols = document.querySelectorAll('.nb-col.tlm-active');
    for (var j = 0; j < cols.length; j++) cols[j].classList.remove('tlm-active');
    var panel = document.querySelector('.jnl-cal-panel');
    if (panel) panel.classList.remove('tlm-collapsed');
    var page = document.querySelector('.mdt-page');
    if (page) page.classList.remove('tlm-mdt-full');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
