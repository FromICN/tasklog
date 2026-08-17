/* ============================================================
   TaskLog — PWA 부트스트랩
   · 서비스워커 등록 / 업데이트 알림
   · 설치(홈 화면 추가) 버튼 · iOS 안내
   · standalone 감지 → <html> 클래스
   · theme-color 를 라이트/다크 테마에 동기화
   · 매니페스트 바로가기(?page=...) 처리
   · 모바일 스와이프로 사이드바 열기/닫기
   ============================================================ */
(function () {
  'use strict';

  var SW_URL  = './sw.js?v=20260817q';   /* @@BUILD:SW_URL — build-sw.js가 자동 갱신 */
  var isHttps = location.protocol === 'https:';
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var isNative = /^(capacitor|ionic|file):$/.test(location.protocol);

  var html = document.documentElement;

  /* ── 1. standalone(설치된 앱) 감지 ───────────────────────── */
  function detectStandalone() {
    var standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches) ||
      window.navigator.standalone === true ||
      isNative;
    html.classList.toggle('pwa-standalone', !!standalone);
    return standalone;
  }
  detectStandalone();
  if (window.matchMedia) {
    try {
      window.matchMedia('(display-mode: standalone)')
        .addEventListener('change', detectStandalone);
    } catch (e) { /* 구형 사파리 */ }
  }

  /* iOS 여부 (설치 안내 문구용) */
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ── 2. theme-color 동기화 ───────────────────────────────── */
  function syncThemeColor() {
    // index.html의 prefers-color-scheme 메타는 "최초 페인트" 전용이다.
    // 앱 자체 테마 토글(.light-mode)이 OS 설정과 다를 수 있으므로,
    // JS가 제어권을 잡는 순간 media 조건부 메타를 걷어내고 하나만 남긴다.
    var pre = document.querySelectorAll('meta[name="theme-color"][media]');
    for (var i = 0; i < pre.length; i++) pre[i].parentNode.removeChild(pre[i]);

    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    var light = document.body && document.body.classList.contains('light-mode');
    meta.setAttribute('content', light ? '#EEF1F5' : '#1a1a1a');
  }
  function watchTheme() {
    if (!document.body) return;
    syncThemeColor();
    new MutationObserver(syncThemeColor)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchTheme);
  } else {
    watchTheme();
  }

  /* ── 3. 토스트 (업데이트 알림 등) ────────────────────────── */
  function toast(msg, actionLabel, onAction, timeoutMs) {
    var el = document.createElement('div');
    el.className = 'pwa-toast';
    var span = document.createElement('span');
    span.className = 'pwa-toast-msg';
    span.textContent = msg;
    el.appendChild(span);

    if (actionLabel) {
      var btn = document.createElement('button');
      btn.className = 'pwa-toast-btn';
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.onclick = function () { close(); if (onAction) onAction(); };
      el.appendChild(btn);
    }
    var x = document.createElement('button');
    x.className = 'pwa-toast-x';
    x.type = 'button';
    x.setAttribute('aria-label', '닫기');
    x.textContent = '✕';
    x.onclick = close;
    el.appendChild(x);

    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });

    var t = null;
    if (timeoutMs) t = setTimeout(close, timeoutMs);
    function close() {
      if (t) clearTimeout(t);
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 260);
    }
    return close;
  }

  /* ── 4. 서비스워커 등록 ──────────────────────────────────── */
  // Capacitor 네이티브(file:/capacitor:)에서는 SW를 쓰지 않음 — 앱 번들이 이미 로컬
  if ('serviceWorker' in navigator && (isHttps || isLocal) && !isNative) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(SW_URL, { scope: './' }).then(function (reg) {

        // 이미 대기 중인 새 버전이 있으면 바로 안내
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            // controller 가 있다는 건 "기존 버전이 이미 떠 있다" = 진짜 업데이트
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(nw);
            }
          });
        });

        // 6시간마다 업데이트 확인 + 앱으로 돌아올 때 확인
        setInterval(function () { reg.update().catch(function () {}); }, 6 * 60 * 60 * 1000);
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) reg.update().catch(function () {});
        });
      }).catch(function (e) {
        console.warn('[PWA] 서비스워커 등록 실패:', e);
      });

      // 새 워커가 제어권을 잡으면 1회만 새로고침.
      // 단, "최초 설치"는 제외한다 — 이미 최신 내용을 받은 상태라 새로고침이 불필요하고,
      // 화면이 한 번 깜빡이는 데다 ?page= 바로가기로 들어온 경우 목적지를 잃어버린다.
      var hadController = !!navigator.serviceWorker.controller;
      var reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) return;
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    });
  }

  function promptUpdate(worker) {
    toast('새 버전이 준비되었습니다.', '업데이트', function () {
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  /* 수동 캐시 비우기 — 콘솔/설정에서 호출 가능 */
  window.tasklogClearCache = function () {
    if (!('serviceWorker' in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.getRegistrations()
      .then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
      .then(function () { return caches.keys(); })
      .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
      .then(function () { location.reload(true); return true; });
  };

  /* ── 5. 설치(홈 화면 추가) ───────────────────────────────── */
  var deferredPrompt = null;
  var DISMISS_KEY = 'tasklog-a2hs-dismissed';

  function dismissed() {
    try {
      var v = localStorage.getItem(DISMISS_KEY);
      if (!v) return false;
      // 14일 후 다시 표시
      return (Date.now() - Number(v)) < 14 * 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }
  function setDismissed() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  function showInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;
    var b = document.createElement('button');
    b.id = 'pwa-install-btn';
    b.className = 'pwa-install-btn';
    b.type = 'button';
    b.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      '<span>앱 설치</span>';
    b.onclick = function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        b.remove();
      });
    };
    // 우클릭/롱프레스로 숨기기
    b.oncontextmenu = function (e) { e.preventDefault(); setDismissed(); b.remove(); };
    document.body.appendChild(b);

    // 20초 후 자동으로 접힘(아이콘만)
    setTimeout(function () { b.classList.add('mini'); }, 20000);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (!dismissed() && !html.classList.contains('pwa-standalone')) showInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    setDismissed();
    var b = document.getElementById('pwa-install-btn');
    if (b) b.remove();
    toast('TaskLog가 설치되었습니다.', null, null, 3000);
  });

  // iOS Safari 는 beforeinstallprompt 가 없음 → 안내 문구
  window.addEventListener('load', function () {
    if (!isIOS || html.classList.contains('pwa-standalone') || dismissed()) return;
    if (!isHttps) return;
    setTimeout(function () {
      toast('공유 → "홈 화면에 추가"로 앱처럼 사용할 수 있어요.', '알겠어요', setDismissed, 12000);
    }, 4000);
  });

  /* 설치 버튼을 다시 띄우고 싶을 때 */
  window.tasklogShowInstall = function () {
    try { localStorage.removeItem(DISMISS_KEY); } catch (e) {}
    if (deferredPrompt) showInstallButton();
    else toast('브라우저 메뉴에서 "앱 설치 / 홈 화면에 추가"를 선택하세요.', null, null, 5000);
  };

  /* ── 6. 매니페스트 바로가기 (?page=todo&focus=today 등) ── */

  /* focus 동작 — 페이지가 그려진 뒤 실행된다.
     true를 돌려주면 완료, false면 아직 DOM이 준비되지 않은 것으로 보고 재시도한다. */
  var FOCUS_ACTIONS = {
    /* 오늘 할 일 — 홈 캘린더에서 오늘을 선택해 하단 상세 목록에 오늘 항목을 띄운다 */
    today: function () {
      if (typeof window.selectCalDate !== 'function') return false;
      if (!document.getElementById('cal-detail')) return false;
      var n = new Date();
      window.selectCalDate(n.getFullYear(), n.getMonth(), n.getDate());
      var el = document.getElementById('cal-detail');
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }
      return true;
    },
    /* 빠른 메모 — 메모 페이지 입력창에 커서를 놓는다 */
    memo: function () {
      var el = document.getElementById('nb-input');
      if (!el) return false;
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      // 모바일 키보드는 렌더 직후 focus가 무시되는 경우가 있어 한 프레임 뒤에 준다
      requestAnimationFrame(function () { try { el.focus(); } catch (e) {} });
      return true;
    }
  };

  function runFocus(focus) {
    var fn = FOCUS_ACTIONS[focus];
    if (!fn) return;
    var n = 0;
    (function tick() {
      var ok = false;
      try { ok = fn(); } catch (e) { ok = true; } // 예외는 재시도해도 같으므로 중단
      if (ok) return;
      if (++n < 40) setTimeout(tick, 150); // 최대 6초
      else console.warn('[PWA] 바로가기 focus 대상을 찾지 못했습니다: ?focus=' + focus);
    })();
  }

  window.addEventListener('load', function () {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }

    var page  = params.get('page');
    var focus = params.get('focus');

    // start_url의 ?source=pwa 등 부가 파라미터는 항상 주소창에서 정리
    function cleanUrl() {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    if (!page) {
      if (focus) runFocus(focus); // ?focus= 만 온 경우(현재 화면에서 실행)
      if (params.toString()) cleanUrl();
      return;
    }

    var tries = 0;
    (function apply() {
      // 사이드바 버튼이 없는 화면(calendar 등)도 열 수 있도록
      // nav 버튼 대신 렌더러 등록 여부로 판정한다.
      var known = (typeof window.MENU_RENDERERS === 'object' && window.MENU_RENDERERS &&
                   window.MENU_RENDERERS[page]) || document.getElementById('nav-' + page);
      if (typeof window.navToMenu === 'function' && known) {
        window.navToMenu(page);
        if (focus) runFocus(focus);
        cleanUrl();
        return;
      }
      if (++tries < 60) { setTimeout(apply, 250); return; }
      // 15초 안에 못 열면 조용히 포기하지 말고 알려준다
      console.warn('[PWA] 바로가기 대상을 찾지 못했습니다: ?page=' + page);
      cleanUrl();
    })();
  });

  /* ── 7. 모바일 스와이프: 왼쪽 가장자리 → 사이드바 열기 ──── */
  (function swipeDrawer() {
    if (!('ontouchstart' in window)) return;
    var EDGE = 24, THRESH = 60;
    var sx = 0, sy = 0, tracking = false, fromEdge = false;

    document.addEventListener('touchstart', function (e) {
      if (window.innerWidth > 768 || e.touches.length !== 1) return;
      // 오른쪽 상세 패널이 열려 있으면 개입하지 않음
      var rp = document.getElementById('right-panel');
      if (rp && rp.classList.contains('open')) return;

      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      var open = document.querySelector('.app.sidebar-open');
      fromEdge = sx <= EDGE;
      tracking = fromEdge || !!open;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < THRESH || Math.abs(dy) > Math.abs(dx)) return;

      var app = document.querySelector('.app');
      if (!app) return;
      if (dx > 0 && fromEdge && typeof window.openSidebar === 'function') window.openSidebar();
      else if (dx < 0 && app.classList.contains('sidebar-open') &&
               typeof window.closeSidebar === 'function') window.closeSidebar();
    }, { passive: true });
  })();

  /* ── 8. 모바일 뷰포트 높이 보정 (iOS 주소창 대응) ───────── */
  (function vhFix() {
    function set() {
      html.style.setProperty('--app-vh', window.innerHeight * 0.01 + 'px');
    }
    set();
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', function () { setTimeout(set, 200); });
  })();

  /* ── 9. 온라인/오프라인 표시 ─────────────────────────────── */
  var offlineClose = null;
  window.addEventListener('offline', function () {
    if (!offlineClose) offlineClose = toast('오프라인 — 변경사항은 연결 후 동기화됩니다.');
  });
  window.addEventListener('online', function () {
    if (offlineClose) { offlineClose(); offlineClose = null; }
    toast('다시 연결되었습니다.', null, null, 2500);
  });
})();
