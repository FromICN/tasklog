// ============================================
//  🔐 Firebase Auth 구글 로그인/로그아웃 관리
// --------------------------------------------
//  ▸ 웹: signInWithPopup / APK(Capacitor): @capacitor-firebase/authentication
//  ▸ 세션은 Firebase가 스스로 유지 → 예전 GIS '조용한 재로그인' 불필요
//  ▸ 구글 캘린더 API 호출용 액세스 토큰은 별도 관리 (ensureCalendarToken)
// ============================================

const AUTH_STORAGE_KEY = 'my-tasklog-user';       // 프로필 캐시(표시용)
const SIGNED_IN_FLAG   = 'tasklog-was-signed-in'; // 게이트 깜빡임 방지용
const CAL_TOKEN_KEY    = 'tasklog-cal-token';     // 캘린더 액세스 토큰(세션)

// 캘린더 스코프 (배열형 — 네이티브 플러그인용)
const CAL_SCOPES_ARR = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
];

let tokenClient  = null;   // GIS 토큰 클라이언트 (웹 캘린더 토큰 갱신용)
let gapiInited   = false;
let currentUser  = null;

// auth.js 내부 전용 escapeHtml (script.js보다 먼저 로드되므로 독립 선언)
function _escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ============================================
//  🚀 gapi(캘린더 REST) / GIS(웹 토큰 갱신) 초기화
// ============================================

function gapiLoaded() {
  if (!window.gapi) return;
  gapi.load('client', async function () {
    try {
      await gapi.client.init({
        apiKey:        GOOGLE_CONFIG.API_KEY,
        discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
      });
      gapiInited = true;
      console.log('✅ gapi(캘린더) 초기화 완료');
      // 이미 로그인돼 있고 유효한 캘린더 토큰이 있으면 자동 동기화 재시도
      var t = _getValidCalToken();
      if (t) {
        gapi.client.setToken({ access_token: t });
        if (firebaseReady && firebase.auth().currentUser && typeof autoSyncCalendar === 'function') autoSyncCalendar();
      }
    } catch (e) { console.warn('gapi 초기화 실패(캘린더 기능 제한):', e); }
  });
}

function gisLoaded() {
  // 웹 전용 — APK에서는 네이티브 플러그인으로 토큰을 받으므로 불필요
  if (!window.google || !google.accounts || !google.accounts.oauth2) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.CLIENT_ID,
    scope:     GOOGLE_CONFIG.SCOPES,
    callback:  '',
  });
  console.log('✅ GIS(캘린더 토큰 갱신) 초기화 완료');
}

// ============================================
//  🎟️ 캘린더 액세스 토큰 관리
// --------------------------------------------
//  Firebase Auth 는 캘린더 API용 토큰을 주지 않으므로,
//  로그인 시 받은 accessToken 을 보관하고 만료(1시간) 시 갱신한다.
//   ▸ 웹   : GIS prompt:'none' 으로 조용히 재발급
//   ▸ APK  : 플러그인 signInWithGoogle 재호출(이미 인증된 계정 → 조용히 발급)
// ============================================

function _saveCalToken(accessToken, expiresInSec) {
  try {
    if (!accessToken) return;
    var ttl = (parseInt(expiresInSec, 10) || 3500) * 1000;
    sessionStorage.setItem(CAL_TOKEN_KEY, JSON.stringify({
      access_token: accessToken,
      expires_at: Date.now() + ttl - 60000   // 만료 1분 전까지만 유효 취급
    }));
    if (window.gapi && gapi.client) gapi.client.setToken({ access_token: accessToken });
  } catch (e) { console.warn('캘린더 토큰 저장 실패:', e); }
}

function _getValidCalToken() {
  try {
    var raw = sessionStorage.getItem(CAL_TOKEN_KEY);
    if (!raw) return null;
    var t = JSON.parse(raw);
    if (!t || !t.access_token || Date.now() >= t.expires_at) return null;
    return t.access_token;
  } catch (e) { return null; }
}

