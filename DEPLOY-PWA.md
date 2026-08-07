# TaskLog PWA 배포 안내 (2026-08-07 개정)

## 0. 이번에 바뀐 것 요약

| 영역 | 이전 | 이후 |
|---|---|---|
| 캐시 버전 관리 | `index.html`의 `?v=`, `sw.js`의 `PRECACHE_URLS`, `CACHE_VERSION`을 **손으로 3곳** 수정 | `node build-sw.js` 한 번 — 내용이 바뀐 파일만 골라 자동 갱신 |
| 배포 전 점검 | 없음 | `npm run check` — 어긋나면 실패 |
| 설치 UI | 아이콘만 | 스크린샷 4장(모바일 3 + 데스크톱 1) → Chrome 리치 설치 화면 |
| 바로가기 | 라벨이 실제 메뉴명과 불일치 | Board · Work Diary · Mandalart · WBS 로 정정 |
| iOS 실행화면 | 없음(흰 화면) | 기기별 스플래시 16종 |
| theme-color | 3곳이 서로 다른 값 | `#1a1a1a`(다크) / `#EEF1F5`(라이트) 로 통일 |
| APK 번들 | 1.8 MB (미사용 파일 포함) | 1.2 MB (index.html이 참조하는 파일만) |

---

## 1. 배포할 파일

`new/` 폴더의 파일을 저장소 루트(`index.html`이 있는 위치)에 덮어씁니다.

| 파일 | 상태 | 설명 |
|---|---|---|
| `index.html` | 덮어쓰기 | theme-color 미디어쿼리, iOS 스플래시 16종 링크 |
| `manifest.json` | 덮어쓰기 | 스크린샷·바로가기·`launch_handler` 추가 |
| `sw.js` | 덮어쓰기 | 빌드 표시(marker) + 오프라인 화면 개선 |
| `pwa.js` | 덮어쓰기 | theme-color 제어권 정리, 바로가기 처리 보강, **최초 설치 시 불필요한 새로고침 제거** |
| `build-sw.js` | 신규 | 캐시 버전 자동화 |
| `copy-www.js` | 덮어쓰기 | `index.html` 참조 기준으로만 번들 |
| `package.json` | 덮어쓰기 | 스크립트 정리 |
| `.gitignore` | 신규 | `www/`, `android/`, `node_modules/` 제외. 웹 업로드로는 안 올라가니 건너뛰어도 무방 |
| `build-hashes.json` | 신규 | ?v= 자동 갱신의 기준선 — **반드시 커밋할 것** |

> **점(.)으로 시작하는 파일은 GitHub 웹 업로더가 걸러냅니다.**
> 그래서 해시 파일 이름을 `.build-hashes.json` → `build-hashes.json` 으로 바꿨습니다.
> `.gitignore` 는 웹 업로드만 쓰는 동안에는 없어도 문제가 없습니다.
> 꼭 넣고 싶다면 GitHub에서 **Add file → Create new file** 로 이름과 내용을 직접 입력하면 됩니다.
| `screenshot-*.png` (4) | 신규 | 설치 화면용 |
| `splash/` (16) | 신규 | iOS 실행화면. **폴더째** 올릴 것 |

> `sw.js`와 `manifest.json`은 반드시 저장소 루트에 있어야 합니다.
> 하위 폴더에 두면 서비스워커 scope가 좁아져 앱 전체를 캐시하지 못합니다.

---

## 2. 앞으로의 작업 흐름 ⭐

파일을 고친 뒤에는 이것만 하면 됩니다.

```bash
node build-sw.js      # 또는  npm run build
```

출력 예시:

```
✅ 캐시 버전 갱신 완료
   CACHE_VERSION : v20260807a → v20260807b
   프리캐시 자원  : 34개
   ?v= 갱신 (2개)
      · journal.js  ?v=20260803a → ?v=20260807b
      · style.css   ?v=20260803a → ?v=20260807b
```

이 한 번으로 아래가 모두 맞춰집니다.

1. 내용이 바뀐 파일의 `index.html` 속 `?v=` (해시 비교로 판별 — 안 바뀐 파일은 건드리지 않음)
2. `sw.js`의 `PRECACHE_URLS` 전체
3. `sw.js`의 `CACHE_VERSION` (같은 날 재배포하면 `a → b → c`)
4. `pwa.js`의 `SW_URL`

