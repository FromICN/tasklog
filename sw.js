/* ============================================================
   TaskLog Service Worker
   ------------------------------------------------------------
   전략
   · 내비게이션(HTML)  : Network First → 실패 시 캐시된 index.html
   · 동일 출처 정적자원 : Stale While Revalidate (즉시 응답 + 백그라운드 갱신)
   · CDN(cdnjs)        : Cache First (오프라인에서도 xlsx 동작)
   · 인증/API          : 절대 캐시하지 않음 (완전 통과)

   ⚠️ 아래 CACHE_VERSION / PRECACHE_URLS 블록은 손으로 고치지 말 것.
      index.html을 수정한 뒤 `npm run build:sw` 를 실행하면 자동으로 갱신된다.
      (수동 편집 시 index.html의 ?v= 와 어긋나 캐시가 영원히 낡은 채로 남는다.)
   ============================================================ */

const CACHE_VERSION = 'v20260829d'; /* @@BUILD:VERSION */
const STATIC_CACHE  = `tasklog-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tasklog-runtime-${CACHE_VERSION}`;

/* index.html이 실제로 요청하는 URL과 동일하게(쿼리 포함) 유지해야 적중률이 높음 */
const PRECACHE_URLS = [
  /* @@BUILD:PRECACHE-START — build-sw.js가 생성합니다 (직접 수정 금지) */
  './',
  './index.html',
  './manifest.json',
  './manifest.json?v=20260810a',
  './style.css?v=20260829c',
  './profile-modal.css?v=20260722',
  './login.css?v=20260720b',
  './mobile.css?v=20260829c',
  './fonts/pretendard.css?v=20260809a',
  './theme.css?v=20260824c',
  './config.js?v=20260810a',
  './firebase-init.js?v=20260808a',
  './colresize.js?v=20260722',
  './backup-core.js?v=20260722',
  './backup-xlsx.js?v=20260722',
  './auth.js?v=20260813b',
  './calendar.js?v=20260731a',
  './mandalart.js?v=20260829d',
  './lifewheel.js?v=20260816e',
  './home.js?v=20260823a',
  './habit.js?v=20260824a',
  './calpage.js?v=20260730',
  './gantt.js?v=20260816b',
  './notes.js?v=20260816a',
  './journal.js?v=20260829b',
  './wbs.js?v=20260817a',
  './mvv.js?v=20260722',
  './settings.js?v=20260817j',
  './drive.js?v=20260722',
  './firestore-sync.js?v=20260813f',
  './todo.js?v=20260803a',
  './yearsync.js?v=20260722',
  './script.js?v=20260824g',
  './pwa.js?v=20260829d',
  './mobile-ui.js?v=20260807c',
  './tasklog-icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './fonts/IBMPlexMono-Regular.woff2',
  './fonts/IBMPlexMono-SemiBold.woff2',
  /* @@BUILD:PRECACHE-END */
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

/* 첫 방문에 오프라인이라 캐시조차 없을 때 보여줄 최소 화면.
   앱과 동일한 theme-color(#1a1a1a / #EEF1F5)를 쓰고 OS 테마를 따라간다. */
const OFFLINE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1a1a">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#EEF1F5">
<title>TaskLog — 오프라인</title><style>
:root{color-scheme:dark light}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
     font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;
     background:#1a1a1a;color:#eee;text-align:center;padding:24px}
h2{margin:0 0 8px;font-size:18px}
p{margin:0 0 20px;color:#999;font-size:13px;line-height:1.6}
button{min-height:44px;padding:0 20px;border-radius:8px;border:1px solid #666;
       background:transparent;color:inherit;font-size:14px;cursor:pointer}
@media (prefers-color-scheme: light){body{background:#EEF1F5;color:#222}p{color:#666}button{border-color:#bbb}}
</style></head><body><div>
<h2>오프라인입니다</h2>
<p>네트워크에 연결되면 자동으로 다시 불러옵니다.<br>저장된 내용은 그대로 남아 있습니다.</p>
<button onclick="location.reload()">다시 시도</button>
</div>
<script>addEventListener('online',function(){location.reload()})<\/script>
</body></html>`;

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
        return cached || new Response(OFFLINE_HTML,
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