// 캘린더 API 호출 전 반드시 호출 — 유효 토큰 보장 (true/false 반환)
//  interactive=true 면 사용자 클릭으로 시작된 흐름(팝업 허용)
async function ensureCalendarToken(interactive) {
  if (!gapiInited || !firebaseReady || !firebase.auth().currentUser) return false;

  var t = _getValidCalToken();
  if (t) { gapi.client.setToken({ access_token: t }); return true; }

  // ── APK(Capacitor): 플러그인으로 토큰 재발급 ──
  if (isNativeApp()) {
    try {
      var FA = Capacitor.Plugins.FirebaseAuthentication;
      var r = await FA.signInWithGoogle({ scopes: CAL_SCOPES_ARR });
      if (r && r.credential && r.credential.accessToken) {
        _saveCalToken(r.credential.accessToken, 3500);
        return true;
      }
    } catch (e) { console.warn('📅 네이티브 캘린더 토큰 발급 실패:', e); }
    return false;
  }

  // ── 웹: GIS로 조용히(또는 팝업으로) 재발급 ──
  if (!tokenClient) return false;
  return new Promise(function (resolve) {
    var user = firebase.auth().currentUser;
    var tried = false;
    tokenClient.callback = function (resp) {
      if (resp.error !== undefined) {
        // 조용한 발급 실패 → 사용자 클릭 흐름이면 한 번만 팝업으로 재시도
        if (interactive && !tried) {
          tried = true;
          tokenClient.requestAccessToken({ prompt: '', login_hint: (user && user.email) || '' });
          return;
        }
        console.warn('📅 캘린더 토큰 발급 실패:', resp.error);
        resolve(false);
        return;
      }
      _saveCalToken(resp.access_token, resp.expires_in);
      resolve(true);
    };
    tokenClient.requestAccessToken({ prompt: 'none', login_hint: (user && user.email) || '' });
  });
}

// ============================================
//  🔐 로그인 게이트(전체화면) 제어
// ============================================
function _hideLoginGate() {
  var g = document.getElementById('login-gate');
  if (g) g.classList.add('is-hidden');
}
function _showLoginGate() {
  document.documentElement.classList.remove('preauth-hide-gate');
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
  if (b) { b.disabled = false; b.innerHTML = '<span class="g-icon">G</span> 구글로 로그인'; }
}

// ============================================
//  🔑 로그인 / 로그아웃
// ============================================

async function handleSignIn() {
  console.log('🖱️ 로그인 버튼 클릭됨!');
  if (!firebaseReady) {
    alert('Firebase 설정이 완료되지 않았어요. config.js 를 확인해주세요.');
    return;
  }
  _setGateLoading();

  try {
    // '로그인 상태 유지' 체크 반영 (해제 시 탭 닫으면 로그아웃)
    var keep = document.getElementById('keep-login');
    var mode = (keep && !keep.checked)
      ? firebase.auth.Auth.Persistence.SESSION
      : firebase.auth.Auth.Persistence.LOCAL;
    await firebase.auth().setPersistence(mode);

    if (isNativeApp()) {
      // ── APK(Capacitor): 네이티브 구글 로그인 → 웹 레이어(Firebase JS)에 연결 ──
      var FA = Capacitor.Plugins.FirebaseAuthentication;
      var result = await FA.signInWithGoogle({ scopes: CAL_SCOPES_ARR });
      var cred = firebase.auth.GoogleAuthProvider.credential(
        result.credential.idToken,
        result.credential.accessToken || undefined
      );
      await firebase.auth().signInWithCredential(cred);
      if (result.credential.accessToken) _saveCalToken(result.credential.accessToken, 3500);
    } else {
      // ── 웹: 팝업 로그인 (캘린더 스코프 동시 요청) ──
      var provider = new firebase.auth.GoogleAuthProvider();
      CAL_SCOPES_ARR.forEach(function (s) { provider.addScope(s); });
      var res = await firebase.auth().signInWithPopup(provider);
      if (res.credential && res.credential.accessToken) {
        _saveCalToken(res.credential.accessToken, 3500);
      }
    }
    console.log('✅ 로그인 성공!');
    // 이후 처리는 onAuthStateChanged 에서 일괄 수행
  } catch (e) {
    console.error('로그인 실패:', e);
    if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      alert('로그인에 실패했어요. 다시 시도해주세요.\n(' + ((e && e.code) || e) + ')');
    }
    _resetGateButton();
  }
}

