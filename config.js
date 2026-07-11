// ============================================
//  🔐 Firebase / Google API 설정
// ============================================

// ⚠️ Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱(웹) 에서 복사해 붙여넣으세요.
//    (FIREBASE-SETUP.md 1단계 참고)
const FIREBASE_CONFIG = {
  apiKey:            '여기에-웹-API-키',
  authDomain:        '프로젝트ID.firebaseapp.com',
  projectId:         '프로젝트ID',
  storageBucket:     '프로젝트ID.appspot.com',
  messagingSenderId: '숫자',
  appId:             '1:숫자:web:영숫자',
};

// 구글 캘린더 연동 전용 설정 (Drive 백업은 Firestore로 대체되어 제거됨)
const GOOGLE_CONFIG = {
  // OAuth 클라이언트 ID (캘린더 토큰 조용한 갱신용 — 웹)
  CLIENT_ID: '420758769250-jejahpe499ofc9q1nurh68ln45ph3p3m.apps.googleusercontent.com',

  API_KEY: 'AIzaSyBZDPLYXqAJzbqr9DmO9oyhV3V7X6Wzs3M',

  // 권한 (캘린더만 — drive.file 제거)
  SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',

  // API 위치 (캘린더만)
  DISCOVERY_DOCS: [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
  ]
};
