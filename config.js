// ============================================
//  🔐 Firebase / Google API 설정
// ============================================

  // Your web app's Firebase configuration
  const firebaseConfig = {
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
  CLIENT_ID: '420758769250-jejahpe499ofc9q1nurh68ln45ph3p3m.apps.googleusercontent.com',

  API_KEY: 'AIzaSyBZDPLYXqAJzbqr9DmO9oyhV3V7X6Wzs3M',

  // 권한 (캘린더만 — drive.file 제거)
  SCOPES: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',

  // API 위치 (캘린더만)
  DISCOVERY_DOCS: [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
  ]
};
