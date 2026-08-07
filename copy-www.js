// ============================================
//  📦 www/ 빌드 스크립트 — Capacitor 패키징용
//  실행: node copy-www.js   (또는 npm run build:www)
//
//  이전 방식은 루트의 모든 .js/.css/.json 을 복사해서
//  index.html이 불러오지도 않는 파일까지 APK에 들어갔다.
//    script.original.js(105KB) · style.original.css(241KB)
//    backup-pg-*.js · chk_*.js · tlfilter.js · firestore-sync.js …  약 455KB
//
//  이제는 index.html이 실제로 참조하는 파일만 복사한다.
//  (참조되지 않은 파일은 목록으로 보여주니 확인 후 정리하면 된다.)
// ============================================
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT  = path.join(ROOT, 'www');

/* index.html이 참조하지는 않지만 앱 실행에 필요한 자원 */
const ALWAYS = [
  'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-1024.png',
  'apple-touch-icon.png', 'favicon-32.png', 'tasklog-icon.svg',
];

/* 네이티브 앱(Capacitor)에는 넣지 않는다
   · sw.js       — 앱 번들이 이미 로컬이라 서비스워커가 불필요
   · splash/*    — iOS 실행화면은 네이티브 스플래시가 담당 (약 600KB 절약) */
function skipForNative(f) {
  return f === 'sw.js' || f.startsWith('splash/');
}

const WEB = process.argv.includes('--web');   // 웹 배포 미리보기용 (전부 포함)

// ── index.html에서 로컬 참조 수집 ───────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = new Set();
const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) {
  const u = m[1];
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:') || u.startsWith('#')) continue;
  refs.add(u.replace(/^\.\//, '').split('?')[0]);
}
refs.add('index.html');                  // 진입점 자신
ALWAYS.forEach((f) => refs.add(f));

// ── 복사 ────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copied = [];
const missing = [];
for (const f of refs) {
  if (!WEB && skipForNative(f)) continue;
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { missing.push(f); continue; }
  const dst = path.join(OUT, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied.push(f);
}

// ── 리포트 ──────────────────────────────────────────────────
const size = copied.reduce((s, f) => {
  try { return s + fs.statSync(path.join(OUT, f)).size; } catch (_) { return s; }
}, 0);

console.log(`✅ www/ 생성 완료 — ${copied.length}개 파일 (${(size / 1024).toFixed(0)} KB)`);
if (missing.length) {
  console.log(`\n⚠️  참조되었지만 파일이 없습니다 (${missing.length}개)`);
  missing.forEach((f) => console.log('   · ' + f));
}

/* 루트에 있지만 아무도 불러오지 않는 파일 알려주기 */
const SKIP_UNUSED = new Set([
  'copy-www.js', 'build-sw.js', 'package.json', 'package-lock.json',
  'capacitor.config.json', 'firestore.rules', 'sw.js', '.build-hashes.json',
  'index.html',
]);
const unused = fs.readdirSync(ROOT)
  .filter((f) => fs.statSync(path.join(ROOT, f)).isFile())
  .filter((f) => /\.(js|css|html)$/i.test(f))
  .filter((f) => !refs.has(f) && !SKIP_UNUSED.has(f));

if (unused.length) {
  const total = unused.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log(`\nℹ️  index.html이 참조하지 않는 파일 ${unused.length}개 (${(total / 1024).toFixed(0)} KB) — 번들에서 제외했습니다`);
  unused.forEach((f) => console.log(`   · ${f}  (${(fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0)} KB)`));
  console.log('   GitHub Pages에도 그대로 올라가 있으니 필요 없으면 저장소에서 지우세요.');
}