그다음 **출력에 나온 파일 + `index.html` + `sw.js` + `pwa.js` + `build-hashes.json`** 을 커밋·푸시하고,
브라우저에서 `Ctrl+Shift+R` 로 확인합니다.

### 배포 직전 점검

```bash
npm run check
```

`sw.js`가 `index.html`과 어긋나 있거나, 내용이 바뀌었는데 `?v=`가 그대로인 파일이 있으면 실패합니다.

```
❌ 점검 실패 — `node build-sw.js` 를 실행하세요.
   · 내용이 바뀌었는데 ?v= 가 그대로입니다: todo.js (?v=20260803a)
```

### 기타 명령

| 명령 | 용도 |
|---|---|
| `npm run build:all` | 변경 여부와 무관하게 모든 `?v=` 를 새 버전으로 (캐시 전면 무효화) |
| `node build-sw.js --version=20260810b` | 버전 직접 지정 |
| `npm run build:www` | 점검 후 Capacitor용 `www/` 생성 |
| `npm run android` | `www/` 생성 → `cap sync` → Android Studio 열기 |

> ⚠️ `build-sw.js`를 저장소에 처음 올린 뒤 **첫 실행은 해시 기준선을 만드는 단계**라 `?v=`를 올리지 않습니다.
> 이때는 `npm run build:all` 을 한 번 돌려 기준을 맞춰두면 깔끔합니다.

---

## 3. 배포 후 확인

1. `https://fromicn.github.io/tasklog/` 접속 (HTTPS 필수)
2. Chrome DevTools → **Application**
   - Manifest: 오류 없음, **Screenshots 4장** 표시
   - Service Workers: `activated and is running`, 스크립트 URL의 `?v=`가 방금 올린 버전인지
   - Cache Storage: `tasklog-static-v2026…` 에 34개 항목
3. Lighthouse → **Installable** 통과

### iOS 스플래시 확인

Safari → 공유 → 홈 화면에 추가 → 아이콘 실행 시 **검은 배경에 로고**가 뜨면 정상입니다.
흰 화면이 뜬다면 그 기기 해상도용 이미지가 없는 것이니, `splash/` 에 해당 크기를 추가하고
`index.html`에 같은 형식으로 `<link rel="apple-touch-startup-image">` 한 줄을 더합니다.

---

## 4. 설치 방법

| 환경 | 방법 |
|---|---|
| Android Chrome | 우측 하단 **앱 설치** 버튼 또는 메뉴 → *앱 설치* |
| iOS Safari | 공유 → **홈 화면에 추가** (Safari에서만 가능) |
| 데스크톱 Chrome/Edge | 주소창 오른쪽 설치 아이콘 |

설치 후 아이콘을 길게 누르면 바로가기가 뜹니다 — **Board · Work Diary · Mandalart · WBS**.

문제가 생기면 브라우저 콘솔에서 `tasklogClearCache()` 를 실행하면 캐시·서비스워커가 모두 초기화됩니다.

---

## 5. 캐시 정책 요약

| 대상 | 전략 |
|---|---|
| HTML(페이지 이동) | Network First → 실패 시 캐시 → 그래도 없으면 오프라인 화면 |
| 동일 출처 JS/CSS/이미지 | Stale While Revalidate |
| cdnjs (xlsx) | Cache First |
| Google 인증·Drive·Firestore | **캐시 안 함** (항상 네트워크) |
| `splash/`, `screenshot-*` | 프리캐시 제외 (용량이 크고 최초 1회만 사용) |

로그인 토큰과 동기화는 캐시되지 않으므로 인증 동작에 영향이 없습니다.

---

## 6. 이번에 함께 고친 동작 버그

1. **최초 설치 시 불필요한 새로고침**
   서비스워커가 처음 설치될 때 `controllerchange` 로 페이지를 다시 로드하고 있었습니다.
   화면이 한 번 깜빡일 뿐 아니라, 바로가기(`?page=journal`)로 처음 들어오면
   새로고침 과정에서 목적지를 잃고 Home으로 떨어졌습니다.
   → 기존 워커가 있을 때(=진짜 업데이트)만 새로고침하도록 수정.

2. **theme-color 충돌**
   `index.html`의 `prefers-color-scheme` 메타(OS 테마)와 앱 자체 테마 토글이 서로 덮어썼습니다.
   → 최초 페인트는 미디어쿼리 메타가 담당하고, `pwa.js`가 제어권을 잡는 순간 그것들을 제거한 뒤
   하나만 관리하도록 정리.

