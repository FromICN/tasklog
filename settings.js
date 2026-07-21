// ============================================
//  settings.js  -- 4-tab settings modal
// ============================================

var settingsState = {
  tab: 'general',
  darkMode: false,
  lang: 'ko',
  weekStart: 'mon',
  notifDeadline: true,
  notifJournal: true,
  fontSize: 'medium',
  calSync: false,
  calProvider: 'google',
  calDirection: 'one',
  calItems: 'deadline',
  syncStatus: null,
};

function initTheme() {
  var saved = localStorage.getItem('app-theme') || 'light';
  settingsState.darkMode = (saved === 'dark');
  applyThemeClass(saved);
  updateDarkModeBtn();
}

function initSettings() {
  var lang      = localStorage.getItem('app-lang');
  var weekStart = localStorage.getItem('app-week-start');
  var notifD    = localStorage.getItem('app-notif-deadline');
  var notifJ    = localStorage.getItem('app-notif-journal');
  var fontSize  = localStorage.getItem('app-font-size');
  var calSync   = localStorage.getItem('app-cal-sync');
  var calProv   = localStorage.getItem('app-cal-provider');
  var calDir    = localStorage.getItem('app-cal-direction');
  var calItems  = localStorage.getItem('app-cal-items');
  if (lang)      settingsState.lang      = lang;
  if (weekStart) settingsState.weekStart = weekStart;
  if (notifD  !== null) settingsState.notifDeadline = notifD  !== '0';
  if (notifJ  !== null) settingsState.notifJournal  = notifJ  !== '0';
  if (fontSize) { settingsState.fontSize = fontSize; applyFontSize(fontSize); }
  if (calSync !== null) settingsState.calSync = (calSync === '1');
  if (calProv) settingsState.calProvider = calProv;
  if (calDir)   settingsState.calDirection = calDir;
  if (calItems) settingsState.calItems = calItems;
}

// 스타일시트 안의 px 글자 크기 원본을 한 번만 캐시해 둠 (배율 계산 기준)
var _fontSizeRules = null;

// 그룹 규칙(@media 등) 안까지 재귀하며 font-size:px 규칙을 모음
function _collectFontRules(rules, out) {
  if (!rules) return;
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (rule.style && rule.style.fontSize && rule.style.fontSize.indexOf('px') >= 0) {
      out.push({ style: rule.style, base: parseFloat(rule.style.fontSize) });
    }
    if (rule.cssRules) _collectFontRules(rule.cssRules, out);   // @media 등 중첩
  }
}

// 글자 크기만 배율 적용 (레이아웃·여백은 그대로). CSS 가 px 단위라 스타일시트 규칙의
// font-size 값에 직접 배율을 곱한다. 인라인 style 의 font-size 몇 곳은 대상이 아님.
// 디자인 토큰 기준값 (style.css :root의 --fs-* 와 반드시 일치해야 함)
var FS_TOKEN_BASE = {
  '--fs-3xs': 9,  '--fs-2xs': 10, '--fs-xs': 11, '--fs-sm': 12,
  '--fs-base': 13, '--fs-md': 14, '--fs-lg': 15, '--fs-xl': 16,
  '--fs-2xl': 18, '--fs-3xl': 20, '--fs-4xl': 22
};

function applyFontSize(val) {
  if (document.body) document.body.style.zoom = '';   // 이전 zoom 방식 잔재 제거
  var scale = val === 'small' ? 0.9 : val === 'large' ? 1.15 : 1;
  // 1) 디자인 토큰 배율 — font-size 대부분이 var(--fs-*)를 사용하므로 여기서 일괄 조정
  Object.keys(FS_TOKEN_BASE).forEach(function (k) {
    document.documentElement.style.setProperty(k, (Math.round(FS_TOKEN_BASE[k] * scale * 10) / 10) + 'px');
  });
  // 2) 토큰 미사용 px 규칙(디스플레이 크기 등 소수) — 기존 CSSOM 방식 유지
  if (!_fontSizeRules) {
    _fontSizeRules = [];
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules;
      try { rules = document.styleSheets[s].cssRules; }   // 외부(CDN) 시트는 보안상 접근 불가 → 건너뜀
      catch (e) { continue; }
      _collectFontRules(rules, _fontSizeRules);
    }
  }
  _fontSizeRules.forEach(function (o) { o.style.fontSize = (Math.round(o.base * scale * 100) / 100) + 'px'; });
}

