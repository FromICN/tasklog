// ============================================
//  🔐 구글 로그인/로그아웃 관리 (자동 로그인 포함)
// ============================================

const AUTH_STORAGE_KEY  = 'my-tasklog-user';
const AUTO_LOGIN_KEY    = 'tasklog-auto-login';   // '자동 로그인' ON 여부(로그아웃 전까지 유지)
const TOKEN_SESSION_KEY = 'tasklog-token';        // 이번 탭 세션 동안 토큰 보관(새로고침 후 재사용)

let tokenClient;
let gapiInited  = false;
let gisInited   = false;
let currentUser = null;
let _silentRetry = 0;       // 조용한 자동 로그인 재시도 횟수

// 구글 공식 4색 "G" 로고 (버튼 등에 재사용)
const GOOGLE_G_SVG = '<svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="display:block">'
  + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
  + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
  + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
  + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
  + '</svg>';
const GOOGLE_BTN_INNER = '<span class="g-icon" aria-hidden="true">' + GOOGLE_G_SVG + '</span> 구글로 로그인';

// auth.js 내부 전용 escapeHtml (script.js보다 먼저 로드되므로 독립 선언)
function _escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ============================================
//  🔥 Firebase 로그인 연동 (Firestore 실시간 동기화)
// --------------------------------------------
//  Google 로그인으로 받은 access_token을 그대로 Firebase Auth 자격증명으로
//  재사용합니다 (firebase-init.js 가 FIREBASE_CONFIG 로 초기화에 성공했을 때만 동작).
//  config.js 에 FIREBASE_CONFIG 를 채우지 않았다면 firebaseReady 가 false라
//  아무 일도 하지 않고 기존 Drive 백업만 동작합니다.
// ============================================
function _syncFirebaseAuth(accessToken) {
  if (typeof firebaseReady === 'undefined' || !firebaseReady || !window.firebase) return;
  var credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
  firebase.auth().signInWithCredential(credential).then(function (result) {
    console.log('🔥 Firebase 로그인 성공:', result.user.uid);
    if (typeof startFirestoreSync === 'function') startFirestoreSync(result.user.uid);
  }).catch(function (err) {
    console.error('🔥 Firebase 로그인 실패 — Firestore 동기화 없이 계속 진행:', err);
  });
}

// ============================================
//  🚀 라이브러리 초기화
// ============================================

function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey:         GOOGLE_CONFIG.API_KEY,
    discoveryDocs:  GOOGLE_CONFIG.DISCOVERY_DOCS,
  });
  gapiInited = true;
  console.log('✅ gapi 클라이언트 초기화 완료');
  maybeAutoSignIn();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.CLIENT_ID,
    scope:     GOOGLE_CONFIG.SCOPES,
    callback:  '',
  });
  gisInited = true;
  console.log('✅ GIS 라이브러리 초기화 완료');
  maybeAutoSignIn();
}

