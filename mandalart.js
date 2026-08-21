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
    if (!a.resultMonths)     a.resultMonths = {};
    if (a.habitWeeklyTarget == null) a.habitWeeklyTarget = 1;
            if (a.annualTarget === undefined) a.annualTarget = 0;
            if (a.annualUnit === undefined)   a.annualUnit = '';
            if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
            // 달성형 세분 (누적형 cum / 실적형 result). 습관형은 한 가지뿐이다.
            if (!a.achieveType) a.achieveType = 'cum';
            if (!a.resultCompare) a.resultCompare = 'gte';   // 실적형 달성기준: 이상(gte)/이하(lte)
            // 습관형은 '주 N회' 하나로 합쳤다 — 예전 일간/월간 값도 여기로 모은다.
            // 날짜 체크 기록(habitLog)은 Habit Tracker 가 계속 쓰므로 건드리지 않는다.
            a.habitFreq = 'weekly';
            if (a.goalText === undefined) a.goalText = '';
            if (a.evalIndicators === undefined) a.evalIndicators = '';
            if (a.cumActual === undefined) {
              // 구버전 분기 실적 합계를 누적 실적으로 이관
              a.cumActual = (a.quarters || []).reduce(function(s, q){ return s + (+q.value || 0); }, 0);
            }
            // ▶ 유형 개편: 달성형(누적/실적) → '실적형(result)' 하나로 통합. 습관형은 유지.
            if (a.trackingType !== 'habit') { a.trackingType = 'task'; a.achieveType = 'result'; }
            // 실적형 실적 기록(일자·내용). 예전 실적형 월배지(달성월)를 일자 기록으로 이관.
            if (!Array.isArray(a.resultEntries)) {
              a.resultEntries = [];
              var _rm = a.resultMonths || {};
              for (var _mo = 1; _mo <= 12; _mo++) {
                if (_rm[_mo] === 1) a.resultEntries.push({ date: String(m.year) + '-' + (('0'+_mo).slice(-2)) + '-01', text: '' });
              }
            }
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
  // 만다라트 Project(실행과제)/Section 명이 바뀌면 연계된 TASK 스냅샷도 자동 갱신
  mdtSyncTasksFromMandalart();
}

// 만다라트 기준으로 모든 TASK의 연계 텍스트(Project·Section)를 재동기화한다.
//  - task.mdtAction.text : 만다라트 실행과제(Project) 이름
//  - task.mdtGoal.text   : 만다라트 핵심목표(Section) 이름
// 변경이 있을 때만 saveTasks()로 영구 저장한다.
function mdtSyncTasksFromMandalart() {
  if (typeof tasks === 'undefined' || !Array.isArray(tasks)) return false;
  var changed = false;
  tasks.forEach(function(t) {
    // Project(실행과제) 이름 동기화
    if (t.mdtAction && t.mdtAction.actionId != null) {
      var mA = getMdt(t.mdtAction.year);
      var sgA = (mA && mA.subGoals) ? mA.subGoals.find(function(s){ return s.id === t.mdtAction.sgId; }) : null;
      var act = (sgA && sgA.actions) ? sgA.actions.find(function(a){ return a.id === t.mdtAction.actionId; }) : null;
      if (act && typeof act.text === 'string') {
        var nA = act.text.trim();
        if (nA && t.mdtAction.text !== nA) { t.mdtAction.text = nA; changed = true; }
      }
    }
    // Section(핵심목표) 이름 동기화
    if (t.mdtGoal && t.mdtGoal.sgId != null) {
      var mG = getMdt(t.mdtGoal.year);
      var sgG = (mG && mG.subGoals) ? mG.subGoals.find(function(s){ return s.id === t.mdtGoal.sgId; }) : null;
      if (sgG && typeof sgG.text === 'string') {
        var nG = sgG.text.trim();
        if (nG && t.mdtGoal.text !== nG) { t.mdtGoal.text = nG; changed = true; }
      }
    }
  });
  if (changed && typeof saveTasks === 'function') saveTasks();
  return changed;
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
          return { id: j+1, text: '', completed: false, trackingType: 'task', achieveType: 'result', resultCompare: 'gte', habitFreq: 'weekly', successThreshold: 80, habitWeeklyTarget: 1, habitLog: {}, resultMonths: {}, resultEntries: [], annualTarget: 0, annualUnit: '', cumActual: 0, goalText: '', evalIndicators: '', quarters: defaultMdtQuarters() };
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
    opts += '<option value="__delete__">현재 연도 삭제</option>';
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

  // 실적관리(상세)에서 드래그로 바꾼 Project 순서를 메인 그리드에도 동일 반영
  var orderedActs = tlGetActionOrder(sg).map(function(id){
    return sg.actions.find(function(a){ return a.id === id; });
  });

  var cells = ACT_MAP.map(function(actIdx) {
    if (actIdx === null) {
      // 중앙 셀: Section 이름 + section별 최종목표 표시 (#2)
      var fg = (sg.smart && sg.smart.finalGoal) ? sg.smart.finalGoal : '';
      return '<div class="mdt-inner-center" style="cursor:pointer;" data-prog="'+m.year+'-'+sg.id+'" onclick="event.stopPropagation();openSgDetail('+m.year+','+sg.id+')" title="'+escMdt(sg.text)+' 관리 페이지 열기">'
        + '<div class="mdt-ic-name mdt-fit-text" data-fit-base="12" style="color:'+color+';font-weight:700;">'+escMdt(sg.text)+'</div>'
        + (fg ? '<div class="mdt-ic-final mdt-fit-text" data-fit-base="10">'+escMdt(fg)+'</div>' : '')
        + '</div>';
    }
    var act = orderedActs[actIdx];
    if (!act) return '<div class="mdt-inner-cell"></div>';
    // #1: 동그라미/다이아 아이콘 제거, 텍스트만 표시. 완료 시 테마컬러 명도70% 배경.
    var doneCls = act.completed ? ' mdt-proj-done' : '';
    var doneStyle = act.completed ? ('background:'+color+'33;') : '';
    return '<div class="mdt-inner-cell mdt-proj-cell'+doneCls+'" style="'+doneStyle+'" onclick="event.stopPropagation();selectMdtAction('+m.year+','+sg.id+','+act.id+')">'
      + '<span class="mdt-inner-text mdt-fit-text'+(act.text?'':' mdt-cell-empty')+(act.completed?' mdt-cell-done-text':'')+'" data-fit-base="12" data-year="'+m.year+'" data-sg="'+sg.id+'" data-act="'+act.id+'">'
      +   escMdt(act.text)
      + '</span>'
      + '</div>';
  }).join('');

  return '<div class="mdt-outer-card" id="mdt-card-'+m.year+'-'+sg.id+'"'
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
  // 개별 실적 관리 영역(우측 패널)을 만들지 않고 세부 실적관리 페이지 전체 화면으로 이동
  openSgDetail(year, sgId);
}

