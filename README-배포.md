# 배포 체크리스트 — 제도(製圖) 테마 + 동기화 버그 수정

## 0. ⚠️ auth.js — 순서를 지켜야 하는 수정

`maybeAutoSignIn()` 의 **세션 토큰 재사용 경로에만** `_syncFirebaseAuth()` 호출이
빠져 있었습니다. 새로고침 때는 거의 항상 이 경로를 타므로, 웹은 사실상
Firestore에 연결되지 않은 채 localStorage + 드라이브 백업으로만 돌고 있었습니다.
Firestore에는 마지막 수동 로그인 시점의 스냅샷만 남아 뒤처졌고, 설치형 앱이
그걸 읽으면서 두 기기가 다른 데이터를 보여줬습니다..

```js
// maybeAutoSignIn() 세션 토큰 분기, updateAuthUI() 바로 위
_syncFirebaseAuth(sessToken);
```

**이 파일을 올리기 전에 Firestore의 아래 컬렉션을 반드시 비워야 합니다.**

```
users/{uid}/tasks · notes · logs · docs      ← docs 안의 _meta 포함
```

`firestore-sync.js` 의 스냅샷 핸들러(246~253행)는 원격과 로컬이 다르면 **병합 없이
통째로 덮어씁니다.** 비우지 않고 배포하면, 웹이 Firestore에 연결되는 순간 옛 스냅샷이
최신 데이터를 밀어버립니다. 비워두면 `_migrateIfNeeded()` 가 리스너를 붙이기 **전에**
로컬 데이터를 클라우드로 올리므로 안전합니다.

배포 후 웹 콘솔에서 확인:

```
🔥 Firebase 로그인 성공: <uid>
🚚 첫 로그인 — 로컬 데이터를 Firestore로 마이그레이션...
```

---

# 그 외 — 제도 테마

이 폴더의 파일을 저장소 **루트**에 그대로 덮어쓰면 됩니다. 폴더 구조 그대로입니다.

## 1. 새로 추가되는 파일

| 파일 | 크기 | 설명 |
|---|---|---|
| `theme.css` | 17KB | 테마 스킨 한 장. DOM은 안 건드리고 토큰만 덮어씁니다. |
| `fonts/pretendard.css` | 55KB | Pretendard 동적 서브셋 @font-face 92개. URL만 `./pretendard/`로 바꾼 원본. |
| `fonts/pretendard/*.woff2` | 2.8MB (92개) | 서브셋 본체. 브라우저는 실제 쓰는 글자 범위만 30KB씩 받아갑니다. |
| `fonts/IBMPlexMono-Regular.woff2` | 15KB | 숫자·눈금용 고정폭 (라틴만). |
| `fonts/IBMPlexMono-SemiBold.woff2` | 16KB | 위와 같음. |

## 2. 덮어쓰는 파일

| 파일 | 바뀐 곳 |
|---|---|
| **`auth.js`** | **동기화 버그 수정 — 아래 0절을 반드시 먼저 읽으세요.** |
| `index.html` | `mobile.css` 링크 뒤에 `fonts/pretendard.css`, `theme.css` 두 줄 추가. 그 외 변경 없음. |
| `mobile.css` | 모바일 레이아웃 버그 수정 — 아래 6절 참고. |
| `build-sw.js` | `EXTRA_ASSETS`에 Plex Mono 2개 추가, `PRECACHE_EXCLUDE`에 `fonts/pretendard/` 추가. |
| `copy-www.js` | `ALWAYS_DIRS` 추가 — CSS만 참조하는 `fonts/pretendard/`를 APK 빌드에 포함시킵니다. |

## 3. 손으로 한 줄 고쳐야 하는 파일

