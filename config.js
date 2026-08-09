// ============================================
//  🔐 구글 API 설정
// ============================================

const GOOGLE_CONFIG = {
  // OAuth 클라이언트 ID
  //  ⚠️ 반드시 아래 FIREBASE_CONFIG 와 '같은 프로젝트'의 클라이언트여야 한다.
  //     예전 값(420758769250-…)은 다른 프로젝트 소속이라, 그 토큰으로
  //     Firebase 로그인을 시도하면 서버가 거부했다:
  //       auth/invalid-credential — access_token audience is not for this project
  //     그 결과 웹은 Firestore에 접속하지 못한 채 localStorage 로만 돌았고,
  //     설치형 앱과 서로 다른 데이터를 보여줬다.
  //     이 값은 tasklog-601bb(=1005717689565)의 웹 클라이언트다.
  CLIENT_ID: '1005717689565-0vlidkn3hv1v78eus52q3v0b8b25nle2.apps.googleusercontent.com',

  // 브라우저 API 키 — 이것도 같은 프로젝트(tasklog-601bb) 것이어야
  // gapi 의 Drive/Calendar 디스커버리가 통과한다.
  API_KEY: 'AIzaSyB3c11ji4m_2Lsoh0U_MP95znsqvX9A5yY',
  
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





