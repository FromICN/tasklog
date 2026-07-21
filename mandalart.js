// ============================================
//  🎯 만다라트 (Mandala Art)
//  - 외부 3×3 그리드 × 내부 3×3 그리드 = 9×9 전체
// ============================================

const MANDALART_KEY = 'my-tasklog-mandalart';
var mandalarts = [];
var currentMdtYear = null;
var mdtSelectedSgId = null;
var mdtSelectedActId = null;
var mdtCalView = {}; // 습관형 캘린더 보기 월 상태: 'year-sgId-actId' -> {y, m}
var mdtCalMode = {}; // 습관형 캘린더 보기 모드: 'year-sgId-actId' -> 'month' | 'week'
var mdtCalWeekStart = {}; // 습관형 주간 보기 기준(일요일) 타임스탬프: 'year-sgId-actId' -> number

// SMART 목표 필드 정의
var MDT_SMART_FIELDS = [
  { key:'specific',   label:'Specific',   icon:'🎯', desc:'구체적으로 무엇을 달성할 건가요?' },
  { key:'measurable', label:'Measurable', icon:'📏', desc:'어떻게 측정/확인할 수 있나요?' },
  { key:'achievable', label:'Achievable', icon:'💪', desc:'실현 가능한 목표인가요?' },
  { key:'relevant',   label:'Relevant',   icon:'🔗', desc:'삶의 방향과 연관되어 있나요?' },
  { key:'timeBound',  label:'Time-bound', icon:'⏰', desc:'언제까지 달성할 건가요?' }
];