3. **사이드바에 없는 화면은 바로가기로 열 수 없음**
   `?page=` 처리기가 `nav-<id>` 버튼의 존재를 요구해서 `calendar` 같은 화면은 조용히 무시됐습니다.
   → 렌더러 등록 여부(`MENU_RENDERERS`)로 판정하도록 변경. 15초 안에 못 열면 콘솔에 경고를 남깁니다.

---

## 7. 저장소 정리 제안 (선택)

`index.html`이 참조하지 않는 파일이 루트에 **약 454 KB** 남아 있고, 그대로 GitHub Pages에 배포되고 있습니다.
`npm run build:www` 를 돌리면 목록이 출력됩니다.

```
script.original.js (103 KB)   style.original.css (236 KB)   tlfilter.js (28 KB)
chk_auth.js (17 KB)           chk_sync.js (15 KB)           firestore-sync.js (15 KB)
backup-pg-board.js (12 KB)    backup-pg-mdt.js (10 KB)      backup-pg-wdlw.js (7 KB)
firebase-init.js (2 KB)       preview-*.html (9 KB)
```

여기에 `*.patch` 파일들(약 300 KB)과 `_bashprobe.txt` · `_w.txt` 도 함께 올라가 있습니다.

> ⚠️ **`firebase-init.js` · `firestore-sync.js` 는 지우기 전에 확인하세요.**
> `package.json`은 firebase 의존성을 갖고 있지만 `index.html`은 이 둘을 불러오지 않습니다.
> 즉 **현재 Firestore 동기화는 동작하지 않는 상태**이고, 데이터는 localStorage + Google Drive로만 유지됩니다.
> 실시간 동기화를 살릴 계획이라면 두 파일을 `index.html`에 추가해야 하고,
> 계획이 없다면 두 파일과 firebase 의존성을 함께 정리하는 편이 낫습니다.

`copy-www.js`는 이 파일들을 이미 APK 번들에서 제외하므로, 저장소 정리는 급하지 않습니다.

---

## 8. Capacitor(APK)와의 관계

- `pwa.js`는 `capacitor:`/`file:` 프로토콜에서 서비스워커 등록을 건너뜁니다.
- `copy-www.js`는 네이티브 번들에서 `sw.js`와 `splash/`를 제외합니다(iOS 실행화면은 네이티브가 담당).
- 웹 배포본과 동일한 `www/`가 필요하면 `npm run build:www:web` 을 쓰세요.

---

## 9. 스크린샷 교체 안내

`screenshot-*.png` 4장은 **와이어프레임을 렌더링한 임시 이미지**입니다.
설치 화면에 실제 앱 모습을 보여주려면 실제 화면을 캡처해 같은 파일명·같은 크기로 교체하세요.

| 파일 | 크기 | 촬영 화면 |
|---|---|---|
| `screenshot-home.png` | 390×844 | Home |
| `screenshot-board.png` | 390×844 | Board |
| `screenshot-workdiary.png` | 390×844 | Work Diary |
| `screenshot-wide.png` | 1280×800 | 데스크톱 Home |

크기가 `manifest.json`의 `sizes` 와 다르면 Chrome이 스크린샷을 통째로 무시하니,
크기를 바꾼다면 `manifest.json`도 함께 고쳐야 합니다.

---

## 10. 모바일 UI 최적화 항목 (기존 유지)

- 노치·홈 인디케이터 안전영역 여백 (`viewport-fit=cover` + `env(safe-area-inset-*)`)
- iOS 주소창에 따른 높이 흔들림 보정 (`100dvh` + JS `--app-vh` 폴백)
- 터치 타깃 최소 44px (버튼·체크박스·탭)
- 더블탭 확대로 인한 300ms 지연 제거, 탭 하이라이트 제거
- 입력 시 iOS 자동 확대 방지 (상세 패널·에디터 입력 16px)
- 스크롤 전파 차단(`overscroll-behavior`), 설치 앱에서 당겨서 새로고침 방지
- 왼쪽 가장자리 스와이프로 사이드바 열기 / 왼쪽 스와이프로 닫기
- 480px 이하: 2열→1열, 시계·캘린더 축소, 캘린더 팝업 중앙 고정
- 오프라인/재연결 토스트 알림