function selectMdtAction(year, sgId, actId) {
  openSgDetail(year, sgId);
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

// ── 유형별 달성 현황 계산 ─────────────────────
// 해당 연도 습관 달성일 수 (habitLog 날짜 체크 수 — Habit Tracker 캘린더 표시용)
function mdtHabitYearDays(a, year) {
  var log = a.habitLog || {};
  var cnt = 0;
  Object.keys(log).forEach(function(k) {
    if (log[k] && k.indexOf(String(year) + '-') === 0) cnt++;
  });
  var totalDays = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
  return { done: cnt, total: totalDays, rate: Math.round(cnt / totalDays * 100) };
}

// 해당 연도 습관 달성 주 수 (주간형: 52주 기준 — '주 N회 이상' 실천한 주만 달성 주로 인정)
function mdtHabitYearWeeks(a, year) {
  var log = a.habitLog || {};
  var target = Math.max(1, +a.habitWeeklyTarget || 1);  // 주 N회 목표
  var weekCount = {};
  Object.keys(log).forEach(function(k) {
    if (!log[k] || k.indexOf(String(year) + '-') !== 0) return;
    var p = k.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var ws = new Date(d); ws.setDate(ws.getDate() - ws.getDay()); // 그 주 일요일
    var wk = fmtHabitKey(ws);
    weekCount[wk] = (weekCount[wk] || 0) + 1;
  });
  // 연간 총 주 수 (해마다 다를 수 있음): 1/1이 속한 주 ~ 12/31이 속한 주
  var first = new Date(year, 0, 1); first.setDate(first.getDate() - first.getDay());
  var last  = new Date(year, 11, 31); last.setDate(last.getDate() - last.getDay());
  var totalWeeks = Math.round((last - first) / (7 * 86400000)) + 1;
  var done = 0;
  Object.keys(weekCount).forEach(function(wk){ if (weekCount[wk] >= target) done++; });  // 목표 달성 주만 카운트
  return { done: done, total: totalWeeks, rate: Math.round(done / totalWeeks * 100), target: target };
}

// 실적형 실적 수 = 일자가 입력된 기록의 개수 (구버전 누적값은 기록이 없을 때만 보조 사용)
function mdtResultActual(a) {
  var e = Array.isArray(a.resultEntries) ? a.resultEntries : [];
  var cnt = e.filter(function(x){ return x && x.date; }).length;
  if (cnt === 0 && (+a.cumActual || 0) > 0) return +a.cumActual;   // 구버전 누적 보존
  return cnt;
}
// 습관형 목표 달성에 필요한 '주 수' = 52주 × 성공기준% (이 수를 100%로 보고 바 표시)
function mdtHabitReqWeeks(a) {
  var thr = Math.max(0, Math.min(100, +a.successThreshold || 0));
  return Math.max(1, Math.ceil(52 * thr / 100));
}

// action 하나의 달성 현황 { pct(0~100), label, achieved }
//  · 공통: label 은 '실적/목표(단위)' 형식으로 달성현황 칸에 그대로 노출한다.
function mdtActPerf(a, year) {
  if (a.trackingType === 'habit') {
    // 습관형: '주 N회'를 달성한 주 수 / (52주×성공기준%) — 후자를 100%로 본다.
    var done = mdtHabitYearWeeks(a, year).done;
    var req  = mdtHabitReqWeeks(a);
    var pctH = Math.min(100, Math.round(done / req * 100));
    return { pct: pctH, label: done + ' / ' + req + ' 주', achieved: done >= req };
  }
  // 실적형: 일자 기록 수(실적) / 목표값(단위)
  var actual = mdtResultActual(a);
  var target = +a.annualTarget || 0;
  var unit   = a.annualUnit ? (' ' + a.annualUnit) : '';
  var pct = target > 0 ? Math.min(100, Math.round(actual / target * 100)) : 0;
  var label = actual + ' / ' + target + unit + (target > 0 ? ' (' + pct + '%)' : '');
  return { pct: pct, label: label, achieved: target > 0 && actual >= target };
}

function calcSgPerf(sg, year) {
  var y = year || (typeof currentMdtYear !== 'undefined' && currentMdtYear) || new Date().getFullYear();
  var acts = sg.actions.filter(function(a){ return a.text && a.text.trim(); });
  var pctSum = 0;
  acts.forEach(function(a) { pctSum += mdtActPerf(a, y).pct; });
  var pct = acts.length ? Math.round(pctSum / acts.length) : 0;
  var done = sg.actions.filter(function(a){ return a.completed; }).length;
  return { pct: pct, sum: 0, target: 0, qStats: [0,0,0,0], achCount: acts.length, done: done, total: sg.actions.length };
}

// 연간 진행 현황 = 전체 Project 수 중 완료한 Project 수
//  · '전체'는 이름을 적어 둔 Project 만 센다 — 빈 칸은 아직 Project 가 아니다.
function calcMdtProjectProgress(m) {
  var total = 0, done = 0;
  (m.subGoals || []).forEach(function(sg) {
    (sg.actions || []).forEach(function(a) {
      if (!a || !a.text || !a.text.trim()) return;
      total++;
      if (a.completed) done++;
    });
  });
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
}

// 연간 목표 입력칸 아래 진행 현황 바
function buildMdtAnnualProgHtml(prog) {
  return '<div class="mdt-annual-prog">'
    + '<div class="mdt-annual-prog-bar"><div class="mdt-annual-prog-fill" style="width:' + prog.pct + '%;"></div></div>'
    + '<div class="mdt-annual-prog-meta">'
    +   '<span class="mdt-annual-prog-txt">Project ' + prog.done + ' / ' + prog.total + ' 완료</span>'
    +   '<span class="mdt-annual-prog-pct">' + prog.pct + '%</span>'
    + '</div>'
    + '</div>';
}

function buildMdtPerfDashboard(m) {
  var _order = tlGetSectionOrder(m.year);
  var cardsHtml = _order.map(function(si) {
    var sg = m.subGoals[si]; if (!sg) return '';
    var perf = calcSgPerf(sg, m.year);
    return '<div class="mdt-perf-dash-card tl-dnd-row" data-secidx="' + si + '"'
      + ' ondragover="mdtSecDragOver(event,' + si + ')" ondragleave="tlDragLeave(event)" ondrop="mdtSecDrop(event,' + si + ')"'
      + ' style="border-left:3px solid ' + sg.color + ';" onclick="openSgDetail(' + m.year + ',' + sg.id + ')">'
      + '<span class="tl-drag-handle" draggable="true" title="\ub4dc\ub798\uadf8\ud574 \uc21c\uc11c \ubcc0\uacbd" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" ondragstart="mdtSecDragStart(event,' + si + ')" ondragend="tlDragEnd(event)">\u283F</span>'
      + '<div class="mdt-perf-dash-head">'
      +   '<span class="mdt-perf-dash-emoji">' + sg.emoji + '</span>'
      +   '<span class="mdt-perf-dash-name">' + escMdt(sg.text) + '</span>'
      +   '<span class="mdt-perf-dash-prog">' + perf.done + '/' + perf.total + '</span>'
      + '</div>'
      + '<div class="mdt-perf-dash-bar"><div class="mdt-perf-dash-fill" style="width:' + perf.pct + '%;background:' + sg.color + ';"></div></div>'
      + '<div class="mdt-perf-dash-foot">'
      +   '<span class="mdt-perf-dash-pct">연간 ' + perf.pct + '%</span>'
      + '</div>'
      + '</div>';
  }).join('');

  // #3: 전체실적 창 최상단 연간 목표 입력 (만다라트 중앙에 표시)
  var annualHtml = '<div class="mdt-perf-annual">'
    + '<label class="mdt-perf-annual-label">' + m.year + ' 연간 목표</label>'
    + '<input class="mdt-perf-annual-inp" type="text" value="' + escMdt(m.coreGoal.text || '') + '"'
    + ' placeholder="올해의 핵심 목표를 입력하세요..." onchange="saveMdtAnnualGoal(' + m.year + ',this.value)">'
    + buildMdtAnnualProgHtml(calcMdtProjectProgress(m))
    + '</div>';

  return '<div class="mdt-perf-dash">'
    + annualHtml
    + '<div class="mdt-perf-summary-box">'
    +   '<div class="mdt-perf-dash-title">달성 현황</div>'
    +   '<div class="mdt-perf-dash-list">' + cardsHtml + '</div>'
    + '</div>'
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

  tlGetActionOrder(sg).forEach(function(aid) {
    var a = sg.actions.find(function(x){ return x.id === aid; }); if (!a) return;
    if (!a.trackingType)     a.trackingType = 'task';
    if (!a.successThreshold) a.successThreshold = 80;
    if (!a.habitLog)         a.habitLog = {};
    if (!a.resultMonths)     a.resultMonths = {};
    if (a.habitWeeklyTarget == null) a.habitWeeklyTarget = 1;
    if (a.annualTarget === undefined) a.annualTarget = 0;
    if (a.annualUnit === undefined)   a.annualUnit = '';
    if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
    if (mdtSelectedActId !== null && mdtSelectedActId !== undefined && a.id !== mdtSelectedActId) return;
    html += '<div class="mdt-act-dndwrap tl-dnd-row" data-actid="' + a.id + '"'
      + ' ondragover="mdtActDragOver(event,' + a.id + ')" ondragleave="tlDragLeave(event)" ondrop="mdtActDrop(event,' + m.year + ',' + sg.id + ',' + a.id + ')">'
      + '<span class="tl-drag-handle" draggable="true" title="\ub4dc\ub798\uadf8\ud574 \uc21c\uc11c \ubcc0\uacbd" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" ondragstart="mdtActDragStart(event,' + a.id + ')" ondragend="tlDragEnd(event)">\u283F</span>'
      + buildActionCard(m, sg, a)
      + '</div>';
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
  if (content) {
    content.innerHTML = buildSgDetailHtml(m, sg);
    // 세부 실적 관리 표: 컬럼 너비 드래그 조정 (localStorage 'mdtGridColW'에 저장 → 유지)
    var _gt = content.querySelector('.mdt-grid-table');
    if (_gt && typeof TLColResize !== 'undefined') TLColResize.table(_gt, 'mdtGridColW');
  }
}

function closeSgDetail() { renderMdtView(); }

// 세부 실적 관리 페이지 저장 버튼
//  - 편집 중이던 셀(contenteditable/input/select)의 변경을 메모리에 반영한 뒤 영구 저장
//  - saveActF 계열이 '메모리만 반영'이라, 이 버튼에서 saveMandalarts()로 확정 저장한다
function saveSgDetail(year, sgId) {
  // 포커스가 남아있는 셀의 onblur/onchange를 먼저 실행시켜 편집값을 메모리에 반영
  if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
  if (typeof saveMandalarts === 'function') saveMandalarts();
  // 이 섹션 액션들의 dirty 상태 정리
  var m = (typeof getMdt === 'function') ? getMdt(year) : null;
  var sg = m ? m.subGoals.find(function(s){ return s.id === sgId; }) : null;
  if (sg) sg.actions.forEach(function(a){ delete mdtDirtyCards[mdtCardKey(year, sgId, a.id)]; });
  if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
  if (typeof renderHomeHabitWidget === 'function') renderHomeHabitWidget();
  // 버튼 피드백 + 토스트
  var btn = document.getElementById('mdt-detail-save-btn');
  if (btn) { var t = btn.innerHTML; btn.innerHTML = '\u2713 저장됨'; setTimeout(function(){ btn.innerHTML = t; }, 1200); }
  mdtToast('저장되었습니다 \u2705');
}

// 간단 토스트 (기존 .nb-toast 스타일 재사용)
function mdtToast(msg) {
  var old = document.getElementById('nb-toast'); if (old) old.remove();
  var t = document.createElement('div');
  t.id = 'nb-toast'; t.className = 'nb-toast'; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function(){ t.classList.add('show'); });
  setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ if (t.parentNode) t.remove(); }, 300); }, 1600);
}

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

  // Life Wheel \uc758 \uac19\uc740 \uc601\uc5ed\uc5d0\uc11c Goal(= smart.finalGoal)\uacfc Ideal \uc744 \ud568\uaed8 \uac00\uc838\uc628\ub2e4.
  //  \uc774 \ucc3d\uc758 \uc81c\ubaa9\uc774 '\ubaa9\ud45c'\uc778\ub370 \uc815\uc791 Goal \uc774 \uc548 \ubcf4\uc774\ub358 \ubb38\uc81c\ub97c \uc5ec\uae30\uc11c \ud574\uacb0\ud55c\ub2e4.
  var ideal = '', goal = '';
  var secName = sg.text || '';
  if (typeof getLwYear === 'function') {
    var lw = getLwYear(year);
    if (lw && lw.sections && lw.sections[idx]) {
      var lwSec = lw.sections[idx];
      ideal = lwSec.ideal || '';
      goal  = (lwSec.smart && lwSec.smart.finalGoal) || '';
      if (lwSec.name) secName = lwSec.name;
    }
  }
  // Life Wheel \uc5d0 \uc5c6\uc73c\uba74 \ub9cc\ub2e4\ub77c\ud2b8 Section \uc790\uccb4\uc758 SMART \ucd5c\uc885\ubaa9\ud45c\ub85c \ud3f4\ubc31
  if (!goal && sg.smart && sg.smart.finalGoal) goal = sg.smart.finalGoal;

  function _fieldBlock(icon, label, text, emptyMsg) {
    var inner = text
      ? '<div style="white-space:pre-wrap;line-height:1.7;font-size:14px;color:var(--text-1);">' + escMdt(text) + '</div>'
      : '<div class="smart-desc">' + emptyMsg + '</div>';
    return '<div class="smart-field"><div class="smart-field-header">'
      + '<span class="smart-icon">' + icon + '</span>'
      + '<span class="smart-label">' + label + '</span></div>'
      + inner + '</div>';
  }

  var body = _fieldBlock('&#127919;', '\ubaa9\ud45c (Life Wheel \u00b7 Goal)', goal,
      '\ub77c\uc774\ud504\ud720\uc5d0\uc11c \uc774 \uc601\uc5ed\uc758 \'Goal\'\uc744 \uc544\uc9c1 \uc785\ub825\ud558\uc9c0 \uc54a\uc558\uc5b4\uc694.')
    + _fieldBlock('&#10024;', '\uc774\uc0c1\uc801\uc778 \ubaa8\uc2b5 (Life Wheel \u00b7 Ideal)', ideal,
      '\ub77c\uc774\ud504\ud720\uc5d0\uc11c \uc774 \uc601\uc5ed\uc758 \'\uc774\uc0c1\uc801 \ubaa8\uc2b5(Ideal)\'\uc744 \uc544\uc9c1 \uc785\ub825\ud558\uc9c0 \uc54a\uc558\uc5b4\uc694.');

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
    + body
    + '</div>'
    + '<div class="lw-modal-footer">'
    + '<button class="lw-modal-cancel" onclick="document.getElementById(\'mdt-ideal-overlay\').remove()">\ub2eb\uae30</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