function escMdt(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 색상 유틸: hex → 명도 지정(HSL) ──
function mdtHexToHsl(hex) {
  hex = String(hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function(c){ return c + c; }).join('');
  if (hex.length < 6) hex = '888888';
  var r = parseInt(hex.substr(0,2),16)/255,
      g = parseInt(hex.substr(2,2),16)/255,
      b = parseInt(hex.substr(4,2),16)/255;
  var max = Math.max(r,g,b), min = Math.min(r,g,b), h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    var d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch (max) {
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h /= 6;
  }
  return { h: h*360, s: s*100, l: l*100 };
}
// 명도(lightness) 퍼센트를 지정한 색상 반환 (#1: 완료 셀 배경 = 테마컬러 명도 70%)
function mdtLighten(hex, lPct) {
  var hsl = mdtHexToHsl(hex);
  return 'hsl(' + Math.round(hsl.h) + ',' + Math.round(hsl.s) + '%,' + lPct + '%)';
}

// ── 만다라트 셀 텍스트 자동 맞춤 (#8: 칸 초과 시 글자 축소, 최대 3줄) ──
function mdtAutoFitText(scope) {
  var root = scope || document;
  var els = root.querySelectorAll('.mdt-fit-text');
  els.forEach(function(el) {
    var base = parseFloat(el.getAttribute('data-fit-base')) || 13;
    var parent = el.parentNode;
    var min = 8, size = base, guard = 0;
    el.style.fontSize = size + 'px';
    function overflows() {
      // 자체(3줄 초과/가로 초과) 또는 부모 칸 높이 초과
      if (el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5) return true;
      if (parent && parent.scrollHeight > parent.clientHeight + 0.5) return true;
      return false;
    }
    while (size > min && guard < 28 && overflows()) {
      size -= 0.5; el.style.fontSize = size + 'px'; guard++;
    }
  });
}

// ── 액션카드 저장 상태 추적 (#4: 저장 버튼 클릭 시에만 영구 저장) ──
var mdtDirtyCards = {};
function mdtCardKey(y, s, a) { return y + '-' + s + '-' + a; }
function markMdtDirty(y, s, a) {
  mdtDirtyCards[mdtCardKey(y, s, a)] = true;
  var card = document.getElementById('mdt-act-card-' + y + '-' + s + '-' + a);
  if (card) card.classList.add('mdt-card-dirty');
}

function defaultMdtQuarters() {
  return [
    { done:false, value:0 },
    { done:false, value:0 },
    { done:false, value:0 },
    { done:false, value:0 }
  ];
}

// ── 데이터 ──

function loadMandalarts() {
  var saved = localStorage.getItem(MANDALART_KEY);
  if (saved) {
    try {
      mandalarts = JSON.parse(saved);
      // 구버전 호환: action에 trackingType/successThreshold/habitLog 없으면 추가
      mandalarts.forEach(function(m) {
        (m.subGoals || []).forEach(function(sg) {
          (sg.actions || []).forEach(function(a) {
            if (!a.trackingType)     a.trackingType = 'task';
            if (a.successThreshold === undefined) a.successThreshold = 80;
            if (!a.habitLog)         a.habitLog = {};
            if (a.annualTarget === undefined) a.annualTarget = 0;
            if (a.annualUnit === undefined)   a.annualUnit = '';
            if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
          });
        });
      });
    }
    catch(e) { mandalarts = []; }
  }
  if (!currentMdtYear && mandalarts.length > 0)
    currentMdtYear = Math.max.apply(null, mandalarts.map(function(m){ return m.year; }));
}

function saveMandalarts() {
  localStorage.setItem(MANDALART_KEY, JSON.stringify(mandalarts));
}

function getMdt(year) {
  return mandalarts.find(function(m){ return m.year === year; }) || null;
}

// 연도 데이터만 생성/보장 (렌더링 없음 — 전역 연도 연결용)
// Life Wheel SECTION을 가져와 subGoal 구성 (LifeWheel → Mandalart 연결)
function ensureMdtData(year) {
  year = parseInt(year);
  if (isNaN(year) || year < 2000 || year > 2100) return null;
  var existing = getMdt(year);
  if (existing) return existing;
  var EMOJIS = ['🎯','💼','🏃','🧘','📚','🔧','🎓','🎸','🎮'];
  var COLORS = ['#e74c3c','#3498db','#f39c12','#2ecc71','#16a085','#e67e22','#8e44ad','#1abc9c'];
  // Life Wheel SECTION이 있으면 이름/이모지 자동 연동
  var lwSecs = null;
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  if (typeof getLwYear === 'function') {
    var lwYr = getLwYear(year);
    if (lwYr && lwYr.sections) lwSecs = lwYr.sections;
  }
  var m = {
    id: Date.now(), year: year,
    coreGoal: { text: year + '년 핵심 목표', emoji: '🎯', connections: ['','','',''] },
    subGoals: Array.from({length:8}, function(_, i) {
      var secName  = lwSecs && lwSecs[i] ? lwSecs[i].name  : ('Section'+(i+1));
      var secEmoji = lwSecs && lwSecs[i] ? lwSecs[i].emoji : EMOJIS[i+1];
      var secColor = lwSecs && lwSecs[i] && lwSecs[i].color ? lwSecs[i].color : COLORS[i];
      return {
        id: i+1, text: secName, emoji: secEmoji,
        color: secColor, badge: secName,
        smart: { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'' },
        notes: '',
        actions: Array.from({length:8}, function(_, j) {
          return { id: j+1, text: '', completed: false, trackingType: 'task', successThreshold: 80, habitLog: {}, annualTarget: 0, annualUnit: '', quarters: defaultMdtQuarters() };
        })
      };
    })
  };
  mandalarts.push(m); saveMandalarts();
  return m;
}

function createMdt(year) {
  var m = ensureMdtData(year);
  if (!m) { alert('올바른 연도를 입력하세요.'); return; }
  currentMdtYear = m.year; renderMdtView();
}

function promptNewMdt() {
  var y = prompt('Mandalart를 생성할 연도:', new Date().getFullYear());
  if (!y) return;
  if (typeof appCreateYear === 'function') appCreateYear(parseInt(y, 10));
  else createMdt(y);
}

// 전역 연도(appSetYear)로 라우팅 → 모든 모듈 함께 이동
function switchMdtYear(year) {
  if (typeof appSetYear === 'function') { appSetYear(year); return; }
  currentMdtYear = year; renderMdtView();
}

// ── 렌더링 ──

// 외부 3×3 그리드: MDT_MAP[i] = subGoals 배열 인덱스 (null = 핵심목표)
var MDT_MAP = [0,1,2,3,null,4,5,6,7];
// 내부 3×3 그리드: ACT_MAP[i] = actions 배열 인덱스 (null = 중앙 = 세부목표명)
var ACT_MAP = [0,1,2,3,null,4,5,6,7];

function handleMdtYearSelect(val) {
  if (val === '__new__') promptNewMdt();
  else if (val === '__delete__') {
    if (typeof appDeleteCurrentYear === 'function') appDeleteCurrentYear();
    else renderMdtView();
  }
  else switchMdtYear(parseInt(val));
}

function renderMdtView() {
  loadMandalarts();
  mdtDirtyCards = {};
  mdtSelectedSgId = null;
  var content = document.getElementById('page-content');
  if (!content) return;

  // Life Wheel 섹션(이름·이모지·색상) 동기화 — Life Wheel이 원천
  if (typeof lwSyncToMandalart === 'function' && currentMdtYear) {
    try {
      if (typeof loadLifeWheel === 'function') loadLifeWheel();
      if (typeof lwCurrentYear !== 'undefined') lwCurrentYear = currentMdtYear;
      lwSyncToMandalart();
    } catch (e) {}
  }

  // 연도 선택 드롭박스
  var yearSelHtml = '';
  if (mandalarts.length > 0) {
    var opts = mandalarts.map(function(m){ return m.year; })
      .sort(function(a,b){ return b-a; })
      .map(function(y){
        return '<option value="'+y+'"'+(y===currentMdtYear?' selected':'')+'>'+y+'년</option>';
      }).join('');
    opts += '<option value="__new__">+ 새 연도 추가</option>';
    opts += '<option value="__delete__">🗑 현재 연도 삭제</option>';
    yearSelHtml = '<select class="year-select" onchange="handleMdtYearSelect(this.value)">'+opts+'</select>';
  }
  var yearSlot = document.getElementById('topbar-mdt-year-slot');
  if (yearSlot) yearSlot.innerHTML = yearSelHtml;

  if (!currentMdtYear || !getMdt(currentMdtYear)) {
    content.innerHTML = '<div class="mdt-page">'
      + renderMdtEmpty()
      + '</div>';
    return;
  }
  content.innerHTML = '<div class="mdt-page">'
    + renderMdtGrid(getMdt(currentMdtYear))
    + '</div>';
  setTimeout(function(){ mdtAutoFitText(); }, 0);
}

function renderMdtEmpty() {
  return '<div class="mdt-empty">'
    + '<div class="mdt-empty-icon">🎯</div>'
    + '<div class="mdt-empty-title">Mandalart 시작하기</div>'
    + '<div class="mdt-empty-desc">연도별 목표를 Mandalart로 체계적으로 관리하세요.<br>Section 1개 + Project 8개 × 실행항목 8개</div>'
    + '<button class="mdt-create-btn" onclick="promptNewMdt()">+ 새 Mandalart 만들기</button>'
    + '</div>';
}

function renderMdtLeftPanel(m) {
  if (!m.quarterlyNotes) m.quarterlyNotes = ['','','',''];
  var labels = ['1분기','2분기','3분기','4분기'];
  var qHtml = labels.map(function(q, i) {
    return '<div class="mdt-quarter-box">'
      + '<div class="mdt-quarter-label">'+q+'</div>'
      + '<textarea class="mdt-quarter-input" placeholder="목표를 입력하세요..."'
      + ' onblur="saveQuarterNote('+m.year+','+i+',this.value)">'
      + escMdt(m.quarterlyNotes[i] || '') + '</textarea>'
      + '</div>';
  }).join('');
  return '<div class="mdt-left-panel">'
    + '<div class="mdt-year-display">'
    +   '<div class="mdt-year-number">'+m.year+'</div>'
    +   '<div class="mdt-year-subtitle">만다라트 신년계획표</div>'
    + '</div>'
    + '<div class="mdt-deco-icons">✿ ✿ ✿ ✿</div>'
    + '<div class="mdt-quarter-list">'+qHtml+'</div>'
    + '</div>';
}

function saveQuarterNote(year, idx, text) {
  var m = getMdt(year); if (!m) return;
  if (!m.quarterlyNotes) m.quarterlyNotes = ['','','',''];
  m.quarterlyNotes[idx] = text;
  saveMandalarts();
}

function renderMdtGrid(m) {
  var grid = '<div class="mdt-main-grid-wrap"><div class="mdt-grid">';
  for (var i = 0; i < 9; i++) {
    var idx = MDT_MAP[i];
    grid += (idx === null) ? renderCoreCard(m) : renderSubGoalCard(m, m.subGoals[idx]);
  }
  grid += '</div></div>';
  var perf = '<div class="mdt-perf-panel" id="mdt-perf-panel">' + buildMdtPerfPanelHtml(m.year) + '</div>';
  return '<div class="mdt-body">' + grid + perf + '</div>';
}

// ── 세부목표 카드 (외부 1칸 = 내부 3×3) ──
function renderSubGoalCard(m, sg) {
  var done  = sg.actions.filter(function(a){ return a.completed; }).length;
  var total = sg.actions.length;
  var color = sg.color;

  var cells = ACT_MAP.map(function(actIdx) {
    if (actIdx === null) {
      // 중앙 셀: Section 이름 + section별 최종목표 표시 (#2)
      var fg = (sg.smart && sg.smart.finalGoal) ? sg.smart.finalGoal : '';
      return '<div class="mdt-inner-center" style="background:'+color+'28;border-bottom:2px solid '+color+'55;cursor:pointer;" data-prog="'+m.year+'-'+sg.id+'" onclick="event.stopPropagation();openSgDetail('+m.year+','+sg.id+')" title="'+escMdt(sg.text)+' 관리 페이지 열기">'
        + '<div class="mdt-ic-name mdt-fit-text" data-fit-base="12" style="color:'+color+';font-weight:700;">'+escMdt(sg.text)+'</div>'
        + (fg ? '<div class="mdt-ic-final mdt-fit-text" data-fit-base="10">'+escMdt(fg)+'</div>' : '')
        + '</div>';
    }
    var act = sg.actions[actIdx];
    if (!act) return '<div class="mdt-inner-cell"></div>';
    // #1: 동그라미/다이아 아이콘 제거, 텍스트만 표시. 완료 시 테마컬러 명도70% 배경.
    var doneCls = act.completed ? ' mdt-proj-done' : '';
    var doneStyle = act.completed ? ('background:'+mdtLighten(color,70)+';border-color:'+mdtLighten(color,60)+';') : '';
    return '<div class="mdt-inner-cell mdt-proj-cell'+doneCls+'" style="'+doneStyle+'" onclick="event.stopPropagation();selectMdtAction('+m.year+','+sg.id+','+act.id+')">'
      + '<span class="mdt-inner-text mdt-fit-text'+(act.text?'':' mdt-cell-empty')+(act.completed?' mdt-cell-done-text':'')+'" data-fit-base="12" data-year="'+m.year+'" data-sg="'+sg.id+'" data-act="'+act.id+'">'
      +   escMdt(act.text)
      + '</span>'
      + '</div>';
  }).join('');

  return '<div class="mdt-outer-card" id="mdt-card-'+m.year+'-'+sg.id+'"'
    + ' style="border-color:'+color+'55;"'
    + ' onclick="onMdtCardClick(event,'+m.year+','+sg.id+')">'
    + '<div class="mdt-inner-grid">'+cells+'</div>'
    + '</div>';
}

// ── 핵심목표 카드 (내부 3×3 = 세부목표명 주변 + 핵심목표 중앙) ──
function renderCoreCard(m) {
  var cells = MDT_MAP.map(function(sgIdx) {
    if (sgIdx === null) {
      return '<div class="mdt-inner-center mdt-core-center">'
        + '<div class="mdt-ic-emoji" style="font-size:22px;">'+(m.coreGoal.emoji||'🎯')+'</div>'
        + '<div class="mdt-core-text mdt-fit-text" data-fit-base="13" data-year="'+m.year+'">'
        + escMdt(m.coreGoal.text)+'</div>'
        + '</div>';
    }
    var sg = m.subGoals[sgIdx];
    if (!sg) return '<div class="mdt-inner-cell"></div>';
    return '<div class="mdt-inner-cell mdt-core-sg-ref"'
      + ' style="background:'+sg.color+'18;border-bottom:2px solid '+sg.color+'55;"'
      + ' onclick="event.stopPropagation();openSgDetail('+m.year+','+sg.id+')" title="'+escMdt(sg.text)+' 관리 페이지 열기">'
      + '<div class="mdt-ic-emoji" style="font-size:20px;">'+sg.emoji+'</div>'
      + '<div class="mdt-ic-name mdt-fit-text" data-fit-base="11" style="color:'+sg.color+';">'+escMdt(sg.text)+'</div>'
      + '</div>';
  }).join('');

  return '<div class="mdt-outer-card mdt-core-outer" id="mdt-card-'+m.year+'-core">'
    + '<div class="mdt-inner-grid">'+cells+'</div>'
    + '</div>';
}

// ── 실적 관리 패널 (우측) ──

function selectMdtSection(year, sgId) {
  mdtSelectedSgId = sgId;
  mdtSelectedActId = null;
  highlightSelectedSection(year, sgId);
  renderMdtPerfPanel(year);
}

function selectMdtAction(year, sgId, actId) {
  mdtSelectedSgId = sgId;
  mdtSelectedActId = actId;
  highlightSelectedSection(year, sgId);
  renderMdtPerfPanel(year);
}

function clearMdtSection(year) {
  mdtSelectedSgId = null;
  mdtSelectedActId = null;
  highlightSelectedSection(year, null);
  renderMdtPerfPanel(year);
}

function highlightSelectedSection(year, sgId) {
  document.querySelectorAll('.mdt-outer-card').forEach(function(card) {
    card.classList.remove('mdt-section-active');
  });
  if (sgId !== null && sgId !== undefined) {
    var el = document.getElementById('mdt-card-' + year + '-' + sgId);
    if (el) el.classList.add('mdt-section-active');
  }
}

function renderMdtPerfPanel(year) {
  var panel = document.getElementById('mdt-perf-panel');
  if (panel) panel.innerHTML = buildMdtPerfPanelHtml(year);
}

function buildMdtPerfPanelHtml(year) {
  var m = getMdt(year); if (!m) return '';
  if (mdtSelectedSgId !== null && mdtSelectedSgId !== undefined) {
    var sg = m.subGoals.find(function(s){ return s.id === mdtSelectedSgId; });
    if (sg) return buildMdtPerfSectionHtml(m, sg);
  }
  return buildMdtPerfDashboard(m);
}

function calcSgPerf(sg) {
  var achActs = sg.actions.filter(function(a){ return a.trackingType !== 'habit'; });
  var totalTarget = 0, totalSum = 0;
  var qStats = [0,0,0,0];
  achActs.forEach(function(a) {
    if (!Array.isArray(a.quarters)) a.quarters = defaultMdtQuarters();
    totalTarget += (+a.annualTarget || 0);
    a.quarters.forEach(function(q, i) {
      totalSum += (+q.value || 0);
      if (q.done) qStats[i]++;
    });
  });
  var pct = totalTarget > 0 ? Math.min(100, Math.round(totalSum / totalTarget * 100)) : 0;
  var done = sg.actions.filter(function(a){ return a.completed; }).length;
  return { pct: pct, sum: totalSum, target: totalTarget, qStats: qStats, achCount: achActs.length, done: done, total: sg.actions.length };
}

function buildMdtPerfDashboard(m) {
  var cardsHtml = m.subGoals.map(function(sg) {
    var perf = calcSgPerf(sg);
    var qDots = perf.qStats.map(function(c, i) {
      var on = perf.achCount > 0 && c >= perf.achCount;
      return '<span class="mdt-perf-qdot' + (on ? ' on' : '') + '" style="' + (on ? ('background:' + sg.color + ';') : '') + '" title="' + (i + 1) + '분기"></span>';
    }).join('');
    return '<div class="mdt-perf-dash-card" style="border-left:3px solid ' + sg.color + ';" onclick="selectMdtSection(' + m.year + ',' + sg.id + ')">'
      + '<div class="mdt-perf-dash-head">'
      +   '<span class="mdt-perf-dash-emoji">' + sg.emoji + '</span>'
      +   '<span class="mdt-perf-dash-name">' + escMdt(sg.text) + '</span>'
      +   '<span class="mdt-perf-dash-prog">' + perf.done + '/' + perf.total + '</span>'
      + '</div>'
      + '<div class="mdt-perf-dash-bar"><div class="mdt-perf-dash-fill" style="width:' + perf.pct + '%;background:' + sg.color + ';"></div></div>'
      + '<div class="mdt-perf-dash-foot">'
      +   '<span class="mdt-perf-dash-pct">연간 ' + perf.pct + '%</span>'
      +   '<span class="mdt-perf-dash-qdots">' + qDots + '</span>'
      + '</div>'
      + '</div>';
  }).join('');

  // #3: 전체실적 창 최상단 연간 목표 입력 (만다라트 중앙에 표시)
  var annualHtml = '<div class="mdt-perf-annual">'
    + '<label class="mdt-perf-annual-label">🎯 ' + m.year + ' 연간 목표</label>'
    + '<input class="mdt-perf-annual-inp" type="text" value="' + escMdt(m.coreGoal.text || '') + '"'
    + ' placeholder="올해의 핵심 목표를 입력하세요..." onchange="saveMdtAnnualGoal(' + m.year + ',this.value)">'
    + '</div>';

  return '<div class="mdt-perf-dash">'
    + annualHtml
    + '<div class="mdt-perf-dash-title">📊 전체 실적 요약</div>'
    + '<div class="mdt-perf-dash-list">' + cardsHtml + '</div>'
    + '</div>';
}

// #3: 연간 목표 저장 + 만다라트 중앙 셀 즉시 반영
function saveMdtAnnualGoal(year, val) {
  var m = getMdt(year); if (!m) return;
  if (!m.coreGoal) m.coreGoal = { text:'', emoji:'🎯', connections:['','','',''] };
  m.coreGoal.text = (val || '').trim();
  saveMandalarts();
  var textEl = document.querySelector('.mdt-core-text[data-year="' + year + '"]');
  if (textEl) {
    textEl.textContent = m.coreGoal.text;
    mdtAutoFitText();
  }
}

function buildMdtPerfSectionHtml(m, sg) {
  if (!sg.smart) sg.smart = { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' };
  var smartFilled = MDT_SMART_FIELDS.filter(function(f){ return sg.smart[f.key]; }).length;
  var hasFinal = !!sg.smart.finalGoal;
  var smartColor = (smartFilled===5&&hasFinal) ? 'var(--success)' : smartFilled>0 ? 'var(--warning)' : 'var(--text-2)';
  var smartLabel = '&#127919; SMART ' + smartFilled + '/5' + (hasFinal ? ' &#10003;' : '');
  var done  = sg.actions.filter(function(a){ return a.completed; }).length;
  var total = sg.actions.length;

  var html = '<div class="mdt-perf-section">'
    + '<div class="mdt-perf-section-head">'
    +   '<button class="mdt-perf-back" onclick="clearMdtSection(' + m.year + ')">&#8592; 전체</button>'
    +   '<span class="mdt-perf-section-title" style="color:' + sg.color + ';">' + sg.emoji + ' ' + escMdt(sg.text) + '</span>'
    +   '<span class="mdt-perf-section-prog">' + done + '/' + total + '</span>'
    +   '<button class="mdt-smart-open-btn" id="mdt-smart-btn-' + sg.id + '"'
    +     ' onclick="openMdtIdeal(' + m.year + ',' + sg.id + ')" style="color:var(--brand-primary);">&#127919; 목표</button>'
    + '</div>';

  html += '<div class="mdt-act-cards" id="mdt-act-cards-' + sg.id + '">';

  sg.actions.forEach(function(a) {
    if (!a.trackingType)     a.trackingType = 'task';
    if (!a.successThreshold) a.successThreshold = 80;
    if (!a.habitLog)         a.habitLog = {};
    if (a.annualTarget === undefined) a.annualTarget = 0;
    if (a.annualUnit === undefined)   a.annualUnit = '';
    if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
    if (mdtSelectedActId !== null && mdtSelectedActId !== undefined && a.id !== mdtSelectedActId) return;
    html += buildActionCard(m, sg, a);
  });

  html += '</div></div>';
  return html;
}

// ── 상호작용 ──

function onMdtCardClick(event, year, sgId) {
  if (event.target.closest('[contenteditable="true"]')) return;
  if (event.target.closest('.mdt-inner-cb')) return;
  if (event.target.closest('button')) return;
  selectMdtSection(year, sgId);
}

function toggleMdtAction(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var act = sg.actions.find(function(a){ return a.id === actId; }); if (!act) return;
  act.completed = !act.completed;
  // #4: 메모리만 반영 — 저장 버튼 클릭 시 영구 저장 + 그리드 배경 갱신
  markMdtDirty(year, sgId, actId);
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, act);
}

function saveMdtActText(el) {
  var m = getMdt(+el.dataset.year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === +el.dataset.sg; }); if (!sg) return;
  var act = sg.actions.find(function(a){ return a.id === +el.dataset.act; });
  if (act) act.text = el.textContent.trim();
  // #4: 메모리만 반영 (저장 버튼 클릭 시 영구 저장)
  markMdtDirty(+el.dataset.year, +el.dataset.sg, +el.dataset.act);
}

