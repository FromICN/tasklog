# TaskLog — Firebase 전환 & APK 패키징 체크리스트

직접 해야 하는 작업은 ☐, 이미 코드에 반영된 것은 ✅ 로 표시했습니다. 순서대로 진행하세요.

---

## 1단계. Firebase 프로젝트 만들기 (웹)

- ☐ https://console.firebase.google.com → **프로젝트 추가** (예: `tasklog`)
- ☐ 프로젝트 개요 → **웹 앱 추가(`</>` 아이콘)** → 앱 닉네임 입력 → 등록
- ☐ 화면에 표시되는 `firebaseConfig` 값을 **`config.js` 의 `FIREBASE_CONFIG`** 에 그대로 붙여넣기
- ☐ **빌드 → Authentication → 시작하기 → 로그인 방법 → Google** 사용 설정 (지원 이메일 선택)
- ☐ Authentication → 설정 → **승인된 도메인**에 앱을 띄울 주소 확인 (`localhost` 는 기본 포함)

## 2단계. Firestore 만들기

- ☐ **빌드 → Firestore Database → 데이터베이스 만들기** → 프로덕션 모드 → 리전 `asia-northeast3(서울)` 권장
- ☐ **규칙 탭**에 프로젝트 폴더의 **`firestore.rules`** 내용을 붙여넣고 게시
  (본인 uid 데이터만 읽기/쓰기 허용)

## 3단계. 구글 캘린더 연동 유지 (선택 — 캘린더 기능을 쓸 경우)

- ☐ https://console.cloud.google.com 에서 **Firebase 프로젝트와 같은 이름의 GCP 프로젝트** 선택
- ☐ **API 및 서비스 → 라이브러리 → Google Calendar API** 사용 설정
- ☐ **API 및 서비스 → 사용자 인증 정보**:
  - Firebase가 자동 생성한 **웹 클라이언트 ID** 를 복사 → **`config.js` 의 `GOOGLE_CONFIG.CLIENT_ID`** 에 교체
  - 해당 웹 클라이언트의 **승인된 JavaScript 원본**에 앱 주소 추가 (예: `http://localhost:5500`)
  - **API 키** 하나 복사 → `GOOGLE_CONFIG.API_KEY` 에 교체
- 참고: 기존 키를 그대로 써도 되지만, 프로젝트가 둘로 갈라지므로 Firebase 프로젝트 하나로 합치는 것을 권장

## 4단계. 웹에서 동작 확인 + 데이터 마이그레이션

- ☐ 로컬 서버로 `index.html` 실행 (예: VS Code Live Server)
- ☐ 구글 로그인 → 콘솔(F12)에 `🚚 마이그레이션 완료` 확인
  - 기존에 쓰던 기기라면 **localStorage 의 데이터가 자동으로 Firestore에 업로드**됩니다 (일회성)
  - 다른 기기의 예전 Drive 백업만 있다면: **설정 → 백업 & 복원 → 파일로 복원**에 Drive 백업 `.json` 업로드 → 자동으로 Firestore 반영
- ☐ Firebase 콘솔 → Firestore 에서 `users/{내uid}/tasks`, `notes`, `logs`, `docs` 문서 생성 확인
- ☐ 브라우저 두 개로 로그인해 한쪽에서 Task 추가 → 다른 쪽 실시간 반영 확인

## 5단계. 안드로이드 앱 등록 (Firebase 콘솔)

- ☐ 프로젝트 개요 → **앱 추가 → Android**
  - 패키지 이름: **`com.fromicn.tasklog`** (`capacitor.config.json` 의 appId와 반드시 동일)
- ☐ **디버그 SHA-1 지문 등록** — PC 터미널에서:
  ```
  keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
  ```
  출력된 `SHA1:` 값을 콘솔에 등록 (⚠️ SHA-1 없으면 APK에서 구글 로그인 실패)
  - 나중에 릴리즈 키로 서명하면 **릴리즈 SHA-1도 추가 등록**
- ☐ **`google-services.json` 다운로드** → 나중에 `android/app/` 폴더에 배치 (6단계에서)

## 6단계. Capacitor 프로젝트 설정 (PC 터미널)

프로젝트 폴더에서 순서대로:

```
npm install                 # ☐ 의존성 설치 (Capacitor + Firebase Auth 플러그인)
npm run build:www           # ☐ 웹 파일을 www/ 로 복사
npx cap add android         # ☐ android/ 네이티브 프로젝트 생성
```

- ☐ 5단계에서 받은 **`google-services.json` 을 `android/app/`** 에 복사
- ☐ `android/build.gradle` 의 `buildscript > dependencies` 에 추가:
  ```gradle
  classpath 'com.google.gms:google-services:4.4.2'
  ```
- ☐ `android/app/build.gradle` 맨 아래에 추가:
  ```gradle
  apply plugin: 'com.google.gms.google-services'
  ```
- ☐ 동기화 후 열기:
  ```
  npx cap sync android
  npx cap open android      # Android Studio 실행 → Run 또는 Build > Build APK
  ```

이후 웹 코드를 수정할 때마다: `npm run build:www && npx cap sync android`

## 7단계. APK 오프라인 시작 보장 (선택 권장)

CDN 스크립트(firebase compat 3개, xlsx)는 첫 실행 시 네트워크가 필요합니다.
완전 오프라인 시작을 원하면:

- ☐ 아래 4개 파일을 받아 프로젝트 폴더에 저장:
  - `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js` (https://www.gstatic.com/firebasejs/10.14.1/…)
  - `xlsx.full.min.js`
- ☐ `index.html` 의 해당 `<script src="https://…">` 를 로컬 파일 경로로 교체

(gapi / GIS 스크립트는 캘린더 연동 = 온라인 기능이므로 CDN 유지)

---

## 동작 구조 요약

| 구분 | 이전 (Drive) | 현재 (Firebase) |
|---|---|---|
| 로그인 | GIS 토큰 (1시간 만료, 조용한 재발급) | Firebase Auth — 세션 자동 유지 |
| 저장 | JSON 파일 통째 업로드 (일자별) | 항목 단위 문서 실시간 push (`users/{uid}/tasks/{id}` 등) |
| 기기 간 반영 | 로그인 시 1회 + 새로고침 | `onSnapshot` 실시간 (열려 있는 화면 즉시 갱신) |
| 오프라인 | 불가(백업 실패) | Firestore persistence — 오프라인 편집 후 자동 재전송 |
| 충돌 | 파일 덮어쓰기 (유실 위험) | 항목 단위 병합 (다른 항목은 서로 안 건드림) |

- 데이터 경로: `users/{uid}/tasks/{taskId}`, `users/{uid}/notes/{noteId}`, `users/{uid}/logs/{logId}`(주간 저널), `users/{uid}/docs/{name}`(만다라트·라이프휠·MVV·설정 등)
- 마이그레이션은 계정당 1회 (`users/{uid}/docs/_meta` 로 기록). 로컬 데이터가 있는 기기에서 첫 로그인하면 자동 업로드됩니다.
- 예전 Drive 백업 파일(.json)은 언제든 **설정 → 파일로 복원**으로 가져올 수 있습니다.