// ── Section의 Project 관리화면 (그리드 형태) ──
//  구분항목: Project | 달성형/습관형 | 목표 | 관리지표 | 달성현황 | 메모
function buildSgDetailHtml(m, sg) {
  if (!sg.smart) sg.smart = { specific:'', measurable:'', achievable:'', relevant:'', timeBound:'', finalGoal:'' };
  var perf = calcSgPerf(sg, m.year);

  var html = '<div class="mdt-detail-wrap">'
    + '<div class="mdt-detail-top">'
    + '<button class="mdt-back-btn" onclick="closeSgDetail()">&#8592; Mandalart</button>'
    + '<div class="mdt-detail-actions">'
    + '<button class="mdt-smart-open-btn" id="mdt-smart-btn-'+sg.id+'"'
    + ' onclick="openMdtIdeal('+m.year+','+sg.id+')" style="color:var(--brand-primary);">&#127919; 목표</button>'
    + '<button class="mdt-detail-save-btn" id="mdt-detail-save-btn" onclick="saveSgDetail('+m.year+','+sg.id+')">저장</button>'
    + '</div>'
    + '</div>'
    // 섹션 헤더 + 연간목표 실적 요약
    // [개선1] 가로 4등분: 왼쪽 1/4 = 이모지+SECTION명 / 나머지 3/4 = 진행현황 바 · 연간실적 % · 달성현황
    + '<div class="mdt-detail-hero mdt-detail-hero--split" style="border-left:4px solid '+sg.color+';">'
    +   '<div class="mdt-hero-title">'
    +     '<span class="mdt-hero-emoji">'+sg.emoji+'</span>'
    +     '<span class="mdt-hero-name" style="color:'+sg.color+';">'+escMdt(sg.text || ('Section '+sg.id))+'</span>'
    +   '</div>'
    +   '<div class="mdt-hero-perf">'
    +     '<div class="mdt-perf-dash-bar mdt-hero-bar"><div class="mdt-perf-dash-fill" style="width:'+perf.pct+'%;background:'+sg.color+';"></div></div>'
    +     '<span class="mdt-hero-pct">'+m.year+' 연간 실적 <b>'+perf.pct+'%</b></span>'
    +     '<span class="mdt-hero-count">달성 '+perf.done+'/'+perf.total+'</span>'
    +   '</div>'
    + '</div>'
    + '<div class="mdt-grid-table-wrap">'
    + '<table class="mdt-grid-table">'
    + '<thead><tr>'
    + '<th class="mgt-th-drag"></th>'
    + '<th class="mgt-th-proj" data-cr-key="proj">Project</th>'
    + '<th class="mgt-th-type" data-cr-key="type">유형</th>'
    + '<th class="mgt-th-goal" data-cr-key="goal">세부계획</th>'
    + '<th class="mgt-th-perf" data-cr-key="perf">달성현황</th>'
    + '<th class="mgt-th-memo" data-cr-key="memo">메모(실적)</th>'
    + '</tr></thead><tbody>';

  // [개선2] 드래그 순서(actionOrder)대로 Project 행 렌더 — SECTION 내 순서 변경 지원
  tlGetActionOrder(sg).forEach(function(actId) {
    var a = sg.actions.find(function(x){ return x.id === actId; });
    if (!a) return;
    if (!a.trackingType)     a.trackingType = 'task';
    if (!a.achieveType)      a.achieveType = 'cum';
    if (!a.habitFreq)        a.habitFreq = 'weekly';
    if (!a.successThreshold) a.successThreshold = 80;
    if (!a.habitLog)         a.habitLog = {};
    if (!a.resultMonths)     a.resultMonths = {};
    if (a.habitWeeklyTarget == null) a.habitWeeklyTarget = 1;
    html += buildMdtGridRow(m, sg, a);
  });

  html += '</tbody></table></div></div>';
  return html;
}