function applyThemeClass(mode) {
  if (mode === 'light') document.body.classList.add('light-mode');
  else document.body.classList.remove('light-mode');
}

function toggleDarkMode() {
  settingsState.darkMode = !settingsState.darkMode;
  var mode = settingsState.darkMode ? 'dark' : 'light';
  localStorage.setItem('app-theme', mode);
  applyThemeClass(mode);
  updateDarkModeBtn();
}

function updateDarkModeBtn() {
  var btn = document.getElementById('dark-toggle-btn'); // (구 탑바 버튼 — 있으면 갱신)
  if (btn) btn.textContent = settingsState.darkMode ? '☀️' : '🌙';
  var sw = document.getElementById('theme-switch');     // 사이드바 하단 스위치
  if (sw) sw.classList.toggle('on', settingsState.darkMode);
}

// ── open / close ──────────────────────────
function openSettings() {
  if (document.getElementById('settings-overlay')) return;
  var overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.id = 'settings-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeSettings(); };
  overlay.innerHTML = buildSettingsModal();
  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('open'); });
  setSettingsTab(settingsState.tab || 'general');
}

function closeSettings() {
  var overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.remove();
}

function buildSettingsModal() {
  return '<div class="settings-modal" onclick="event.stopPropagation()">'
    + '<div class="settings-modal-header">'
    + '<span class="settings-modal-title">⚙️ Setting</span>'
    + '<button class="settings-close" onclick="closeSettings()">✕</button>'
    + '</div>'
    + '<div class="settings-body">'
    + '<div class="settings-tabs" id="settings-tabs">'
    + buildSettingsTabBtn('general',  '일반')
    + buildSettingsTabBtn('display',  '화면')
    + buildSettingsTabBtn('calendar', '캘린더 동기화')
    + buildSettingsTabBtn('backup',   '백업 & 복원')
    + '</div>'
    + '<div class="settings-content" id="settings-content"></div>'
    + '</div>'
    + '<div class="settings-modal-footer">'
    + '<button class="btn-secondary" onclick="closeSettings()">닫기</button>'
    + '<button class="btn-primary" onclick="saveSettingsAndClose()">저장</button>'
    + '</div>'
    + '</div>';
}

function buildSettingsTabBtn(id, label) {
  return '<button class="settings-tab" id="stab-' + id + '" onclick="setSettingsTab(\'' + id + '\')">' + label + '</button>';
}

function setSettingsTab(tabId) {
  settingsState.tab = tabId;
  ['general','display','calendar','backup'].forEach(function(t) {
    var el = document.getElementById('stab-' + t);
    if (el) el.classList.toggle('active', t === tabId);
  });
  var content = document.getElementById('settings-content');
  if (!content) return;
  if (tabId === 'general')  content.innerHTML = buildTabGeneral();
  if (tabId === 'display')  content.innerHTML = buildTabDisplay();
  if (tabId === 'calendar') content.innerHTML = buildTabCalendar();
  if (tabId === 'backup')   content.innerHTML = buildTabBackup();
}

