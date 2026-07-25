// ============================================
//  MVV (Why · How · What + Action Plan) 페이지
//  · 연도별 저장 지원
//  · 코어벨류 선택은 라이프 휠 → 핵심가치 연결 → '가치 추가' 팝업
// ============================================

var MVV_KEY = 'tasklog-mvv-data';

var mvvState = {
  year: null,           // 현재 보고 있는 연도
  mission: '',          // Why
  vision: '',           // How
  what: '',             // What
  actionPlan: '',       // Action Plan
  sectionValues: {},    // 라이프 휠 연결용 (연도 무관, 공유)
  dirty: false,
  saved: false,
};

var SECTIONS_MVV = ['건강','커리어','재정','관계','성장','여가','환경','내면'];

function mvvCurrentYear() { return new Date().getFullYear(); }

// ── 스토어 입출력 ─────────────────────────
function mvvReadStore() {
  try {
    var o = JSON.parse(localStorage.getItem(MVV_KEY) || 'null');
    if (o && typeof o === 'object') return o;
  } catch(e) {}
  return {};
}

// 데이터가 있는 연도 목록 (정렬)
function mvvSavedYears() {
  var store = mvvReadStore();
  var years = store.years ? Object.keys(store.years) : [];
  return years.map(function(y){ return parseInt(y,10); })
    .filter(function(y){ return !isNaN(y); })
    .sort(function(a,b){ return a-b; });
}

// ── 데이터 로드/저장 ──────────────────────
function loadMVV() {
  var store = mvvReadStore();
  if (!store.years) store.years = {};

  // 구버전(연도 없는 최상위 텍스트) → 올해로 마이그레이션
  var legacy = store.mission || store.vision || store.what || store.actionPlan;
  if (legacy) {
    var ly = String(mvvCurrentYear());
    if (!store.years[ly]) {
      store.years[ly] = {
        mission: store.mission || '', vision: store.vision || '',
        what: store.what || '', actionPlan: store.actionPlan || '',
      };
    }
    delete store.mission; delete store.vision; delete store.what; delete store.actionPlan;
    localStorage.setItem(MVV_KEY, JSON.stringify(store));
  }

  // 공유 sectionValues
  mvvState.sectionValues = store.sectionValues || {};
  SECTIONS_MVV.forEach(function(s) {
    if (!mvvState.sectionValues[s]) mvvState.sectionValues[s] = [];
  });

  // 연도 결정 후 해당 연도 데이터 로드
  if (mvvState.year == null) mvvState.year = mvvCurrentYear();
  var yd = store.years[String(mvvState.year)] || {};
  mvvState.mission    = yd.mission    || '';
  mvvState.vision     = yd.vision     || '';
  mvvState.what       = yd.what       || '';
  mvvState.actionPlan = yd.actionPlan || '';
  mvvState.dirty = false;
  mvvState.saved = false;
}

function saveMVVData() {
  var store = mvvReadStore();
  if (!store.years) store.years = {};
  store.years[String(mvvState.year)] = {
    mission:    mvvState.mission,
    vision:     mvvState.vision,
    what:       mvvState.what,
    actionPlan: mvvState.actionPlan,
  };
  // sectionValues는 라이프 휠과 공유 → 보존
  if (!store.sectionValues) store.sectionValues = mvvState.sectionValues || {};
  localStorage.setItem(MVV_KEY, JSON.stringify(store));
  mvvState.dirty = false;
  mvvState.saved = true;
  renderMVVSaveStatus();
}

// 연도 텍스트 레코드 보장 (전역 연도 연결용 — 빈 레코드 생성)
function ensureMvvYearData(year) {
  year = parseInt(year, 10);
  if (isNaN(year)) return;
  var store = mvvReadStore();
  if (!store.years) store.years = {};
  if (!store.years[String(year)]) {
    store.years[String(year)] = { mission:'', vision:'', what:'', actionPlan:'' };
    localStorage.setItem(MVV_KEY, JSON.stringify(store));
  }
}