`gantt.js`의 `getGanttColor()` 마지막 줄 — 이 폴더에 없습니다. 이 저장소의 `gantt.js`가
로컬 `backup\` 사본과 다를 수 있어서 통째로 덮어쓰지 않았습니다.

```js
// 기존
return '#3b82f6';
// 변경
return '#4E8F79';   // 섹션 미지정 Task의 기본 막대색 (제도 테마: 소나무빛)
```

간트 막대 색은 JS 인라인 스타일이라 CSS로는 못 바꿉니다. 만다라트 섹션에 연결된
Task는 원래 섹션 색을 그대로 쓰고, 연결 안 된 Task만 이 기본색을 씁니다.

## 4. 배포 절차

```
npm run build        # index.html의 ?v= 갱신 + sw.js PRECACHE_URLS/CACHE_VERSION 재생성
git add -A
git commit -m "제도 테마 적용 + 글꼴 자체 호스팅"
git push
```

`npm run build`가 `sw.js`와 `build-hashes.json`을 고칩니다. 이 두 파일도 같이 커밋하세요.
(손으로 고치면 안 됩니다.)

APK도 만든다면 `npm run build:www` → `npx cap sync android`.

## 5. 알아둘 것

- **글꼴은 CDN을 안 씁니다.** `sw.js`의 `CDN_HOSTS`에 `cdnjs.cloudflare.com`만 있어서
  구글/jsdelivr 폰트는 서비스워커가 캐시하지 않습니다. 오프라인이나 APK(로컬 오리진)에서
  글꼴이 통째로 빠집니다. 같은 오리진으로 두면 `sw.js`의 4번 규칙(Stale While Revalidate)이
  알아서 캐시합니다.
- **Pretendard 서브셋은 일부러 프리캐시에서 뺐습니다.** 92개를 다 프리캐시하면 배포할 때마다
  `CACHE_VERSION`이 올라가면서 2.8MB를 다시 받습니다. 런타임 캐시로 충분합니다.
- **주홍색 규칙**: `--tl-seal`은 "지금"에만 씁니다 — 오늘 날짜, 간트의 현재 시각선, 마감 지남.
  나중에 화면을 더 손볼 때도 이 규칙은 지켜주세요. 다른 데 주홍이 보이면 버그입니다.
- 되돌리려면 `index.html`에서 `theme.css` 한 줄만 빼면 원래 화면으로 돌아갑니다.
  (단 `mobile.css`의 수정은 테마와 무관한 버그 수정이라 그대로 두는 편이 낫습니다.)

## 6. mobile.css에서 고친 것

**깨진 주석 두 곳** — 이게 여러 증상의 진짜 원인이었습니다. 주석이 `*/`로 한 번
닫힌 뒤 설명이 더 이어지고 다시 `*/`로 끝나서, CSS 파서가 그 뒤 규칙을 통째로
삼켰습니다. 눈으로는 정상 주석처럼 보입니다.

- Home 절: `.home-page { overflow-y: auto }` 가 먹히지 않아 `style.css`의
  `height:100% + overflow:hidden` 이 그대로 남았습니다. 세로로 쌓인 카드 1430px가
  690px에서 잘려 **습관 트래커 · 만다라트 · 라이프휠에 아예 닿을 수 없었습니다.**
- Board 절: `.todo-table { table-layout:auto; min-width:680px }` 이 사라져
  데스크톱에서 저장된 열 너비가 그대로 적용됐습니다.

**그 밖에**

| 증상 | 원인 | 수정 |
|---|---|---|
| 햄버거와 페이지 제목이 두 줄로 | `.topbar-left`에 `display` 선언이 없어 블록으로 쌓임 | `display:flex` + 제목 말줄임 |
| Board 첫 열 고정이 안 됨 | `border-collapse: collapse` 이면 크롬이 `th/td`의 `position:sticky`를 무시 | `border-collapse: separate` |
| Board 헤더에 다른 열이 겹침 | `thead th`의 `z-index`가 10인데 첫 열만 3이었음 | 첫 열을 11로 |
| 고정 열 왼쪽 틈으로 내용이 비침 | 스크롤 컨테이너의 `padding-left`(12px)는 `left:0`이 못 덮음 | 왼쪽을 메우는 `box-shadow` |
| 고정 열 색이 표와 다름 | 배경이 `--main-bg`(매트색)였음 | 카드와 같은 `--tl-sheet` |
| WD 머리글과 본문 세로선이 어긋남 | `min-width:560px`이 `.jnlw-body`에 걸려 있는데 **그런 요소가 없음**(실제 이름은 `.jnlw-canvas`) → 머리글만 560px | 폭 강제를 없애고 7일이 한 화면에 |
| WD 주간 그리드가 회고 패널 위에 겹침 | `.jnl-body`에 `flex:1 1 0%`가 남아 497px로 눌린 채 내용 1800px가 넘침 | `flex:0 0 auto` + 그리드 자체 스크롤 |
| 만다라트 항목 이름이 안 보임 | ≤480px에서 2열이라 한 칸이 169px | 480px 이하에서는 한 줄에 하나씩 |