// ── General tab ───────────────────────────
function buildTabGeneral() {
  var signedIn = typeof isSignedIn === 'function' && isSignedIn();
  var user = null;
  try { user = JSON.parse(localStorage.getItem('my-tasklog-user') || 'null'); } catch(e) {}

  var authHtml = (signedIn && user)
    ? '<div class="settings-row">'
      + '<div class="user-info">'
      + '<div class="user-avatar">'
      + (user.picture ? '<img src="' + user.picture + '" referrerpolicy="no-referrer" alt="">' : '<div class="user-avatar-fallback">👤</div>')
      + '</div>'
      + '<div><div class="user-name">' + sEsc(user.name || '') + '</div><div class="user-email">' + sEsc(user.email || '') + '</div></div>'
      + '</div>'
      + '<button class="btn-secondary" style="font-size:12px;" onclick="if(typeof handleSignOut===\'function\')handleSignOut();closeSettings();">로그아웃</button>'
      + '</div>'
    : '<div class="settings-row">'
      + '<div><div class="settings-row-label">사용자 이름</div></div>'
      + '<input class="settings-input" id="settings-username" value="Mia">'
      + '</div>'
      + '<div class="settings-row" style="border-bottom:none;">'
      + '<div><div class="settings-row-label">Google 로그인</div><div class="settings-row-desc">Drive 백업, 캘린더 동기화에 필요합니다</div></div>'
      + '<button class="signin-btn" id="settings-signin-btn" style="width:auto;padding:7px 14px;" onclick="if(typeof handleSignIn===\'function\')handleSignIn()"><span class="g-icon">G</span> 로그인</button>'
      + '</div>';

  return '<div class="settings-section-head" style="margin-top:8px;">지역</div>'
    + '<div class="settings-row">'
    + '<div><div class="settings-row-label">주 시작 요일</div><div class="settings-row-desc">캘린더 첫 번째 열 기준</div></div>'
    + '<select class="settings-select" onchange="settingsSetWeekStart(this.value)">'
    + '<option value="mon"' + (settingsState.weekStart === 'mon' ? ' selected' : '') + '>월요일</option>'
    + '<option value="sun"' + (settingsState.weekStart === 'sun' ? ' selected' : '') + '>일요일</option>'
    + '</select>'
    + '</div>'
    + '<div class="settings-section-head">알림</div>'
    + '<div class="settings-row">'
    + '<div><div class="settings-row-label">마감 임박 알림</div><div class="settings-row-desc">Task 마감 D-3일부터 표시</div></div>'
    + buildToggle('settings-notif-deadline', settingsState.notifDeadline, "settingsToggleKey('notifDeadline','settings-notif-deadline')")
    + '</div>'
    + '<div class="settings-row">'
    + '<div><div class="settings-row-label">주간일지 작성 알림</div><div class="settings-row-desc">매주 목요일부터 일요일까지</div></div>'
    + buildToggle('settings-notif-journal', settingsState.notifJournal, "settingsToggleKey('notifJournal','settings-notif-journal')")
    + '</div>'
    + '<div class="settings-section-head">계정</div>'
    + authHtml;
}

// ── Display tab ───────────────────────────
function buildTabDisplay() {
  var isDark = settingsState.darkMode;
  return '<div class="settings-section-head" style="margin-top:8px;">테마</div>'
    + '<div style="background:var(--set-sec);border-radius:10px;padding:16px;border:1px solid var(--border);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">'
    + '<div style="display:flex;align-items:center;gap:12px;">'
    + '<span style="font-size:22px;">' + (isDark ? '🌙' : '☀️') + '</span>'
    + '<div><div class="settings-row-label">다크 모드</div>'
    + '<div class="settings-row-desc">' + (isDark ? '현재 다크 모드가 활성화되어 있습니다' : '현재 라이트 모드가 활성화되어 있습니다') + '</div>'
    + '</div></div>'
    + buildToggle('settings-darkmode-toggle', isDark, 'settingsToggleDark()')
    + '</div>'
    + '<div class="theme-previews">'
    + buildThemePreview('라이트', '☀️', false, isDark)
    + buildThemePreview('다크', '🌙', true, isDark)
    + '</div>'
    + '<div class="settings-section-head">텍스트 크기</div>'
    + '<div class="font-size-group">'
    + buildFontSizeBtn('small', '작게')
    + buildFontSizeBtn('medium', '보통')
    + buildFontSizeBtn('large', '크게')
    + '</div>';
}

function buildThemePreview(label, icon, dark, isDark) {
  var bg  = dark ? '#161920' : '#F5F6F8';
  var sbg = dark ? '#1E2129' : '#fff';
  var brd = dark ? '#2A2D38' : '#E8EAED';
  var sel = (dark === isDark);
  return '<div class="theme-preview-card' + (sel ? ' selected' : '') + '" onclick="settingsSetTheme(' + dark + ')">'
    + '<div class="theme-preview-top" style="background:' + bg + ';">'
    + '<div style="width:10px;height:28px;border-radius:3px;background:' + sbg + ';border:1px solid ' + brd + ';"></div>'
    + '<div style="flex:1;height:20px;border-radius:3px;background:' + sbg + ';border:1px solid ' + brd + ';"></div>'
    + '</div>'
    + '<div class="theme-preview-bottom" style="background:' + sbg + ';">'
    + '<span style="font-size:12px;">' + icon + '</span>'
    + '<span style="font-size:12px;font-weight:' + (sel ? 700 : 400) + ';color:var(--text-1);">' + label + '</span>'
    + (sel ? '<span class="theme-preview-check">✓ 선택됨</span>' : '')
    + '</div>'
    + '</div>';
}

