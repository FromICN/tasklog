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

  // 브라우저 API 키 — 같은 프로젝트(tasklog-601bb)의 '웹' 키여야 한다.
  //  ⚠️ google-services.json 의 api_key 는 안드로이드용이라 패키지명+SHA-1로
  //     제한돼 있다. 브라우저에서 쓰면 디스커버리가 403 Forbidden 으로 막히고
  //     gapi.client.init 이 실패해 로그인 흐름 전체가 시작되지 않는다.
  //     아래 값은 Firebase 웹 앱 구성(FIREBASE_CONFIG.apiKey)과 같은 웹 키다.
  API_KEY: 'AIzaSyCsel2skjTQN7A8e2Z3FfUduSCITKEc1ss',
  
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





