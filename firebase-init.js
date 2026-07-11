// ============================================
//  🔥 Firebase 초기화 (compat SDK)
// --------------------------------------------
//  ▸ index.html 에서 firebase-app/auth/firestore-compat 로드 후 실행됩니다.
//  ▸ Firestore 오프라인 persistence 를 켜서, 네트워크 없이도
//    읽기/쓰기가 동작하고 온라인 복귀 시 자동 반영됩니다.
// ============================================

var db = null;            // Firestore 인스턴스 (전역)
var firebaseReady = false;

// Capacitor 네이티브(APK) 환경인지 판별
function isNativeApp() {
  return !!(window.Capacitor
    && typeof Capacitor.isNativePlatform === 'function'
    && Capacitor.isNativePlatform());
}

(function initFirebase() {
  if (!window.firebase || !firebase.initializeApp) {
    console.error('🔥 Firebase SDK가 로드되지 않았습니다. index.html 스크립트를 확인하세요.');
    return;
  }
  if (!window.FIREBASE_CONFIG || String(FIREBASE_CONFIG.apiKey).indexOf('여기에') === 0) {
    console.error('🔥 config.js 의 FIREBASE_CONFIG 를 채워주세요. (FIREBASE-SETUP.md 1단계)');
    alert('Firebase 설정이 비어 있습니다.\nconfig.js 의 FIREBASE_CONFIG 를 채운 뒤 새로고침하세요.\n(FIREBASE-SETUP.md 참고)');
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();

  // 오프라인 persistence (여러 탭 동시 사용 지원)
  db.enablePersistence({ synchronizeTabs: true }).then(function () {
    console.log('💾 Firestore 오프라인 persistence 활성화');
  }).catch(function (err) {
    // failed-precondition: 다른 탭이 이미 소유 / unimplemented: 브라우저 미지원 — 앱은 정상 동작
    console.warn('💾 오프라인 persistence 비활성화:', err && err.code);
  });

  firebaseReady = true;
  console.log('🔥 Firebase 초기화 완료');
})();