function buildFontSizeBtn(val, label) {
  var active = settingsState.fontSize === val;
  var sz = val === 'small' ? 11 : val === 'large' ? 15 : 13;
  return '<button class="font-size-btn' + (active ? ' active' : '') + '" style="font-size:' + sz + 'px;" onclick="settingsSetFontSize(\'' + val + '\')">' + label + '</button>';
}

// ── Calendar tab ──────────────────────────
function buildTabCalendar() {
  var calSync = settingsState.calSync;
  var signedIn = typeof isSignedIn === 'function' && isSignedIn();
  var syncBtnText = settingsState.syncStatus === 'syncing' ? '⏳ 동기화 중...'
    : settingsState.syncStatus === 'done' ? '✓ 동기화 완료' : '🔄 지금 동기화';

  var allItems = settingsState.calItems === 'all';

  var subHtml = !calSync ? '' :
    '<div class="settings-row">'
    + '<div><div class="settings-row-label">동기화 항목</div><div class="settings-row-desc">캘린더에 표시할 항목</div></div>'
    + '<select class="settings-select" onchange="settingsSetCalItems(this.value)">'
    + '<option value="deadline"' + (allItems ? '' : ' selected') + '>Task 마감일만</option>'
    + '<option value="all"' + (allItems ? ' selected' : '') + '>Task + To-Do 전체</option>'
    + '</select>'
    + '</div>'
    // 사용자 계정의 구글 캘린더 목록 + 캘린더별 동기화 방향
    + '<div class="settings-section-head">구글 캘린더 목록 · 캘린더별 동기화 방향</div>'
    + '<div id="settings-cal-list">'
    + (signedIn
        ? '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">캘린더 목록을 불러오는 중...</div>'
        : '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">⚠️ Google 로그인 후 캘린더 목록을 확인할 수 있습니다.</div>')
    + '</div>'
    // Task / To Do 연동 캘린더 지정
    + '<div class="settings-section-head">Task · To Do 연동 캘린더</div>'
    + '<div id="settings-cal-target">'
    + (signedIn
        ? '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">캘린더 목록을 불러오는 중...</div>'
        : '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">⚠️ Google 로그인 후 설정할 수 있습니다.</div>')
    + '</div>';

  // 목록 비동기 로드
  if (calSync && signedIn) setTimeout(settingsLoadCalendarList, 0);

  return '<div class="settings-row" style="margin-top:8px;">'
    + '<div><div class="settings-row-label">캘린더 동기화 사용</div><div class="settings-row-desc">TaskLog 일정을 구글 캘린더와 동기화합니다</div></div>'
    + buildToggle('settings-calsync', calSync, 'settingsToggleCalSync()')
    + '</div>'
    + subHtml
    + '<div style="margin-top:20px;">'
    + '<button onclick="settingsDoSync()" ' + (calSync ? '' : 'disabled') + ' style="width:100%;height:40px;border-radius:8px;border:none;cursor:' + (calSync ? 'pointer' : 'not-allowed') + ';background:' + (calSync ? 'var(--brand-primary)' : 'var(--border)') + ';color:' + (calSync ? '#fff' : 'var(--text-3)') + ';font-size:13px;font-weight:700;font-family:inherit;">'
    + syncBtnText + '</button>'
    + (!calSync ? '<div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px;">동기화를 사용하려면 위 토글을 켜주세요</div>' : '')
    + '</div>';
}

// 사용자 계정의 구글 캘린더 목록 비동기 로드 → 목록/연동 대상 UI 렌더
var _settingsCalCache = null;

function settingsLoadCalendarList() {
  if (typeof listUserCalendars !== 'function') return;
  listUserCalendars().then(function(cals) {
    _settingsCalCache = cals;
    settingsRenderCalList(cals);
    settingsRenderCalTargets(cals);
  });
}

