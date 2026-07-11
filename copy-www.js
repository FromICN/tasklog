// ============================================
//  📦 www/ 빌드 스크립트 — Capacitor 패키징용
//  웹앱 파일만 www 폴더로 복사합니다. (node copy-www.js)
// ============================================
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'www');

// 복사 대상: html/css/js (개발·설정 파일 제외)
const EXCLUDE = new Set([
  'copy-www.js', 'package.json', 'package-lock.json',
  'capacitor.config.json', 'firestore.rules',
]);
const EXCLUDE_DIRS = new Set(['www', 'android', 'node_modules', 'BackUp', '.git']);
const EXT_OK = new Set(['.html', '.css', '.js', '.json', '.png', '.svg', '.ico']);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
for (const name of fs.readdirSync(__dirname)) {
  const full = path.join(__dirname, name);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) { if (EXCLUDE_DIRS.has(name)) continue; else continue; }
  if (EXCLUDE.has(name)) continue;
  if (!EXT_OK.has(path.extname(name).toLowerCase())) continue;
  fs.copyFileSync(full, path.join(OUT, name));
  n++;
}
console.log('✅ www/ 생성 완료 — ' + n + '개 파일 복사됨');