// action의 유형 값 ('cum' | 'result' | 'habit')
//  구버전 'daily'(일간) · 'monthly'(월간)도 전부 습관형 하나로 읽는다.
function mdtActTypeVal(a) {
  return (a.trackingType === 'habit') ? 'habit' : 'result';   // 유형 2종: 실적형 / 습관형
}

// 유형 선택 드롭다운 (그리드 · 실적 패널 공용 — 한 곳에서만 고치면 되도록)
function mdtTypeSelectHtml(year, sgId, actId, tv) {
  var opts = [
    ['result',  '실적형'],
    ['habit',   '습관형'],
  ].map(function(o) {
    return '<option value="' + o[0] + '"' + (tv === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  }).join('');
  return '<select class="mgt-type-sel" onchange="mdtSetActType(' + year + ',' + sgId + ',' + actId + ',this.value)">'
    + opts + '</select>';
}

// 유형 선택 변경 (그리드/실적 패널 공용)
function mdtSetActType(year, sgId, actId, val) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (val === 'habit') { a.trackingType = 'habit'; a.habitFreq = 'weekly'; }
  else { a.trackingType = 'task'; a.achieveType = 'result'; }
  if (!Array.isArray(a.resultEntries)) a.resultEntries = [];
  saveMandalarts();
  if (document.querySelector('.mdt-grid-table')) openSgDetail(year, sgId);
  else _mdtRerenderActCard(year, sgId, actId);
  if (typeof renderHomeHabitWidget === 'function') renderHomeHabitWidget();
}

// 누적 실적 저장
function mdtSaveCum(year, sgId, actId, val) {
  saveActF(year, sgId, actId, 'cumActual', +val || 0);
  saveMandalarts();
  openSgDetail(year, sgId);
}

// 실적형: 12월 달성 여부 토글
function mdtToggleResultDone(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  a.completed = !a.completed;
  if (!a.resultMonths) a.resultMonths = {};
  a.resultMonths[12] = a.completed;
  saveMandalarts();
  if (document.querySelector('.mdt-grid-table')) openSgDetail(year, sgId);
  else _mdtRerenderActCard(year, sgId, actId);
  refreshMdtGridForAction(year, sgId, actId);
}

// 실적형: 월별 달성 여부 토글 (12월 = 그 해 성공 판단)
function mdtToggleResultMonth(year, sgId, actId, month) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (!a.resultMonths) a.resultMonths = {};
  a.resultMonths[month] = ((a.resultMonths[month] || 0) + 1) % 3;   // 0→1(달성)→2(실패)→0
  if (month === 12) a.completed = (a.resultMonths[12] === 1);       // 12월 달성 = 연 성공
  saveMandalarts();
  if (document.querySelector('.mdt-grid-table')) openSgDetail(year, sgId);
  else _mdtRerenderActCard(year, sgId, actId);
  refreshMdtGridForAction(year, sgId, actId);
}