function settingsRenderCalList(cals) {
  var box = document.getElementById('settings-cal-list');
  if (!box) return;
  if (!cals || !cals.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">캘린더 목록을 불러오지 못했습니다.</div>';
    return;
  }
  var dirFor = (typeof calDirFor === 'function') ? calDirFor : function(){ return 'pull'; };
  box.innerHTML = cals.map(function(c) {
    var dir = dirFor(c.id);
    var idEnc = encodeURIComponent(c.id);
    return '<div class="settings-row settings-cal-row">'
      + '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
      + '<span class="settings-cal-dot" style="background:' + (c.color || 'var(--text-3)') + ';"></span>'
      + '<span class="settings-cal-name">' + sEsc(c.name) + (c.primary ? ' <span style="font-size:10px;color:var(--text-3);">(기본)</span>' : '') + '</span>'
      + '</div>'
      + '<select class="settings-select" data-calid="' + idEnc + '" onchange="settingsSetPerCalDir(decodeURIComponent(this.dataset.calid), this.value)">'
      + '<option value="off"'  + (dir === 'off'  ? ' selected' : '') + '>동기화 안 함</option>'
      + '<option value="pull"' + (dir === 'pull' ? ' selected' : '') + '>가져오기 (구글 → TaskLog)</option>'
      + '<option value="two"'  + (dir === 'two'  ? ' selected' : '') + '>양방향</option>'
      + '</select>'
      + '</div>';
  }).join('');
}

function settingsRenderCalTargets(cals) {
  var box = document.getElementById('settings-cal-target');
  if (!box) return;
  if (!cals || !cals.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">캘린더 목록을 불러오지 못했습니다.</div>';
    return;
  }
  var getT = (typeof getCalTarget === 'function') ? getCalTarget : function(){ return ''; };
  function targetRow(kind, label, desc) {
    var cur = getT(kind);
    var opts = '<option value=""' + (cur ? '' : ' selected') + '>기본 (TaskLog 캘린더)</option>'
      + cals.map(function(c) {
          return '<option value="' + encodeURIComponent(c.id) + '"' + (cur === c.id ? ' selected' : '') + '>' + sEsc(c.name) + '</option>';
        }).join('');
    return '<div class="settings-row">'
      + '<div><div class="settings-row-label">' + label + '</div><div class="settings-row-desc">' + desc + '</div></div>'
      + '<select class="settings-select" onchange="settingsSetCalTargetSel(\'' + kind + '\', this.value)">' + opts + '</select>'
      + '</div>';
  }
  box.innerHTML = targetRow('task', 'Task 연동 캘린더', 'TaskLog의 Task를 등록할 캘린더')
    + targetRow('todo', 'To Do 연동 캘린더', 'TaskLog의 To Do를 등록할 캘린더');
}

function settingsSetPerCalDir(calId, dir) {
  if (typeof setCalDirection === 'function') setCalDirection(calId, dir);
}

function settingsSetCalTargetSel(kind, encVal) {
  if (typeof setCalTarget === 'function') setCalTarget(kind, encVal ? decodeURIComponent(encVal) : '');
}

function buildCalProvider(id, icon, label, selected) {
  return '<div class="cal-provider-card' + (selected === id ? ' selected' : '') + '" onclick="settingsSetCalProvider(\'' + id + '\')">'
    + '<div class="cal-provider-icon">' + icon + '</div>'
    + '<div class="cal-provider-label">' + label + '</div>'
    + '</div>';
}

