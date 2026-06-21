// ============================================
//  🎡 인생 수레바퀴 (Wheel of Life)
// ============================================

const LIFEWHEEL_KEY = 'my-tasklog-lifewheel';

const LW_SECTION_DEFAULTS = [
  { emoji:'💼', name:'커리어/학업', info:'직장/학교에서의 성취와 성장' },
  { emoji:'💰', name:'재정',        info:'수입, 자산, 재무 안정성' },
  { emoji:'🏃', name:'건강',        info:'신체적 건강, 운동, 식습관' },
  { emoji:'🧘', name:'정신/영감',   info:'멘탈 헬스, 명상, 창의성' },
  { emoji:'👥', name:'인간관계',    info:'친구, 동료, 소셜 네트워크' },
  { emoji:'❤️', name:'가족/연인',   info:'가까운 사람들과의 관계' },
  { emoji:'📚', name:'자기계발',    info:'학습, 새로운 기술 습득' },
  { emoji:'🎮', name:'취미/여가',   info:'즐거움, 재미, 휴식' }
];

const LW_STATUS = {
  strength: { label:'✅ 강점',     color:'#2ecc71' },
  maintain: { label:'🔥 유지/고민', color:'#f39c12' },
  concern:  { label:'⚠️ 개선 필요', color:'#e74c3c' }
};

// ────────────────────────────────────────────
//  💎 핵심가치 (Core Values)
// ────────────────────────────────────────────

const LW_CV_KEY = 'my-tasklog-corevalues';

// 카테고리 순서 (이미지 기준)
const LW_CV_CATS = ['성취와 성장', '안정과 평온', '관계와 공동체', '자유와 창의', '기여와 의미'];

// 카테고리 헤더 색상
const LW_CV_CAT_COLORS = {
  '성취와 성장':   '#48bb78',
  '안정과 평온':   '#4299e1',
  '관계와 공동체': '#ed64a6',
  '자유와 창의':   '#ecc94b',
  '기여와 의미':   '#667eea',
};

