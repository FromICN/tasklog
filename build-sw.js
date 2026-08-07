#!/usr/bin/env node
/* ============================================================
   📦 build-sw.js — 캐시 버전 자동화
   ------------------------------------------------------------
   해결하는 문제
     1) 파일을 고쳤는데 index.html의 ?v= 를 안 올림
        → 사용자 브라우저가 옛 파일을 계속 씀
     2) index.html의 ?v= 는 올렸는데 sw.js의 PRECACHE_URLS 를 안 고침
        → 서비스워커가 없는 URL을 프리캐시 → 오프라인에서 깨짐
     3) sw.js의 CACHE_VERSION 을 안 올림
        → 새 버전이 사용자에게 영원히 도달하지 않음

   어떻게
     · 각 자원의 내용 해시를 build-hashes.json 에 기록해 둔다.
     · 내용이 바뀐 파일만 골라 index.html의 ?v= 를 자동으로 올린다.
     · 그 결과를 그대로 sw.js의 PRECACHE_URLS 로 복사하고 CACHE_VERSION 도 올린다.
     · pwa.js의 SW_URL 도 같은 버전으로 맞춘다.

   사용법
     node build-sw.js              내용이 바뀐 파일을 찾아 버전 일괄 갱신
     node build-sw.js --check      아무것도 쓰지 않고 어긋난 곳만 보고 (배포 전 점검)
     node build-sw.js --all        변경 여부와 무관하게 모든 ?v= 를 새 버전으로
     node build-sw.js --version=20260810b   버전 직접 지정

   ⚠️ 첫 실행은 해시 기준선을 만드는 단계라 ?v= 를 올리지 않는다.
      (기준선 생성 후 두 번째 실행부터 변경 감지가 동작한다.)
   ============================================================ */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT       = __dirname;
const INDEX_HTML = path.join(ROOT, 'index.html');
const SW_JS      = path.join(ROOT, 'sw.js');
const PWA_JS     = path.join(ROOT, 'pwa.js');
/* 점으로 시작하면 GitHub 웹 업로더가 걸러내므로 일반 파일명을 쓴다.
   예전 이름(.build-hashes.json)이 남아 있으면 그것도 읽어준다. */
const HASH_FILE     = path.join(ROOT, 'build-hashes.json');
const HASH_FILE_OLD = path.join(ROOT, '.build-hashes.json');

const argv    = process.argv.slice(2);
const CHECK   = argv.includes('--check');
const ALL     = argv.includes('--all');
const forced  = (argv.find((a) => a.startsWith('--version=')) || '').split('=')[1];

/* index.html에 ?v= 없이 적히지만 프리캐시에는 넣고 싶은 자원 */
const EXTRA_ASSETS = [
  './tasklog-icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

/* 프리캐시 제외 — 용량이 크고 최초 1회만 쓰이므로 런타임 캐시로 충분 */
const PRECACHE_EXCLUDE = [/^\.\/splash\//, /^\.\/screenshot-/, /^\.\/icon-1024\.png$/];

// ── 유틸 ────────────────────────────────────────────────────
const read     = (p) => fs.readFileSync(p, 'utf8');
const hashOf   = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
const problems = [];
const changed  = [];

function die(msg) { console.error('❌ ' + msg); process.exit(1); }

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/* 오늘 이미 배포했으면 접미사를 a → b → c 로 올린다 */
function nextVersion(cur) {
  if (forced) return forced;
  const today = todayStamp();
  const c = String(cur || '').replace(/^v/, '');
  if (c.startsWith(today)) {
    const s = c.slice(today.length) || 'a';
    const n = String.fromCharCode(Math.min(s.charCodeAt(0) + 1, 122));
    return today + n;
  }
  return today + 'a';
}

// ── 0. 사전 점검 ────────────────────────────────────────────
if (!fs.existsSync(INDEX_HTML)) die('index.html을 찾을 수 없습니다.');
if (!fs.existsSync(SW_JS))      die('sw.js를 찾을 수 없습니다.');

let html = read(INDEX_HTML);
let sw   = read(SW_JS);
let pwa  = fs.existsSync(PWA_JS) ? read(PWA_JS) : null;

const verMatch = sw.match(/const CACHE_VERSION\s*=\s*'([^']+)';\s*\/\* @@BUILD:VERSION \*\//);
if (!verMatch) die("sw.js에 '/* @@BUILD:VERSION */' 표시가 없습니다.");
const curVersion = verMatch[1].replace(/^v/, '');
const version    = CHECK ? curVersion : nextVersion(curVersion);

const hashSrc    = fs.existsSync(HASH_FILE) ? HASH_FILE
                 : (fs.existsSync(HASH_FILE_OLD) ? HASH_FILE_OLD : null);
const prevHashes = hashSrc ? JSON.parse(read(hashSrc)) : null;
const firstRun   = prevHashes === null;
const hashes     = {};

// ── 1. pwa.js의 SW_URL 을 먼저 맞춘다 (해시 계산 전에) ──────
if (pwa) {
  if (!/@@BUILD:SW_URL/.test(pwa)) {
    problems.push("pwa.js에 '@@BUILD:SW_URL' 표시가 없어 SW_URL을 갱신하지 못했습니다.");
  } else {
    pwa = pwa.replace(
      /var SW_URL\s*=\s*'\.\/sw\.js\?v=[^']*';[^\n]*/,
      `var SW_URL  = './sw.js?v=${version}';   /* @@BUILD:SW_URL — build-sw.js가 자동 갱신 */`
    );
  }
}