// ── Backup tab ────────────────────────────
function buildTabBackup() {
  var signedIn   = typeof isSignedIn === 'function' && isSignedIn();
  var lastBackup = localStorage.getItem('last-backup-time');
  var lastText   = lastBackup ? '마지막 백업: ' + new Date(lastBackup).toLocaleString('ko-KR') : '백업 기록 없음';
  var autoOn     = typeof autoBackupEnabled !== 'undefined' ? autoBackupEnabled : false;

  // 실제 데이터 개수 세기 (localStorage 기준)
  function cnt(key) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v.length : (v ? 1 : 0); }
    catch (e) { return 0; }
  }
  var taskCount  = cnt('my-tasklog-data');
  var noteCount  = cnt('my-tasklog-notes');
  var jrnlCount  = cnt('my-tasklog-journal');
  var mdtCount   = cnt('my-tasklog-mandalart');

  return '<div class="backup-stats">'
    + '<div class="backup-stats-title">현재 데이터 현황</div>'
    + '<div class="backup-stats-row">'
    + '<div class="backup-stat"><div class="backup-stat-val">' + taskCount + '개</div><div class="backup-stat-lbl">Task</div></div>'
    + '<div class="backup-stat"><div class="backup-stat-val">' + noteCount + '개</div><div class="backup-stat-lbl">메모</div></div>'
    + '<div class="backup-stat"><div class="backup-stat-val">' + jrnlCount + '개</div><div class="backup-stat-lbl">저널</div></div>'
    + '<div class="backup-stat"><div class="backup-stat-val">' + mdtCount + '개</div><div class="backup-stat-lbl">만다라트</div></div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text-3);margin-top:8px;">백업 시 모든 페이지의 입력 데이터와 환경설정이 함께 저장됩니다.</div>'
    + '</div>'
    + '<div class="settings-section-head">내보내기 / 양식</div>'
    + '<div class="settings-row">'
    + '<div><div class="settings-row-label">전체 백업 내보내기 (JSON)</div><div class="settings-row-desc">모든 페이지 데이터 + 환경설정을 .json 파일로 다운로드</div></div>'
    + '<button class="btn-secondary" style="font-size:12px;" onclick="exportJSON()">⬇ 내보내기</button>'
    + '</div>'
    + '<div class="settings-row">'
    + '<div><div class="settings-row-label">엑셀 양식 다운로드 (Task)</div><div class="settings-row-desc">현재 할 일을 엑셀(.xlsx) 표로 받아 편집 후 그대로 복원 가능</div></div>'
    + '<button class="btn-secondary" style="font-size:12px;" onclick="downloadTaskExcel()">⬇ 엑셀</button>'
    + '</div>'
    + '<div class="settings-section-head">Google Drive 백업</div>'
    + '<div class="drive-section">'
    + (!signedIn ? '<div class="drive-note">⚠️ Google 로그인 후 Drive 백업을 이용할 수 있습니다.</div>' : '')
    + '<div class="drive-actions">'
    + '<button class="drive-btn primary-btn" ' + (signedIn ? '' : 'disabled') + ' onclick="backupToDrive&&backupToDrive();refreshSettingsBackupStatus()">☁️ 지금 백업</button>'
    + '<button class="drive-btn" ' + (signedIn ? '' : 'disabled') + ' onclick="restoreFromDrive&&restoreFromDrive()">📥 복원</button>'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 0;">'
    + '<div><div class="settings-row-label" style="font-size:12px;">자동 백업</div><div class="settings-row-desc">매시 정각 + 변경 시 Drive에 저장 (시간대별 24개 순환)</div></div>'
    + buildToggle('settings-auto-backup', autoOn, 'settingsToggleAutoBackup()')
    + '</div>'
    + '<div class="drive-status" id="settings-backup-status">' + lastText + '</div>'
    + '</div>'
    + '<div class="settings-section-head">파일로 복원</div>'
    + '<div class="backup-dropzone" onclick="document.getElementById(\'restore-file-input\').click()">'
    + '<div style="font-size:28px;margin-bottom:8px;">📂</div>'
    + '<div style="font-size:13px;font-weight:600;color:var(--text-1);margin-bottom:4px;">백업/엑셀 파일 업로드</div>'
    + '<div style="font-size:11px;color:var(--text-3);">클릭하거나 파일을 드래그해 주세요 (.json · .xlsx)</div>'
    + '<input type="file" id="restore-file-input" accept=".json,.xlsx" style="display:none;" onchange="handleRestoreFile(this)">'
    + '</div>'
    + '<div class="backup-warn">⚠️ 복원 시 현재 데이터가 덧어씨워집니다. 복원 전 반드시 백업을 먼저 진행하세요.</div>';
}

// ── Helpers ───────────────────────────────
function buildToggle(id, on, onchange) {
  return '<button class="toggle' + (on ? ' on' : '') + '" id="' + id + '" onclick="' + onchange + '"></button>';
}