// 연도 변경 (현재 연도에 미저장 변경이 있으면 자동 저장)
// 전역 연도(appSetYear)로 라우팅 → MVV·LifeWheel·Mandalart 함께 이동
function mvvChangeYear(year) {
  year = parseInt(year, 10);
  if (isNaN(year) || year === mvvState.year) return;
  if (typeof appSetYear === 'function') { appSetYear(year); return; }
  if (mvvState.dirty) saveMVVData();
  mvvState.year = year;
  loadMVV();
  _renderMVV();
}

// ── 메인 렌더 ────────────────────────────
function renderMVVPage() {
  loadMVV();
  _renderMVV();
}

function _renderMVV() {
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML =
    '<div class="mvv-page">'
    + buildMVVMainView()
    + '</div>';
  renderMVVYearSlot();
  bindMVVEvents();
}

// ── 연도 선택 드롭다운 (타이틀 영역 슬롯) ─────────
function renderMVVYearSlot() {
  var slot = document.getElementById('topbar-mdt-year-slot');
  if (!slot) return;
  var y = mvvState.year;
  var years = (typeof appAllSavedYears === 'function') ? appAllSavedYears() : mvvSavedYears();
  if (years.indexOf(y) === -1) years.push(y);
  years.sort(function(a, b){ return b - a; });
  var opts = years.map(function(yr){
    return '<option value="' + yr + '"' + (yr === y ? ' selected' : '') + '>' + yr + '년</option>';
  }).join('');
  opts += '<option value="__new__">+ 새 연도 추가</option>';
  opts += '<option value="__delete__">현재 연도 삭제</option>';
  slot.innerHTML = '<select class="year-select mvv-year-select" onchange="handleMvvYearSelect(this.value)">' + opts + '</select>';
}

// 연도 드롭박스 handler
function handleMvvYearSelect(val) {
  if (val === '__new__') {
    var y = prompt('연도를 입력하세요:', new Date().getFullYear());
    if (!y) { renderMVVYearSlot(); return; }
    if (typeof appCreateYear === 'function') appCreateYear(parseInt(y, 10));
    else mvvChangeYear(parseInt(y, 10));
    return;
  }
  if (val === '__delete__') {
    if (typeof appDeleteCurrentYear === 'function') appDeleteCurrentYear();
    else renderMVVYearSlot();
    return;
  }
  mvvChangeYear(parseInt(val, 10));
}

// ── 카드 헬퍼 ────────────────────────────
function buildMVVTextCard(opts) {
  // opts: { id, title, value, placeholder }
  return '<div class="mvv-card">'
    + '<div class="mvv-card-header">'
    + '<div class="mvv-card-title">' + opts.title + '</div>'
    + '</div>'
    + '<div class="mvv-rta" id="' + opts.id + '" contenteditable="true" data-ph="' + mvvAttr(opts.placeholder) + '">'
    + mvvNormalizeRich(opts.value)
    + '</div>'
    + '</div>';
}
function mvvAttr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function mvvNormalizeRich(val) {
  if (!val) return '';
  if (/<(div|span|br|b|strong|i|u|p)/i.test(val)) return val;
  return mvvEsc(val).replace(/\n/g, '<br>');
}