// ============================================
//  🔐 로그인 게이트(전체화면) 제어
// ============================================
function _hideLoginGate() {
  var g = document.getElementById('login-gate');
  if (g) g.classList.add('is-hidden');
}
function _showLoginGate() {
  document.documentElement.classList.remove('preauth-hide-gate');  // 미리숨김 해제
  var g = document.getElementById('login-gate');
  if (g) g.classList.remove('is-hidden');
  _resetGateButton();
}
function _setGateLoading() {
  var b = document.getElementById('gate-google-btn');
  if (b) { b.disabled = true; b.textContent = '로그인 확인 중...'; }
}
function _resetGateButton() {
  var b = document.getElementById('gate-google-btn');
  if (b) { b.disabled = false; b.innerHTML = GOOGLE_BTN_INNER; }
}
// '로그인 상태 유지(자동 로그인)' 설정 반영
//  ▸ 체크됨  → 자동 로그인 ON (로그아웃 전까지 계속 자동 로그인)
//  ▸ 해제됨  → 자동 로그인 OFF + 기억 정보 삭제(다음 방문 때 다시 로그인)
function _applyKeepLoginPref() {
  var keep = document.getElementById('keep-login');
  if (keep && keep.checked) {
    localStorage.setItem(AUTO_LOGIN_KEY, 'true');
  } else {
    localStorage.removeItem(AUTO_LOGIN_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

// ============================================
//  🎟️ 세션 토큰 보관/재사용 (새로고침 후 재로그인 팝업 방지)
// --------------------------------------------
//  로그인 시 받은 액세스 토큰을 이번 탭 세션 동안만 보관했다가,
//  드라이브 동기화로 새로고침된 직후 그대로 재사용한다.
//  → 새로고침 때마다 '조용한 재로그인'을 하지 않으므로 팝업 반복이 사라짐.
//  (sessionStorage는 같은 출처 전용 + 탭을 닫으면 삭제됨)
// ============================================
function _saveSessionToken(resp) {
  try {
    if (!resp || !resp.access_token) return;
    var ttlMs = (parseInt(resp.expires_in, 10) || 3600) * 1000;
    localStorage.setItem(TOKEN_SESSION_KEY, JSON.stringify({
      access_token: resp.access_token,
      expires_at: Date.now() + ttlMs - 60000   // 만료 1분 전까지만 유효 취급
    }));
    // gapi(드라이브·캘린더)도 이 토큰으로 인증되도록 설정
    if (window.gapi && gapi.client) gapi.client.setToken({ access_token: resp.access_token });
  } catch (e) { console.warn('세션 토큰 저장 실패:', e); }
}
function _getValidSessionToken() {
  try {
    var raw = localStorage.getItem(TOKEN_SESSION_KEY);
    if (!raw) return null;
    var t = JSON.parse(raw);
    if (!t || !t.access_token || Date.now() >= t.expires_at) return null;
    return t.access_token;
  } catch (e) { return null; }
}

// ============================================
//  🔥 Firebase 세션으로 버티기
// --------------------------------------------
//  Google 액세스 토큰(GIS 암묵적 플로우)은 1시간짜리이고 refresh token 이 없다.
//  반면 Firebase 세션은 자체 refresh token 으로 훨씬 오래 산다.
//  데이터 동기화에 필요한 건 Firebase uid 뿐이므로, 구글 토큰이 만료됐다고
//  앱을 잠글 이유가 없다. 드라이브·캘린더만 다음 로그인 때 되살아나면 된다.
//
//  ⚠️ 예전에는 토큰이 없으면 곧바로 로그인 화면을 띄웠다. 그래서 두 기기를 오갈 때
//     한 시간만 지나면 "다른 기기에서 로그인해서 로그아웃됐다"처럼 보였다.
// ============================================
var _needsGoogleReauth = false;

// Firebase 세션 복원은 비동기다 — 첫 통지를 한 번만 기다린다
function _firebaseUserOnce(timeoutMs) {
  return new Promise(function (resolve) {
    if (typeof firebaseReady === 'undefined' || !firebaseReady || !window.firebase) { resolve(null); return; }
    var done = false, unsub = null;
    function finish(u) {
      if (done) return;
      done = true;
      if (unsub) { try { unsub(); } catch (e) {} }
      resolve(u || null);
    }
    try {
      unsub = firebase.auth().onAuthStateChanged(function (u) { finish(u); }, function () { finish(null); });
    } catch (e) { finish(null); return; }
    setTimeout(function () {
      var cur = null;
      try { cur = firebase.auth().currentUser; } catch (e) {}
      finish(cur);
    }, timeoutMs || 4000);
  });
}

// 구글 토큰이 없을 때: Firebase 세션이 살아 있으면 앱으로 들여보내고, 아니면 로그인 화면.
async function _enterWithFirebaseSessionOrGate() {
  // 사용자가 직접 로그아웃했다면 세션이 남아 있어도 게이트를 띄운다
  if (localStorage.getItem(AUTO_LOGIN_KEY) !== 'true') { _showLoginGate(); return; }

  var u = await _firebaseUserOnce(4000);
  if (!u) { _showLoginGate(); return; }

  var saved = localStorage.getItem(AUTH_STORAGE_KEY);
  if (saved) { try { currentUser = JSON.parse(saved); } catch (e) {} }
  _needsGoogleReauth = true;
  if (typeof startFirestoreSync === 'function') {
    try { startFirestoreSync(u.uid); } catch (e) { console.warn('동기화 시작 실패:', e); }
  }
  updateAuthUI();
  _hideLoginGate();
  console.log('🔓 구글 토큰 만료 — Firebase 세션으로 계속 사용합니다 (드라이브·캘린더는 재연결 필요)');
}

// ============================================
//  🔄 자동 로그인 시도
// ============================================

function maybeAutoSignIn() {
  // 둘 다 준비됐을 때만 진행
  if (!gapiInited || !gisInited) return;

  // 0) 이번 탭 세션에 유효한 토큰이 남아 있으면 → 재로그인(팝업/조용한 요청) 없이 바로 사용.
  //    (드라이브 동기화로 새로고침된 직후가 여기에 해당 → 팝업 반복 차단)
  var sessToken = _getValidSessionToken();
  if (sessToken) {
    var saved0 = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved0) { try { currentUser = JSON.parse(saved0); } catch (e) {} }
    try { if (gapi.client) gapi.client.setToken({ access_token: sessToken }); } catch (e) {}
    // ⚠️ 이 줄이 빠져 있었다.
    //  handleSignIn() 과 _silentSignIn() 은 Firebase 로그인을 하는데
    //  이 '세션 토큰 재사용' 경로만 건너뛰고 있었다. 새로고침 때는 거의 항상
    //  이 경로를 타므로, 웹은 사실상 Firestore에 연결되지 않은 채
    //  localStorage + 드라이브 백업으로만 돌고 있었다.
    //  (설치형 앱은 Firestore를 보므로 서로 다른 데이터를 보여줬다)
    _syncFirebaseAuth(sessToken);
    _needsGoogleReauth = false;
    updateAuthUI();
    _hideLoginGate();
    console.log('🎟️ 세션 토큰 재사용 → 자동 로그인 (팝업 없음)');
    if (typeof autoSyncCalendar === 'function') autoSyncCalendar();
    if (typeof onSignInSync === 'function') onSignInSync();
    return;
  }

  // 자동 로그인 ON이면 → 로그아웃 전까지 계속 조용히 자동 로그인 시도
  const autoOn = localStorage.getItem(AUTO_LOGIN_KEY) === 'true';
  if (autoOn) {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      try { currentUser = JSON.parse(saved); updateAuthUI(); } catch (e) {}
    }
    _setGateLoading();             // 게이트는 '확인 중'으로 표시(팝업 없음)
    _silentSignIn();               // 백그라운드에서 토큰 조용히 갱신
    console.log('🔄 자동 로그인 시도 중...');
  } else {
    _showLoginGate();              // 자동 로그인 OFF → 로그인 화면 표시
  }
}

function _silentSignIn() {
  tokenClient.callback = async (response) => {
    if (response.error !== undefined) {
      // 조용한 갱신 실패 — ⚠️ 자동 로그인 설정/식별정보는 지우지 않는다.
      //  (지우면 다음부터 자동 로그인이 안 되므로. 로그아웃할 때만 해제됨)
      console.warn('🔒 자동 로그인(조용히) 실패:', response.error);
      if (_silentRetry < 1) {
        _silentRetry++;
        setTimeout(_silentSignIn, 1200);   // 잠깐 후 한 번 더 조용히 시도
        return;
      }
      // 그래도 실패(구글 세션 자체 만료 등) → Firebase 세션이 살아 있으면 앱은 계속 쓴다.
      // 설정은 보존하므로, '구글로 로그인'을 한 번 누르면 드라이브·캘린더도 되살아난다.
      _enterWithFirebaseSessionOrGate();
      return;
    }
    // 토큰 갱신 성공 → 프로필도 최신화
    _silentRetry = 0;
    _saveSessionToken(response);   // 토큰 보관(새로고침 후 재사용)
    await fetchUserInfo(response.access_token);
    _syncFirebaseAuth(response.access_token);
    updateAuthUI();
    _hideLoginGate();              // 로그인 확인됨 → 앱으로 진입
    console.log('✅ 자동 로그인 성공!');
    // 로그인 직후 구글 캘린더 자동 동기화 (1회)
    if (typeof autoSyncCalendar === 'function') autoSyncCalendar();
    // 로그인 직후 드라이브에서 먼저 불러오기 → 그 다음 자동 백업 ON
    if (typeof onSignInSync === 'function') onSignInSync();
  };

  // prompt: 'none' + login_hint → 계정 선택 팝업 없이 완전히 조용히 토큰 요청
  tokenClient.requestAccessToken({
    prompt: 'none',
    login_hint: (currentUser && currentUser.email) ? currentUser.email : ''
  });
}

function _showSignInButton() {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;
  authArea.innerHTML =
    '<button id="signin-btn" class="signin-btn" onclick="handleSignIn()">'
    + GOOGLE_BTN_INNER
    + '</button>';
}

// ============================================
//  🔑 수동 로그인 / 로그아웃
// ============================================

function handleSignIn() {
  console.log('🖱️ 로그인 버튼 클릭됨!');

  // 로그인 모듈(GIS)이 아직 준비 안 됐으면 잠시 후 재시도 안내
  if (!tokenClient) {
    alert('로그인 모듈을 불러오는 중이에요. 잠시 후 다시 시도해주세요.');
    return;
  }

  tokenClient.callback = async (response) => {
    if (response.error !== undefined) {
      console.error('로그인 실패:', response);
      alert('로그인에 실패했어요. 다시 시도해주세요.');
      _resetGateButton();
      return;
    }
    console.log('✅ 로그인 성공!');
    _saveSessionToken(response);   // 토큰 보관(새로고침 후 재사용 → 팝업 반복 방지)
    await fetchUserInfo(response.access_token);
    _syncFirebaseAuth(response.access_token);
    updateAuthUI();
    _applyKeepLoginPref();         // '로그인 상태 유지' 설정 반영
    _hideLoginGate();              // 로그인 완료 → 앱(home)으로 진입
    // 로그인 직후 구글 캘린더 자동 동기화 (1회)
    if (typeof autoSyncCalendar === 'function') autoSyncCalendar();
    // 로그인 직후 드라이브에서 먼저 불러오기 → 그 다음 자동 백업 ON
    if (typeof onSignInSync === 'function') onSignInSync();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

// 이 기기에서만 로그아웃한다.
//
// ⚠️ 예전에는 google.accounts.oauth2.revoke() 를 불렀다. 그런데 이 API 는 토큰 하나가
//    아니라 "사용자가 이 앱에 부여한 모든 스코프"를 취소한다 — 계정↔앱 단위라
//    기기를 가리지 않는다. 그래서 PC 웹에서 로그아웃하면 폰 앱의 토큰까지 죽어서
//    폰이 멋대로 로그아웃된 것처럼 보였다. (네이티브 native-auth.js 는 원래
//    로컬 로그아웃만 해서, 폰→웹 방향은 멀쩡한 비대칭 상태였다.)
//    계정 연결을 진짜로 끊고 싶으면 구글 계정 설정에서 하면 된다.
function handleSignOut() {
  const token = gapi.client.getToken();
  if (token !== null) {
    gapi.client.setToken('');
  }
  if (typeof stopFirestoreSync === 'function') stopFirestoreSync();
  if (window.firebase && firebase.auth && firebase.auth().currentUser) {
    firebase.auth().signOut().catch(function () {});
  }
  currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);   // 저장 정보 삭제
  localStorage.removeItem(AUTO_LOGIN_KEY);     // 자동 로그인 해제(명시적 로그아웃 시에만)
  localStorage.removeItem(TOKEN_SESSION_KEY);   // 보관한 토큰 삭제(영구 저장분)
  sessionStorage.removeItem(TOKEN_SESSION_KEY);// 이전 버전 호환 정리
  sessionStorage.removeItem('tasklog-synced'); // 다음 로그인 때 드라이브 재동기화
  _silentRetry = 0;
  updateAuthUI();
  _showLoginGate();                            // 로그아웃 → 로그인 화면으로
  console.log('👋 로그아웃 완료 — 자동 로그인 정보 삭제됨');
}

async function fetchUserInfo(accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (!response.ok) {
      console.warn('프로필 정보를 가져올 수 없어요.');
      currentUser = { name: '사용자', signedIn: true };
      return;
    }

    const data = await response.json();
    currentUser = {
      name:    data.name    || '사용자',
      email:   data.email   || '',
      picture: data.picture || ''
    };

    // ✅ localStorage에 사용자 정보 저장 (자동 로그인 핵심)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
    console.log('💾 사용자 정보 저장됨:', currentUser.name);

  } catch (error) {
    console.error('사용자 정보 가져오기 실패:', error);
    currentUser = { name: '사용자', signedIn: true };
  }
}

// ============================================
//  🎨 UI 업데이트
// ============================================

function updateAuthUI() {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  if (currentUser) {
    const avatar = currentUser.picture
      ? '<img src="' + currentUser.picture + '" alt="' + _escHtml(currentUser.name) + '" referrerpolicy="no-referrer">'
      : '<span class="avatar-fallback">👤</span>';

    authArea.innerHTML =
      '<div class="user-info">'
      + avatar
      + '<span class="user-name">' + _escHtml(currentUser.name) + '</span>'
      + '<button class="signout-btn" onclick="handleSignOut()">로그아웃</button>'
      + '</div>';
  } else {
    authArea.innerHTML =
      '<button id="signin-btn" class="signin-btn" onclick="handleSignIn()">'
      + GOOGLE_BTN_INNER
      + '</button>';
  }

  // 홈 위젯 사용자 영역 갱신 (홈 화면이 열려있을 때)
  if (typeof refreshHpUserArea === 'function') refreshHpUserArea();
}

// ============================================
//  👤 프로필 모달
// ============================================

const NICKNAME_KEY = 'my-tasklog-nickname';

function getDisplayName() {
  var nick = localStorage.getItem(NICKNAME_KEY);
  if (nick) return nick;
  return currentUser ? (currentUser.name || '사용자') : '게스트';
}

function openProfilePanel() {
  // 이미 열려있으면 닫기
  if (document.getElementById('profile-modal-overlay')) {
    closeProfilePanel();
    return;
  }

  var overlay = document.createElement('div');
  overlay.id = 'profile-modal-overlay';
  overlay.className = 'profile-modal-overlay';
  overlay.onclick = function(e) {
    if (e.target === overlay) closeProfilePanel();
  };

  var modal = document.createElement('div');
  modal.className = 'profile-modal';

  if (currentUser) {
    var avatarHtml = currentUser.picture
      ? '<img class="pm-avatar" src="' + currentUser.picture + '" alt="" referrerpolicy="no-referrer">'
      : '<div class="pm-avatar pm-avatar-fallback">' + _escHtml(getDisplayName().charAt(0).toUpperCase()) + '</div>';

    modal.innerHTML =
      '<div class="pm-header">'
      + '<span class="pm-title">내 계정</span>'
      + '<button class="pm-close" onclick="closeProfilePanel()">✕</button>'
      + '</div>'

      // 프로필 섹션
      + '<div class="pm-profile-section">'
      + avatarHtml
      + '<div class="pm-profile-info">'
      + '<div class="pm-display-name">' + _escHtml(getDisplayName()) + '</div>'
      + '<div class="pm-google-name">Google: ' + _escHtml(currentUser.name) + '</div>'
      + '<div class="pm-email">' + _escHtml(currentUser.email) + '</div>'
      + '</div>'
      + '</div>'

      // 닉네임 변경 섹션
      + '<div class="pm-section">'
      + '<div class="pm-section-label">표시 이름 (닉네임)</div>'
      + '<div class="pm-input-row">'
      + '<input type="text" id="pm-nickname-input" class="pm-input" value="' + _escHtml(getDisplayName()) + '" maxlength="30" placeholder="표시할 이름을 입력하세요">'
      + '<button class="pm-btn-save" onclick="saveNickname()">저장</button>'
      + '</div>'
      + '<div class="pm-input-hint">Google 계정 이름 대신 앱에서 사용할 이름이에요.</div>'
      + '</div>'

      // 계정 정보 섹션
      + '<div class="pm-section">'
      + '<div class="pm-section-label">연결된 계정</div>'
      + '<div class="pm-account-row">'
      + '<span class="g-icon" aria-hidden="true" style="margin-right:8px;display:inline-flex;width:16px;height:16px;">' + GOOGLE_G_SVG + '</span>'
      + '<span style="font-size:13px;color:var(--text-1);">Google 계정</span>'
      // 구글 토큰은 1시간이면 만료된다. 데이터 동기화는 Firebase 세션으로 계속되지만
      // 드라이브·캘린더는 토큰이 있어야 하므로, 상태를 솔직히 보여주고 재연결 길을 준다.
      + (_getValidSessionToken()
          ? '<span class="pm-badge-connected">연결됨</span>'
          : '<button class="pm-badge-connected" style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning-border);cursor:pointer;font-family:inherit;" onclick="handleSignIn();closeProfilePanel()">재연결</button>')
      + '</div>'
      + (_getValidSessionToken() ? ''
          : '<div class="pm-input-hint" style="margin-top:6px;">데이터 동기화는 정상입니다. 드라이브 백업·캘린더 불러오기만 재연결이 필요해요.</div>')
      + '</div>'

      // 로그아웃 버튼
      + '<div class="pm-footer">'
      + '<button class="pm-btn-signout" onclick="handleSignOut();closeProfilePanel()">🚪 로그아웃</button>'
      + '</div>';

  } else {
    modal.innerHTML =
      '<div class="pm-header">'
      + '<span class="pm-title">로그인</span>'
      + '<button class="pm-close" onclick="closeProfilePanel()">✕</button>'
      + '</div>'
      + '<div class="pm-guest-section">'
      + '<div class="pm-guest-icon">👤</div>'
      + '<div class="pm-guest-msg">로그인하면 Google 캘린더와<br>Drive를 연동할 수 있어요.</div>'
      + '<button class="pm-btn-signin" onclick="handleSignIn();closeProfilePanel()">'
      + GOOGLE_BTN_INNER
      + '</button>'
      + '</div>';
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 닉네임 입력창 Enter 키
  setTimeout(function() {
    var inp = document.getElementById('pm-nickname-input');
    if (inp) inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') saveNickname();
    });
  }, 50);
}