function saveMdtSgText(el) {
  var m = getMdt(+el.dataset.year); if (!m) return;
  if (el.dataset.core) {
    m.coreGoal.text = el.textContent.trim();
  } else {
    var sg = m.subGoals.find(function(s){ return s.id === +el.dataset.sg; });
    if (sg) sg.text = el.textContent.trim();
  }
  saveMandalarts();
}

function saveMdtConn(el) {
  var m = getMdt(+el.dataset.year); if (!m) return;
  if (!m.coreGoal.connections) m.coreGoal.connections = ['','','',''];
  m.coreGoal.connections[+el.dataset.conn] = el.textContent.trim();
  saveMandalarts();
}

// ── 셀 편집 모달 ──

function buildCellModal(headerHtml, currentText, placeholder) {
  var ol = document.createElement('div');
  ol.id = 'mdt-cell-modal-overlay';
  ol.className = 'mdt-cedit-overlay';
  ol.innerHTML =
    '<div class="mdt-cedit-modal">'
    + '<div class="mdt-cedit-header">'
    +   '<div class="mdt-cedit-ctx">'+headerHtml+'</div>'
    +   '<button class="mdt-cedit-close" onclick="document.getElementById(\'mdt-cell-modal-overlay\').remove()">&#10005;</button>'
    + '</div>'
    + '<div class="mdt-cedit-body">'
    +   '<input id="mdt-cedit-input" class="mdt-cedit-input" type="text"'
    +     ' placeholder="'+placeholder+'" autocomplete="off">'
    +   '<div class="mdt-cedit-hint">Enter로 저장 &nbsp;·&nbsp; Esc로 닫기</div>'
    + '</div>'
    + '<div class="mdt-cedit-footer">'
    +   '<button class="mdt-cedit-cancel-btn" id="mdt-cedit-cancel">취소</button>'
    +   '<button class="mdt-cedit-save-btn" id="mdt-cedit-save">저장</button>'
    + '</div>'
    + '</div>';
  var existing = document.getElementById('mdt-cell-modal-overlay');
  if (existing) existing.remove();
  document.body.appendChild(ol);
  var input = document.getElementById('mdt-cedit-input');
  input.value = currentText || '';
  setTimeout(function(){ input.focus(); input.select(); }, 30);
  return { overlay: ol, input: input };
}

