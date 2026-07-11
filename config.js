// ============================================
//  🔐 Firebase / Google API 설정
// ============================================

// ⚠️ 변수 이름은 반드시 FIREBASE_CONFIG (대문자) — firebase-init.js가 이 이름을 찾습니다.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCsel2skjTQN7A8e2Z3FfUduSCITKEc1ss",
  authDomain: "tasklog-601bb.firebaseapp.com",
  projectId: "tasklog-601bb",
  storageBucket: "tasklog-601bb.firebasestorage.app",
  messagingSenderId: "1005717689565",
  appId: "1:1005717689565:web:e6c95bec2e0ea680b3b734"
};

// 구글 캘린더 연동 전용 설정 (Drive 백업은 Firestore로 대체되어 제거됨)
const GOOGLE_CONFIG = {
  // OAuth 클라이언트 ID (캘린더 토큰 조용한 갱신용 — 웹)
  CLIENT_ID: '1005717689565-0vlidkn3hv1v78eus52q3v0b8b25nle2.apps.googleusercontent.com',

  // Firebase 프로젝트의 API 키와 동일하게 통일
  API_KEY: 'AIzaSyCsel2skjTQN7A8e2Z3FfUduSCITKEc1ss',

  // 권한 (캘린더만 — drive.file 제거)
  SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',

  // API 위치 (캘린더만)
  DISCOVERY_DOCS: [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
  ]
};
