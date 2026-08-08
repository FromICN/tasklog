// ============================================
//  🔐 구글 API 설정
// ============================================

const GOOGLE_CONFIG = {
  // OAuth 클라이언트 ID
  CLIENT_ID: '420758769250-jejahpe499ofc9q1nurh68ln45ph3p3m.apps.googleusercontent.com',
  
  // ⚠️ 아래 'AIza...' 부분을 본인의 실제 API 키로 바꾸세요!
  API_KEY: 'AIzaSyBZDPLYXqAJzbqr9DmO9oyhV3V7X6Wzs3M',
  
  // 권한 (캘린더 + 드라이브)
 SCOPES: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file profile email', 

 // API 위치 (캘린더 + 드라이브)
  DISCOVERY_DOCS: [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  ]
};

// ============================================
//  🔥 Firebase 설정 (Firestore 실시간 동기화용)
// --------------------------------------------
//  Firebase Console(console.firebase.google.com) → 프로젝트 설정 →
//  '내 앱'의 firebaseConfig 값을 그대로 붙여넣으세요. (FIREBASE-SETUP.md 1단계)
// ============================================
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCsel2skjTQN7A8e2Z3FfUduSCITKEc1ss',
  authDomain: 'tasklog-601bb.firebaseapp.com',
  projectId: 'tasklog-601bb',
  storageBucket: 'tasklog-601bb.firebasestorage.app',
  messagingSenderId: '1005717689565',
  appId: '1:1005717689565:web:e6c95bec2e0ea680b3b734'
};