function openMdtCellEdit(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var act = sg.actions.find(function(a){ return a.id === actId; }); if (!act) return;

  var badge = '<span class="mdt-cedit-sg-badge" style="background:'+sg.color+'22;color:'+sg.color+';">'
    + sg.emoji+' '+escMdt(sg.text)+'</span>';
  var modal = buildCellModal(badge, act.text, '실행항목을 입력하세요...');
  var ol = modal.overlay, input = modal.input;

  function doSave() {
    act.text = input.value.trim();
    saveMandalarts();
    var textEl = document.querySelector('.mdt-inner-text[data-year="'+year+'"][data-sg="'+sgId+'"][data-act="'+actId+'"]');
    if (textEl) {
      textEl.textContent = act.text;
      textEl.classList.toggle('mdt-cell-empty', !act.text);
    }
    // 진행률 업데이트
    var done = sg.actions.filter(function(a){ return a.completed; }).length;
    var progEl = document.getElementById('mdt-prog-'+year+'-'+sgId);
    if (progEl) progEl.textContent = done+'/'+sg.actions.length;
    ol.remove();
  }
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { ol.remove(); }
  });
  document.getElementById('mdt-cedit-save').onclick   = doSave;
  document.getElementById('mdt-cedit-cancel').onclick = function(){ ol.remove(); };
  ol.addEventListener('click', function(e){ if (e.target === ol) ol.remove(); });
}

function openMdtCoreEdit(year) {
  var m = getMdt(year); if (!m) return;

  var badge = '<span class="mdt-cedit-sg-badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;">🎯 핵심목표</span>';
  var modal = buildCellModal(badge, m.coreGoal.text, year+'년 핵심목표를 입력하세요...');
  var ol = modal.overlay, input = modal.input;

  function doSave() {
    m.coreGoal.text = input.value.trim();
    saveMandalarts();
    var textEl = document.querySelector('.mdt-core-text[data-year="'+year+'"]');
    if (textEl) textEl.textContent = m.coreGoal.text;
    ol.remove();
  }
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { ol.remove(); }
  });
  document.getElementById('mdt-cedit-save').onclick   = doSave;
  document.getElementById('mdt-cedit-cancel').onclick = function(){ ol.remove(); };
  ol.addEventListener('click', function(e){ if (e.target === ol) ol.remove(); });
}

// ── 실적 관리 (인라인 테이블) ──

var MDT_AGENCY_COLORS = {
  '자체':  { bg:'rgba(60,90,55,0.75)',  text:'#a3d99a' },
  '감사원':{ bg:'rgba(120,65,20,0.75)', text:'#f0ac6a' },
  '기후부':{ bg:'rgba(20,90,110,0.75)', text:'#80cce8' },
  '권익위':{ bg:'rgba(25,65,110,0.75)', text:'#80aaec' },
  '국조실':{ bg:'rgba(90,50,100,0.75)', text:'#d0a0ec' },
};
var MDT_AGENCY_PAL = [
  {bg:'rgba(60,90,55,0.75)', text:'#a3d99a'},
  {bg:'rgba(120,65,20,0.75)',text:'#f0ac6a'},
  {bg:'rgba(20,90,110,0.75)',text:'#80cce8'},
  {bg:'rgba(25,65,110,0.75)',text:'#80aaec'},
  {bg:'rgba(90,50,100,0.75)',text:'#d0a0ec'},
  {bg:'rgba(30,90,70,0.75)', text:'#80d4b8'},
];

function getMdtAgencyColor(name) {
  if (MDT_AGENCY_COLORS[name]) return MDT_AGENCY_COLORS[name];
  var h=0; for (var i=0;i<name.length;i++) h+=name.charCodeAt(i);
  return MDT_AGENCY_PAL[h % MDT_AGENCY_PAL.length];
}

function openSgDetail(year, sgId) {
  var m  = getMdt(year);
  var sg = m ? m.subGoals.find(function(s){ return s.id === sgId; }) : null;
  if (!sg) return;
  sg.actions.forEach(function(a) {
    if (!a.recYear) a.recYear = m.year;
    if (a.weight === undefined) a.weight = 0;
    if (!Array.isArray(a.agencies)) a.agencies = [];
    if (!a.mainTasks) a.mainTasks = '';
    if (!a.evalIndicators) a.evalIndicators = '';
    if (!a.midtermNote) a.midtermNote = '';
  });
  var content = document.getElementById('page-content');
  if (content) content.innerHTML = buildSgDetailHtml(m, sg);
}

function closeSgDetail() { renderMdtView(); }

