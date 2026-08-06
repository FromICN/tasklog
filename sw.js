/* ============================================================
   TaskLog Service Worker
   ------------------------------------------------------------
   전략
   · 내비게이션(HTML)  : Network First → 실패 시 캐시된 index.html
   · 동일 출처 정적자원 : Stale While Revalidate (즉시 응답 + 백그라운드 갱신)
   · CDN(cdnjs)        : Cache First (오프라인에서도 xlsx 동작)
   · 인증/API          : 절대 캐시하지 않음 (완전 통과)

   ⚠️ 파일을 수정해 배포할 때는 아래 CACHE_VERSION 값을 반드시 올릴 것.
   ============================================================ */

const CACHE_VERSION = 'v20260806a';
const STATIC_CACHE  = `tasklog-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tasklog-runtime-${CACHE_VERSION}`;

/* index.html이 실제로 요청하는 URL과 동일하게(쿼리 포함) 유지해야 적중률이 높음 */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './manifest.json?v=20260806a',

  // 스타일
  './style.css?v=20260803a',
  './profile-modal.css?v=20260722',
  './login.css?v=20260720b',
  './mobile.css?v=20260806a',

  // 스크립트 (index.html 로드 순서와 동일)
  './config.js?v=20260722',
  './colresize.js?v=20260722',
  './backup-core.js?v=20260722',
  './backup-xlsx.js?v=20260722',
  './auth.js?v=20260722',
  './calendar.js?v=20260731a',
  './mandalart.js?v=20260803a',
  './lifewheel.js?v=20260722',
  './home.js?v=20260803a',
  './calpage.js?v=20260730',
  './gantt.js?v=20260803a',
  './notes.js?v=20260803a',
  './journal.js?v=20260803a',
  './wbs.js?v=20260803a',
  './mvv.js?v=20260722',
  './settings.js?v=20260722',
  './drive.js?v=20260722',
  './todo.js?v=20260803a',
  './yearsync.js?v=20260722',
  './script.js?v=20260803a',
  './pwa.js?v=20260806a',

  // 아이콘
  './tasklog-icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

/* 캐시 금지 — 인증·실시간 데이터 (요청을 그대로 네트워크로 흘려보냄) */
const BYPASS_HOSTS = [
  'accounts.google.com',
  'apis.google.com',
  'oauth2.googleapis.com',
  'www.googleapis.com',
  'content.googleapis.com',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'www.google.com',
  'lh3.googleusercontent.com',
];

/* Cache First 로 다뤄도 되는 CDN */
const CDN_HOSTS = ['cdnjs.cloudflare.com'];

// ── 설치: 프리캐시 ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // 하나가 실패해도 설치 전체가 깨지지 않도록 개별 처리
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (_) { /* 개별 실패는 무시 */ }
    }));
    await self.skipWaiting();
  })());
});

// ── 활성화: 옛 캐시 정리 ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('tasklog-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

// ── 페이지에서 즉시 업데이트 요청 ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k.startsWith('tasklog-')).map((k) => caches.delete(k)))
    ));
  }
});

// ── fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 이외(POST 등)는 손대지 않음
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // http(s) 이외 스킴 무시 (chrome-extension:, capacitor: 등)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 인증·API 는 완전히 통과
  if (BYPASS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return;

  // 1) 내비게이션 → Network First
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          const c = await caches.open(STATIC_CACHE);
          c.put('./index.html', preload.clone());
          return preload;
        }
        const fresh = await fetch(req);
        const c = await caches.open(STATIC_CACHE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const cached = (await caches.match('./index.html')) || (await caches.match('./'));
        return cached || new Response(
          '<!doctype html><meta charset="utf-8"><title>오프라인</title>' +
          '<body style="font-family:-apple-system,sans-serif;background:#1c1c1c;color:#eee;' +
          'display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
          '<div style="text-align:center"><h2>오프라인입니다</h2>' +
          '<p style="color:#999">네트워크에 연결되면 자동으로 다시 불러옵니다.</p></div>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
        );
      }
    })());
    return;
  }

  // 2) CDN → Cache First
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 3) 그 외 교차 출처 → 손대지 않음
  if (url.origin !== self.location.origin) return;

  // 4) 동일 출처 정적자원 → Stale While Revalidate
  event.respondWith((async () => {
    const cache  = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req, { ignoreSearch: false })
                || await cache.match(req, { ignoreSearch: true });

    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { network; return cached; }
    const fresh = await network;
    return fresh || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