function settingsToggleKey(key, btnId) {
  settingsState[key] = !settingsState[key];
  var el = document.getElementById(btnId);
  if (el) el.classList.toggle('on', settingsState[key]);
  // 알림 토글은 즉시 저장하고, 켤 때 브라우저 알림 권한을 요청한다
  if (key === 'notifDeadline') localStorage.setItem('app-notif-deadline', settingsState[key] ? '1' : '0');
  if (key === 'notifJournal')  localStorage.setItem('app-notif-journal',  settingsState[key] ? '1' : '0');
  if ((key === 'notifDeadline' || key === 'notifJournal') && settingsState[key]
      && typeof ensureNotifPermission === 'function') ensureNotifPermission();
}

function settingsToggleDark() {
  toggleDarkMode();
  setSettingsTab('display');
}
function settingsSetTheme(dark) {
  if (dark !== settingsState.darkMode) settingsToggleDark();
}
function settingsSetFontSize(val) {
  settingsState.fontSize = val;
  applyFontSize(val);
  localStorage.setItem('app-font-size', val);
  setSettingsTab('display');
}
function settingsSetWeekStart(v) {
  settingsState.weekStart = (v === 'sun') ? 'sun' : 'mon';
  localStorage.setItem('app-week-start', settingsState.weekStart);
  // 보이는 캘린더에 즉시 반영
  if (typeof navToMenu === 'function' && typeof currentMenu !== 'undefined') navToMenu(currentMenu);
}
function settingsToggleCalSync() {
  settingsState.calSync = !settingsState.calSync;
  localStorage.setItem('app-cal-sync', settingsState.calSync ? '1' : '0');
  setSettingsTab('calendar');
}
function settingsSetCalProvider(id) {
  settingsState.calProvider = id;
  localStorage.setItem('app-cal-provider', id);
  setSettingsTab('calendar');
}
function settingsSetCalDirection(val) {
  settingsState.calDirection = (val === 'two') ? 'two' : 'one';
  localStorage.setItem('app-cal-direction', settingsState.calDirection);
  setSettingsTab('calendar');
}
function settingsSetCalItems(val) {
  settingsState.calItems = (val === 'all') ? 'all' : 'deadline';
  localStorage.setItem('app-cal-items', settingsState.calItems);
  setSettingsTab('calendar');
}
function settingsDoSync() {
  if (!settingsState.calSync) return;
  if (typeof fetchCalendarEvents === 'function') fetchCalendarEvents();
  settingsState.syncStatus = 'syncing';
  setSettingsTab('calendar');
  setTimeout(function() { settingsState.syncStatus = 'done'; setSettingsTab('calendar'); }, 2000);
}
function settingsToggleAutoBackup() {
  if (!(typeof isSignedIn === 'function' && isSignedIn())) {
    alert('자동 백업을 사용하려면 먼저 Google 로그인을 해주세요! 🔑');
    return;
  }
  if (typeof toggleAutoBackup === 'function') toggleAutoBackup();
  setSettingsTab('backup');
}
function saveSettingsAndClose() {
  localStorage.setItem('app-theme',            settingsState.darkMode ? 'dark' : 'light');
  localStorage.setItem('app-lang',             settingsState.lang);
  localStorage.setItem('app-week-start',       settingsState.weekStart);
  localStorage.setItem('app-notif-deadline',   settingsState.notifDeadline ? '1' : '0');
  localStorage.setItem('app-notif-journal',    settingsState.notifJournal  ? '1' : '0');
  localStorage.setItem('app-font-size',        settingsState.fontSize);
  applyFontSize(settingsState.fontSize);
  closeSettings();
}
function refreshSettingsBackupStatus() {
  setTimeout(function() {
    var el = document.getElementById('settings-backup-status');
    if (!el) return;
    var lb = localStorage.getItem('last-backup-time');
    el.textContent = lb ? '마지막 백업: ' + new Date(lb).toLocaleString('ko-KR') : '백업 없음';
  }, 200);
}