const LW_CV_PRESETS = [
  // ── 성취와 성장 ──
  { id:'growth',       label:'성장',     en:'Growth',      desc:'배우고 변화하며 스스로를 확장하는 것',        cat:'성취와 성장' },
  { id:'challenge',    label:'도전',     en:'Challenge',   desc:'두려움을 넘어 새로운 시도를 감행하는 것',     cat:'성취와 성장' },
  { id:'excellence',   label:'탁월함',   en:'Excellence',  desc:'최고의 기준을 세우고 꾸준히 정진하는 것',     cat:'성취와 성장' },
  { id:'achievement',  label:'성취',     en:'Achievement', desc:'목표를 달성하고 결과를 만들어내는 것',        cat:'성취와 성장' },
  { id:'focus',        label:'집중',     en:'Focus',       desc:'한 가지에 몰입하여 깊이 있는 결과를 내는 것', cat:'성취와 성장' },
  { id:'initiative',   label:'자기주도', en:'Initiative',  desc:'스스로 방향을 정하고 행동으로 옮기는 것',     cat:'성취와 성장' },
  { id:'impact',       label:'영향력',   en:'Impact',      desc:'주변과 세상에 긍정적인 변화를 이끄는 것',     cat:'성취와 성장' },
  { id:'vision',       label:'비전',     en:'Vision',      desc:'장기적인 목표와 방향성을 갖는 것',            cat:'성취와 성장' },
  { id:'resilience',   label:'회복탄력성', en:'Resilience', desc:'실패나 어려움 속에서도 다시 일어나는 힘',   cat:'성취와 성장' },
  { id:'abundance',    label:'부와 자유', en:'Abundance',  desc:'경제적 풍요와 선택의 자유를 누리는 것',       cat:'성취와 성장' },
  // ── 안정과 평온 ──
  { id:'stability',    label:'안정',     en:'Stability',   desc:'예측 가능하고 평온한 삶을 사는 것',           cat:'안정과 평온' },
  { id:'health',       label:'건강',     en:'Health',      desc:'몸과 마음의 균형을 유지하는 것',              cat:'안정과 평온' },
  { id:'calm',         label:'평온',     en:'Calm',        desc:'내면의 고요함과 마음의 여유를 가지는 것',     cat:'안정과 평온' },
  { id:'order',        label:'질서',     en:'Order',       desc:'정돈되고 계획적인 삶을 지향하는 것',          cat:'안정과 평온' },
  { id:'simplicity',   label:'단순함',   en:'Simplicity',  desc:'본질에 집중하고 불필요한 것을 줄이는 것',     cat:'안정과 평온' },
  { id:'moderation',   label:'절제',     en:'Moderation',  desc:'욕심을 조절하고 균형을 유지하는 것',          cat:'안정과 평온' },
  { id:'security',     label:'안전',     en:'Security',    desc:'물리적·정서적 보호 속에 안도감을 느끼는 것', cat:'안정과 평온' },
  { id:'consistency',  label:'일관성',   en:'Consistency', desc:'말과 행동, 가치가 조화를 이루는 것',          cat:'안정과 평온' },
  { id:'reliability',  label:'신뢰성',   en:'Reliability', desc:'믿을 수 있는 태도와 책임감을 지키는 것',      cat:'안정과 평온' },
  { id:'integrity',    label:'진실성',   en:'Integrity',   desc:'정직하고 원칙에 따라 행동하는 것',            cat:'안정과 평온' },
  // ── 관계와 공동체 ──
  { id:'trust',        label:'신뢰',     en:'Trust',       desc:'진심과 약속을 기반으로 믿음을 쌓는 것',       cat:'관계와 공동체' },
  { id:'respect',      label:'존중',     en:'Respect',     desc:'자신과 타인의 가치를 인정하는 것',            cat:'관계와 공동체' },
  { id:'belonging',    label:'소속감',   en:'Belonging',   desc:'함께함 속에서 안정과 의미를 느끼는 것',       cat:'관계와 공동체' },
  { id:'collaboration',label:'협력',     en:'Collaboration',desc:'함께 힘을 모아 시너지를 내는 것',           cat:'관계와 공동체' },
  { id:'empathy',      label:'공감',     en:'Empathy',     desc:'타인의 감정을 이해하고 함께 느끼는 것',       cat:'관계와 공동체' },
  { id:'compassion',   label:'배려',     en:'Compassion',  desc:'세심한 관심과 온기로 타인을 돌보는 것',       cat:'관계와 공동체' },
  { id:'gratitude',    label:'감사',     en:'Gratitude',   desc:'주변의 좋은 것들에 고마움을 느끼는 것',       cat:'관계와 공동체' },
  { id:'acceptance',   label:'포용',     en:'Acceptance',  desc:'차이와 다양성을 열린 마음으로 받아들이는 것', cat:'관계와 공동체' },
  { id:'authenticity', label:'진정성',   en:'Authenticity',desc:'관계 속에서도 본연의 모습을 유지하는 것',    cat:'관계와 공동체' },
  { id:'love',         label:'사랑',     en:'Love',        desc:'깊은 유대감과 애정을 나누는 것',              cat:'관계와 공동체' },
  // ── 자유와 창의 ──
  { id:'freedom',      label:'자유',     en:'Freedom',     desc:'스스로 선택하고 행동할 수 있는 권리',          cat:'자유와 창의' },
  { id:'adventure',    label:'모험',     en:'Adventure',   desc:'새로운 경험과 미지의 세계를 탐험하는 것',     cat:'자유와 창의' },
  { id:'creativity',   label:'창의성',   en:'Creativity',  desc:'독창적인 아이디어를 만들어내는 것',           cat:'자유와 창의' },
  { id:'flexibility',  label:'유연성',   en:'Flexibility', desc:'변화에 적응하고 열린 태도를 가지는 것',       cat:'자유와 창의' },
  { id:'individuality',label:'개성',     en:'Individuality',desc:'나만의 고유한 색과 방식을 표현하는 것',     cat:'자유와 창의' },
  { id:'curiosity',    label:'호기심',   en:'Curiosity',   desc:'세상에 대한 탐구심을 멈추지 않는 것',         cat:'자유와 창의' },
  { id:'joy',          label:'즐거움',   en:'Joy',         desc:'인생의 순간을 가볍고 기쁘게 즐기는 것',       cat:'자유와 창의' },
  { id:'humor',        label:'유머',     en:'Humor',       desc:'유쾌함으로 상황을 긍정적으로 바라보는 것',    cat:'자유와 창의' },
  { id:'autonomy',     label:'자율성',   en:'Autonomy',    desc:'타인의 기대가 아닌 내 기준으로 사는 것',      cat:'자유와 창의' },
  { id:'openness',     label:'개방성',   en:'Openness',    desc:'새로운 생각과 관점을 수용하는 것',            cat:'자유와 창의' },
  // ── 기여와 의미 ──
  { id:'contribution', label:'기여',     en:'Contribution',desc:'타인과 사회에 도움이 되는 것',               cat:'기여와 의미' },
  { id:'justice',      label:'정의',     en:'Justice',     desc:'옳고 그름을 분별하고 공정함을 추구하는 것',   cat:'기여와 의미' },
  { id:'responsibility',label:'책임감',  en:'Responsibility',desc:'맡은 바를 끝까지 해내는 자세',             cat:'기여와 의미' },
  { id:'kindness',     label:'배려',     en:'Kindness',    desc:'타인의 감정을 이해하고 보살피는 것',          cat:'기여와 의미' },
  { id:'service',      label:'봉사',     en:'Service',     desc:'자신의 시간과 노력을 나누는 것',              cat:'기여와 의미' },
  { id:'spirituality', label:'영성',     en:'Spirituality',desc:'더 큰 존재나 가치와의 연결을 느끼는 것',     cat:'기여와 의미' },
  { id:'passion',      label:'열정',     en:'Passion',     desc:'진심으로 몰두하며 에너지를 쏟는 것',          cat:'기여와 의미' },
  { id:'dedication',   label:'헌신',     en:'Dedication',  desc:'한 가지 일이나 사람에게 진심으로 임하는 것', cat:'기여와 의미' },
  { id:'fairness',     label:'공정성',   en:'Fairness',    desc:'모두에게 같은 기회를 주고 균형을 추구하는 것',cat:'기여와 의미' },
  { id:'purpose',      label:'의미',     en:'Purpose',     desc:'나의 행동이 세상과 연결된 이유를 찾는 것',    cat:'기여와 의미' },
];

var lwCoreValues = [];     // 선택된 핵심가치 id 배열
var lwCurrentTab = 'wheel'; // 'wheel' | 'values'


var lwYears = [];
var lwCurrentYear = null;

// ────────────────────────────────────────────
//  💾 데이터
// ────────────────────────────────────────────

function loadLifeWheel() {
  var saved = localStorage.getItem(LIFEWHEEL_KEY);
  if (saved) {
    try {
      var parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
        lwYears = [{ year: new Date().getFullYear(), sections: parsed }];
        saveLifeWheel();
      } else {
        lwYears = parsed;
      }
      // 저장된 데이터에 누락 필드(smart, ideal, info 등) 자동 보정
      lwYears.forEach(function(yr) {
        if (Array.isArray(yr.sections)) {
          yr.sections = yr.sections.map(function(sec, i) {
            return makeLwSection(sec, i);
          });
        }
      });
    } catch(e) { lwYears = []; }
  }
  if (!lwCurrentYear && lwYears.length > 0)
    lwCurrentYear = Math.max.apply(null, lwYears.map(function(y){ return y.year; }));
}

function saveLifeWheel() {
  localStorage.setItem(LIFEWHEEL_KEY, JSON.stringify(lwYears));
}

