// ============================================
//  🧰 통합 필터 / 정렬 컴포넌트 (TLFilter)
//  - 타이틀 영역 오른쪽 · 테마(다크모드) 버튼 왼쪽 슬롯(#topbar-filter-slot)에
//    각 페이지가 등록한 "구분 항목" 기준 필터/정렬 UI를 그린다.
//  - 필터: 여러 항목 동시 적용 가능 (필드 간 AND, 같은 필드 값 간 OR)
//  - 정렬: 단일 기준(오름/내림차순)
//  - 연도(year) 컨트롤: 연도별 페이지의 전역 연도 선택을 필터 슬롯으로 통합
// ============================================

var TLFilter = (function () {
  var CONFIGS = {};
  var STATE_KEY = 'tlfilter-state';
  var _state = {};
  var _openPop = null;
  var _activeMenu = null;

  try {
    var raw = localStorage.getItem(STATE_KEY);
    if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') _state = p; }
  } catch (e) { _state = {}; }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(_state)); } catch (e) {}
  }

  function getState(menu) {
    if (!_state[menu]) _state[menu] = { filters: {}, sort: null };
    if (!_state[menu].filters) _state[menu].filters = {};
    if (!('sort' in _state[menu])) _state[menu].sort = null;
    return _state[menu];
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = (s == null) ? '' : String(s);
    return d.innerHTML;
  }

  function register(menu, config) { CONFIGS[menu] = config || {}; }

  function hasConfig(menu) {
    var c = CONFIGS[menu];
    if (!c) return false;
    return !!(c.year || (c.filters && c.filters.length) || (c.sorts && c.sorts.length));
  }

  function fieldOptions(menu, field) {
    if (typeof field.options === 'function') {
      try { return (field.options() || []).slice(); } catch (e) { return []; }
    }
    var cfg = CONFIGS[menu] || {};
    var items = [];
    try { items = (typeof cfg.items === 'function') ? (cfg.items() || []) : []; } catch (e) { items = []; }
    var seen = {}, out = [];
    items.forEach(function (it) {
      var v;
      try { v = field.get(it); } catch (e) { v = null; }
      var arr = Array.isArray(v) ? v : [v];
      arr.forEach(function (x) {
        if (x === null || x === undefined || x === '') return;
        var key = String(x);
        if (!seen[key]) { seen[key] = 1; out.push(x); }
      });
    });
    out.sort(function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') return b - a;
      return String(a).localeCompare(String(b), 'ko');
    });
    return out;
  }

  function apply(menu, arr) {
    var cfg = CONFIGS[menu];
    if (!cfg || !Array.isArray(arr)) return arr;
    var st = getState(menu);
    var out = arr.slice();

    (cfg.filters || []).forEach(function (field) {
      var sel = st.filters[field.key];
      if (!sel || !sel.length) return;
      var selSet = {};
      sel.forEach(function (v) { selSet[String(v)] = 1; });
      out = out.filter(function (it) {
        var v;
        try { v = field.get(it); } catch (e) { v = null; }
        var vals = Array.isArray(v) ? v : [v];
        for (var i = 0; i < vals.length; i++) {
          var vv = (vals[i] === null || vals[i] === undefined) ? '' : vals[i];
          if (selSet[String(vv)]) return true;
        }
        return false;
      });
    });

    if (st.sort && st.sort.key) {
      var field = (cfg.sorts || []).filter(function (s) { return s.key === st.sort.key; })[0];
      if (field) {
        var dir = (st.sort.dir === 'desc') ? -1 : 1;
        out.sort(function (a, b) {
          var va, vb;
          try { va = field.get(a); } catch (e) { va = null; }
          try { vb = field.get(b); } catch (e) { vb = null; }
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        });
      }
    }
    return out;
  }

  function activeFilterCount(menu) {
    var st = getState(menu);
    var n = 0;
    Object.keys(st.filters).forEach(function (k) {
      if (st.filters[k] && st.filters[k].length) n += st.filters[k].length;
    });
    return n;
  }

  function toggleFilterValue(menu, key, value) {
    var st = getState(menu);
    if (!st.filters[key]) st.filters[key] = [];
    var arr = st.filters[key];
    var sv = String(value);
    var idx = arr.map(String).indexOf(sv);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
    if (!arr.length) delete st.filters[key];
    saveState();
    fireChange(menu);
    renderPopover(menu);
  }

  function clearFilters(menu) {
    var st = getState(menu);
    st.filters = {};
    saveState();
    fireChange(menu);
    renderPopover(menu);
  }

  function setSort(menu, key, dir) {
    var st = getState(menu);
    if (!key) st.sort = null;
    else st.sort = { key: key, dir: dir || 'asc' };
    saveState();
    fireChange(menu);
    renderPopover(menu);
  }

  // 외부에서 필터 값 직접 설정 (예: Gantt 월 이동 시 연도 변경)
  function setFilter(menu, key, values) {
    var st = getState(menu);
    if (!values || !values.length) delete st.filters[key];
    else st.filters[key] = values.slice();
    saveState();
  }

  function fireChange(menu) {
    var cfg = CONFIGS[menu] || {};
    if (typeof cfg.onChange === 'function') {
      try { cfg.onChange(); return; } catch (e) {}
    }
    try {
      var map = (typeof MENU_RENDERERS !== 'undefined') ? MENU_RENDERERS : null;
      if (map && map[menu] && typeof window[map[menu]] === 'function') window[map[menu]]();
    } catch (e) {}
  }

  function onYearSelect(menu, val) {
    var cfg = CONFIGS[menu] || {};
    var yc = cfg.year;
    if (!yc) return;
    if (val === '__new__') {
      if (typeof yc.onNew === 'function') { yc.onNew(); return; }
      var def = (typeof yc.get === 'function' ? yc.get() : new Date().getFullYear()) + 1;
      var input = prompt('추가할 연도를 입력하세요', def);
      if (input == null) return;
      var ny = parseInt(input, 10);
      if (isNaN(ny) || ny < 2000 || ny > 2100) { alert('2000~2100 사이의 연도를 입력하세요.'); return; }
      yc.set(ny);
      return;
    }
    if (val === '__delete__') {
      if (typeof yc.onDelete === 'function') yc.onDelete();
      else if (typeof appDeleteCurrentYear === 'function') appDeleteCurrentYear();
      return;
    }
    var y = parseInt(val, 10);
    if (!isNaN(y) && typeof yc.set === 'function') yc.set(y);
  }

  function slot() { return document.getElementById('topbar-filter-slot'); }

  function clear() {
    var s = slot();
    if (s) s.innerHTML = '';
    _openPop = null;
    _activeMenu = null;
  }

  function render(menu) {
    var s = slot();
    if (!s) return;
    _activeMenu = menu;
    var cfg = CONFIGS[menu];
    if (!cfg || !hasConfig(menu)) { s.innerHTML = ''; return; }

    var html = '';
    if (cfg.year) html += yearSelectHtml(menu, cfg.year);

    if (cfg.filters && cfg.filters.length) {
      var cnt = activeFilterCount(menu);
      html += '<div class="tlf-ctrl" id="tlf-filter-ctrl">'
        + '<button class="tlf-btn' + (cnt ? ' tlf-active' : '') + '" onclick="TLFilter.togglePop(\'' + menu + '\',\'filter\',event)" title="필터">'
        + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>'
        + '<span class="tlf-btn-label">필터</span>'
        + (cnt ? '<span class="tlf-badge">' + cnt + '</span>' : '')
        + '</button>'
        + '<div class="tlf-pop" id="tlf-filter-pop" style="display:none;"></div>'
        + '</div>';
    }

    if (cfg.sorts && cfg.sorts.length) {
      var st = getState(menu);
      var sortOn = !!(st.sort && st.sort.key);
      html += '<div class="tlf-ctrl" id="tlf-sort-ctrl">'
        + '<button class="tlf-btn' + (sortOn ? ' tlf-active' : '') + '" onclick="TLFilter.togglePop(\'' + menu + '\',\'sort\',event)" title="정렬">'
        + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h5M17 7v12M17 19l3-3M17 19l-3-3"/></svg>'
        + '<span class="tlf-btn-label">정렬</span>'
        + '</button>'
        + '<div class="tlf-pop" id="tlf-sort-pop" style="display:none;"></div>'
        + '</div>';
    }

    s.innerHTML = html;
    if (_openPop) renderPopover(menu);
    else refreshButtons(menu);
  }

  function yearSelectHtml(menu, yc) {
    var cur = null;
    try { cur = (typeof yc.get === 'function') ? yc.get() : null; } catch (e) {}
    var years = [];
    try { years = (typeof yc.years === 'function') ? (yc.years() || []).slice() : []; } catch (e) { years = []; }
    if (cur != null && years.indexOf(cur) === -1) years.push(cur);
    years.sort(function (a, b) { return b - a; });
    var opts = years.map(function (y) {
      return '<option value="' + y + '"' + (y === cur ? ' selected' : '') + '>' + y + '년</option>';
    }).join('');
    if (yc.allowNew !== false) opts += '<option value="__new__">+ 새 연도 추가</option>';
    if (yc.allowDelete !== false) opts += '<option value="__delete__">🗑 현재 연도 삭제</option>';
    return '<select class="year-select tlf-year" onchange="TLFilter.onYear(\'' + menu + '\',this.value)">' + opts + '</select>';
  }

  function togglePop(menu, which, e) {
    if (e) e.stopPropagation();
    if (_openPop === which) { _openPop = null; renderPopover(menu); return; }
    _openPop = which;
    renderPopover(menu);
  }

  function renderPopover(menu) {
    var cfg = CONFIGS[menu] || {};
    var fp = document.getElementById('tlf-filter-pop');
    var sp = document.getElementById('tlf-sort-pop');
    if (fp) fp.style.display = 'none';
    if (sp) sp.style.display = 'none';
    refreshButtons(menu);
    if (_openPop === 'filter' && fp) {
      fp.innerHTML = buildFilterPanel(menu, cfg);
      fp.style.display = 'block';
    } else if (_openPop === 'sort' && sp) {
      sp.innerHTML = buildSortPanel(menu, cfg);
      sp.style.display = 'block';
    }
  }

  function refreshButtons(menu) {
    var cnt = activeFilterCount(menu);
    var fctrl = document.getElementById('tlf-filter-ctrl');
    if (fctrl) {
      var fbtn = fctrl.querySelector('.tlf-btn');
      if (fbtn) {
        fbtn.classList.toggle('tlf-active', cnt > 0);
        var badge = fbtn.querySelector('.tlf-badge');
        if (cnt > 0) {
          if (!badge) { badge = document.createElement('span'); badge.className = 'tlf-badge'; fbtn.appendChild(badge); }
          badge.textContent = cnt;
        } else if (badge) { badge.remove(); }
      }
    }
    var st = getState(menu);
    var sctrl = document.getElementById('tlf-sort-ctrl');
    if (sctrl) {
      var sbtn = sctrl.querySelector('.tlf-btn');
      if (sbtn) sbtn.classList.toggle('tlf-active', !!(st.sort && st.sort.key));
    }
  }

  function buildFilterPanel(menu, cfg) {
    var st = getState(menu);
    var html = '<div class="tlf-pop-head">필터'
      + (activeFilterCount(menu) ? ' <button class="tlf-clear" onclick="TLFilter.clearFilters(\'' + menu + '\')">전체 해제</button>' : '')
      + '</div>';
    (cfg.filters || []).forEach(function (field) {
      var opts = fieldOptions(menu, field);
      if (!opts.length) return;
      var sel = st.filters[field.key] || [];
      var selSet = {}; sel.forEach(function (v) { selSet[String(v)] = 1; });
      html += '<div class="tlf-group"><div class="tlf-group-label">' + esc(field.label) + '</div>';
      opts.forEach(function (opt) {
        var checked = selSet[String(opt)] ? ' checked' : '';
        var lbl = (field.format ? field.format(opt) : opt);
        html += '<label class="tlf-opt">'
          + '<input type="checkbox"' + checked + ' onchange="TLFilter.toggleFilterValue(\'' + menu + '\',\'' + esc(field.key) + '\',this.dataset.v)" data-v="' + esc(opt) + '">'
          + '<span>' + esc(lbl) + '</span></label>';
      });
      html += '</div>';
    });
    return html;
  }

  function buildSortPanel(menu, cfg) {
    var st = getState(menu);
    var cur = st.sort || {};
    var html = '<div class="tlf-pop-head">정렬</div>';
    html += '<label class="tlf-opt"><input type="radio" name="tlf-sort-' + menu + '"' + (!cur.key ? ' checked' : '') + ' onchange="TLFilter.setSort(\'' + menu + '\',\'\')"><span>기본</span></label>';
    (cfg.sorts || []).forEach(function (field) {
      var asc = (cur.key === field.key && cur.dir !== 'desc');
      var desc = (cur.key === field.key && cur.dir === 'desc');
      html += '<div class="tlf-sort-row">'
        + '<span class="tlf-sort-name">' + esc(field.label) + '</span>'
        + '<button class="tlf-sort-dir' + (asc ? ' on' : '') + '" onclick="TLFilter.setSort(\'' + menu + '\',\'' + esc(field.key) + '\',\'asc\')" title="오름차순">▲</button>'
        + '<button class="tlf-sort-dir' + (desc ? ' on' : '') + '" onclick="TLFilter.setSort(\'' + menu + '\',\'' + esc(field.key) + '\',\'desc\')" title="내림차순">▼</button>'
        + '</div>';
    });
    return html;
  }

  document.addEventListener('click', function (e) {
    if (!_openPop) return;
    var s = slot();
    if (s && !s.contains(e.target)) {
      _openPop = null;
      var fp = document.getElementById('tlf-filter-pop');
      var sp = document.getElementById('tlf-sort-pop');
      if (fp) fp.style.display = 'none';
      if (sp) sp.style.display = 'none';
      refreshButtons(_activeMenu);
    }
  });

  return {
    register: register,
    render: render,
    apply: apply,
    clear: clear,
    hasConfig: hasConfig,
    togglePop: togglePop,
    toggleFilterValue: toggleFilterValue,
    clearFilters: clearFilters,
    setSort: setSort,
    setFilter: setFilter,
    onYear: onYearSelect,
    getState: getState
  };
})();
