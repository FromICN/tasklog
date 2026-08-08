# 배포 체크리스트 — 제도(製圖) 테마

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
| `index.html` | `mobile.css` 링크 뒤에 `fonts/pretendard.css`, `theme.css` 두 줄 추가. 그 외 변경 없음. |
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