// 실적형: 1~12월 월별 달성 배지 (클릭 시 초록으로 달성 표시, 12월은 연 성공 판단)
function mdtResultMonthsHtml(yr, sgId, a) {
  if (!a.resultMonths) a.resultMonths = {};
  if (a.resultMonths[12] == null && a.completed) a.resultMonths[12] = 1; // 기존 데이터 마이그레이션
  var cells = '';
  for (var mo = 1; mo <= 12; mo++) {
    var st = a.resultMonths[mo] || 0;                 // 0 없음 · 1 달성 · 2 실패
    var cls = (st === 1 ? ' on' : (st === 2 ? ' fail' : ''));
    var isDec = (mo === 12);
    cells += '<button type="button" class="mgt-month-badge' + (isDec ? ' is-dec' : '') + cls + '"'
      + ' title="' + mo + '월' + (isDec ? ' · 연 성공 판단' : '') + ' (클릭: 달성→실패→해제)"'
      + ' onclick="mdtToggleResultMonth(' + yr + ',' + sgId + ',' + a.id + ',' + mo + ')">' + mo + '월</button>';
  }
  return '<div class="mgt-month-grid">' + cells + '</div>';
}

// 그리드 셀: 목표
//  네 유형 모두 '목표'는 글로 적는다 — 무엇을 이루려는지는 숫자가 아니라 문장이다.
//  숫자(목표값 · 성공기준)는 전부 오른쪽 '달성현황' 칸에서 직접 입력한다.
function mdtGoalCellHtml(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  return '<input type="text" class="mgt-text-inp" value="' + escMdt(a.goalText || '') + '" placeholder="세부계획"'
    + ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'goalText\',this.value);saveMandalarts();">';
}

// 그리드 셀: 달성현황 — 실적/목표(단위) 요약 + 진행바. 바(칸)를 누르면 실적 입력 창이 뜬다.
function mdtPerfCellHtml(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var perf = mdtActPerf(a, yr);
  return '<div class="mgt-perf-wrap" onclick="mdtOpenPerfModal(' + yr + ',' + sgId + ',' + a.id + ')" title="클릭해 실적 입력">'
    + '<div class="mgt-perf-summary">' + escMdt(perf.label) + (perf.achieved ? ' <span class="mgt-perf-badge-sq on">달성</span>' : '') + '</div>'
    + '<div class="mdt-perf-dash-bar mgt-perf-clickbar"><div class="mdt-perf-dash-fill" style="width:' + perf.pct + '%;background:' + sg.color + ';"></div></div>'
    + '</div>';
}

// ============================================================
//  📥 실적 입력 모달 (달성현황 바 클릭 → 새 창)
//   · 실적형: 목표값·단위 + [일자·내용] 표(일자 입력 시 자동 실적 카운팅)
//   · 습관형: 주N회·성공기준% + 1~12월 캘린더(날짜 클릭 시 실적 카운팅)
// ============================================================
function mdtOpenPerfModal(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  var old = document.getElementById('mdt-perf-modal-overlay'); if (old) old.remove();
  var isHabit = (a.trackingType === 'habit');
  var title = (a.text && a.text.trim()) ? a.text : ('Project ' + a.id);
  var html = '<div class="mdt-proj-overlay" id="mdt-perf-modal-overlay" onclick="if(event.target===this)mdtClosePerfModal()">'
    + '<div class="mdt-proj-modal mdt-perf-modal">'
    +   '<div class="mdt-proj-modal-header" style="border-bottom:3px solid ' + sg.color + ';">'
    +     '<div class="mdt-proj-modal-title"><span style="font-size:22px;">' + sg.emoji + '</span>'
    +       '<span>' + escMdt(title) + '</span>'
    +       '<span class="mdt-perf-modal-tag">' + (isHabit ? '습관형' : '실적형') + '</span></div>'
    +     '<button class="mdt-proj-close" onclick="mdtClosePerfModal()">✕</button>'
    +   '</div>'
    +   '<div class="mdt-proj-modal-body" id="mdt-perf-modal-body"></div>'
    +   '<div class="mdt-proj-modal-footer">'
    +     '<button class="mdt-proj-save" onclick="mdtClosePerfModal()" style="background:' + sg.color + ';">닫기</button>'
    +   '</div>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  _mdtPerfModalCtx = { year: year, sgId: sgId, actId: actId };
  mdtRenderPerfModalBody(year, sgId, actId);
}
var _mdtPerfModalCtx = null;

function mdtClosePerfModal() {
  var el = document.getElementById('mdt-perf-modal-overlay'); if (el) el.remove();
  // 그리드가 열려 있으면 달성현황 갱신
  if (_mdtPerfModalCtx && document.querySelector('.mdt-grid-table')) {
    openSgDetail(_mdtPerfModalCtx.year, _mdtPerfModalCtx.sgId);
  }
  _mdtPerfModalCtx = null;
}

function mdtRenderPerfModalBody(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  var body = document.getElementById('mdt-perf-modal-body'); if (!body) return;
  body.innerHTML = (a.trackingType === 'habit')
    ? mdtBuildHabitModalBody(m, sg, a)
    : mdtBuildResultModalBody(m, sg, a);
}

// 달성현황 요약 + 바 (모달 상단 공용)
function mdtPerfModalHead(m, sg, a) {
  var perf = mdtActPerf(a, m.year);
  return '<div class="mdt-perf-modal-head">'
    + '<div class="mdt-perf-modal-sum">' + escMdt(perf.label) + (perf.achieved ? ' <span class="mgt-perf-badge-sq on">달성</span>' : '') + '</div>'
    + '<div class="mdt-perf-dash-bar"><div class="mdt-perf-dash-fill" style="width:' + perf.pct + '%;background:' + sg.color + ';"></div></div>'
    + '</div>';
}

// ── 실적형 모달: 목표값·단위 + 일자/내용 표 ──
function mdtBuildResultModalBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  if (!Array.isArray(a.resultEntries)) a.resultEntries = [];
  var save = 'saveMandalarts();mdtRenderPerfModalBody(' + yr + ',' + sgId + ',' + a.id + ');';
  var head = '<div class="mdt-perf-goalrow">'
    + '<label>목표값</label>'
    + '<input type="text" inputmode="numeric" class="mdt-num-inp" value="' + (+a.annualTarget || 0) + '"'
    +   ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'annualTarget\',+this.value);' + save + '">'
    + '<input type="text" class="mdt-unit-inp" value="' + escMdt(a.annualUnit || '') + '" placeholder="단위"'
    +   ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'annualUnit\',this.value);' + save + '">'
    + '</div>';
  // 표: 기존 기록 + 항상 빈 행 1개(입력 시 자동 추가)
  var rows = '';
  a.resultEntries.forEach(function(e, idx) {
    rows += mdtResultRowHtml(yr, sgId, a.id, idx, e.date || '', e.text || '', false);
  });
  rows += mdtResultRowHtml(yr, sgId, a.id, a.resultEntries.length, '', '', true);   // 새 입력용 빈 행
  var table = '<div class="mdt-perf-tbl">'
    + '<div class="mdt-perf-tbl-hd"><span class="c-idx">#</span><span class="c-date">일자</span><span class="c-text">내용</span><span class="c-del"></span></div>'
    + rows
    + '</div>'
    + '<div class="mdt-perf-tbl-hint">※ 일자를 입력하면 자동으로 실적 1건으로 집계됩니다.</div>';
  return mdtPerfModalHead(m, sg, a) + head + table;
}