function closeProfilePanel() {
  var overlay = document.getElementById('profile-modal-overlay');
  if (overlay) overlay.remove();
  // 하위 호환: 구형 dropdown도 제거
  var dd = document.getElementById('profile-dropdown');
  if (dd) dd.remove();
}

function saveNickname() {
  var inp = document.getElementById('pm-nickname-input');
  if (!inp) return;
  var val = inp.value.trim();
  if (!val) { alert('이름을 입력해주세요.'); inp.focus(); return; }

  localStorage.setItem(NICKNAME_KEY, val);

  // 모달 내 표시 이름 즉시 갱신
  var nameEl = document.querySelector('.pm-display-name');
  if (nameEl) nameEl.textContent = val;

  // 사이드바 아바타 이니셜 갱신
  _syncAvatarInitial();

  // 홈 위젯 갱신
  if (typeof refreshHpUserArea === 'function') refreshHpUserArea();

  // 저장 완료 피드백
  var btn = document.querySelector('.pm-btn-save');
  if (btn) {
    btn.textContent = '✓ 저장됨';
    btn.style.background = 'var(--brand-primary)';
    setTimeout(function() {
      btn.textContent = '저장';
      btn.style.background = '';
    }, 1500);
  }
}

function _syncAvatarInitial() {
  var av = document.getElementById('sidebar-avatar');
  if (!av) return;
  if (currentUser && currentUser.picture) return; // 사진 있으면 변경 불필요
  av.textContent = getDisplayName().charAt(0).toUpperCase();
}

// updateAuthUI에서 사이드바 아바타도 동기화
var _origUpdateAuthUI = updateAuthUI;
updateAuthUI = function() {
  _origUpdateAuthUI();
  // 사이드바 아바타 이미지/이니셜 갱신
  var av = document.getElementById('sidebar-avatar');
  if (!av) return;
  if (currentUser && currentUser.picture) {
    av.innerHTML = '<img src="' + currentUser.picture + '" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
  } else if (currentUser) {
    av.textContent = getDisplayName().charAt(0).toUpperCase();
  } else {
    av.textContent = '?';
  }
};

// ============================================
//  🎬 시작!
// ============================================

window.addEventListener('load', () => {
  gapiLoaded();
  gisLoaded();
});