async function handleSignOut() {
  try {
    if (typeof stopFirestoreSync === 'function') stopFirestoreSync();
    if (firebaseReady) await firebase.auth().signOut();
    if (isNativeApp()) {
      try { await Capacitor.Plugins.FirebaseAuthentication.signOut(); } catch (e) {}
    }
  } catch (e) { console.warn('로그아웃 처리 중 경고:', e); }

  currentUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(SIGNED_IN_FLAG);
  sessionStorage.removeItem(CAL_TOKEN_KEY);
  if (window.gapi && gapi.client) try { gapi.client.setToken(''); } catch (e) {}
  updateAuthUI();
  _showLoginGate();
  console.log('👋 로그아웃 완료');
}

// ============================================
//  👀 로그인 상태 감시 (앱의 단일 진입점)
// ============================================

function _watchAuthState() {
  if (!firebaseReady) { _showLoginGate(); return; }

  firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
      currentUser = {
        name:    user.displayName || '사용자',
        email:   user.email       || '',
        picture: user.photoURL    || ''
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
      localStorage.setItem(SIGNED_IN_FLAG, '1');
      updateAuthUI();
      _hideLoginGate();
      console.log('🔑 로그인 상태:', currentUser.email);

      // 1) Firestore 실시간 동기화 시작 (마이그레이션 포함)
      if (typeof startFirestoreSync === 'function') startFirestoreSync(user.uid);

      // 2) 캘린더 토큰 확보 후 자동 동기화 (조용히 — 실패해도 앱 사용에 지장 없음)
      ensureCalendarToken(false).then(function (ok) {
        if (ok && typeof autoSyncCalendar === 'function') autoSyncCalendar();
      });
    } else {
      currentUser = null;
      localStorage.removeItem(SIGNED_IN_FLAG);
      if (typeof stopFirestoreSync === 'function') stopFirestoreSync();
      updateAuthUI();
      _showLoginGate();
    }
  });
}

// ============================================
//  🎨 UI 업데이트
// ============================================

function updateAuthUI() {
  const authArea = document.getElementById('auth-area');
  if (authArea) {
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
        + '<span class="g-icon">G</span> 구글로 로그인'
        + '</button>';
    }
  }

  // 사이드바 아바타 이미지/이니셜 갱신
  var av = document.getElementById('sidebar-avatar');
  if (av) {
    if (currentUser && currentUser.picture) {
      av.innerHTML = '<img src="' + currentUser.picture + '" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    } else if (currentUser) {
      av.textContent = getDisplayName().charAt(0).toUpperCase();
    } else {
      av.textContent = '?';
    }
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
      + '<span class="g-icon" style="font-size:14px;margin-right:8px;">G</span>'
      + '<span style="font-size:13px;color:var(--text-1);">Google 계정</span>'
      + '<span class="pm-badge-connected">연결됨</span>'
      + '</div>'
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
      + '<div class="pm-guest-msg">로그인하면 모든 기기에서<br>데이터가 실시간 동기화돼요.</div>'
      + '<button class="pm-btn-signin" onclick="handleSignIn();closeProfilePanel()">'
      + '<span class="g-icon">G</span> 구글로 로그인'
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

  // 사이드바 아바타·홈 위젯 갱신
  updateAuthUI();

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

// ============================================
//  🎬 시작!
// ============================================

window.addEventListener('load', function () {
  // 로그인 확인 동안 게이트는 '확인 중' 상태 (직전 로그인 기록이 있을 때)
  if (localStorage.getItem(SIGNED_IN_FLAG) === '1') {
    var saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) { try { currentUser = JSON.parse(saved); updateAuthUI(); } catch (e) {} }
    _setGateLoading();
  }
  gapiLoaded();
  gisLoaded();
  _watchAuthState();
});
