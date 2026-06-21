// ============================================
//  연도 동기화 (Year Sync)
//  MVV → LifeWheel → Mandalart → Project → Task → ToDo
//  모든 모듈이 "하나의 연도"로 연결되도록 관리한다.
//
//  - 전역 연도(_appYear)를 단일 진실 소스로 사용
//  - 어느 모듈에서 연도를 바꿔도 전체가 같은 연도로 이동
//  - 새 연도 생성 시 LifeWheel·Mandalart·MVV 데이터를 자동 생성/연결
// ============================================

var _appYear = null;

// 현재 전역 연도
function appGetYear() {
  if (_appYear == null) appInitYear();
  return _appYear;
}

// 모듈 통합 — 데이터가 존재하는 모든 연도 목록 (오름차순)
function appAllSavedYears() {
  var set = {};
  try {
    if (typeof mvvSavedYears === 'function')
      mvvSavedYears().forEach(function(y){ if (y) set[y] = 1; });
  } catch (e) {}
  try {
    if (typeof lwYears !== 'undefined' && lwYears)
      lwYears.forEach(function(o){ if (o && o.year) set[o.year] = 1; });
  } catch (e) {}
  try {
    if (typeof mandalarts !== 'undefined' && mandalarts)
      mandalarts.forEach(function(o){ if (o && o.year) set[o.year] = 1; });
  } catch (e) {}
  return Object.keys(set)
    .map(function(y){ return parseInt(y, 10); })
    .filter(function(y){ return !isNaN(y); })
    .sort(function(a, b){ return a - b; });
}

// 전역 연도 초기화 (항상 "현재 연도" 기준 — 초기 접속 시 올해 페이지 표시)
function appInitYear() {
  try { if (typeof loadMandalarts === 'function') loadMandalarts(); } catch (e) {}
  try { if (typeof loadLifeWheel  === 'function') loadLifeWheel();  } catch (e) {}
  _appYear = new Date().getFullYear();   // 초기값은 언제나 올해
  appEnsureYear(_appYear);               // 올해 데이터(LW·Mandalart·MVV) 보장
  appSyncVars();
}

// 전역 연도를 각 모듈의 현재연도 변수에 반영
function appSyncVars() {
  var y = _appYear;
  window.lwCurrentYear  = y;
  window.currentMdtYear = y;
  if (typeof mvvState !== 'undefined' && mvvState) mvvState.year = y;
}

// 해당 연도 데이터가 모든 모듈에 존재하도록 보장 (자동 연결)
// 연결 방향: LifeWheel(섹션 원천) → Mandalart(섹션 가져옴) → MVV
function appEnsureYear(year) {
  year = parseInt(year, 10);
  if (isNaN(year) || year < 2000 || year > 2100) return;

  // 1) Life Wheel — 섹션 이름/이모지의 원천
  if (typeof ensureLwYearData === 'function') {
    ensureLwYearData(year);
  } else if (typeof getLwYear === 'function' && typeof createLwYear === 'function') {
    if (!getLwYear(year)) createLwYear(year);
  }

  // 2) Mandalart — Life Wheel 섹션을 가져와 subGoal 구성
  if (typeof ensureMdtData === 'function') {
    ensureMdtData(year);
  } else if (typeof getMdt === 'function' && typeof createMdt === 'function') {
    if (!getMdt(year)) createMdt(year);
  }

  // 3) MVV — 연도 텍스트 레코드 보장
  if (typeof ensureMvvYearData === 'function') {
    ensureMvvYearData(year);
  }
}

// 전역 연도 변경 (없으면 자동 생성/연결) + 현재 화면 다시 그리기
function appSetYear(year) {
  year = parseInt(year, 10);
  if (isNaN(year) || year < 2000 || year > 2100) return;

  // MVV 미저장 변경 자동 저장 (연도 전환 시 데이터 손실 방지)
  try {
    if (typeof mvvState !== 'undefined' && mvvState && mvvState.dirty &&
        typeof saveMVVData === 'function') saveMVVData();
  } catch (e) {}

  appEnsureYear(year);   // 모든 모듈에 연결 보장
  _appYear = year;
  appSyncVars();

  try { if (typeof loadMVV === 'function') loadMVV(); } catch (e) {}

  appRenderCurrent();
}

// 새 연도 생성 (생성 = ensure가 처리하므로 setYear와 동일)
function appCreateYear(year) { appSetYear(year); }

// 현재 보고 있는 메뉴만 다시 렌더 (숨은 페이지는 이동 시 갱신됨)
function appRenderCurrent() {
  try {
    var id  = (typeof currentMenu !== 'undefined') ? currentMenu : null;
    var map = (typeof MENU_RENDERERS !== 'undefined') ? MENU_RENDERERS : null;
    if (id && map && map[id] && typeof window[map[id]] === 'function') {
      window[map[id]]();
    }
  } catch (e) {}
}

// 기존에 한 모듈에만 있던 연도들을 모든 모듈로 연결 (1회 마이그레이션)
function appConnectAllYears() {
  var years = appAllSavedYears();
  years.forEach(function(y){ appEnsureYear(y); });
  appSyncVars();
}

// 부팅 시 호출: 전역 연도 결정 + 기존 연도 통합 연결
function appBootYearSync() {
  appInitYear();
  appConnectAllYears();
}

// ── 연도 삭제 ───────────────────────────────
// 전역 연도 삭제 — 모든 모듈에서 해당 연도 데이터 제거
function appDeleteYear(year) {
  year = parseInt(year, 10);
  if (isNaN(year)) return;

  // 1) MVV
  try {
    if (typeof mvvReadStore === 'function' && typeof MVV_KEY !== 'undefined') {
      var store = mvvReadStore();
      if (store && store.years && store.years[String(year)]) {
        delete store.years[String(year)];
        localStorage.setItem(MVV_KEY, JSON.stringify(store));
      }
    }
  } catch (e) {}

  // 2) Life Wheel
  try {
    if (typeof lwYears !== 'undefined' && Array.isArray(lwYears)) {
      lwYears = lwYears.filter(function(o){ return !o || o.year !== year; });
      if (typeof saveLifeWheel === 'function') saveLifeWheel();
    }
  } catch (e) {}

  // 3) Mandalart
  try {
    if (typeof mandalarts !== 'undefined' && Array.isArray(mandalarts)) {
      mandalarts = mandalarts.filter(function(o){ return !o || o.year !== year; });
      if (typeof saveMandalarts === 'function') saveMandalarts();
    }
  } catch (e) {}

  // 남은 연도 중 가장 최근으로 이동 (없으면 올해 — 빈 데이터 자동 생성)
  var years = appAllSavedYears();
  var next = years.length ? years[years.length - 1] : new Date().getFullYear();
  _appYear = null;
  appSetYear(next);
}

// 현재 연도 삭제(확인 후) — 연도 드롭다운에서 호출
function appDeleteCurrentYear() {
  var y = appGetYear();
  if (!confirm(y + '년 데이터를 삭제할까요?\n이 연도의 Life Wheel · Mandalart · MVV 내용이 모두 제거됩니다.')) return;
  appDeleteYear(y);
}