function openMdtSmart(year, sgId) {
  var m  = getMdt(year);
  var sg = m ? m.subGoals.find(function(s){ return s.id === sgId; }) : null;
  if (!sg) return;
  if (!sg.smart) sg.smart = { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' };

  var fieldsHtml = '<div class="smart-checks-row">' + MDT_SMART_FIELDS.map(function(f) {
    var checked = sg.smart[f.key] ? ' checked' : '';
    return '<label class="smart-check">'
      + '<input type="checkbox" id="mdt-smart-'+f.key+'"'+checked+'>'
      + '<span class="smart-icon">'+f.icon+'</span>'
      + '<span class="smart-label">'+f.label+'</span>'
      + '</label>';
  }).join('') + '</div>';

  var overlay = document.createElement('div');
  overlay.id = 'mdt-smart-overlay';
  overlay.className = 'lw-modal-overlay';
  overlay.innerHTML = '<div class="lw-modal smart-modal">'
    + '<div class="lw-modal-header">'
    + '<span>'+sg.emoji+' '+escMdt(sg.text)+' — SMART 목표</span>'
    + '<button class="lw-modal-close" onclick="document.getElementById(\'mdt-smart-overlay\').remove()">&#10005;</button>'
    + '</div>'
    + '<div class="smart-fields-wrap">'
    + fieldsHtml
    + '<div class="smart-divider"></div>'
    + '<div class="smart-field smart-final-field">'
    + '<div class="smart-field-header">'
    + '<span class="smart-icon">&#127942;</span>'
    + '<span class="smart-label" style="color:var(--warning);">최종 목표</span>'
    + '<span class="smart-desc">위 5가지를 종합해 구체적인 최종 목표 한 문장을 작성하세요</span>'
    + '</div>'
    + '<textarea class="smart-textarea smart-final-ta" id="mdt-smart-finalGoal" placeholder="예) 2026년 12월까지...">'+escMdt(sg.smart.finalGoal||'')+'</textarea>'
    + '</div>'
    + '</div>'
    + '<div class="lw-modal-footer">'
    + '<button class="lw-modal-save" onclick="saveMdtSmart('+year+','+sgId+')">저장</button>'
    + '<button class="lw-modal-cancel" onclick="document.getElementById(\'mdt-smart-overlay\').remove()">취소</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

function saveMdtSmart(year, sgId) {
  var m  = getMdt(year);
  var sg = m ? m.subGoals.find(function(s){ return s.id === sgId; }) : null;
  if (!sg) return;
  if (!sg.smart) sg.smart = {};
  MDT_SMART_FIELDS.forEach(function(f) {
    var cb = document.getElementById('mdt-smart-'+f.key);
    if (cb) sg.smart[f.key] = cb.checked;
  });
  var finalTa = document.getElementById('mdt-smart-finalGoal');
  if (finalTa) sg.smart.finalGoal = finalTa.value.trim();
  saveMandalarts();
  var ol = document.getElementById('mdt-smart-overlay');
  if (ol) ol.remove();
  // 실적 페이지 헤더 갱신
  var smartBtn = document.getElementById('mdt-smart-btn-'+sgId);
  if (smartBtn) {
    var filled = MDT_SMART_FIELDS.filter(function(f){ return sg.smart[f.key]; }).length;
    var hasFinal = !!sg.smart.finalGoal;
    smartBtn.textContent = '🎯 SMART ' + filled + '/5' + (hasFinal ? ' ✓' : '');
    smartBtn.style.color = (filled===5&&hasFinal) ? 'var(--success)' : filled>0 ? 'var(--warning)' : 'var(--text-2)';
  }
}

function openMdtIdeal(year, sgId) {
  var m  = getMdt(year);
  var sg = m ? m.subGoals.find(function(s){ return s.id === sgId; }) : null;
  if (!sg) return;
  var idx = m.subGoals.findIndex(function(s){ return s.id === sgId; });

  var ideal = '';
  var secName = sg.text || '';
  if (typeof getLwYear === 'function') {
    var lw = getLwYear(year);
    if (lw && lw.sections && lw.sections[idx]) {
      ideal = lw.sections[idx].ideal || '';
      if (lw.sections[idx].name) secName = lw.sections[idx].name;
    }
  }

  var body = ideal
    ? '<div style="white-space:pre-wrap;line-height:1.7;font-size:14px;color:var(--text-1);">' + escMdt(ideal) + '</div>'
    : '<div class="smart-desc">\ub77c\uc774\ud504\ud720\uc5d0\uc11c \uc774 \uc601\uc5ed\uc758 \'\uc774\uc0c1\uc801 \ubaa8\uc2b5(Ideal)\'\uc744 \uc544\uc9c1 \uc785\ub825\ud558\uc9c0 \uc54a\uc558\uc5b4\uc694.</div>';

  var overlay = document.createElement('div');
  overlay.id = 'mdt-ideal-overlay';
  overlay.className = 'lw-modal-overlay';
  overlay.onclick = function(e){ if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="lw-modal smart-modal">'
    + '<div class="lw-modal-header">'
    + '<span>' + sg.emoji + ' ' + escMdt(secName) + ' \u2014 \ubaa9\ud45c</span>'
    + '<button class="lw-modal-close" onclick="document.getElementById(\'mdt-ideal-overlay\').remove()">&#10005;</button>'
    + '</div>'
    + '<div class="smart-fields-wrap">'
    + '<div class="smart-field"><div class="smart-field-header"><span class="smart-icon">&#10024;</span>'
    + '<span class="smart-label">\uc774\uc0c1\uc801\uc778 \ubaa8\uc2b5 (Life Wheel \u00b7 Ideal)</span></div>'
    + body
    + '</div>'
    + '</div>'
    + '<div class="lw-modal-footer">'
    + '<button class="lw-modal-cancel" onclick="document.getElementById(\'mdt-ideal-overlay\').remove()">\ub2eb\uae30</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

function buildSgDetailHtml(m, sg) {
  if (!sg.smart) sg.smart = { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' };
  var smartFilled = MDT_SMART_FIELDS.filter(function(f){ return sg.smart[f.key]; }).length;
  var hasFinal = !!sg.smart.finalGoal;
  var smartColor = (smartFilled===5&&hasFinal) ? 'var(--success)' : smartFilled>0 ? 'var(--warning)' : 'var(--text-2)';
  var smartLabel = '&#127919; SMART ' + smartFilled + '/5' + (hasFinal ? ' &#10003;' : '');

  var perf = calcSgPerf(sg);
  var qDots = perf.qStats.map(function(c, i) {
    var on = perf.achCount > 0 && c >= perf.achCount;
    return '<span class="mdt-perf-qdot' + (on ? ' on' : '') + '" style="' + (on ? ('background:' + sg.color + ';') : '') + '" title="' + (i + 1) + '분기"></span>';
  }).join('');

  var html = '<div class="mdt-detail-wrap">'
    + '<div class="mdt-detail-top">'
    + '<button class="mdt-back-btn" onclick="closeSgDetail()">&#8592; Mandalart</button>'
    + '<button class="mdt-smart-open-btn" id="mdt-smart-btn-'+sg.id+'"'
    + ' onclick="openMdtIdeal('+m.year+','+sg.id+')" style="color:var(--brand-primary);">&#127919; 목표</button>'
    + '</div>'
    // 섹션 헤더 + 연간목표 실적 요약
    + '<div class="mdt-detail-hero" style="border-left:4px solid '+sg.color+';padding:12px 14px;margin-bottom:12px;background:var(--set-sec);border-radius:10px;">'
    +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
    +     '<span style="font-size:22px;">'+sg.emoji+'</span>'
    +     '<span style="font-size:15px;font-weight:700;color:'+sg.color+';">'+escMdt(sg.text || ('Section '+sg.id))+'</span>'
    +     '<span style="margin-left:auto;font-size:12px;color:var(--text-2);">완료 '+perf.done+'/'+perf.total+'</span>'
    +   '</div>'
    +   '<div class="mdt-perf-dash-bar"><div class="mdt-perf-dash-fill" style="width:'+perf.pct+'%;background:'+sg.color+';"></div></div>'
    +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">'
    +     '<span style="font-size:12px;color:var(--text-1);">📊 '+m.year+' 연간 실적 <b>'+perf.pct+'%</b>'+(perf.target>0?(' ('+perf.sum+'/'+perf.target+')'):'')+'</span>'
    +     '<span class="mdt-perf-dash-qdots">'+qDots+'</span>'
    +   '</div>'
    + '</div>'
    + '<div class="mdt-act-cards" id="mdt-act-cards-'+sg.id+'">';

  sg.actions.forEach(function(a) {
    if (!a.trackingType)     a.trackingType = 'task';
    if (!a.successThreshold) a.successThreshold = 80;
    if (!a.habitLog)         a.habitLog = {};
    html += buildActionCard(m, sg, a);
  });

  html += '</div></div>';
  return html;
}

function buildInlineAgencyHtml(year, sgId, a) {
  var tags = (a.agencies||[]).map(function(ag) {
    var col = getMdtAgencyColor(ag);
    return '<span class="mdt-atag" style="background:'+col.bg+';color:'+col.text+';">'
      + escMdt(ag)
      + '<button class="mdt-atag-del" onclick="removeActAgency(event,'+year+','+sgId+','+a.id+',\''+escMdt(ag).replace(/'/g,'&#39;')+'\')">&#215;</button>'
      + '</span>';
  }).join('');
  return tags
    + '<input class="mdt-tag-inp" placeholder="+ 기관"'
    + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();addActAgency(event,'+year+','+sgId+','+a.id+',this);}">';
}

function buildActionRow(m, sg, a) {
  var yr=m.year, sgId=sg.id, wPct=Math.min(100,Math.max(0,a.weight||0));
  return '<tr>'
    + '<td class="mdt-td-year"><input class="mdt-cell-inp" type="number" value="'+(a.recYear||yr)+'" min="2000" max="2100"'
    + ' onchange="saveActF('+yr+','+sgId+','+a.id+',\'recYear\',+this.value)"></td>'
    + '<td class="mdt-td-weight"><div class="mdt-weight-wrap"><div class="mdt-weight-top">'
    + '<input class="mdt-cell-inp mdt-weight-inp" type="number" value="'+wPct+'" min="0" max="100"'
    + ' onchange="saveActF('+yr+','+sgId+','+a.id+',\'weight\',+this.value);refreshBar(this)">'
    + '<span class="mdt-weight-pct-label">%</span></div>'
    + '<div class="mdt-weight-track"><div class="mdt-weight-fill" style="width:'+wPct+'%;"></div></div>'
    + '</div></td>'
    + '<td class="mdt-td-agency"><div class="mdt-agency-cell" id="mac-'+a.id+'">'+buildInlineAgencyHtml(yr,sgId,a)+'</div></td>'
    + '<td class="mdt-td-task"><div class="mdt-tasktitle-ro">'+escMdt(a.text||'')+'</div></td>'
    + '<td class="mdt-td-main"><div class="mdt-ce-cell" contenteditable="true" spellcheck="false"'
    + ' data-year="'+yr+'" data-sg="'+sgId+'" data-act="'+a.id+'" data-field="mainTasks"'
    + ' onblur="saveActCE(this)">'+escMdt(a.mainTasks||'').replace(/\n/g,'<br>')+'</div></td>'
    + '<td class="mdt-td-eval"><div class="mdt-ce-cell" contenteditable="true" spellcheck="false"'
    + ' data-year="'+yr+'" data-sg="'+sgId+'" data-act="'+a.id+'" data-field="evalIndicators"'
    + ' onblur="saveActCE(this)">'+escMdt(a.evalIndicators||'').replace(/\n/g,'<br>')+'</div></td>'
    + '<td class="mdt-td-mid"><div class="mdt-ce-cell" contenteditable="true" spellcheck="false"'
    + ' data-year="'+yr+'" data-sg="'+sgId+'" data-act="'+a.id+'" data-field="midtermNote"'
    + ' onblur="saveActCE(this)">'+escMdt(a.midtermNote||'').replace(/\n/g,'<br>')+'</div></td>'
    + '</tr>';
}


// ── Project 유형별 카드 렌더링 ──


// ── Project 유형별 카드 렌더링 ──

function fmtHabitKey(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}

function calcHabitStats(a, year) {
  var log = a.habitLog || {};
  var today = new Date();
  // 연속일수
  var streak = 0;
  for (var i = 0; i < 365; i++) {
    var d = new Date(today.getTime()); d.setDate(d.getDate() - i);
    if (log[fmtHabitKey(d)]) streak++;
    else if (i > 0) break;
  }
  // 연간 달성률: 해당 연도 1/1 ~ (오늘 또는 연말) 경과일 중 달성일 비율
  var y = year || today.getFullYear();
  var yearStart = new Date(y, 0, 1);
  var yearEnd = new Date(y, 11, 31);
  var endDate = today < yearStart ? yearStart : (today > yearEnd ? yearEnd : today);
  var elapsedDays = Math.floor((endDate - yearStart) / 86400000) + 1;
  if (elapsedDays < 1) elapsedDays = 1;
  var cnt = 0;
  for (var j = 0; j < elapsedDays; j++) {
    var dd = new Date(y, 0, 1 + j);
    if (log[fmtHabitKey(dd)]) cnt++;
  }
  // 최근 7일
  var DOW = ['일','월','화','수','목','금','토'];
  var last7 = [];
  for (var k = 6; k >= 0; k--) {
    var day = new Date(today.getTime()); day.setDate(day.getDate() - k);
    var dk = fmtHabitKey(day);
    last7.push({
      key: dk, done: !!log[dk], future: day > today,
      dow: DOW[day.getDay()], day: day.getDate(),
      label: (day.getMonth()+1) + '/' + day.getDate()
    });
  }
  return { streak: streak, rate: Math.round(cnt / elapsedDays * 100), last7: last7 };
}

function mdtCalNav(year, sgId, actId, delta) {
  var key = year + '-' + sgId + '-' + actId;
  var today = new Date();
  var cur = mdtCalView[key] || { y: today.getFullYear(), m: today.getMonth() };
  var d = new Date(cur.y, cur.m + delta, 1);
  // 미래 달로는 이동 불가
  if (d.getFullYear() > today.getFullYear()
      || (d.getFullYear() === today.getFullYear() && d.getMonth() > today.getMonth())) return;
  mdtCalView[key] = { y: d.getFullYear(), m: d.getMonth() };
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

// 이번 주 일요일 0시 반환
function mdtWeekStartOf(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// 월간/주간 보기 전환
function mdtCalSetMode(year, sgId, actId, mode) {
  var key = year + '-' + sgId + '-' + actId;
  mdtCalMode[key] = mode;
  if (mode === 'week' && !mdtCalWeekStart[key]) {
    mdtCalWeekStart[key] = mdtWeekStartOf(new Date()).getTime();
  }
  _mdtRerenderActCard(year, sgId, actId);
}

// 주간 이동 (delta 주)
function mdtWeekNav(year, sgId, actId, delta) {
  var key = year + '-' + sgId + '-' + actId;
  var curMs = mdtCalWeekStart[key] || mdtWeekStartOf(new Date()).getTime();
  var d = new Date(curMs); d.setDate(d.getDate() + delta * 7);
  // 미래 주로는 이동 불가 (이번 주 이후 차단)
  if (mdtWeekStartOf(d).getTime() > mdtWeekStartOf(new Date()).getTime()) return;
  mdtCalWeekStart[key] = d.getTime();
  _mdtRerenderActCard(year, sgId, actId);
}

// 액션카드 다시 그리기 (공용)
function _mdtRerenderActCard(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

function buildHabitCalendar(year, sgId, a) {
  var key = year + '-' + sgId + '-' + a.id;
  var mode = mdtCalMode[key] || 'month';

  // 공용 셀 스타일
  var S_GRID = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:4px;';
  var S_DOW  = 'font-size:9px;text-align:center;color:var(--text-3);padding:1px 0;';
  var S_CELL_BASE = 'aspect-ratio:1/1;border-radius:4px;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;color:var(--text-2);background:var(--surface);';
  var S_DONE   = 'background:rgba(139,92,246,0.3);color:#a78bfa;font-weight:700;';
  var S_TODAY  = 'outline:1.5px solid rgba(139,92,246,0.65);';
  var S_FUTURE = 'opacity:0.25;pointer-events:none;';
  var S_EMPTY  = 'background:transparent;pointer-events:none;';
  var S_NAV    = 'cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text-2);font-size:13px;line-height:1;padding:1px 8px;user-select:none;';
  var S_NAV_OFF = S_NAV + 'opacity:0.25;pointer-events:none;';
  var S_SEG    = 'cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text-3);font-size:10px;line-height:1;padding:2px 7px;user-select:none;';
  var S_SEG_ON = 'cursor:pointer;background:rgba(139,92,246,0.18);border:1px solid rgba(139,92,246,0.5);border-radius:5px;color:#a78bfa;font-weight:700;font-size:10px;line-height:1;padding:2px 7px;user-select:none;';
  var DOW_KO = ['일','월','화','수','목','금','토'];

  // 월간/주간 전환 토글
  var modeToggle = '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:6px;">'
    + '<span style="' + (mode === 'month' ? S_SEG_ON : S_SEG) + '" onclick="mdtCalSetMode(' + year + ',' + sgId + ',' + a.id + ',\'month\')">월간</span>'
    + '<span style="' + (mode === 'week' ? S_SEG_ON : S_SEG) + '" onclick="mdtCalSetMode(' + year + ',' + sgId + ',' + a.id + ',\'week\')">주간</span>'
    + '</div>';

  var inner = (mode === 'week')
    ? _buildHabitWeekGrid(year, sgId, a, key, { S_GRID:S_GRID, S_DOW:S_DOW, S_CELL_BASE:S_CELL_BASE, S_DONE:S_DONE, S_TODAY:S_TODAY, S_FUTURE:S_FUTURE, S_NAV:S_NAV, S_NAV_OFF:S_NAV_OFF, DOW_KO:DOW_KO })
    : _buildHabitMonthGrid(year, sgId, a, key, { S_GRID:S_GRID, S_DOW:S_DOW, S_CELL_BASE:S_CELL_BASE, S_DONE:S_DONE, S_TODAY:S_TODAY, S_FUTURE:S_FUTURE, S_EMPTY:S_EMPTY, S_NAV:S_NAV, S_NAV_OFF:S_NAV_OFF, DOW_KO:DOW_KO });

  return '<div style="margin-top:10px;">' + modeToggle + inner + '</div>';
}

// 월간 그리드
function _buildHabitMonthGrid(year, sgId, a, key, S) {
  var log = a.habitLog || {};
  var today = new Date();
  var view = mdtCalView[key] || { y: today.getFullYear(), m: today.getMonth() };
  var yr = view.y, mo = view.m;
  var daysInMonth = new Date(yr, mo + 1, 0).getDate();
  var firstDow = new Date(yr, mo, 1).getDay();
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var isCurMonth = (yr === today.getFullYear() && mo === today.getMonth());

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
    +   '<span style="' + S.S_NAV + '" onclick="mdtCalNav(' + year + ',' + sgId + ',' + a.id + ',-1)" title="이전 달">&#8249;</span>'
    +   '<span style="font-size:11px;color:var(--text-2);">' + yr + '년 ' + MONTHS[mo] + '</span>'
    +   '<span style="' + (isCurMonth ? S.S_NAV_OFF : S.S_NAV) + '" onclick="mdtCalNav(' + year + ',' + sgId + ',' + a.id + ',1)" title="다음 달">&#8250;</span>'
    + '</div>'
    + '<div style="' + S.S_GRID + '">';

  S.DOW_KO.forEach(function(d) { html += '<div style="' + S.S_DOW + '">' + d + '</div>'; });

  for (var i = 0; i < firstDow; i++) {
    html += '<div style="' + S.S_CELL_BASE + S.S_EMPTY + '"></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var cellDate = new Date(yr, mo, d);
    var dKey = fmtHabitKey(cellDate);
    var isFuture = cellDate > today;
    var isDone   = !!log[dKey];
    var isToday  = d === today.getDate() && mo === today.getMonth() && yr === today.getFullYear();

    var style = S.S_CELL_BASE;
    if (isDone)   style += S.S_DONE;
    if (isToday)  style += S.S_TODAY;
    if (isFuture) style += S.S_FUTURE;

    html += '<div style="' + style + '"'
      + (isFuture ? '' : ' onclick="toggleHabitDay(' + year + ',' + sgId + ',' + a.id + ',\'' + dKey + '\')"')
      + '>' + d + '</div>';
  }

  html += '</div>';
  return html;
}

// 주간 그리드 (한 주: 일~토)
function _buildHabitWeekGrid(year, sgId, a, key, S) {
  var log = a.habitLog || {};
  var today = new Date();
  var ws = mdtCalWeekStart[key] ? new Date(mdtCalWeekStart[key]) : mdtWeekStartOf(today);
  var weekEnd = new Date(ws); weekEnd.setDate(weekEnd.getDate() + 6);
  var isCurWeek = mdtWeekStartOf(ws).getTime() >= mdtWeekStartOf(today).getTime();

  var label = (ws.getMonth()+1) + '/' + ws.getDate() + ' – ' + (weekEnd.getMonth()+1) + '/' + weekEnd.getDate();

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
    +   '<span style="' + S.S_NAV + '" onclick="mdtWeekNav(' + year + ',' + sgId + ',' + a.id + ',-1)" title="이전 주">&#8249;</span>'
    +   '<span style="font-size:11px;color:var(--text-2);">' + ws.getFullYear() + '년 ' + label + '</span>'
    +   '<span style="' + (isCurWeek ? S.S_NAV_OFF : S.S_NAV) + '" onclick="mdtWeekNav(' + year + ',' + sgId + ',' + a.id + ',1)" title="다음 주">&#8250;</span>'
    + '</div>'
    + '<div style="' + S.S_GRID + '">';

  S.DOW_KO.forEach(function(d) { html += '<div style="' + S.S_DOW + '">' + d + '</div>'; });

  for (var i = 0; i < 7; i++) {
    var cellDate = new Date(ws); cellDate.setDate(ws.getDate() + i);
    var dKey = fmtHabitKey(cellDate);
    var isFuture = cellDate > today;
    var isDone   = !!log[dKey];
    var isToday  = fmtHabitKey(cellDate) === fmtHabitKey(today);

    var style = S.S_CELL_BASE;
    if (isDone)   style += S.S_DONE;
    if (isToday)  style += S.S_TODAY;
    if (isFuture) style += S.S_FUTURE;

    html += '<div style="' + style + '"'
      + (isFuture ? '' : ' onclick="toggleHabitDay(' + year + ',' + sgId + ',' + a.id + ',\'' + dKey + '\')"')
      + '>' + cellDate.getDate() + '</div>';
  }

  html += '</div>';
  return html;
}

function toggleActQuarterDone(year, sgId, actId, qIdx) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (!Array.isArray(a.quarters)) a.quarters = defaultMdtQuarters();
  a.quarters[qIdx].done = !a.quarters[qIdx].done;
  markMdtDirty(year, sgId, actId);
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

function saveActQuarterValue(year, sgId, actId, qIdx, value) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (!Array.isArray(a.quarters)) a.quarters = defaultMdtQuarters();
  a.quarters[qIdx].value = +value || 0;
  markMdtDirty(year, sgId, actId);
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

function buildAnnualTargetHtml(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  if (!Array.isArray(a.quarters)) a.quarters = defaultMdtQuarters();
  var target = a.annualTarget || 0;
  var unit = a.annualUnit || '';
  var sum = a.quarters.reduce(function(s,q){ return s + (+q.value || 0); }, 0);
  var pct = target > 0 ? Math.min(100, Math.round(sum / target * 100)) : 0;
  var qLabels = ['1분기','2분기','3분기','4분기'];

  var qHtml = a.quarters.map(function(q, i) {
    return '<div class="mdt-q-cell' + (q.done ? ' mdt-q-done' : '') + '">'
      + '<div class="mdt-q-head">'
      +   '<span class="mdt-q-cb" onclick="toggleActQuarterDone(' + yr + ',' + sgId + ',' + a.id + ',' + i + ')" title="달성 여부">'
      +     (q.done ? '&#9745;' : '&#9744;') + '</span>'
      +   '<span class="mdt-q-label">' + qLabels[i] + '</span>'
      + '</div>'
      + '<input class="mdt-q-val" type="number" value="' + (q.value || 0) + '"'
      +   ' onchange="saveActQuarterValue(' + yr + ',' + sgId + ',' + a.id + ',' + i + ',this.value)">'
      + '</div>';
  }).join('');

  return '<div class="mdt-annual-block">'
    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
    +   '<span style="font-size:11px;color:var(--text-3);">연간목표</span>'
    +   '<input type="number" value="' + target + '" class="mdt-annual-target-inp"'
    +     ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'annualTarget\',+this.value)">'
    +   '<input type="text" value="' + escMdt(unit) + '" placeholder="단위" class="mdt-annual-unit-inp"'
    +     ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'annualUnit\',this.value)">'
    +   '<span class="mdt-annual-sum">누적 ' + sum + (unit ? (' ' + escMdt(unit)) : '') + ' (' + pct + '%)</span>'
    + '</div>'
    + '<div class="mdt-q-grid">' + qHtml + '</div>'
    + '</div>';
}

function buildTaskCardBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var S_ROW   = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;';
  var S_LABEL = 'font-size:11px;color:var(--text-3);min-width:52px;padding-top:3px;flex-shrink:0;';
  return '<div style="padding:4px 0;">'
    + buildAnnualTargetHtml(m, sg, a)
    + '<div style="' + S_ROW + 'flex-direction:column;gap:5px;">'
    +   '<span style="' + S_LABEL + '">메모</span>'
    +   '<div class="mdt-memo-box" contenteditable="true" spellcheck="false" data-ph="메모를 입력하세요..."'
    +     ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '" data-field="memo"'
    +     ' onblur="saveActCE(this)">' + escMdt(a.memo || '').replace(/\n/g, '<br>') + '</div>'
    + '</div>'
    + '</div>';
}

function buildHabitCardBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var threshold = a.successThreshold || 80;
  var stats = calcHabitStats(a, m.year);

  // 최근 7일 (주간 실적) — 클래스 기반(테마 대응)
  var weekHtml = stats.last7.map(function(d) {
    return '<div class="mdt-hb-day' + (d.done ? ' done' : '') + (d.future ? ' future' : '')+'"'
      + (d.future ? '' : ' onclick="toggleHabitDay(' + yr + ',' + sgId + ',' + a.id + ',\'' + d.key + '\')"')
      + ' title="' + d.label + '">'
      + '<span class="mdt-hb-dow">' + d.dow + '</span>'
      + '<span class="mdt-hb-num">' + d.day + '</span>'
      + '</div>';
  }).join('');

  return '<div style="padding:4px 0;">'
    + '<div class="mdt-hb-settings">'
    +   '<span class="mdt-hb-lbl">성공 기준</span>'
    +   '<input type="number" class="mdt-hb-thr" value="' + threshold + '" min="1" max="100"'
    +     ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'successThreshold\',+this.value)">%이상'
    +   '<span class="mdt-hb-chip">🔥 연속 <b>' + stats.streak + '</b>일</span>'
    +   '<span class="mdt-hb-chip" title="연간 달성률">📊 연간 <b>' + stats.rate + '</b>%</span>'
    + '</div>'
    // 주간 실적 + 메모(왼쪽) / 캘린더(오른쪽, 작게)
    + '<div class="mdt-hb-main">'
    +   '<div class="mdt-hb-week-col">'
    +     '<div class="mdt-hb-week-title">주간 실적</div>'
    +     '<div class="mdt-hb-week">' + weekHtml + '</div>'
    +     '<div class="mdt-hb-memo-wrap">'
    +       '<span class="mdt-hb-lbl">메모</span>'
    +       '<div class="mdt-memo-box mdt-memo-sm" contenteditable="true" spellcheck="false" data-ph="메모를 입력하세요..."'
    +         ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '" data-field="memo"'
    +         ' onblur="saveActCE(this)">' + escMdt(a.memo || '').replace(/\n/g, '<br>') + '</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="mdt-hb-cal-col">' + buildHabitCalendar(yr, sgId, a) + '</div>'
    + '</div>'
    + '</div>';
}


function buildActionCard(m, sg, a) {
  if (!a.trackingType)           a.trackingType = 'task';
  if (!a.successThreshold)       a.successThreshold = 80;
  if (!a.habitLog)               a.habitLog = {};
  if (a.annualTarget === undefined) a.annualTarget = 0;
  if (a.annualUnit === undefined)   a.annualUnit = '';
  if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
  var yr = m.year, sgId = sg.id;
  var isHabit = a.trackingType === 'habit';
  var titleDisp = a.text ? escMdt(a.text) : '<span style="opacity:0.35;">Project ' + a.id + '</span>';

  var typeToggle = '<div class="mdt-type-toggle">'
    + '<button class="mdt-type-btn' + (!isHabit ? ' active' : '') + '"'
    + ' onclick="setActTrackingType(' + yr + ',' + sgId + ',' + a.id + ',\'task\')">📋 달성형</button>'
    + '<button class="mdt-type-btn' + (isHabit ? ' active' : '') + '"'
    + ' onclick="setActTrackingType(' + yr + ',' + sgId + ',' + a.id + ',\'habit\')">🔄 습관형</button>'
    + '</div>';

  var body = isHabit ? buildHabitCardBody(m, sg, a) : buildTaskCardBody(m, sg, a);

  var dirtyClass = mdtDirtyCards[mdtCardKey(yr, sgId, a.id)] ? ' mdt-card-dirty' : '';
  var saveBtn = '<button class="mdt-act-save-btn" onclick="commitMdtCard(' + yr + ',' + sgId + ',' + a.id + ')">💾 저장</button>';

  return '<div class="mdt-act-card' + dirtyClass + '" id="mdt-act-card-' + yr + '-' + sgId + '-' + a.id + '">'
    + '<div class="mdt-act-card-header">'
    +   '<div class="mdt-act-card-title">'
    +     '<span class="mdt-inner-cb" onclick="toggleMdtAction(' + yr + ',' + sgId + ',' + a.id + ')" style="font-size:15px;margin-right:6px;">'
    +       (a.completed ? '&#9745;' : '&#9744;') + '</span>'
    +     '<span contenteditable="true" spellcheck="false" class="mdt-act-title-text"'
    +       ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '"'
    +       ' onblur="saveMdtActText(this)"'
    +       ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
    +       titleDisp + '</span>'
    +   '</div>'
    +   typeToggle
    +   saveBtn
    + '</div>'
    + '<div class="mdt-act-card-body">' + body + '</div>'
    + '</div>';
}

// #4: 액션카드 변경 사항 영구 저장 (저장 버튼 클릭 시에만)
function commitMdtCard(year, sgId, actId) {
  saveMandalarts();
  delete mdtDirtyCards[mdtCardKey(year, sgId, actId)];
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.classList.remove('mdt-card-dirty');
  refreshMdtGridForAction(year, sgId, actId);
  if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
  if (typeof renderHomeHabitWidget === 'function') renderHomeHabitWidget();
  var btn = card ? card.querySelector('.mdt-act-save-btn') : null;
  if (btn) {
    btn.textContent = '✓ 저장됨';
    setTimeout(function(){ btn.textContent = '💾 저장'; }, 1200);
  }
}

// 저장 시 만다라트 그리드 셀(텍스트/완료 배경) 갱신
function refreshMdtGridForAction(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  var textEl = document.querySelector('.mdt-inner-text[data-year="' + year + '"][data-sg="' + sgId + '"][data-act="' + actId + '"]');
  if (textEl) {
    textEl.textContent = a.text;
    textEl.classList.toggle('mdt-cell-empty', !a.text);
    textEl.classList.toggle('mdt-cell-done-text', !!a.completed);
    var cell = textEl.closest('.mdt-inner-cell');
    if (cell) {
      cell.classList.toggle('mdt-proj-done', !!a.completed);
      if (a.completed) {
        cell.style.background = mdtLighten(sg.color, 70);
        cell.style.borderColor = mdtLighten(sg.color, 60);
      } else {
        cell.style.background = '';
        cell.style.borderColor = '';
      }
    }
    mdtAutoFitText();
  }
}

function toggleHabitDay(year, sgId, actId, dateKey) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s) { return s.id === sgId; }); if (!sg) return;
  var a  = sg.actions.find(function(x) { return x.id === actId; }); if (!a) return;
  if (!a.habitLog) a.habitLog = {};
  if (a.habitLog[dateKey]) delete a.habitLog[dateKey];
  else a.habitLog[dateKey] = true;
  markMdtDirty(year, sgId, actId);
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

function setActTrackingType(year, sgId, actId, type) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s) { return s.id === sgId; }); if (!sg) return;
  var a  = sg.actions.find(function(x) { return x.id === actId; }); if (!a) return;
  a.trackingType = type;
  markMdtDirty(year, sgId, actId);
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (card) card.outerHTML = buildActionCard(m, sg, a);
}

function getAllHabitActions() {
  var result = [];
  if (typeof loadMandalarts === 'function') loadMandalarts();
  mandalarts.forEach(function(m) {
    (m.subGoals || []).forEach(function(sg) {
      (sg.actions || []).filter(function(a) { return a.trackingType === 'habit' && a.text; })
        .forEach(function(a) {
          result.push({ m: m, sg: sg, a: a });
        });
    });
  });
  return result;
}


function saveActF(year,sgId,actId,field,value) {
  var m=getMdt(year); if(!m) return;
  var sg=m.subGoals.find(function(s){return s.id===sgId;}); if(!sg) return;
  var a=sg.actions.find(function(x){return x.id===actId;}); if(!a) return;
  a[field]=value;
  // #4: 메모리만 반영 (저장 버튼 클릭 시 영구 저장)
  markMdtDirty(year, sgId, actId);
}
function saveActCE(el) {
  saveActF(+el.dataset.year,+el.dataset.sg,+el.dataset.act,el.dataset.field,el.innerText.trim());
}
function refreshBar(input) {
  var pct=Math.min(100,Math.max(0,+input.value||0));
  var fill=input.closest('tr')?input.closest('tr').querySelector('.mdt-weight-fill'):null;
  if(fill) fill.style.width=pct+'%';
}
function addActAgency(event,year,sgId,actId,inputEl) {
  event.stopPropagation();
  var name=(inputEl.value||'').trim(); if(!name) return;
  var m=getMdt(year); if(!m) return;
  var sg=m.subGoals.find(function(s){return s.id===sgId;}); if(!sg) return;
  var a=sg.actions.find(function(x){return x.id===actId;}); if(!a) return;
  if(!Array.isArray(a.agencies)) a.agencies=[];
  if(!a.agencies.includes(name)) a.agencies.push(name);
  inputEl.value=''; saveMandalarts();
  var cell=document.getElementById('mac-'+actId);
  if(cell) cell.innerHTML=buildInlineAgencyHtml(year,sgId,a);
}
function removeActAgency(event,year,sgId,actId,name) {
  event.stopPropagation();
  var m=getMdt(year); if(!m) return;
  var sg=m.subGoals.find(function(s){return s.id===sgId;}); if(!sg) return;
  var a=sg.actions.find(function(x){return x.id===actId;}); if(!a) return;
  a.agencies=(a.agencies||[]).filter(function(ag){return ag!==name;});
  saveMandalarts();
  var cell=document.getElementById('mac-'+actId);
  if(cell) cell.innerHTML=buildInlineAgencyHtml(year,sgId,a);
}

function getMdtSubGoalOptions(year) {
  var m = year ? getMdt(year) : (currentMdtYear ? getMdt(currentMdtYear) : null);
  if (!m) return [];
  return m.subGoals.map(function(sg) {
    return { id: sg.id, year: m.year, text: sg.text, emoji: sg.emoji, color: sg.color };
  });
}

// ============================================
//  🎯 만다라트 PROJECT 상세 모달
// ============================================

function openMdtProjectModal(year, sgId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;

  // 기존 모달 제거
  var old = document.getElementById('mdt-proj-modal-overlay');
  if (old) old.remove();

  if (!sg.smart) sg.smart = { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'' };
  if (sg.notes === undefined) sg.notes = '';

  var smartFields = [
    { key:'specific',   icon:'🎯', label:'Specific',   desc:'구체적으로 무엇을 달성할 건가요?' },
    { key:'measurable', icon:'📏', label:'Measurable', desc:'어떻게 측정/확인할 수 있나요?' },
    { key:'achievable', icon:'💪', label:'Achievable', desc:'실현 가능한 목표인가요?' },
    { key:'relevant',   icon:'🔗', label:'Relevant',   desc:'삶의 방향과 연관되어 있나요?' },
    { key:'timeBound',  icon:'⏰', label:'Time-bound', desc:'언제까지 달성할 건가요?' }
  ];

  var done  = sg.actions.filter(function(a){ return a.completed; }).length;
  var total = sg.actions.length;
  var pct   = total > 0 ? Math.round(done/total*100) : 0;

  var smartHtml = smartFields.map(function(sf) {
    return '<div class="mdt-proj-field">'
      + '<div class="mdt-proj-field-label"><span>' + sf.icon + '</span><strong>' + sf.label + '</strong><span class="mdt-proj-field-desc">' + sf.desc + '</span></div>'
      + '<textarea class="mdt-proj-ta" id="mdt-proj-' + sf.key + '" placeholder="' + sf.desc + '">' + escMdt(sg.smart[sf.key] || '') + '</textarea>'
      + '</div>';
  }).join('');

  var html = '<div class="mdt-proj-overlay" id="mdt-proj-modal-overlay" onclick="if(event.target===this)closeMdtProjectModal()">'
    + '<div class="mdt-proj-modal">'
    + '<div class="mdt-proj-modal-header" style="border-bottom:3px solid ' + sg.color + ';">'
    +   '<div class="mdt-proj-modal-title">'
    +     '<span style="font-size:24px;">' + sg.emoji + '</span>'
    +     '<span>' + escMdt(sg.text) + '</span>'
    +   '</div>'
    +   '<div class="mdt-proj-modal-prog">'
    +     '<span class="mdt-proj-prog-num" style="color:' + sg.color + ';">' + done + '/' + total + '</span>'
    +     '<div class="mdt-proj-prog-bar"><div class="mdt-proj-prog-fill" style="width:' + pct + '%;background:' + sg.color + ';"></div></div>'
    +   '</div>'
    +   '<button class="mdt-proj-close" onclick="closeMdtProjectModal()">✕</button>'
    + '</div>'
    + '<div class="mdt-proj-modal-body">'
    +   '<div class="mdt-proj-section-title">🎯 SMART 목표 설정</div>'
    +   smartHtml
    +   '<div class="mdt-proj-section-title" style="margin-top:16px;">📝 메모 / 참고사항</div>'
    +   '<textarea class="mdt-proj-ta mdt-proj-notes" id="mdt-proj-notes" placeholder="프로젝트 관련 메모, 리소스, 참고사항...">' + escMdt(sg.notes || '') + '</textarea>'
    + '</div>'
    + '<div class="mdt-proj-modal-footer">'
    +   '<button class="mdt-proj-cancel" onclick="closeMdtProjectModal()">취소</button>'
    +   '<button class="mdt-proj-save" onclick="saveMdtProjectModal(' + year + ',' + sgId + ')" style="background:' + sg.color + ';">저장</button>'
    + '</div>'
    + '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function closeMdtProjectModal() {
  var el = document.getElementById('mdt-proj-modal-overlay');
  if (el) el.remove();
}

function saveMdtProjectModal(year, sgId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  if (!sg.smart) sg.smart = {};
  ['specific','measurable','achievable','relevant','timeBound'].forEach(function(k) {
    var el = document.getElementById('mdt-proj-' + k);
    if (el) sg.smart[k] = el.value;
  });
  var notesEl = document.getElementById('mdt-proj-notes');
  if (notesEl) sg.notes = notesEl.value;
  saveMandalarts();
  closeMdtProjectModal();
  // 센터 셀 힌트 업데이트 (SMART가 채워지면 색상 변경)
  var hasContent = Object.values(sg.smart).some(function(v){ return v && v.trim(); });
  var center = document.querySelector('[data-prog="' + year + '-' + sgId + '"] .mdt-ic-edit-hint');
  if (center) center.textContent = hasContent ? '✅ 상세' : '✏️ 상세';
}
