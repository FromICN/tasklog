// ============================================
//  ↔ 컬럼 너비 클릭&드래그 조정 (TLColResize)
//  - <table> 페이지(Board, Life Wheel): 각 <th> 오른쪽 경계를 드래그해 열 너비 조정
//  - flex 헤더 페이지(WBS): 헤더 셀 오른쪽 경계를 드래그해 CSS 변수로 열 너비 조정
//  - 조정한 너비는 localStorage에 키별로 저장되어 새로고침/재접속 후에도 유지
// ============================================

var TLColResize = (function () {
  function loadW(key) {
    try { var r = localStorage.getItem(key); if (r) { var o = JSON.parse(r); if (o && typeof o === 'object') return o; } } catch (e) {}
    return {};
  }
  function saveW(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }

  // 공통 드래그 핸들러
  //  getW(): 시작 너비, onMove(nw): 이동 중 적용, onEnd(nw): 종료 시 저장
  function addDrag(handle, getW, onMove, onEnd, min) {
    min = min || 40;
    handle.addEventListener('click', function (e) { e.stopPropagation(); });
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var startX = e.clientX, startW = getW(), lastW = startW;
      document.body.classList.add('cr-resizing');
      function mm(ev) { lastW = Math.max(min, Math.round(startW + (ev.clientX - startX))); onMove(lastW); }
      function mu() {
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
        document.body.classList.remove('cr-resizing');
        if (onEnd) onEnd(lastW);
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  }

  // ── 1) <table> 컬럼 리사이즈 ───────────────────────────
  //  각 <th>는 data-cr-key 로 식별(없으면 인덱스). 저장은 key별 px.
  function table(tbl, storeKey) {
    if (!tbl || !tbl.tHead || !tbl.tHead.rows.length) return;
    var ths = Array.prototype.slice.call(tbl.tHead.rows[0].cells);
    if (!ths.length) return;
    var saved = loadW(storeKey);
    var keys = ths.map(function (th, i) { return th.getAttribute('data-cr-key') || ('c' + i); });

    // 너비 결정: 저장값 우선, 없으면 현재(auto 레이아웃) 렌더 너비 측정
    var widths = ths.map(function (th, i) {
      var w = saved[keys[i]];
      if (!w || w < 1) w = th.offsetWidth || 80;
      return Math.round(w);
    });

    // colgroup 재구성
    var old = tbl.querySelector('colgroup.cr-cg');
    if (old) old.parentNode.removeChild(old);
    var cg = document.createElement('colgroup');
    cg.className = 'cr-cg';
    widths.forEach(function (w) { var c = document.createElement('col'); c.style.width = w + 'px'; cg.appendChild(c); });
    tbl.insertBefore(cg, tbl.firstChild);
    tbl.style.tableLayout = 'fixed';
    tbl.style.width = widths.reduce(function (a, b) { return a + b; }, 0) + 'px';

    function totalW() { var t = 0; for (var j = 0; j < cg.children.length; j++) t += parseFloat(cg.children[j].style.width) || 0; return t; }

    ths.forEach(function (th, i) {
      if (window.getComputedStyle(th).position === 'static') th.style.position = 'relative';
      var h = document.createElement('div');
      h.className = 'cr-handle';
      th.appendChild(h);
      addDrag(h,
        function () { return parseFloat(cg.children[i].style.width) || widths[i]; },
        function (nw) { cg.children[i].style.width = nw + 'px'; tbl.style.width = totalW() + 'px'; },
        function (nw) { saved[keys[i]] = nw; saveW(storeKey, saved); });
    });
  }

  // ── 2) flex 헤더 컬럼 리사이즈 (CSS 변수 기반) ─────────────
  //  rootEl 에 --var 를 설정하면, CSS 가 헤더/본문 셀 너비를 함께 따라감.
  //  specs: [{ key, headSel, varName, min }]
  function flex(rootEl, headerEl, storeKey, specs) {
    if (!rootEl || !headerEl) return;
    var saved = loadW(storeKey);
    specs.forEach(function (s) {
      if (saved[s.key]) rootEl.style.setProperty(s.varName, saved[s.key] + 'px');
      var head = headerEl.querySelector(s.headSel);
      if (!head) return;
      if (window.getComputedStyle(head).position === 'static') head.style.position = 'relative';
      var h = document.createElement('div');
      h.className = 'cr-handle';
      head.appendChild(h);
      addDrag(h,
        function () { return Math.round(head.getBoundingClientRect().width); },
        function (nw) { rootEl.style.setProperty(s.varName, nw + 'px'); },
        function (nw) { saved[s.key] = nw; saveW(storeKey, saved); },
        s.min || 36);
    });
  }

  return { table: table, flex: flex };
})();