// ── Export / Restore ──────────────────────
// 전체 백업 내보내기 — 모든 페이지 데이터를 통일된 형식으로 다운로드
function exportJSON() {
  if (typeof collectBackupData !== 'function') { alert('백업 모듈을 불러오지 못했습니다.'); return; }
  var data = collectBackupData();
  downloadBackupJSON(data, 'tasklog-backup-' + fmtDateForFile(new Date()) + '.json');
}

// 복원용 빈 양식 다운로드 — 백업 파일과 완전히 동일한 형식
function downloadRestoreTemplate() {
  if (typeof buildRestoreTemplate !== 'function') { alert('백업 모듈을 불러오지 못했습니다.'); return; }
  downloadBackupJSON(buildRestoreTemplate(), 'tasklog-복원양식.json');
}

function exportCSV() {
  if (typeof tasks === 'undefined' || !tasks.length) { alert('내보낼 Task가 없습니다.'); return; }
  var header = ['ID', '이름', '완료', '시작일', '마감일', '아이젠하워'];
  var rows = tasks.map(function(t) {
    return [t.id, '"' + t.text.replace(/"/g, '""') + '"',
      t.completed ? '완료' : '미완료',
      t.startDate || '', t.dueDateTime ? t.dueDateTime.slice(0, 10) : '',
      t.eisenhower || ''].join(',');
  });
  var csv = '﻿' + header.join(',') + '\n' + rows.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'tasklog-tasks-' + fmtDateForFile(new Date()) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// 파일명용 날짜 포맷 (YYYY-MM-DD-HHmm)
function fmtDateForFile(d) {
  d = d || new Date();
  function p(n){ return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes());
}

// JSON 백업/양식 파일에서 복원 (exportJSON · downloadRestoreTemplate 와 같은 형식)
function handleRestoreFile(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  // 엑셀 파일이면 전용 변환기로 처리
  if (/\.xlsx?$/i.test(file.name)) {
    if (typeof handleRestoreXlsx === 'function') { handleRestoreXlsx(file, input); }
    else { alert('엑셀 모듈을 불러오지 못했습니다.'); input.value = ''; }
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (typeof isValidBackup !== 'function' || !isValidBackup(data))
        throw new Error('올바른 백업/양식 파일이 아닙니다');
      var taskN = (typeof backupTaskCount === 'function') ? backupTaskCount(data) : 0;
      if (!confirm('백업 파일의 내용으로 현재 데이터를 덮어씁니다.\n(Task ' + taskN + '개 등 모든 페이지 데이터)\n계속할까요?')) {
        input.value = ''; return;
      }
      var n = applyBackupData(data);   // 통합 복원 엔진 (신규/구버전 형식 모두 지원)
      alert('복원 완료! (' + n + '개 항목) 페이지를 새로고침합니다. ✅');
      location.reload();
    } catch (err) {
      alert('복원 실패: ' + err.message);
    }
    input.value = '';
  };
  reader.readAsText(file);
}

// HTML 이스케이프 (설정 전용 헬퍼)
function sEsc(text) {
  var d = document.createElement('div');
  d.textContent = (text == null) ? '' : String(text);
  return d.innerHTML;
}

// ============================================
//  📅 주 시작 요일 유틸 (설정: 'mon' | 'sun')
//  월간 그리드 캘린더(사이드바·날짜피커·홈 위젯)에서 공통으로 사용
// ============================================
function appWeekStart() {
  var v = (typeof settingsState !== 'undefined' && settingsState.weekStart)
          || localStorage.getItem('app-week-start') || 'mon';
  return v === 'sun' ? 'sun' : 'mon';
}
// 표시 순서의 요일 라벨 배열 (base 기본: 일~토)
function weekDayOrder(base) {
  base = base || ['일','월','화','수','목','금','토'];
  return appWeekStart() === 'mon' ? base.slice(1).concat([base[0]]) : base.slice();
}
// firstDay.getDay()(0=일) → 그리드 앞쪽 빈칸 개수
function weekLeadOffset(dowSun) {
  return appWeekStart() === 'mon' ? (dowSun + 6) % 7 : dowSun;
}
// 표시 컬럼 인덱스(0~6) → 실제 요일(0=일). 주말 색상 판정용
function weekColDow(colIdx) {
  return appWeekStart() === 'mon' ? (colIdx + 1) % 7 : colIdx;
}