// ── 2. index.html의 ?v= 를 내용 변경 기준으로 갱신 ──────────
/* src/href="foo.js?v=xxx" 를 모두 순회하며 실제 파일 해시와 비교 */
html = html.replace(/((?:src|href)\s*=\s*")([^"]+?)(\?v=)([^"]*)(")/g,
  (full, pre, file, q, ver, post) => {
    if (/^(https?:)?\/\//.test(file) || file.startsWith('data:')) return full;
    const abs = path.join(ROOT, file.replace(/^\.\//, ''));
    if (!fs.existsSync(abs)) { problems.push(`index.html이 참조하는 파일이 없습니다: ${file}`); return full; }

    // 스스로 고친 pwa.js는 디스크가 아니라 메모리 내용으로 해시
    const buf = (pwa !== null && path.basename(abs) === 'pwa.js') ? Buffer.from(pwa, 'utf8')
                                                                  : fs.readFileSync(abs);
    const h = hashOf(buf);
    hashes[file] = h;

    if (CHECK) {
      if (prevHashes && prevHashes[file] && prevHashes[file] !== h) {
        problems.push(`내용이 바뀌었는데 ?v= 가 그대로입니다: ${file} (?v=${ver})`);
      }
      return full;
    }
    const contentChanged = ALL || (prevHashes && prevHashes[file] !== undefined && prevHashes[file] !== h);
    if (firstRun || !contentChanged) return full;

    changed.push(`${file}  ?v=${ver} → ?v=${version}`);
    return pre + file + q + version + post;
  });

/* manifest.json 링크는 manifest 내용이 바뀌면 함께 올라간다(위 로직 적용됨) */

// ── 3. 프리캐시 목록 생성 (갱신된 html 기준) ────────────────
function collectFromIndex(src) {
  const urls = [];
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const u = m[1];
    if (/^(https?:)?\/\//.test(u) || u.startsWith('data:') || u.startsWith('#')) continue;
    if (!/\.(js|css|json)(\?|$)/.test(u)) continue;
    urls.push('./' + u.replace(/^\.\//, ''));
  }
  return urls;
}

const precache = ['./', './index.html', './manifest.json']
  .concat(collectFromIndex(html))
  .concat(EXTRA_ASSETS)
  .filter((u) => !PRECACHE_EXCLUDE.some((re) => re.test(u.split('?')[0])));

const seen = new Set();
const list = precache.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

/* EXTRA_ASSETS 존재 확인 */
EXTRA_ASSETS.forEach((u) => {
  if (!fs.existsSync(path.join(ROOT, u.replace(/^\.\//, '')))) problems.push(`프리캐시 대상 파일이 없습니다: ${u}`);
});

// ── 4. sw.js 블록 교체 ──────────────────────────────────────
const START = '/* @@BUILD:PRECACHE-START';
const END   = '/* @@BUILD:PRECACHE-END */';
const si = sw.indexOf(START);
const ei = sw.indexOf(END);
if (si === -1 || ei === -1) die('sw.js에 PRECACHE 표시가 없습니다.');

const oldBlock = sw.slice(si, ei + END.length);
const newBlock =
  START + ' — build-sw.js가 생성합니다 (직접 수정 금지) */\n' +
  list.map((u) => `  '${u}',`).join('\n') + '\n  ' + END;

sw = sw.slice(0, si) + newBlock + sw.slice(ei + END.length);
sw = sw.replace(
  /const CACHE_VERSION\s*=\s*'[^']+';\s*\/\* @@BUILD:VERSION \*\//,
  `const CACHE_VERSION = 'v${version}'; /* @@BUILD:VERSION */`
);

// ── 5. 결과 ─────────────────────────────────────────────────
if (CHECK) {
  if (oldBlock.trim() !== newBlock.trim()) {
    problems.push('sw.js의 PRECACHE_URLS가 index.html과 어긋나 있습니다.');
  }
  if (problems.length) {
    console.error('\n❌ 점검 실패 — `node build-sw.js` 를 실행하세요.\n');
    problems.forEach((p) => console.error('   · ' + p));
    process.exit(1);
  }
  console.log(`✅ 점검 통과 — 프리캐시 ${list.length}개, CACHE_VERSION=v${curVersion}`);
  process.exit(0);
}

if (problems.length) {
  console.error('\n❌ 빌드 중단\n');
  problems.forEach((p) => console.error('   · ' + p));
  process.exit(1);
}

fs.writeFileSync(INDEX_HTML, html, 'utf8');
fs.writeFileSync(SW_JS, sw, 'utf8');
if (pwa !== null) fs.writeFileSync(PWA_JS, pwa, 'utf8');
fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2) + '\n', 'utf8');
/* 예전 이름이 남아 있으면 정리 (두 벌이 어긋나는 걸 막는다) */
if (fs.existsSync(HASH_FILE_OLD)) { try { fs.unlinkSync(HASH_FILE_OLD); } catch (e) {} }

console.log('✅ 캐시 버전 갱신 완료');
console.log(`   CACHE_VERSION : v${curVersion} → v${version}`);
console.log(`   프리캐시 자원  : ${list.length}개`);
if (firstRun) {
  console.log('   ℹ️  첫 실행 — 해시 기준선(build-hashes.json)을 만들었습니다.');
  console.log('      다음 실행부터 내용이 바뀐 파일의 ?v= 를 자동으로 올립니다.');
} else if (changed.length) {
  console.log(`   ?v= 갱신 (${changed.length}개)`);
  changed.forEach((c) => console.log('      · ' + c));
} else {
  console.log('   ?v= 갱신 대상 없음 (내용이 바뀐 파일이 없습니다)');
}
console.log('\n   배포할 파일: index.html, sw.js, pwa.js, build-hashes.json + 내용을 고친 파일');