function mdtResultRowHtml(yr, sgId, actId, idx, date, text, isNew) {
  var chg = 'mdtResultRowChange(' + yr + ',' + sgId + ',' + actId + ',' + idx + ',';
  return '<div class="mdt-perf-tr' + (isNew ? ' is-new' : '') + '">'
    + '<span class="c-idx">' + (isNew ? '+' : (idx + 1)) + '</span>'
    + '<input type="date" class="c-date mdt-perf-date" value="' + date + '" onchange="' + chg + '\'date\',this.value)">'
    + '<input type="text" class="c-text mdt-perf-txt" value="' + escMdt(text) + '" placeholder="내용" onchange="' + chg + '\'text\',this.value)">'
    + (isNew ? '<span class="c-del"></span>'
             : '<button class="c-del mdt-perf-del" title="삭제" onclick="mdtDelResultRow(' + yr + ',' + sgId + ',' + actId + ',' + idx + ')">✕</button>')
    + '</div>';
}

function mdtResultRowChange(year, sgId, actId, idx, field, value) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (!Array.isArray(a.resultEntries)) a.resultEntries = [];
  if (idx >= a.resultEntries.length) a.resultEntries.push({ date: '', text: '' });  // 빈 행 → 실제 행
  a.resultEntries[idx][field] = value;
  // 일자·내용이 모두 비면 그 행 제거(빈 행 정리)
  a.resultEntries = a.resultEntries.filter(function(e){ return (e.date && e.date.trim()) || (e.text && e.text.trim()); });
  saveMandalarts();
  mdtRenderPerfModalBody(year, sgId, actId);
}

function mdtDelResultRow(year, sgId, actId, idx) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  if (!Array.isArray(a.resultEntries)) return;
  a.resultEntries.splice(idx, 1);
  saveMandalarts();
  mdtRenderPerfModalBody(year, sgId, actId);
}

// ── 습관형 모달: 주N회·성공기준% + 1~12월 캘린더 ──
function mdtBuildHabitModalBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var save = 'saveMandalarts();mdtRenderPerfModalBody(' + yr + ',' + sgId + ',' + a.id + ');';
  var head = '<div class="mdt-perf-goalrow">'
    + '<label>목표</label><span class="mdt-perf-hint">주</span>'
    + '<input type="text" inputmode="numeric" class="mdt-num-inp mdt-num-sm" value="' + (a.habitWeeklyTarget || 1) + '" title="주 N회"'
    +   ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'habitWeeklyTarget\',+this.value);' + save + '">'
    + '<span class="mdt-perf-hint">회 · 52주 중</span>'
    + '<input type="text" inputmode="numeric" class="mdt-num-inp mdt-num-sm" value="' + (a.successThreshold || 80) + '" title="성공 기준(%)"'
    +   ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'successThreshold\',+this.value);' + save + '">'
    + '<span class="mdt-perf-hint">% 이상 달성 시 성공</span>'
    + '</div>';
  return mdtPerfModalHead(m, sg, a) + head + mdt12MonthCalHtml(yr, sgId, a);
}

// 1~12월 미니 캘린더 (클릭 시 toggleHabitDay)
function mdt12MonthCalHtml(year, sgId, a) {
  var log = a.habitLog || {};
  var today = new Date();
  var DOW = ['일','월','화','수','목','금','토'];
  var MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var months = '';
  for (var mo = 0; mo < 12; mo++) {
    var daysIn = new Date(year, mo + 1, 0).getDate();
    var firstDow = new Date(year, mo, 1).getDay();
    var cells = DOW.map(function(d){ return '<span class="mc-dow">' + d + '</span>'; }).join('');
    for (var i = 0; i < firstDow; i++) cells += '<span class="mc-cell mc-empty"></span>';
    for (var d = 1; d <= daysIn; d++) {
      var cd = new Date(year, mo, d);
      var dKey = fmtHabitKey(cd);
      var isFuture = cd > today;
      var isDone = !!log[dKey];
      var isToday = (d === today.getDate() && mo === today.getMonth() && year === today.getFullYear());
      var cls = 'mc-cell' + (isDone ? ' mc-done' : '') + (isToday ? ' mc-today' : '') + (isFuture ? ' mc-future' : '');
      cells += '<span class="' + cls + '"' + (isFuture ? '' : ' onclick="toggleHabitDay(' + year + ',' + sgId + ',' + a.id + ',\'' + dKey + '\')"') + '>' + d + '</span>';
    }
    months += '<div class="mc-month"><div class="mc-title">' + MONTHS[mo] + '</div><div class="mc-grid">' + cells + '</div></div>';
  }
  return '<div class="mdt-12mo-cal">' + months + '</div>';
}

// 그리드 행 (습관형은 아래에 월간 캘린더 행 추가: 캘린더 왼쪽 · 메모 오른쪽)
function buildMdtGridRow(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var tv = mdtActTypeVal(a);
  var typeSel = mdtTypeSelectHtml(yr, sgId, a.id, tv);

  var memoCell = '<div class="mdt-memo-box mdt-memo-sm" contenteditable="true" spellcheck="false" data-ph=""'
      + ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '" data-field="memo"'
      + ' onblur="saveActCE(this);saveMandalarts();">' + escMdt(a.memo || '').replace(/\n/g, '<br>') + '</div>';

  var html = '<tr class="mgt-row tl-dnd-row" id="mdt-grid-row-' + yr + '-' + sgId + '-' + a.id + '"'
    + ' ondragover="mdtActDragOver(event,' + a.id + ')" ondragleave="tlDragLeave(event)" ondrop="mdtActDrop(event,' + yr + ',' + sgId + ',' + a.id + ')">'
    + '<td class="mgt-td-drag">'
    + '<span class="tl-drag-handle" draggable="true" title="드래그해 Project 순서 변경"'
    + ' onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"'
    + ' ondragstart="mdtActDragStart(event,' + a.id + ')" ondragend="tlDragEnd(event)">\u283F</span>'
    + '</td>'
    + '<td class="mgt-td-proj">'
    + '<span contenteditable="true" spellcheck="false" class="mdt-act-title-text"'
    + ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '"'
    + ' onblur="saveMdtActText(this);saveMandalarts();refreshMdtGridForAction(' + yr + ',' + sgId + ',' + a.id + ');"'
    + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}">'
    + (a.text ? escMdt(a.text) : '<span style="opacity:0.35;">Project ' + a.id + '</span>') + '</span>'
    + '</td>'
    + '<td class="mgt-td-type">' + typeSel + '</td>'
    + '<td class="mgt-td-goal">' + mdtGoalCellHtml(m, sg, a) + '</td>'
    + '<td class="mgt-td-perf">' + mdtPerfCellHtml(m, sg, a) + '</td>'
    + '<td class="mgt-td-memo">' + memoCell + '</td>'
    + '</tr>';

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
  _mdtRerenderActCard(year, sgId, actId);
}

