# TaskLog PWA 배포 안내 (2026-08-06)

## 1. 배포할 파일

`new/` 폴더의 아래 파일을 GitHub 저장소 루트(현재 `index.html`이 있는 위치)에 올립니다.

| 파일 | 상태 | 설명 |
|---|---|---|
| `index.html` | **덮어쓰기** | PWA 메타태그·매니페스트 링크·`mobile.css`·`pwa.js` 추가 |
| `manifest.json` | 신규 | 앱 이름·아이콘·시작 URL·바로가기 |
| `sw.js` | 신규 | 서비스워커 (오프라인 캐시) |
| `pwa.js` | 신규 | 서비스워커 등록·설치 버튼·업데이트 알림·스와이프 |
| `mobile.css` | 신규 | 모바일/PWA UI 최적화 |
| `icon-192.png` `icon-512.png` `icon-1024.png` `apple-touch-icon.png` `favicon-32.png` `tasklog-icon.svg` | 확인 | 이미 올라가 있으면 그대로 두면 됩니다 |

> `sw.js`와 `manifest.json`은 **반드시 저장소 루트**에 있어야 합니다.
> 하위 폴더에 두면 서비스워커 범위(scope)가 좁아져 앱 전체를 캐시하지 못합니다.

## 2. 배포 후 확인

1. `https://fromicn.github.io/tasklog/` 접속 (HTTPS 필수 — GitHub Pages는 기본 HTTPS)
2. Chrome DevTools → **Application** 탭
   - Manifest: 오류 없음, 아이콘 정상 표시
   - Service Workers: `activated and is running`
3. Lighthouse → PWA 항목 통과 확인

## 3. 설치 방법

| 환경 | 방법 |
|---|---|
| Android Chrome | 우측 하단 **앱 설치** 버튼 또는 메뉴 → *앱 설치* |
| iOS Safari | 공유 → **홈 화면에 추가** (Safari에서만 가능) |
| 데스크톱 Chrome/Edge | 주소창 오른쪽 설치 아이콘 |

## 4. 앱 수정 후 재배포할 때 ⚠️

서비스워커가 이전 버전을 캐시하므로 **버전을 올려야 사용자에게 반영**됩니다.

1. `sw.js` 의 `CACHE_VERSION` 값 변경 → 예: `'v20260806a'` → `'v20260810a'`
2. 수정한 파일의 `?v=` 쿼리를 `index.html`과 `sw.js`의 `PRECACHE_URLS`에서 **동일하게** 변경
3. 배포하면 사용자에게 *"새 버전이 준비되었습니다"* 토스트가 뜨고, 누르면 즉시 갱신됩니다

문제가 생기면 브라우저 콘솔에서 `tasklogClearCache()` 를 실행하면 캐시·서비스워커가 모두 초기화됩니다.

## 5. 캐시 정책 요약

| 대상 | 전략 |
|---|---|
| HTML(페이지 이동) | Network First → 실패 시 캐시 |
| 동일 출처 JS/CSS/이미지 | Stale While Revalidate |
| cdnjs (xlsx) | Cache First |
| Google 인증·Drive·Firestore | **캐시 안 함** (항상 네트워크) |

로그인 토큰과 실시간 동기화는 캐시되지 않으므로 인증 동작에 영향이 없습니다.

## 6. 모바일 UI 최적화 항목

- 노치·홈 인디케이터 안전영역 여백 (`viewport-fit=cover` + `env(safe-area-inset-*)`)
- iOS 주소창에 따른 높이 흔들림 보정 (`100dvh` + JS `--app-vh` 폴백)
- 터치 타깃 최소 44px (버튼·체크박스·탭)
- 더블탭 확대로 인한 300ms 지연 제거, 탭 하이라이트 제거
- 입력 시 iOS 자동 확대 방지 (상세 패널·에디터 입력 16px)
- 스크롤 전파 차단(`overscroll-behavior`), 설치 앱에서 당겨서 새로고침 방지
- 왼쪽 가장자리 스와이프로 사이드바 열기 / 왼쪽 스와이프로 닫기
- 480px 이하: 2열→1열, 시계·캘린더 축소, 캘린더 팝업 중앙 고정
- 오프라인/재연결 토스트 알림

## 7. Capacitor(APK)와의 관계

기존 `capacitor.config.json` · `copy-www.js` 설정은 그대로 유지됩니다.
`pwa.js`는 `capacitor:`/`file:` 프로토콜에서 서비스워커 등록을 건너뛰므로,
`npm run android` 로 APK를 빌드해도 충돌하지 않습니다.
(`copy-www.js`는 `.json`을 이미 복사 대상에 포함하므로 `manifest.json`도 자동으로 포함됩니다.)