// ── 메인 뷰 (Why / How / What + Action Plan) ──
function buildMVVMainView() {
  var whyCard = buildMVVTextCard({
    id: 'mvv-mission', icon: '🎯', iconBg: 'rgba(79,110,247,0.12)',
    title: 'Why (Mission)', subtitle: '나는 왜 존재하는가',
    value: mvvState.mission,
    placeholder: '나는 왜 존재하는가 — 삶의 이유·목적을 한 문장으로 적어보세요.',
    previewIcon: '💬', previewClass: 'mvv-preview-mission',
  });
  var howCard = buildMVVTextCard({
    id: 'mvv-vision', icon: '🔭', iconBg: 'rgba(34,192,139,0.12)',
    title: 'How (Vision)', subtitle: '나는 어떻게 살아갈 것인가',
    value: mvvState.vision,
    placeholder: '나는 어떻게 살아갈 것인가 — 실현 방식·태도를 적어보세요.',
    previewIcon: '🔭', previewClass: 'mvv-preview-vision',
  });
  var whatCard = buildMVVTextCard({
    id: 'mvv-what', icon: '🧩', iconBg: 'rgba(245,166,35,0.12)',
    title: 'What', subtitle: '나는 무엇을 하는가',
    value: mvvState.what,
    placeholder: '나는 무엇을 하는가 — 실제로 하는 일을 적어보세요.',
    previewIcon: '🧩', previewClass: 'mvv-preview-what',
  });
  var actionCard = buildMVVTextCard({
    id: 'mvv-action', icon: '🚀', iconBg: 'rgba(224,92,122,0.12)',
    title: 'Action Plan', subtitle: '구체적인 실행 계획',
    value: mvvState.actionPlan,
    placeholder: '구체적인 실행 계획을 자유롭게 적어보세요.',
    previewIcon: '🚀', previewClass: 'mvv-preview-action',
  });

  return '<div class="mvv-2col">'
    + '<div class="mvv-col">' + whyCard + howCard + whatCard + '</div>'
    + '<div class="mvv-col">' + actionCard + '</div>'
    + '</div>';
}

function buildMVVSaveBar() {
  var statusHtml = '';
  if (mvvState.saved && !mvvState.dirty) {
    statusHtml = '<span class="mvv-save-status saved">✓ 저장되었습니다</span>';
  } else if (mvvState.dirty) {
    statusHtml = '<span class="mvv-save-status unsaved">저장하지 않은 변경사항이 있습니다</span>';
  }
  return '<div class="mvv-save-bar" id="mvv-save-bar">'
    + '<span id="mvv-status-text">' + statusHtml + '</span>'
    + '<button class="btn-primary" onclick="saveMVVData()" style="opacity:' + (mvvState.dirty ? '1' : '0.5') + ';" id="mvv-save-btn">' + mvvState.year + '년 저장</button>'
    + '</div>';
}

// ── 이벤트 바인딩 ─────────────────────────
function bindMVVEvents() {
  var fields = [
    { id: 'mvv-mission', key: 'mission' },
    { id: 'mvv-vision',  key: 'vision' },
    { id: 'mvv-what',    key: 'what' },
    { id: 'mvv-action',  key: 'actionPlan' },
  ];
  fields.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener('input', function() {
      mvvState[f.key] = this.innerHTML;
      mvvMarkDirty();
      mvvScheduleAutoSave();
    });
  });
}

// 자동 저장 (디바운스)
var _mvvSaveTimer = null;
function mvvScheduleAutoSave() {
  if (_mvvSaveTimer) clearTimeout(_mvvSaveTimer);
  _mvvSaveTimer = setTimeout(function() { saveMVVData(); }, 800);
}

// HTML 이스케이프 (MVV 전용 헬퍼)
function mvvEsc(text) {
  var d = document.createElement('div');
  d.textContent = (text == null) ? '' : String(text);
  return d.innerHTML;
}

// 저장 상태 표시 갱신 (저장바)
function renderMVVSaveStatus() {
  var statusEl = document.getElementById('mvv-status-text');
  if (statusEl) {
    var html = '';
    if (mvvState.saved && !mvvState.dirty) {
      html = '<span class="mvv-save-status saved">✓ 저장되었습니다</span>';
    } else if (mvvState.dirty) {
      html = '<span class="mvv-save-status unsaved">저장하지 않은 변경사항이 있습니다</span>';
    }
    statusEl.innerHTML = html;
  }
  var btn = document.getElementById('mvv-save-btn');
  if (btn) btn.style.opacity = mvvState.dirty ? '1' : '0.5';
}

// 변경 발생 표시
function mvvMarkDirty() {
  mvvState.dirty = true;
  mvvState.saved = false;
  renderMVVSaveStatus();
}