// 이번 주 일요일 0시 반환
function mdtWeekStartOf(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// 액션카드/습관 상세 다시 그리기 (공용)
//  - Section 관리 그리드의 습관 상세(div.mgt-habit-detail)면 그리드 전체 재렌더
//  - 우측 실적 패널의 액션 카드면 카드만 교체
function _mdtRerenderActCard(year, sgId, actId) {
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  var a = sg.actions.find(function(x){ return x.id === actId; }); if (!a) return;
  // 세부 실적관리 그리드가 열려 있으면 그리드 전체를 다시 그린다(캘린더는 달성현황 셀에 위치)
  if (document.querySelector('.mdt-grid-table')) { openSgDetail(year, sgId); return; }
  var card = document.getElementById('mdt-act-card-' + year + '-' + sgId + '-' + actId);
  if (!card) return;
  if (card.classList && card.classList.contains('mgt-habit-detail')) {
    openSgDetail(year, sgId);
  } else {
    card.outerHTML = buildActionCard(m, sg, a);
  }
}

function buildHabitCalendar(year, sgId, a) {
  var key = year + '-' + sgId + '-' + a.id;

  // 공용 셀 스타일
  var S_GRID = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:4px;';
  var S_DOW  = 'font-size:9px;text-align:center;color:var(--text-3);padding:1px 0;';
  // 세로 높이를 기존(정사각형)의 50%로 축소: aspect-ratio 2/1 (너비:높이 = 2:1)
  var S_CELL_BASE = 'aspect-ratio:2/1;border-radius:4px;font-size:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;color:var(--text-2);background:var(--surface);';
  var S_DONE   = 'background:rgba(139,92,246,0.3);color:#a78bfa;font-weight:700;';
  var S_TODAY  = 'outline:1.5px solid rgba(139,92,246,0.65);';
  var S_FUTURE = 'opacity:0.25;pointer-events:none;';
  var S_EMPTY  = 'background:transparent;pointer-events:none;';
  var S_NAV    = 'cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text-2);font-size:13px;line-height:1;padding:1px 8px;user-select:none;';
  var S_NAV_OFF = S_NAV + 'opacity:0.25;pointer-events:none;';
  var DOW_KO = ['일','월','화','수','목','금','토'];

  // 월간 캘린더만 표시 (주간 전환 버튼 제거)
  var inner = _buildHabitMonthGrid(year, sgId, a, key, { S_GRID:S_GRID, S_DOW:S_DOW, S_CELL_BASE:S_CELL_BASE, S_DONE:S_DONE, S_TODAY:S_TODAY, S_FUTURE:S_FUTURE, S_EMPTY:S_EMPTY, S_NAV:S_NAV, S_NAV_OFF:S_NAV_OFF, DOW_KO:DOW_KO });

  return '<div style="margin-top:4px;">' + inner + '</div>';
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

// 달성형 실적 블록 (누적형: 연간목표 대비 누적 실적 / 실적형: 12월 달성 여부)
function buildAnnualTargetHtml(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  // 실적형: 실적/목표(단위) 요약 + 진행바(클릭 시 실적 입력 모달)
  var perf = mdtActPerf(a, yr);
  return '<div class="mdt-annual-block">'
    + '<div class="mgt-perf-wrap" onclick="mdtOpenPerfModal(' + yr + ',' + sgId + ',' + a.id + ')" title="클릭해 실적 입력">'
    +   '<div class="mgt-perf-summary">' + escMdt(perf.label) + (perf.achieved ? ' <span class="mgt-perf-badge-sq on">달성</span>' : '') + '</div>'
    +   '<div class="mdt-perf-dash-bar mgt-perf-clickbar"><div class="mdt-perf-dash-fill" style="width:' + perf.pct + '%;background:' + sg.color + ';"></div></div>'
    + '</div>'
    + '</div>';
}

function buildTaskCardBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var S_ROW   = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;';
  var S_LABEL = 'font-size:11px;color:var(--text-3);min-width:52px;padding-top:3px;flex-shrink:0;';
  return '<div style="padding:4px 0;">'
    + buildAnnualTargetHtml(m, sg, a)
    + '<div style="' + S_ROW + 'flex-direction:column;gap:5px;">'
    +   '<span style="' + S_LABEL + '">메모(실적)</span>'
    +   '<div class="mdt-memo-box" contenteditable="true" spellcheck="false" data-ph=""'
    +     ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '" data-field="memo"'
    +     ' onblur="saveActCE(this)">' + escMdt(a.memo || '').replace(/\n/g, '<br>') + '</div>'
    + '</div>'
    + '</div>';
}

function buildHabitCardBody(m, sg, a) {
  var yr = m.year, sgId = sg.id;
  var threshold = a.successThreshold || 80;
  var yearStat = mdtHabitYearWeeks(a, m.year);

  return '<div style="padding:4px 0;">'
    + '<div class="mdt-hb-settings">'
    +   '<span class="mdt-hb-lbl">주</span>'
    +   '<input type="text" inputmode="numeric" class="mdt-hb-thr" value="' + (a.habitWeeklyTarget || 1) + '"'
    +     ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'habitWeeklyTarget\',+this.value)" title="주 N회 목표">회 (연간'
    +   '<input type="text" inputmode="numeric" class="mdt-hb-thr" value="' + threshold + '"'
    +     ' onchange="saveActF(' + yr + ',' + sgId + ',' + a.id + ',\'successThreshold\',+this.value)" title="연간 성공 기준(달성 주 비율)">%) 이상'
    +   '<span class="mdt-hb-chip" title="연간 달성 현황">📊 ' + yearStat.done + '주/' + yearStat.total + '주 (<b>' + yearStat.rate + '</b>%)</span>'
    + '</div>'
    // 월간 캘린더(왼쪽) + 메모(오른쪽) — 주간 실적/주간 버튼 제거
    + '<div class="mdt-hb-main">'
    +   '<div class="mdt-hb-cal-col">' + buildHabitCalendar(yr, sgId, a) + '</div>'
    +   '<div class="mdt-hb-week-col">'
    +     '<div class="mdt-hb-memo-wrap">'
    +       '<span class="mdt-hb-lbl">메모(실적)</span>'
    +       '<div class="mdt-memo-box mdt-memo-sm" contenteditable="true" spellcheck="false" data-ph=""'
    +         ' data-year="' + yr + '" data-sg="' + sgId + '" data-act="' + a.id + '" data-field="memo"'
    +         ' onblur="saveActCE(this)">' + escMdt(a.memo || '').replace(/\n/g, '<br>') + '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '</div>';
}


function buildActionCard(m, sg, a) {
  if (!a.trackingType)           a.trackingType = 'task';
  if (!a.successThreshold)       a.successThreshold = 80;
  if (!a.habitLog)               a.habitLog = {};
  if (!a.resultMonths)           a.resultMonths = {};
  if (a.habitWeeklyTarget == null) a.habitWeeklyTarget = 1;
  if (a.annualTarget === undefined) a.annualTarget = 0;
  if (a.annualUnit === undefined)   a.annualUnit = '';
  if (!Array.isArray(a.quarters))   a.quarters = defaultMdtQuarters();
  var yr = m.year, sgId = sg.id;
  var isHabit = a.trackingType === 'habit';
  var titleDisp = a.text ? escMdt(a.text) : '<span style="opacity:0.35;">Project ' + a.id + '</span>';

  var tv = mdtActTypeVal(a);
  var typeToggle = mdtTypeSelectHtml(yr, sgId, a.id, tv);

  var body = isHabit ? buildHabitCardBody(m, sg, a) : buildTaskCardBody(m, sg, a);

  var dirtyClass = mdtDirtyCards[mdtCardKey(yr, sgId, a.id)] ? ' mdt-card-dirty' : '';
  var saveBtn = '<button class="mdt-act-save-btn" onclick="commitMdtCard(' + yr + ',' + sgId + ',' + a.id + ')">저장</button>';

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
    setTimeout(function(){ btn.textContent = '저장'; }, 1200);
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
  saveMandalarts();   // home Habit Tracker와 즉시 연동
  if (document.getElementById('mdt-perf-modal-overlay')) mdtRenderPerfModalBody(year, sgId, actId);
  _mdtRerenderActCard(year, sgId, actId);
  if (typeof renderHomeHabitWidget === 'function') renderHomeHabitWidget();
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

// ============================================================
//  🔀 Section / Project 드래그 순서 변경 (라이프휠·만다라트 공용)
//  - 데이터 배열/ID는 건드리지 않고 "표시 순서(order)"만 저장 → Task 연결 안전
//  - Section 순서는 라이프휠·만다라트가 공유(양쪽에 함께 저장)해 항상 동기화
// ============================================================
function tlSanitizeOrder(ord, n) {
  var out = [], seen = {};
  if (Array.isArray(ord)) ord.forEach(function(v){ v = +v; if (v >= 0 && v < n && !seen[v]) { seen[v] = 1; out.push(v); } });
  for (var i = 0; i < n; i++) if (!seen[i]) out.push(i);
  return out;
}
function tlMoveInOrder(order, fromId, toId, after) {
  if (fromId === toId) return order.slice();
  var a = order.slice();
  var fi = a.indexOf(fromId); if (fi < 0) return a;
  var mv = a.splice(fi, 1)[0];
  var ti = a.indexOf(toId); if (ti < 0) ti = a.length; else if (after) ti += 1;
  a.splice(ti, 0, mv);
  return a;
}
// Section 표시순서(섹션 인덱스 0..7의 순열) — 만다라트·라이프휠 레코드에 함께 저장
function tlGetSectionOrder(year) {
  var ord = null;
  var m = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (m && Array.isArray(m.sectionOrder)) ord = m.sectionOrder;
  if (!ord) { var lw = (typeof getLwYear === 'function') ? getLwYear(year) : null; if (lw && Array.isArray(lw.sectionOrder)) ord = lw.sectionOrder; }
  return tlSanitizeOrder(ord, 8);
}
function tlSetSectionOrder(year, ord) {
  ord = tlSanitizeOrder(ord, 8);
  var m = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (m) { m.sectionOrder = ord; if (typeof saveMandalarts === 'function') saveMandalarts(); }
  var lw = (typeof getLwYear === 'function') ? getLwYear(year) : null;
  if (lw) { lw.sectionOrder = ord; if (typeof saveLifeWheel === 'function') saveLifeWheel(); }
}
// Project(action) 표시순서(action id 목록) — 해당 subGoal 에 저장
function tlGetActionOrder(sg) {
  var ids = (sg.actions || []).map(function(a){ return a.id; });
  var ord = Array.isArray(sg.actionOrder) ? sg.actionOrder.filter(function(id){ return ids.indexOf(id) >= 0; }) : [];
  ids.forEach(function(id){ if (ord.indexOf(id) < 0) ord.push(id); });
  return ord;
}

// ── 공용 드래그 상태/헬퍼 ──
var _tlDrag = null;
function tlClearDrops(except) {
  document.querySelectorAll('.tl-drop-before, .tl-drop-after').forEach(function(el){
    if (el !== except) { el.classList.remove('tl-drop-before'); el.classList.remove('tl-drop-after'); }
  });
}
function tlDragEnd() {
  _tlDrag = null;
  document.querySelectorAll('.tl-dragging').forEach(function(el){ el.classList.remove('tl-dragging'); });
  tlClearDrops(null);
}
function tlDragLeave(ev) {
  var r = ev.currentTarget;
  if (r) { r.classList.remove('tl-drop-before'); r.classList.remove('tl-drop-after'); }
}
function tlGenericStart(ev, type, id) {
  _tlDrag = { type: type, id: id };
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(id)); } catch (e) {}
  var row = ev.currentTarget.closest ? ev.currentTarget.closest('.tl-dnd-row') : null;
  if (row) setTimeout(function(){ row.classList.add('tl-dragging'); }, 0);
}
function tlGenericOver(ev, type, id) {
  if (!_tlDrag || _tlDrag.type !== type) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  var row = ev.currentTarget;
  if (id === _tlDrag.id) { tlClearDrops(null); return; }
  tlClearDrops(row);
  var rect = row.getBoundingClientRect();
  var after = ev.clientY > rect.top + rect.height / 2;
  row.classList.toggle('tl-drop-after', after);
  row.classList.toggle('tl-drop-before', !after);
}
function tlDropIsAfter(ev) {
  var row = ev.currentTarget;
  if (!row) return false;
  var r = row.getBoundingClientRect();
  return ev.clientY > r.top + r.height / 2;
}