function loadCoreValues() {
  try { lwCoreValues = JSON.parse(localStorage.getItem(LW_CV_KEY) || '[]'); }
  catch(e) { lwCoreValues = []; }
}

function saveCoreValues() {
  localStorage.setItem(LW_CV_KEY, JSON.stringify(lwCoreValues));
}

function lwGetPreset(id) {
  return LW_CV_PRESETS.find(function(v){ return v.id === id; }) || null;
}

function getLwYear(year) {
  return lwYears.find(function(y){ return y.year === year; }) || null;
}

function getLwSections() {
  var yr = getLwYear(lwCurrentYear);
  if (!yr) return null;
  // name이 비어있는 섹션은 LW_SECTION_DEFAULTS에서 폴백
  return yr.sections.map(function(s, i) {
    var def = LW_SECTION_DEFAULTS[i] || {};
    if (s.name) return s;
    return Object.assign({}, s, { name: def.name || ('섹션' + (i + 1)) });
  });
}

function makeLwSection(def, idx) {
  var base = LW_SECTION_DEFAULTS[idx] || {};
  return {
    emoji:      def.emoji      || base.emoji || '⭐',
    name:       def.name       || base.name  || ('섹션'+(idx+1)),
    info:       def.info       || base.info  || '',
    ideal:      def.ideal      || '',
    score:      def.score      !== undefined ? def.score : 5,
    importance: def.importance || 2,
    status:     def.status     || 'maintain',
    priority:   def.priority   || 5,
    values:     def.values     || [],
    color:      def.color      || base.color || '',
    smart: Object.assign(
      { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' },
      def.smart || {}
    )
  };
}

// 연도 데이터만 생성/보장 (렌더링 없음 — 전역 연도 연결용)
function ensureLwYearData(year) {
  year = parseInt(year);
  if (isNaN(year) || year < 2000 || year > 2100) return null;
  var existing = getLwYear(year);
  if (existing) return existing;
  var sections = LW_SECTION_DEFAULTS.map(function(def, i) {
    var sg = null;
    if (typeof getMdt === 'function') {
      var mdt = getMdt(year);
      if (mdt && mdt.subGoals[i]) sg = mdt.subGoals[i];
    }
    return makeLwSection(sg ? { emoji:sg.emoji, name:sg.text } : def, i);
  });
  var rec = { year:year, sections:sections };
  lwYears.push(rec);
  saveLifeWheel();
  return rec;
}

function createLwYear(year) {
  var rec = ensureLwYearData(year);
  if (!rec) { alert('올바른 연도를 입력하세요.'); return; }
  lwCurrentYear = rec.year; renderLifeWheelView();
}

function promptNewLwYear() {
  var y = prompt('연도를 입력하세요:', new Date().getFullYear());
  if (!y) return;
  if (typeof appCreateYear === 'function') appCreateYear(parseInt(y, 10));
  else createLwYear(y);
}

// 전역 연도(appSetYear)로 라우팅 → 모든 모듈 함께 이동
function switchLwYear(year) {
  if (typeof appSetYear === 'function') { appSetYear(year); return; }
  lwCurrentYear = year; renderLifeWheelView();
}

// 연도 드롭박스 handler
function handleLwYearSelect(val) {
  if (val === '__new__') promptNewLwYear();
  else if (val === '__delete__') {
    if (typeof appDeleteCurrentYear === 'function') appDeleteCurrentYear();
    else renderLifeWheelView();
  }
  else switchLwYear(parseInt(val));
}

// ────────────────────────────────────────────
//  🔗 만다라트 연동
// ────────────────────────────────────────────

function lwSyncToMandalart(sectionIndex) {
  if (typeof getMdt !== 'function' || typeof saveMandalarts !== 'function') return;
  var mdt = getMdt(lwCurrentYear); if (!mdt) return;
  var sections = getLwSections(); if (!sections) return;

  // index 미지정 → 모든 섹션 일괄 동기화
  if (sectionIndex === undefined || sectionIndex === null) {
    sections.forEach(function(s, i) {
      var g = mdt.subGoals[i];
      if (!s || !g) return;
      g.text = s.name; g.badge = s.name; g.emoji = s.emoji;
      if (s.color) g.color = s.color;
    });
    saveMandalarts();
    return;
  }

  var sec = sections[sectionIndex];
  var sg  = mdt.subGoals[sectionIndex];
  if (!sec || !sg) return;
  sg.text = sec.name; sg.badge = sec.name; sg.emoji = sec.emoji;
  if (sec.color) sg.color = sec.color;
  saveMandalarts();
  var cardEl = document.getElementById('mdt-card-'+lwCurrentYear+'-'+sg.id);
  if (cardEl) {
    var nameEl  = cardEl.querySelector('.mdt-ic-name');
    var emojiEl = cardEl.querySelector('.mdt-ic-emoji');
    if (nameEl)  nameEl.textContent  = sec.name;
    if (emojiEl) emojiEl.textContent = sec.emoji;
  }
}

// ────────────────────────────────────────────
//  🎨 렌더링
// ────────────────────────────────────────────

function renderLifeWheelView() {
  loadLifeWheel();
  loadCoreValues();

  // 새 레이아웃: #page-content에 렌더링
  var pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  // 연도 데이터 없으면 초기화 (전역 연도 기준 — 모듈 간 동기화 유지)
  if (!lwCurrentYear) {
    lwCurrentYear = (typeof appGetYear === 'function') ? appGetYear() : new Date().getFullYear();
  }
  if (!getLwYear(lwCurrentYear)) {
    createLwYear(lwCurrentYear);
    return;
  }

  var sections = getLwSections();
  if (!sections) return;

  pageContent.innerHTML = '<div class="lw-page">'
    + '<div id="lw-tab-content"></div>'
    + '</div>';

  renderLwYearSlot();
  lwRenderTabContent();
}

// ── 연도 선택 드롭다운 (타이틀 영역 슬롯, MVV와 동일) ─────────
function renderLwYearSlot() {
  var slot = document.getElementById('topbar-mdt-year-slot');
  if (!slot) return;
  var years = (typeof appAllSavedYears === 'function')
    ? appAllSavedYears()
    : lwYears.map(function(y){ return y.year; });
  if (years.indexOf(lwCurrentYear) === -1) years.push(lwCurrentYear);
  years.sort(function(a, b){ return b - a; });
  var opts = years.map(function(yr){
    return '<option value="' + yr + '"' + (yr === lwCurrentYear ? ' selected' : '') + '>' + yr + '년</option>';
  }).join('');
  opts += '<option value="__new__">+ 새 연도 추가</option>';
  opts += '<option value="__delete__">🗑 현재 연도 삭제</option>';
  slot.innerHTML = '<select class="year-select" onchange="handleLwYearSelect(this.value)">' + opts + '</select>';
}

function lwSetTab(tab) {
  lwCurrentTab = tab;
  lwRenderTabContent();
}

function lwRenderTabContent() {
  var el = document.getElementById('lw-tab-content');
  if (!el) return;
  el.innerHTML = buildLwWheelTab();
}

// MVV 데이터의 영역 이름 매핑 (인덱스 → 고정 이름)
var LW_MVV_SECTION_NAMES = ['건강','커리어','재정','관계','성장','여가','환경','내면'];

// MVV sectionValues에서 특정 행(index)의 핵심가치 레이블 반환
function lwGetMvvSectionValues(rowIdx) {
  return lwGetSectionValueIds(rowIdx).map(function(id) {
    var p = lwGetPreset(id);
    return p ? p.label : id;
  });
}

// 특정 영역(index)에 연결된 핵심가치 ID 목록
function lwGetSectionValueIds(rowIdx) {
  try {
    var saved = JSON.parse(localStorage.getItem('tasklog-mvv-data') || 'null');
    if (saved && saved.sectionValues) {
      return saved.sectionValues[LW_MVV_SECTION_NAMES[rowIdx]] || [];
    }
  } catch(e) {}
  return [];
}

// 영역에 핵심가치 연결/해제 (최대 3개), tasklog-mvv-data에 저장
function lwToggleSectionValue(rowIdx, id) {
  var secName = LW_MVV_SECTION_NAMES[rowIdx];
  var saved;
  try { saved = JSON.parse(localStorage.getItem('tasklog-mvv-data') || 'null'); } catch(e) { saved = null; }
  if (!saved) saved = { mission:'', vision:'', sectionValues:{} };
  if (!saved.sectionValues) saved.sectionValues = {};
  var cur = saved.sectionValues[secName] || [];
  var i = cur.indexOf(id);
  if (i > -1) {
    cur.splice(i, 1);
  } else {
    if (cur.length >= 3) return;  // 영역당 최대 3개
    cur.push(id);
  }
  saved.sectionValues[secName] = cur;
  localStorage.setItem('tasklog-mvv-data', JSON.stringify(saved));
  // 모달 내 칩 블록만 갱신
  var box = document.getElementById('lw-modal-cv-block');
  if (box) box.innerHTML = lwBuildModalCvBlock(rowIdx);
}

// 섹션 편집 모달 안의 '핵심가치 연결' 블록 HTML
function lwBuildModalCvBlock(rowIdx) {
  loadCoreValues(); // MVV에서 고른 풀(LW_CV_KEY)
  var connected = lwGetSectionValueIds(rowIdx);
  var countColor = connected.length > 0 ? 'var(--brand-primary)' : 'var(--text-3)';
  var html = '<div class="smart-field-header" style="justify-content:space-between;">'
    + '<span><span class="smart-icon">💎</span><span class="smart-label">Value</span></span>'
    + '<span style="display:flex;align-items:center;gap:8px;">'
    + '<button type="button" class="lw-cv-add-btn" onclick="lwOpenCvPicker(' + rowIdx + ')">+ 가치 추가</button>'
    + '<span style="font-size:12px;font-weight:700;color:' + countColor + ';">' + connected.length + ' / 3</span>'
    + '</span>'
    + '</div>';
  if (!lwCoreValues || lwCoreValues.length === 0) {
    html += '<div style="font-size:12px;color:var(--text-3);padding:8px 0;">아직 선택한 핵심가치가 없습니다. <strong>+ 가치 추가</strong>를 눌러 시작하세요.</div>';
    return html;
  }
  html += '<div class="lw-cv-chips" style="margin-top:6px;">'
    + lwCoreValues.map(function(id) {
        var p = lwGetPreset(id);
        var label = p ? p.label : id;
        var sel = connected.indexOf(id) > -1;
        return '<button class="lw-cv-chip' + (sel ? ' selected' : '') + '"'
          + ' onclick="lwToggleSectionValue(' + rowIdx + ',\'' + id + '\')">'
          + (sel ? '✓ ' : '') + hwEsc(label)
          + '</button>';
      }).join('')
    + '</div>';
  return html;
}

// ── 핵심가치 추가 팝업 (라이프 휠 → 핵심가치 연결) ──
var _lwCvPickerRow = null;

function lwOpenCvPicker(rowIdx) {
  _lwCvPickerRow = rowIdx;
  loadCoreValues();
  var existing = document.getElementById('lw-cv-picker-overlay');
  if (existing) existing.remove();
  var ol = document.createElement('div');
  ol.className = 'lw-modal-overlay lw-cv-picker-overlay';
  ol.id = 'lw-cv-picker-overlay';
  ol.onclick = function(e) {
    if (e && e.target && e.target.id === 'lw-cv-picker-overlay') lwCloseCvPicker();
  };
  ol.innerHTML = '<div class="lw-modal lw-cv-picker-modal">'
    + '<div class="lw-modal-header">'
    + '<span><span class="smart-icon">💎</span> 핵심가치 선택</span>'
    + '<button class="lw-modal-close" onclick="lwCloseCvPicker()">✕</button>'
    + '</div>'
    + '<div class="lw-modal-body" id="lw-cv-picker-body">' + lwBuildCvPickerBody() + '</div>'
    + '<div class="lw-modal-footer">'
    + '<button class="lw-modal-save" onclick="lwCloseCvPicker()">완료</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(ol);
}

function lwCloseCvPicker() {
  var ol = document.getElementById('lw-cv-picker-overlay');
  if (ol) ol.remove();
  // 섹션 모달의 핵심가치 연결 블록 갱신
  if (_lwCvPickerRow != null) {
    var box = document.getElementById('lw-modal-cv-block');
    if (box) box.innerHTML = lwBuildModalCvBlock(_lwCvPickerRow);
  }
  _lwCvPickerRow = null;
}

// 팝업 내 가치 토글 (LW_CV_KEY 풀에 추가/제거)
function lwPickerToggleValue(id) {
  loadCoreValues();
  var idx = lwCoreValues.indexOf(id);
  if (idx > -1) {
    lwCoreValues.splice(idx, 1);
    // 풀에서 빠지면 모든 영역 연결에서도 제거
    lwUnlinkValueFromAllSections(id);
  } else {
    lwCoreValues.push(id);
  }
  saveCoreValues();
  var body = document.getElementById('lw-cv-picker-body');
  if (body) body.innerHTML = lwBuildCvPickerBody();
}

// 특정 가치를 모든 영역 연결(sectionValues)에서 제거
function lwUnlinkValueFromAllSections(id) {
  var saved;
  try { saved = JSON.parse(localStorage.getItem('tasklog-mvv-data') || 'null'); } catch(e) { saved = null; }
  if (!saved || !saved.sectionValues) return;
  Object.keys(saved.sectionValues).forEach(function(sec) {
    saved.sectionValues[sec] = (saved.sectionValues[sec] || []).filter(function(x){ return x !== id; });
  });
  localStorage.setItem('tasklog-mvv-data', JSON.stringify(saved));
}

// 팝업 본문 (카테고리별 가치 칩 + 선택 목록)
function lwBuildCvPickerBody() {
  loadCoreValues();
  var html = '<div class="lw-cv-picker-count">선택된 핵심가치 <strong>' + lwCoreValues.length + '</strong>개</div>';
  LW_CV_CATS.forEach(function(cat) {
    var color = LW_CV_CAT_COLORS[cat] || '#999';
    var presets = LW_CV_PRESETS.filter(function(v){ return v.cat === cat; });
    html += '<div class="lw-cv-cat" style="border-left:3px solid ' + color + ';">'
      + '<div class="lw-cv-cat-title" style="color:' + color + ';">' + cat + '</div>'
      + '<div class="lw-cv-chips">'
      + presets.map(function(v) {
          var sel = lwCoreValues.indexOf(v.id) > -1;
          return '<button class="lw-cv-chip' + (sel ? ' selected' : '') + '" style="' + (sel ? 'border-color:' + color + ';background:' + color + '18;color:' + color + ';' : '') + '" onclick="lwPickerToggleValue(\'' + v.id + '\')" title="' + v.desc + '">'
            + (sel ? '✓ ' : '') + v.label
            + ' <span style="font-size:10px;opacity:0.55;">' + v.en + '</span>'
            + '</button>';
        }).join('')
      + '</div></div>';
  });
  return html;
}

// ── 수레바퀴 탭 ───────────────────────────
function buildLwWheelTab() {
  var sections = getLwSections();
  if (!sections) return '<div style="padding:40px;text-align:center;color:var(--text-3);">데이터가 없습니다.</div>';

  var rows = sections.map(function(sec, i) {
    var statusInfo = LW_STATUS[sec.status] || LW_STATUS.maintain;
    var secColor = sec.color || '';
    var scoreBar = '';
    for (var s = 1; s <= 10; s++) {
      var active = s <= (sec.score || 5);
      var pipStyle = (active && secColor) ? ' style="background:' + secColor + ';border-color:' + secColor + ';"' : '';
      scoreBar += '<div class="lw-score-pip' + (active ? ' active' : '') + '"' + pipStyle + ' onclick="event.stopPropagation();lwSetScore(' + i + ',' + s + ')" title="' + s + '점"></div>';
    }
    var finalGoal = sec.smart && sec.smart.finalGoal ? sec.smart.finalGoal : '';
    var infoText  = sec.info  || '—';
    var idealText = sec.ideal || '—';
    var goalText  = finalGoal || '—';

    // 핵심가치: MVV sectionValues에서 읽어옴
    var mvvVals = lwGetMvvSectionValues(i);
    var cvCell = mvvVals.length > 0
      ? mvvVals.map(function(label) {
          return '<span class="lw-cv-tag">' + hwEsc(label) + '</span>';
        }).join('')
      : '<span style="font-size:11px;color:var(--text-3);">—</span>';

    return '<tr class="lw-row" id="lw-card-' + i + '" onclick="lwOpenSectionModal(' + i + ')">'
      + '<td class="lw-section"' + (secColor ? ' style="border-left:3px solid ' + secColor + ';"' : '') + '><span style="font-size:16px;margin-right:6px;">' + (sec.emoji || '⭐') + '</span><span' + (secColor ? ' style="color:' + secColor + ';font-weight:600;"' : '') + '>' + hwEsc(sec.name || '') + '</span></td>'
      + '<td class="lw-score-cell"><div class="lw-score-wrap" onclick="event.stopPropagation();"><div class="lw-score-bar">' + scoreBar + '</div><span class="lw-score-num" style="font-size:11px;min-width:24px;">' + (sec.score || 5) + '/10</span></div></td>'
      + '<td style="white-space:nowrap;"><span style="font-size:12px;font-weight:600;color:' + statusInfo.color + ';">' + statusInfo.label + '</span></td>'
      + '<td class="lw-info" style="font-size:12px;color:var(--text-2);">' + hwEsc(infoText) + '</td>'
      + '<td class="lw-ideal"><div class="lw-ideal-text">' + hwEsc(idealText) + '</div></td>'
      + '<td class="lw-ideal"><div class="lw-ideal-text">' + hwEsc(goalText) + '</div></td>'
      + '<td class="lw-cv-cell">' + cvCell + '</td>'
      + '<td><button class="lw-edit-btn" title="편집" onclick="event.stopPropagation();lwOpenSectionModal(' + i + ')">✏️</button></td>'
      + '</tr>';
  }).join('');

  return '<div style="display:flex;flex-direction:column;flex:1;min-height:0;">'
    + '<div class="lw-table-wrap" style="flex:1;min-height:0;">'
    + '<table class="lw-table">'
    + '<thead><tr>'
    + '<th class="lw-th-section">Section</th>'
    + '<th>Point</th>'
    + '<th>Status</th>'
    + '<th>Info</th>'
    + '<th>Ideal</th>'
    + '<th>Goal</th>'
    + '<th>Value</th>'
    + '<th></th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>';
}

function buildLwRadarSVG(scores, sections) {
  var N = 8, CX = 160, CY = 160, R = 130;
  var angles = [];
  for (var i = 0; i < N; i++) angles.push((Math.PI * 2 * i / N) - Math.PI / 2);

  // Grid rings
  var rings = '';
  for (var r = 1; r <= 10; r++) {
    var pts = angles.map(function(a) {
      return (CX + (R * r / 10) * Math.cos(a)).toFixed(1) + ',' + (CY + (R * r / 10) * Math.sin(a)).toFixed(1);
    }).join(' ');
    rings += '<polygon points="' + pts + '" fill="none" stroke="var(--border)" stroke-width="0.5"/>';
  }

  // Spokes
  var spokes = angles.map(function(a) {
    return '<line x1="' + CX + '" y1="' + CY + '" x2="' + (CX + R * Math.cos(a)).toFixed(1) + '" y2="' + (CY + R * Math.sin(a)).toFixed(1) + '" stroke="var(--border)" stroke-width="0.5"/>';
  }).join('');

  // Fill polygon
  var fillPts = angles.map(function(a, i) {
    var sc = (scores[i] || 0) / 10;
    return (CX + R * sc * Math.cos(a)).toFixed(1) + ',' + (CY + R * sc * Math.sin(a)).toFixed(1);
  }).join(' ');

  // Dots
  var dots = angles.map(function(a, i) {
    var sc = (scores[i] || 0) / 10;
    var dotColor = (sections[i] && sections[i].color) || 'var(--brand-primary)';
    return '<circle cx="' + (CX + R * sc * Math.cos(a)).toFixed(1) + '" cy="' + (CY + R * sc * Math.sin(a)).toFixed(1) + '" r="4" fill="' + dotColor + '" stroke="var(--surface)" stroke-width="1.5"/>';
  }).join('');

  // Labels
  var labels = angles.map(function(a, i) {
    var lx = CX + (R + 22) * Math.cos(a);
    var ly = CY + (R + 22) * Math.sin(a);
    var anchor = lx < CX - 5 ? 'end' : lx > CX + 5 ? 'start' : 'middle';
    var sec = sections[i] || {};
    return '<text x="' + lx.toFixed(1) + '" y="' + (ly - 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="var(--text-2)">' + (sec.emoji || '') + '</text>'
      + '<text x="' + lx.toFixed(1) + '" y="' + (ly + 9).toFixed(1) + '" text-anchor="' + anchor + '" font-size="9" fill="var(--text-3)">' + (sec.name || '') + '</text>';
  }).join('');

  return '<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:320px;">'
    + rings + spokes
    + '<polygon points="' + fillPts + '" fill="rgba(79,110,247,0.15)" stroke="var(--brand-primary)" stroke-width="1.5"/>'
    + dots + labels
    + '</svg>';
}

function buildLwSectionCard(sec, idx) {
  var statusInfo = LW_STATUS[sec.status] || LW_STATUS.maintain;
  var scoreBar = '';
  for (var s = 1; s <= 10; s++) {
    var active = s <= (sec.score || 5);
    scoreBar += '<div class="lw-score-pip' + (active ? ' active' : '') + '" onclick="event.stopPropagation();lwSetScore(' + idx + ',' + s + ')" title="' + s + '점"></div>';
  }
  var idealSnippet = sec.ideal ? '<div class="lw-card-ideal">' + hwEsc(sec.ideal.length > 60 ? sec.ideal.slice(0,60) + '…' : sec.ideal) + '</div>' : '';
  var secColor = sec.color || '';
  return '<div class="lw-section-card" id="lw-card-' + idx + '" onclick="lwOpenSectionModal(' + idx + ')" style="cursor:pointer;' + (secColor ? 'border-left:4px solid ' + secColor + ';' : '') + '">'
    + '<div class="lw-card-head">'
    + '<span class="lw-card-emoji">' + (sec.emoji || '⭐') + '</span>'
    + '<span class="lw-card-name"' + (secColor ? ' style="color:' + secColor + ';"' : '') + '>' + hwEsc(sec.name || '') + '</span>'
    + '<span class="lw-status-badge" style="color:' + statusInfo.color + ';">' + statusInfo.label + '</span>'
    + '<span class="lw-score-num">' + (sec.score || 5) + '/10</span>'
    + '<span style="font-size:11px;color:var(--text-3);margin-left:4px;">✏️</span>'
    + '</div>'
    + idealSnippet
    + '<div class="lw-score-bar" onclick="event.stopPropagation();">' + scoreBar + '</div>'
    + '</div>';
}

// ── 핵심가치 탭 ───────────────────────────
function buildLwValuesTab() {
  loadCoreValues();
  var html = '<div class="lw-values-page">';
  LW_CV_CATS.forEach(function(cat) {
    var color = LW_CV_CAT_COLORS[cat] || '#999';
    var presets = LW_CV_PRESETS.filter(function(v){ return v.cat === cat; });
    html += '<div class="lw-cv-cat" style="border-left:3px solid ' + color + ';">'
      + '<div class="lw-cv-cat-title" style="color:' + color + ';">' + cat + '</div>'
      + '<div class="lw-cv-chips">'
      + presets.map(function(v) {
          var sel = lwCoreValues.indexOf(v.id) > -1;
          return '<button class="lw-cv-chip' + (sel ? ' selected' : '') + '" style="' + (sel ? 'border-color:' + color + ';background:' + color + '18;color:' + color + ';' : '') + '" onclick="lwToggleValue(\'' + v.id + '\')" title="' + v.desc + '">'
            + (sel ? '✓ ' : '') + v.label
            + '</button>';
        }).join('')
      + '</div></div>';
  });

  var selVals = lwCoreValues.map(function(id) {
    var p = lwGetPreset(id);
    return p ? '<div class="lw-cv-sel-item"><span>' + p.label + '</span><span class="lw-cv-sel-en">' + p.en + '</span></div>' : '';
  }).join('');

  if (selVals) {
    html += '<div class="lw-cv-selected-panel">'
      + '<div class="lw-cv-selected-title">선택된 핵심가치 (' + lwCoreValues.length + '개)</div>'
      + '<div class="lw-cv-selected-list">' + selVals + '</div>'
      + '</div>';
  }
  html += '</div>';
  return html;
}

// ── 액션 함수 ─────────────────────────────
function lwSetScore(sectionIdx, score) {
  var sections = getLwSections();
  if (!sections || !sections[sectionIdx]) return;
  sections[sectionIdx].score = score;
  saveLifeWheel();
  // 점수 바 업데이트
  var card = document.getElementById('lw-card-' + sectionIdx);
  if (card) {
    var numEl = card.querySelector('.lw-score-num');
    if (numEl) numEl.textContent = score + '/10';
    var pips = card.querySelectorAll('.lw-score-pip');
    pips.forEach(function(p, i) { p.classList.toggle('active', i < score); });
  }
  // 레이더 차트 업데이트
  lwUpdateRadar();
}

function lwUpdateRadar() {
  var sections = getLwSections();
  if (!sections) return;
  var wrap = document.querySelector('.lw-radar-wrap');
  if (!wrap) return;
  var scores = sections.map(function(s) { return s.score || 5; });
  wrap.innerHTML = buildLwRadarSVG(scores, sections);
}

function lwToggleValue(id) {
  loadCoreValues();
  var idx = lwCoreValues.indexOf(id);
  if (idx > -1) lwCoreValues.splice(idx, 1);
  else lwCoreValues.push(id);
  saveCoreValues();
  lwRenderTabContent();
}

// ── 섹션 편집 모달 ────────────────────────
function lwOpenSectionModal(idx) {
  var sections = getLwSections();
  if (!sections || !sections[idx]) return;
  var sec = sections[idx];

  // 누락 필드 방어 (구버전 데이터 대응)
  sec.smart = Object.assign(
    { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' },
    sec.smart || {}
  );
  sec.ideal = sec.ideal || '';
  sec.info  = sec.info  || '';

  var statusOpts = Object.keys(LW_STATUS).map(function(k) {
    var st = LW_STATUS[k];
    return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:4px 0;">'
      + '<input type="radio" name="lw-modal-status" value="' + k + '"' + (sec.status === k ? ' checked' : '') + '>'
      + '<span style="color:' + st.color + ';font-weight:600;">' + st.label + '</span></label>';
  }).join('');

  var smartFields = [
    { key:'specific',   icon:'🎯', label:'Specific',   desc:'무엇을 어떻게 달성할 것인가?' },
    { key:'measurable', icon:'📏', label:'Measurable', desc:'어떻게 진행을 측정할 것인가?' },
    { key:'achievable', icon:'💪', label:'Achievable', desc:'현실적으로 가능한 목표인가?' },
    { key:'relevant',   icon:'🔗', label:'Relevant',   desc:'삶의 방향과 연결되어 있는가?' },
    { key:'timeBound',  icon:'⏰', label:'Time-bound', desc:'언제까지 달성할 것인가?' },
  ];
  var smartHtml = smartFields.map(function(f) {
    return '<div class="smart-field">'
      + '<div class="smart-field-header"><span class="smart-icon">' + f.icon + '</span>'
      + '<span class="smart-label">' + f.label + '</span>'
      + '<span class="smart-desc">' + f.desc + '</span></div>'
      + '<textarea class="smart-textarea" id="lw-smart-' + f.key + '" placeholder="여기에 입력...">' + hwEsc(sec.smart[f.key] || '') + '</textarea>'
      + '</div>';
  }).join('');

  var html = '<div class="lw-modal-overlay" id="lw-modal-overlay" onclick="lwModalOverlayClick(event)">'
    + '<div class="lw-modal smart-modal">'
    + '<div class="lw-modal-header">'
    + '<span>' + (sec.emoji || '⭐') + ' ' + hwEsc(sec.name || '') + ' 편집</span>'
    + '<button class="lw-modal-close" onclick="lwCloseSectionModal()">✕</button>'
    + '</div>'
    + '<div class="smart-fields-wrap">'
    + '<div style="display:flex;gap:10px;">'
    + '<div style="display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-3);">이모지</label>'
    + '<input id="lw-modal-emoji" type="text" value="' + hwEsc(sec.emoji || '') + '" maxlength="4"'
    + ' style="width:52px;text-align:center;font-size:20px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text-1);padding:4px;">'
    + '</div>'
    + '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-3);">Section</label>'
    + '<input id="lw-modal-name" type="text" value="' + hwEsc(sec.name || '') + '"'
    + ' style="width:100%;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text-1);padding:7px 10px;font-size:13px;font-family:inherit;box-sizing:border-box;">'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-3);">색상</label>'
    + '<div style="display:flex;gap:5px;align-items:center;">'
    + '<input id="lw-modal-color" type="color" value="' + (sec.color || '#4f6ef7') + '"'
    + ' oninput="var h=document.getElementById(\'lw-modal-color-hex\');if(h)h.value=this.value.toUpperCase();"'
    + ' style="width:38px;height:38px;padding:2px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer;flex-shrink:0;">'
    + '<input id="lw-modal-color-hex" type="text" value="' + (sec.color ? sec.color.toUpperCase() : '#4F6EF7') + '" maxlength="7" placeholder="#E64A19"'
    + ' oninput="var v=this.value.trim();if(/^#([0-9a-fA-F]{6})$/.test(v)){document.getElementById(\'lw-modal-color\').value=v;}"'
    + ' style="width:84px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text-1);padding:7px 8px;font-size:13px;font-family:inherit;box-sizing:border-box;text-transform:uppercase;">'
    + '</div>'
    + '</div></div>'
    + '<div style="display:flex;flex-direction:column;gap:4px;">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-3);">Status</label>'
    + '<div style="display:flex;gap:16px;flex-wrap:wrap;">' + statusOpts + '</div>'
    + '</div>'
    + '<div class="smart-field">'
    + '<div class="smart-field-header"><span class="smart-icon">📝</span><span class="smart-label">Info</span><span class="smart-desc">이 영역에 대한 간단한 설명</span></div>'
    + '<textarea class="smart-textarea" id="lw-info" placeholder="이 영역이 무엇을 의미하는지 간단히 적어보세요...">' + hwEsc(sec.info || '') + '</textarea>'
    + '</div>'
    + smartHtml
    + '<div class="smart-field">'
    + '<div class="smart-field-header"><span class="smart-icon">🏁</span><span class="smart-label">Goal</span><span class="smart-desc">이 영역에서 이루고 싶은 것</span></div>'
    + '<textarea class="smart-textarea" id="lw-smart-finalGoal" placeholder="이 영역에서 궁극적으로 달성하고 싶은 모습을 적어보세요...">' + hwEsc(sec.smart.finalGoal || '') + '</textarea>'
    + '</div>'
    + '<div class="smart-field">'
    + '<div class="smart-field-header"><span class="smart-icon">✨</span><span class="smart-label">Ideal</span><span class="smart-desc">이 영역이 가장 이상적일 때의 모습</span></div>'
    + '<textarea class="smart-textarea" id="lw-ideal" placeholder="이 영역이 가장 이상적일 때의 모습을 적어보세요...">' + hwEsc(sec.ideal || '') + '</textarea>'
    + '</div>'
    + '<div class="smart-final-field" id="lw-modal-cv-block">' + lwBuildModalCvBlock(idx) + '</div>'
    + '</div>'
    + '<div class="lw-modal-footer">'
    + '<button class="lw-modal-cancel" onclick="lwCloseSectionModal()">취소</button>'
    + '<button class="lw-modal-save" onclick="lwSaveSectionModal(' + idx + ')">저장</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  var existing = document.getElementById('lw-modal-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  setTimeout(function() {
    var nameInput = document.getElementById('lw-modal-name');
    if (nameInput) nameInput.focus();
  }, 50);
}

// 섹션 편집 모달 닫기
function lwCloseSectionModal() {
  var ol = document.getElementById('lw-modal-overlay');
  if (ol) ol.remove();
  // 핵심가치 연결 변경이 표에 반영되도록 갱신
  if (typeof lwRenderTabContent === 'function') lwRenderTabContent();
}

// 오버레이(배경) 클릭 시 닫기
function lwModalOverlayClick(e) {
  if (e && e.target && e.target.id === 'lw-modal-overlay') lwCloseSectionModal();
}

// 섹션 편집 내용 저장
function lwSaveSectionModal(idx) {
  var sections = getLwSections();
  if (!sections || !sections[idx]) { lwCloseSectionModal(); return; }
  var sec = sections[idx];

  var emojiEl = document.getElementById('lw-modal-emoji');
  var nameEl  = document.getElementById('lw-modal-name');
  if (emojiEl && emojiEl.value.trim()) sec.emoji = emojiEl.value.trim();
  if (nameEl  && nameEl.value.trim())  sec.name  = nameEl.value.trim();

  var statusEl = document.querySelector('input[name="lw-modal-status"]:checked');
  if (statusEl) sec.status = statusEl.value;

  var colorHexEl = document.getElementById('lw-modal-color-hex');
  var colorEl = document.getElementById('lw-modal-color');
  if (colorHexEl && /^#([0-9a-fA-F]{6})$/.test(colorHexEl.value.trim())) {
    sec.color = colorHexEl.value.trim().toUpperCase();
  } else if (colorEl) {
    sec.color = colorEl.value;
  }

  sec.smart = sec.smart || {};
  ['specific','measurable','achievable','relevant','timeBound','finalGoal'].forEach(function(k) {
    var el = document.getElementById('lw-smart-' + k);
    if (el) sec.smart[k] = el.value;
  });

  var idealEl = document.getElementById('lw-ideal');
  if (idealEl) sec.ideal = idealEl.value;

  var infoEl = document.getElementById('lw-info');
  if (infoEl) sec.info = infoEl.value;

  saveLifeWheel();
  if (typeof lwSyncToMandalart === 'function') lwSyncToMandalart(idx);
  lwCloseSectionModal();
  if (typeof lwRenderTabContent === 'function') lwRenderTabContent();
}