// ── 만다라트 Section(대시보드 카드) 순서 변경 ──
function mdtSecDragStart(ev, idx) { tlGenericStart(ev, 'sec', idx); }
function mdtSecDragOver(ev, idx)  { tlGenericOver(ev, 'sec', idx); }
function mdtSecDrop(ev, idx) {
  ev.preventDefault();
  if (!_tlDrag || _tlDrag.type !== 'sec') { tlDragEnd(); return; }
  var from = _tlDrag.id, after = tlDropIsAfter(ev);
  tlDragEnd();
  if (from === idx) return;
  var year = (typeof currentMdtYear !== 'undefined' && currentMdtYear) ? currentMdtYear : (typeof appGetYear === 'function' ? appGetYear() : null);
  tlSetSectionOrder(year, tlMoveInOrder(tlGetSectionOrder(year), from, idx, after));
  if (typeof renderMdtPerfPanel === 'function') renderMdtPerfPanel(year);
}

// ── 만다라트 Project(action 카드) 순서 변경 ──
function mdtActDragStart(ev, actId) { tlGenericStart(ev, 'act', actId); }
function mdtActDragOver(ev, actId)  { tlGenericOver(ev, 'act', actId); }
function mdtActDrop(ev, year, sgId, actId) {
  ev.preventDefault();
  if (!_tlDrag || _tlDrag.type !== 'act') { tlDragEnd(); return; }
  var from = _tlDrag.id, after = tlDropIsAfter(ev);
  tlDragEnd();
  if (from === actId) return;
  var m = getMdt(year); if (!m) return;
  var sg = m.subGoals.find(function(s){ return s.id === sgId; }); if (!sg) return;
  sg.actionOrder = tlMoveInOrder(tlGetActionOrder(sg), from, actId, after);
  if (typeof saveMandalarts === 'function') saveMandalarts();
  // 세부 실적관리 그리드가 열려 있으면 그리드를 다시 그림, 아니면 실적 패널 갱신
  if (document.querySelector('.mdt-grid-table')) { if (typeof openSgDetail === 'function') openSgDetail(year, sgId); }
  else if (typeof renderMdtPerfPanel === 'function') renderMdtPerfPanel(year);
}
