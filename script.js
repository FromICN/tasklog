// ============================================
//  My TaskLog - 메인 스크립트 (MS To-Do 스타일)
// ============================================

let tasks = [];
const pickerState = {};
let currentCategory = 'home';
let detailTaskId = null;
let completedSectionOpen = false;
let dpTitleSaveTimer = null;
const STORAGE_KEY = 'my-tasklog-data';
let searchQuery = '';
let datePlanDate = null;

const REPEAT_LABELS = {
  daily:   '매일',
  weekday: '평일마다',
  weekly:  '매주',
  monthly: '매달',
  yearly:  '매년'
};

// ============================================
//  🔍 검색
// ============================================

function handleSearch(query) {
  searchQuery = query.trim();
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.style.display = searchQuery ? 'inline-flex' : 'none';
  const titleEl = document.getElementById('category-title');
  if (titleEl) {
    if (searchQuery) {
      titleEl.textContent = '"' + searchQuery + '" 검색 결과';
    } else {
      const activeNav = document.querySelector('#category-list li.active .nav-label');
      if (activeNav) titleEl.textContent = activeNav.textContent;
    }
  }
  renderTasks();
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  handleSearch('');
}

function highlightText(text, query) {
  const escaped = escapeHtml(text);
  if (!query) return escaped;
  const safeQ = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp('(' + safeQ + ')', 'gi'),
    '<mark class="search-hl">$1</mark>');
}

// ============================================
//  💾 로컬스토리지
// ============================================

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  if (typeof scheduleAutoBackup === 'function') scheduleAutoBackup();
}

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    tasks = JSON.parse(saved).map(t => {
      const normalized = { steps: [], reminder: null, assignee: '', assignees: [], repeat: null, startDate: null, prevTaskIds: [], nextTaskIds: [], ...t };
      if (!Array.isArray(normalized.prevTaskIds)) normalized.prevTaskIds = [];
      if (!Array.isArray(normalized.nextTaskIds)) normalized.nextTaskIds = [];
      // 구 버전 호환: assignee 문자열 → assignees 배열
      if (!Array.isArray(normalized.assignees)) normalized.assignees = [];
      if (normalized.assignee && normalized.assignees.length === 0) {
        normalized.assignees = [normalized.assignee];
      }
      normalized.assignee = '';
      normalized.steps = normalized.steps.map(s => ({ dueDateTime: null, hasTime: false, ...s }));
      // 구 버전 호환: 상태값 보류/지연 → 연기로 통합
      if (normalized.status === '보류' || normalized.status === '지연') normalized.status = '연기';
      return normalized;
    });
  }
}

// ============================================
//  ✏️ TASK CRUD
// ============================================

// ── TASK 카테고리 상태 ──
var _taskCat = { lwIdx: null, lwName: '', lwEmoji: '', sgId: null, sgText: '', actionId: null, actionText: '', year: null };

function addTask(text, dueDate, dueTime) {
  if (!text.trim()) return;
  let dueDateTime = null;
  if (dueDate) dueDateTime = dueTime ? dueDate+'T'+dueTime+':00' : dueDate+'T09:00:00';
  const task = {
    id: Date.now(), text: text.trim(), completed: false, starred: false,
    createdAt: new Date().toISOString(), dueDateTime, hasTime: !!dueTime,
    steps: [], reminder: null, assignee: '', assignees: [], repeat: null, startDate: null, prevTaskIds: [], nextTaskIds: []
  };
  // 카테고리 저장
  if (_taskCat.lwIdx !== null) {
    task.lwSection = _taskCat.lwIdx;
    task.lwSectionName = _taskCat.lwName;
    task.lwSectionEmoji = _taskCat.lwEmoji;
  }
  if (_taskCat.sgId !== null) {
    task.mdtGoal = { year: _taskCat.year, sgId: _taskCat.sgId, text: _taskCat.sgText };
  }
  if (_taskCat.actionId !== null) {
    task.mdtAction = { year: _taskCat.year, sgId: _taskCat.sgId, actionId: _taskCat.actionId, text: _taskCat.actionText };
  }
  tasks.push(task);
  saveTasks(); renderTasks(); updateCategoryCounts();
  clearTaskCat();
}

// 완료 시 [YYMMDD] 접두사 부여 / 해제 시 제거 (Task·To Do 공통)
function applyDonePrefix(text, done) {
  if (done) {
    if (/^\[\d{6}\]/.test(text)) return text;
    var now = new Date();
    var yy = String(now.getFullYear()).slice(2);
    var mm = String(now.getMonth()+1).padStart(2,'0');
    var dd = String(now.getDate()).padStart(2,'0');
    return '[' + yy + mm + dd + '] ' + text;
  }
  return text.replace(/^\[\d{6}\] /, '');
}

function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;

  if (task.completed) {
    // 완료 처리: [YYMMDD] 접두사 추가 (중복 방지)
    if (!/^\[\d{6}\]/.test(task.text)) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(2);
      const mm = String(now.getMonth()+1).padStart(2,'0');
      const dd = String(now.getDate()).padStart(2,'0');
      task.text = '[' + yy + mm + dd + '] ' + task.text;
    }
  } else {
    // 완료 취소: [YYMMDD] 접두사 제거
    task.text = task.text.replace(/^\[\d{6}\] /, '');
  }

  saveTasks(); renderTasks(); updateCategoryCounts();
  if (detailTaskId === id) {
    document.querySelector('.dp-check')?.classList.toggle('is-done', task.completed);
    // 디테일 패널 타이틀도 업데이트
    const ta = document.getElementById('dp-title-area');
    if (ta) { ta.value = task.text; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  }
}

function toggleStar(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.starred = !task.starred;
  saveTasks(); renderTasks(); updateCategoryCounts();
  if (detailTaskId === id) {
    const btn = document.querySelector('.dp-star');
    if (btn) { btn.textContent = task.starred ? '★' : '☆'; btn.classList.toggle('starred', task.starred); }
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(); renderTasks(); updateCategoryCounts();
}

// ============================================
//  📅 날짜 유틸리티
// ============================================

function formatDueDate(isoString, hasTime) {
  const date = new Date(isoString);
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const taskDate = new Date(date); taskDate.setHours(0,0,0,0);
  const timeStr = hasTime
    ? ' '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')
    : '';
  if (taskDate.getTime() === today.getTime()) return '오늘'+timeStr;
  if (taskDate.getTime() === tomorrow.getTime()) return '내일'+timeStr;
  return (date.getMonth()+1)+'/'+date.getDate()+timeStr;
}

function getDueStatus(isoString) {
  if (!isoString) return null;
  const now = new Date(), due = new Date(isoString);
  const today = new Date(); today.setHours(0,0,0,0);
  const dueDate = new Date(due); dueDate.setHours(0,0,0,0);
  if (due < now && dueDate.getTime() !== today.getTime()) return 'overdue';
  if (dueDate.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

function toDateInputVal(iso) {
  const d = new Date(iso);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function toTimeInputVal(iso) {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function escapeHtml(text) {
  const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
}

// ============================================
//  🎨 TASK 렌더링
// ============================================

function getFilteredTasks() {
  // 검색 모드: 카테고리 무관하게 전체 검색
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    return tasks.filter(t => {
      if (t.text.toLowerCase().includes(q)) return true;
      if (t.steps && t.steps.some(s => s.text.toLowerCase().includes(q))) return true;
      return false;
    });
  }
  if (currentCategory === 'important') return tasks.filter(t => t.starred);
  if (currentCategory === 'today') {
    const today = new Date().toDateString();
    return tasks.filter(t => {
      // 할 일 자체의 기한이 오늘
      if (t.dueDateTime && new Date(t.dueDateTime).toDateString() === today) return true;
      // 단계 중 하나라도 기한이 오늘
      if (t.steps && t.steps.some(s => s.dueDateTime && new Date(s.dueDateTime).toDateString() === today)) return true;
      return false;
    });
  }
  if (currentCategory === 'planned') {
    return [...tasks.filter(t => t.dueDateTime), ...calendarEvents]
      .sort((a,b) => new Date(a.dueDateTime) - new Date(b.dueDateTime));
  }
  return tasks;
}

function renderTaskItem(task) {
  if (task.isFromCalendar) {
    const ds = getDueStatus(task.dueDateTime);
    const db = task.dueDateTime
      ? '<span class="due-badge '+ds+'">📅 '+formatDueDate(task.dueDateTime, task.hasTime)+'</span>' : '';
    return '<div class="task-item is-calendar">'
      + '<span class="cal-dot">📆</span>'
      + '<div class="task-body"><span class="task-title">'+escapeHtml(task.text)+'</span>'
      + '<div class="task-meta">'+db+'<span class="due-badge cal-origin">구글 캘린더</span></div></div></div>';
  }

  const ds = getDueStatus(task.dueDateTime);
  let badges = '';
  if (task.dueDateTime) badges += '<span class="due-badge '+ds+'">📅 '+formatDueDate(task.dueDateTime, task.hasTime)+'</span>';
  if (task.steps && task.steps.length > 0) {
    const done = task.steps.filter(s=>s.completed).length;
    badges += '<span class="due-badge">📝 '+done+'/'+task.steps.length+'</span>';
  }
  if (task.repeat) badges += '<span class="due-badge">🔄 '+REPEAT_LABELS[task.repeat]+'</span>';
  if (task.assignees && task.assignees.length > 0) {
    const shown = task.assignees.slice(0,2).map(escapeHtml).join(', ');
    const more  = task.assignees.length > 2 ? ' +' + (task.assignees.length-2) : '';
    badges += '<span class="due-badge">👥 ' + shown + more + '</span>';
  }

  // 검색 모드: 일치하는 단계 텍스트 배지 표시
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    (task.steps || []).filter(s => s.text.toLowerCase().includes(q)).forEach(s => {
      badges += '<span class="due-badge search-step-badge">📝 ' + highlightText(s.text, searchQuery) + '</span>';
    });
  }

  const isDone = task.completed ? 'is-done' : '';
  const isSel = detailTaskId === task.id ? 'is-selected' : '';
  return '<div class="task-item '+isDone+' '+isSel+'" id="task-item-'+task.id+'">'
    + '<div class="task-check '+isDone+'" onclick="event.stopPropagation();toggleComplete('+task.id+')"></div>'
    + '<div class="task-body" onclick="openDetailPanel('+task.id+')">'
    + '<span class="task-title">'+highlightText(task.text, searchQuery)+'</span>'
    + (badges ? '<div class="task-meta">'+badges+'</div>' : '')
    + '</div>'
    + '<button class="task-star '+(task.starred?'starred':'')+'" onclick="event.stopPropagation();toggleStar('+task.id+')">'
    + (task.starred?'★':'☆')+'</button></div>';
}

// ============================================
//  📆 날짜 일정 — 메인 화면 렌더링
// ============================================

function renderDayPlanInMain() {
  const {year, month, day} = datePlanDate;
  const dateObj  = new Date(year, month, day);
  const DAY_KO   = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const titleEl  = document.getElementById('category-title');
  const dateEl   = document.getElementById('cat-date');
  if (titleEl) titleEl.textContent = (month+1) + '월 ' + day + '일 ' + DAY_KO[dateObj.getDay()];
  if (dateEl)  dateEl.textContent  = year + '년';

  const dayTasks = tasks.filter(t => {
    if (!t.dueDateTime) return false;
    const d = new Date(t.dueDateTime);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  const calEvts = (typeof calendarEvents !== 'undefined') ? calendarEvents : [];
  const dayCalEvts = calEvts.filter(e => {
    const d = new Date(e.dueDateTime);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });

  const listEl  = document.getElementById('task-list');
  const emptyEl = document.getElementById('empty-message');
  emptyEl.style.display = 'none';

  let html = '<div class="day-plan-back">'
    + '<button class="day-plan-back-btn" onclick="closeDatePlan()">&#8592; 돌아가기</button>'
    + '</div>';

  if (dayTasks.length === 0 && dayCalEvts.length === 0) {
    html += '<div style="text-align:center;color:var(--text-2);padding:48px 0;font-size:14px;">이 날에는 일정이 없어요 ✨</div>';
  } else {
    if (dayTasks.length > 0) {
      html += '<div class="day-plan-section-lbl">TASK</div>';
      html += dayTasks.map(renderTaskItem).join('');
    }
    if (dayCalEvts.length > 0) {
      html += '<div class="day-plan-section-lbl">캘린더 일정</div>';
      html += dayCalEvts.map(renderTaskItem).join('');
    }
  }

  listEl.innerHTML = html;
  document.querySelector('.add-task-area').style.display = 'none';
  updateCategoryCounts();
}

function renderTasks() {
  // datePlanDate는 home 모드보다 먼저 체크 (홈 달력 클릭 시 정상 동작)
  if (datePlanDate) {
    // 홈 모드였다면 해제하고 사이드바 복원
    if (document.querySelector('.app.home-mode')) {
      if (typeof exitHomeMode === 'function') exitHomeMode();
      if (typeof clearNavActive === 'function') clearNavActive();
      const titleEl = document.getElementById('category-title');
      if (titleEl) titleEl.textContent = '';
      const main = document.getElementById('main-content');
      if (main) main.className = 'main-content cat-planned';
      const addArea = document.querySelector('.add-task-area');
      if (addArea) addArea.style.display = 'none';
    }
    renderDayPlanInMain();
    return;
  }
  // 🧭 새 레이아웃: currentMenu(사이드바에서 실제로 선택된 페이지) 기준으로 분기.
  // (예전엔 currentCategory로 분기했는데 currentCategory가 항상 'home'에 고정돼 있어서
  //  TASK/TO-DO 등 다른 페이지에서 상세 패널을 열면 메인화면이 홈으로 바뀌는 버그가 있었음)
  if (typeof currentMenu !== 'undefined' && typeof MENU_RENDERERS !== 'undefined') {
    var _fn = MENU_RENDERERS[currentMenu];
    if (_fn && typeof window[_fn] === 'function') { window[_fn](); return; }
  }
  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('empty-message');
  if (!listEl) return; // 새 레이아웃 — task-list 없음, 홈 위젯에서 렌더링
  const filtered = getFilteredTasks();
  const active = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed && !t.isFromCalendar);

  if (active.length === 0 && completed.length === 0) {
    listEl.innerHTML = '';
    emptyEl.textContent = searchQuery ? '"' + searchQuery + '" 검색 결과가 없어요' : '아직 할 일이 없어요 ✨';
    emptyEl.style.display = 'block';
    renderSidebarCalendar();
    return;
  }
  emptyEl.style.display = 'none';

  let html = active.map(renderTaskItem).join('');
  if (completed.length > 0) {
    const arrowClass = completedSectionOpen ? 'open' : '';
    const listDisplay = completedSectionOpen ? 'flex' : 'none';
    html += '<div class="completed-section">'
      + '<button class="completed-toggle" onclick="toggleCompletedSection()">'
      + '<span class="toggle-arrow '+arrowClass+'">›</span>'
      + '완료됨 <span class="completed-count">'+completed.length+'</span></button>'
      + '<div style="display:'+listDisplay+';flex-direction:column;gap:2px;">'
      + completed.map(renderTaskItem).join('')+'</div></div>';
  }
  listEl.innerHTML = html;
  updateCategoryCounts();
  renderSidebarCalendar();
}

function toggleCompletedSection() { completedSectionOpen = !completedSectionOpen; renderTasks(); }

// ============================================
//  🔢 사이드바 카운트 배지
// ============================================

function updateCategoryCounts() {
  const active = tasks.filter(t => !t.completed);
  const today = new Date().toDateString();
  const todayCount = active.filter(t => {
    if (t.dueDateTime && new Date(t.dueDateTime).toDateString() === today) return true;
    if (t.steps && t.steps.some(s => s.dueDateTime && new Date(s.dueDateTime).toDateString() === today)) return true;
    return false;
  }).length;
  const set = (id, n) => { const el = document.getElementById(id); if(el) el.textContent = n>0?n:''; };
  // count-today는 홈 메뉴 뱃지로 재사용 (오늘 마감 건수)
  set('count-today', todayCount);
  set('count-important', active.filter(t=>t.starred).length);
  set('count-planned', active.filter(t=>t.dueDateTime).length);
  set('count-all', active.length);
}

// ============================================
//  📆 사이드바 미니 달력 위젯
// ============================================

let sidebarCalYear = new Date().getFullYear();
let sidebarCalMonth = new Date().getMonth();

function sidebarCalPrevMonth() {
  sidebarCalMonth--;
  if (sidebarCalMonth < 0) { sidebarCalMonth = 11; sidebarCalYear--; }
  renderSidebarCalendar();
}

function sidebarCalNextMonth() {
  sidebarCalMonth++;
  if (sidebarCalMonth > 11) { sidebarCalMonth = 0; sidebarCalYear++; }
  renderSidebarCalendar();
}

function sidebarCalToday() {
  sidebarCalYear = new Date().getFullYear();
  sidebarCalMonth = new Date().getMonth();
  renderSidebarCalendar();
}

function renderSidebarCalendar() {
  const container = document.getElementById('sidebar-cal-widget');
  if (!container) return; // 새 레이아웃에서는 사이드바 캘린더 위젯 없음

  const year = sidebarCalYear;
  const month = sidebarCalMonth;
  const today = new Date();
  const todayKey = today.getFullYear() + '-'
    + String(today.getMonth()+1).padStart(2,'0') + '-'
    + String(today.getDate()).padStart(2,'0');

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month+1, 0);
  const startDow  = firstDay.getDay(); // 0=일
  const totalDays = lastDay.getDate();
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  // 날짜별 이벤트 수집
  const evtMap = {};
  const addEvt = (d, text, type) => {
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const k = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (!evtMap[k]) evtMap[k] = [];
    evtMap[k].push({ text, type });
  };

  // 할 일 (미완료, 마감일 있는 것)
  tasks.forEach(t => {
    if (!t.dueDateTime || t.completed) return;
    addEvt(new Date(t.dueDateTime), t.text, 'task');
  });

  // 구글 캘린더 이벤트
  const calEvts = (typeof calendarEvents !== 'undefined') ? calendarEvents : [];
  calEvts.forEach(e => {
    addEvt(new Date(e.dueDateTime), e.text, 'calendar');
  });

  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const DAY_NAMES   = (typeof weekDayOrder === 'function') ? weekDayOrder() : ['일','월','화','수','목','금','토'];
  const lead        = (typeof weekLeadOffset === 'function') ? weekLeadOffset(startDow) : startDow;

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  // 헤더: ‹ YYYY년 MM월 [오늘] ›
  let html = '<div class="scal-header">'
    + '<button class="scal-nav" onclick="sidebarCalPrevMonth()">&#8249;</button>'
    + '<span class="scal-month-label">' + year + '년 ' + MONTH_NAMES[month] + '</span>'
    + (!isCurrentMonth
        ? '<button class="scal-today-btn" onclick="sidebarCalToday()">오늘</button>'
        : '<span class="scal-today-spacer"></span>')
    + '<button class="scal-nav" onclick="sidebarCalNextMonth()">&#8250;</button>'
    + '</div>';

  // 요일 헤더
  html += '<div class="scal-grid">';
  DAY_NAMES.forEach((d, i) => {
    const _dw = (typeof weekColDow === 'function') ? weekColDow(i) : i;
    const cls = _dw === 0 ? ' s-sun' : _dw === 6 ? ' s-sat' : '';
    html += '<div class="scal-dh' + cls + '">' + d + '</div>';
  });

  // 이전 달 패딩
  for (let i = 0; i < lead; i++) {
    const d = prevMonthLastDay - lead + 1 + i;
    html += '<div class="scal-cell s-dim"><span class="scal-num">' + d + '</span></div>';
  }

  // 현재 달 날짜
  for (let d = 1; d <= totalDays; d++) {
    const _col = (lead + d - 1) % 7;
    const dow = (typeof weekColDow === 'function') ? weekColDow(_col) : _col;
    const dateKey = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const isToday = dateKey === todayKey;
    const evts = evtMap[dateKey] || [];

    let numCls = 'scal-num';
    if (dow === 0) numCls += ' s-sun';
    if (dow === 6) numCls += ' s-sat';

    // 이벤트 제목 인라인 표시 (최대 2개 + 넘침 표시)
    const MAX_SHOW = 2;
    let evtHtml = '';
    evts.slice(0, MAX_SHOW).forEach(ev => {
      const ecls = ev.type === 'task' ? 'scal-ev scal-ev-task' : 'scal-ev scal-ev-calendar';
      evtHtml += '<div class="' + ecls + '">' + escapeHtml(ev.text) + '</div>';
    });
    if (evts.length > MAX_SHOW) {
      evtHtml += '<div class="scal-ev-more">+' + (evts.length - MAX_SHOW) + '개</div>';
    }

    html += '<div class="scal-cell' + (isToday ? ' s-today-cell' : '') + '" onclick="openDatePlan(' + year + ',' + month + ',' + d + ')">'
      + '<span class="' + numCls + (isToday ? ' s-today-num' : '') + '">' + d + '</span>'
      + evtHtml
      + '</div>';
  }

  // 다음 달 패딩
  const filled = startDow + totalDays;
  const remain = (7 - (filled % 7)) % 7;
  for (let i = 1; i <= remain; i++) {
    html += '<div class="scal-cell s-dim"><span class="scal-num">' + i + '</span></div>';
  }

  html += '</div>'; // scal-grid
  container.innerHTML = html;
}


// ============================================
//  🗓️ 스마트 날짜 피커
// ============================================

function parseNumericDate(raw) {
  var s = (raw || '').replace(/\D/g, '');
  if (!s) return null;
  var now = new Date();
  var Y = now.getFullYear();
  var year, month, day, hour = null, min = null;

  if (s.length === 12) {
    year = +s.slice(0,4); month = +s.slice(4,6)-1; day = +s.slice(6,8);
    hour = +s.slice(8,10); min = +s.slice(10,12);
  } else if (s.length === 10) {
    year = +s.slice(0,4); month = +s.slice(4,6)-1; day = +s.slice(6,8);
    hour = +s.slice(8,10); min = 0;
  } else if (s.length === 8) {
    year = +s.slice(0,4); month = +s.slice(4,6)-1; day = +s.slice(6,8);
  } else if (s.length === 6) {
    year = Y; month = +s.slice(0,2)-1; day = +s.slice(2,4);
    hour = +s.slice(4,6); min = 0;
  } else if (s.length === 4) {
    year = Y; month = +s.slice(0,2)-1; day = +s.slice(2,4);
  } else {
    return null;
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  if (hour !== null && (hour < 0 || hour > 23 || min < 0 || min > 59)) return null;
  var dt = new Date(year, month, day);
  if (dt.getMonth() !== month) return null;

  var pad = function(n){ return String(n).padStart(2,'0'); };
  return {
    dateStr: year + '-' + pad(month+1) + '-' + pad(day),
    timeStr: hour !== null ? pad(hour) + ':' + pad(min) : null,
    year: year, month: month, day: day, hour: hour, min: min
  };
}

function formatPickerPreview(parsed) {
  if (!parsed) return '';
  var DAY = ['일','월','화','수','목','금','토'];
  var d = new Date(parsed.year, parsed.month, parsed.day);
  var label = parsed.year + '년 ' + (parsed.month+1) + '월 ' + parsed.day + '일 (' + DAY[d.getDay()] + ')';
  if (parsed.timeStr) {
    var h = parsed.hour;
    var ampm = h < 12 ? '오전' : '오후';
    var dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
    label += '  ' + ampm + ' ' + dh + ':' + String(parsed.min).padStart(2,'0');
  }
  return label;
}

function initPicker(id, dateStr, timeStr) {
  var now = new Date();
  pickerState[id] = {
    dateStr: dateStr || null,
    timeStr: timeStr || null,
    calYear: dateStr ? +dateStr.slice(0,4) : now.getFullYear(),
    calMonth: dateStr ? +dateStr.slice(5,7)-1 : now.getMonth()
  };
}

function getPickerValue(id) {
  return pickerState[id] || { dateStr: null, timeStr: null };
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  var p = dateStr.split('-');
  if (p.length !== 3) return dateStr;
  return p[0].slice(2) + '. ' + p[1] + '. ' + p[2] + '.';
}

function buildPickerHtml(id, dateStr, timeStr) {
  initPicker(id, dateStr, timeStr);
  var s = pickerState[id];
  var dateDisp = s.dateStr ? formatDateDisplay(s.dateStr) : '';
  var timeVal  = s.timeStr || '';

  return '<div class="sdp-wrap" id="sdp-' + id + '">'
    + '<div class="sdp-inputs-row">'
    + '<div class="sdp-field">'
    + '<label class="sdp-field-label">날짜</label>'
    + '<input type="text" class="sdp-date-inp" id="sdp-text-' + id + '"'
    + ' placeholder="YYYYMMDD"'
    + ' value="' + dateDisp + '"'
    + ' oninput="onPickerText(\'' + id + '\')"'
    + ' onfocus="openPickerCal(\'' + id + '\')"'
    + ' onkeydown="onPickerKey(event,\'' + id + '\')"'
    + ' autocomplete="off" readonly>'
    + '</div>'
    + (s.dateStr ? '<button class="sdp-clr-btn" onclick="clearPicker(\'' + id + '\')" title="초기화">✕</button>' : '')
    + '</div>'
    + '<div class="sdp-cal-wrap" id="sdp-cal-' + id + '" style="display:none;">'
    + buildPickerCalHtml(id)
    + '</div>'
    + '</div>';
}

function buildPickerCalHtml(id) {
  var s = pickerState[id];
  if (!s) return '';
  var year = s.calYear, month = s.calMonth;
  var today = new Date();
  var todayKey = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var firstDay = new Date(year, month, 1);
  var lastDay  = new Date(year, month+1, 0);
  var startDow = firstDay.getDay();
  var total    = lastDay.getDate();
  var prevLast = new Date(year, month, 0).getDate();
  var DN = (typeof weekDayOrder === 'function') ? weekDayOrder() : ['일','월','화','수','목','금','토'];
  var lead = (typeof weekLeadOffset === 'function') ? weekLeadOffset(startDow) : startDow;
  var pad = function(n){ return String(n).padStart(2,'0'); };

  // 연도 선택 옵션
  var yearOpts = '';
  for (var y = year-5; y <= year+10; y++) {
    yearOpts += '<option value="' + y + '"' + (y===year?' selected':'') + '>' + y + '</option>';
  }
  // 월 선택 옵션
  var MN = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var monthOpts = '';
  for (var m = 0; m < 12; m++) {
    monthOpts += '<option value="' + m + '"' + (m===month?' selected':'') + '>' + MN[m] + '</option>';
  }

  var html = '<div class="sdp-cal-hdr2">'
    + '<button class="sdp-cal-nav" onclick="pickerPrev(\'' + id + '\')">&#8249;</button>'
    + '<div class="sdp-cal-selects">'
    + '<select class="sdp-year-sel" onchange="pickerSetYear(\'' + id + '\',+this.value)">' + yearOpts + '</select>'
    + '<select class="sdp-month-sel" onchange="pickerSetMonth(\'' + id + '\',+this.value)">' + monthOpts + '</select>'
    + '</div>'
    + '<button class="sdp-cal-nav" onclick="pickerNext(\'' + id + '\')">&#8250;</button>'
    + '</div>'
    + '<div class="sdp-cal-grid2">';

  for (var di = 0; di < 7; di++) {
    var _dw = (typeof weekColDow === 'function') ? weekColDow(di) : di;
    html += '<div class="sdp-dh' + (_dw===0?' sdp-sun':_dw===6?' sdp-sat':'') + '">' + DN[di] + '</div>';
  }
  for (var i = 0; i < lead; i++) {
    html += '<div class="sdp-dc sdp-dim">' + (prevLast - lead + 1 + i) + '</div>';
  }
  for (var d = 1; d <= total; d++) {
    var _col = (lead + d - 1) % 7;
    var dow = (typeof weekColDow === 'function') ? weekColDow(_col) : _col;
    var dk  = year + '-' + pad(month+1) + '-' + pad(d);
    var cls = 'sdp-dc';
    if (dow === 0) cls += ' sdp-sun';
    if (dow === 6) cls += ' sdp-sat';
    if (dk === todayKey) cls += ' sdp-today';
    if (dk === s.dateStr) cls += ' sdp-sel';
    html += '<div class="' + cls + '" onclick="pickerPickDate(\'' + id + '\',' + year + ',' + (month+1) + ',' + d + ')">' + d + '</div>';
  }
  var filled = lead + total;
  var remain = (7 - (filled % 7)) % 7;
  for (var r = 1; r <= remain; r++) {
    html += '<div class="sdp-dc sdp-dim">' + r + '</div>';
  }
  html += '</div>';  // sdp-cal-grid2
  // 오늘로 이동 버튼
  html += '<div class="sdp-cal-footer">'
    + '<button class="sdp-today-btn" onclick="pickerGoToday(\'' + id + '\')">오늘</button>'
    + '<button class="sdp-cal-close-btn" onclick="closePickerCal(\'' + id + '\')">닫기</button>'
    + '</div>';
  return html;
}

function openPickerCal(id) {
  var w = document.getElementById('sdp-cal-' + id);
  if (!w) return;
  w.style.display = 'block';
  w.innerHTML = buildPickerCalHtml(id);
}

function closePickerCal(id) {
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.style.display = 'none';
}

function togglePickerCal(id) {
  var w = document.getElementById('sdp-cal-' + id);
  if (!w) return;
  if (w.style.display === 'none') openPickerCal(id);
  else closePickerCal(id);
}

function pickerSetYear(id, year) {
  pickerState[id].calYear = year;
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.innerHTML = buildPickerCalHtml(id);
}

function pickerSetMonth(id, month) {
  pickerState[id].calMonth = month;
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.innerHTML = buildPickerCalHtml(id);
}

function pickerGoToday(id) {
  var now = new Date();
  pickerState[id].calYear  = now.getFullYear();
  pickerState[id].calMonth = now.getMonth();
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.innerHTML = buildPickerCalHtml(id);
}

function pickerPrev(id) {
  var s = pickerState[id];
  s.calMonth--;
  if (s.calMonth < 0) { s.calMonth = 11; s.calYear--; }
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.innerHTML = buildPickerCalHtml(id);
}

function pickerNext(id) {
  var s = pickerState[id];
  s.calMonth++;
  if (s.calMonth > 11) { s.calMonth = 0; s.calYear++; }
  var w = document.getElementById('sdp-cal-' + id);
  if (w) w.innerHTML = buildPickerCalHtml(id);
}

function pickerPickDate(id, year, month, day) {
  var s = pickerState[id];
  var pad = function(n){ return String(n).padStart(2,'0'); };
  s.dateStr = year + '-' + pad(month) + '-' + pad(day);
  s.calYear = year; s.calMonth = month - 1;
  var textEl = document.getElementById('sdp-text-' + id);
  if (textEl) textEl.value = formatDateDisplay(s.dateStr);
  updatePickerPreview(id);
  var w = document.getElementById('sdp-cal-' + id);
  if (w && w.style.display !== 'none') w.innerHTML = buildPickerCalHtml(id);
  onPickerChanged(id);
}

function pickerSetTime(id) {
  var s = pickerState[id];
  var timeEl = document.getElementById('sdp-time-' + id);
  s.timeStr = timeEl ? (timeEl.value || null) : null;
  updatePickerPreview(id);
  onPickerChanged(id);
}

function onPickerText(id) {
  var s = pickerState[id];
  var textEl = document.getElementById('sdp-text-' + id);
  var raw = textEl ? textEl.value.replace(/\D/g,'') : '';
  var parsed = parseNumericDate(raw);
  if (parsed) {
    s.dateStr = parsed.dateStr;
    if (parsed.timeStr) { s.timeStr = parsed.timeStr; var te = document.getElementById('sdp-time-' + id); if(te) te.value = parsed.timeStr; }
    s.calYear = parsed.year; s.calMonth = parsed.month;
    var w = document.getElementById('sdp-cal-' + id);
    if (w && w.style.display !== 'none') w.innerHTML = buildPickerCalHtml(id);
    onPickerChanged(id);
  } else { s.dateStr = null; s.timeStr = null; }
  updatePickerPreview(id);
}

function onPickerKey(event, id) {
  if (event.key === 'Escape') closePickerCal(id);
  if (event.key === 'Enter')  onPickerChanged(id);
}

function updatePickerPreview(id) {
  // preview 요소가 없을 수도 있음 (새 UI에서는 사용 안 함)
  var el = document.getElementById('sdp-prev-' + id);
  if (!el) return;
  var s = pickerState[id];
  if (!s || !s.dateStr) { el.textContent = ''; return; }
  var raw = s.dateStr.replace(/-/g,'') + (s.timeStr ? s.timeStr.replace(':','') : '');
  var parsed = parseNumericDate(raw);
  el.textContent = parsed ? formatPickerPreview(parsed) : '';
}

function clearPicker(id) {
  var s = pickerState[id];
  if (!s) return;
  s.dateStr = null; s.timeStr = null;
  var textEl = document.getElementById('sdp-text-' + id);
  if (textEl) textEl.value = '';
  var timeEl = document.getElementById('sdp-time-' + id);
  if (timeEl) timeEl.value = '';
  updatePickerPreview(id);
  closePickerCal(id);
  onPickerChanged(id);
}

function onPickerChanged(id) {
  if (id === 'dp-due')      saveDpDateTimeFromPicker();
  if (id === 'dp-start')    saveDpStartFromPicker();
  if (id === 'dp-reminder') saveReminderFromPicker();
  if (id.indexOf('rp-step-') === 0) rpSaveStepFromPicker(id);
}

function saveReminderFromPicker() {
  if (!detailTaskId) return;
  var task = tasks.find(function(t){ return t.id === detailTaskId; });
  if (!task) return;
  var pv = getPickerValue('dp-reminder');
  task.reminder = pv.dateStr ? pv.dateStr + 'T09:00:00' : null;
  if (task.reminder) scheduleReminder(task);
  saveTasks(); renderTasks();
}

function saveDpDateTimeFromPicker() {
  if (!detailTaskId) return;
  var task = tasks.find(function(t){ return t.id === detailTaskId; });
  if (!task) return;
  var pv = getPickerValue('dp-due');
  if (!pv.dateStr) {
    task.dueDateTime = null; task.hasTime = false;
  } else {
    task.dueDateTime = pv.timeStr ? pv.dateStr + 'T' + pv.timeStr + ':00' : pv.dateStr + 'T09:00:00';
    task.hasTime = !!pv.timeStr;
  }
  saveTasks(); renderTasks();
  // 행 레이블 업데이트
  var rowItem = document.getElementById('dp-date-inputs');
  if (rowItem) {
    var prev = rowItem.previousElementSibling;
    if (prev) {
      var lbl = prev.querySelector('.dp-row-label');
      if (lbl) {
        lbl.textContent = task.dueDateTime ? formatDueDate(task.dueDateTime, task.hasTime) : '마감일 추가';
        lbl.classList.toggle('is-set', !!task.dueDateTime);
      }
      var rmBtn = prev.querySelector('.dp-row-remove');
      if (task.dueDateTime && !rmBtn) {
        prev.insertAdjacentHTML('beforeend', '<button class="dp-row-remove" onclick="clearDpDue(event)">✕</button>');
      } else if (!task.dueDateTime && rmBtn) {
        rmBtn.remove();
      }
    }
  }
}

// ============================================
//  📋 디테일 패널
// ============================================

function buildDetailPanelHTML(task) {
  task.steps = task.steps || [];
  task.reminder = task.reminder || null;
  task.assignees = Array.isArray(task.assignees) ? task.assignees : (task.assignee ? [task.assignee] : []);
  task.repeat = task.repeat || null;

  const startLabel    = task.startDate   ? formatDueDate(task.startDate, false)          : '시작일 설정';
  const dueLabel      = task.dueDateTime ? formatDueDate(task.dueDateTime, task.hasTime) : '기한 설정';
  const reminderLabel = task.reminder    ? formatDueDate(task.reminder, true)             : '알림 설정';
  const repeatLabel   = task.repeat      ? REPEAT_LABELS[task.repeat]                     : '반복 설정';
  if (!Array.isArray(task.assignees)) task.assignees = task.assignee ? [task.assignee] : [];
  const hasAssignees    = task.assignees.length > 0;
  const assigneeLabel   = hasAssignees ? task.assignees.join(', ') : '협업자 추가';
  const createdDt     = new Date(task.createdAt);
  const createdStr    = (createdDt.getMonth()+1)+'월 '+createdDt.getDate()+'일 생성됨';

  const stepsHtml = buildStepsHtml(task);

  const repeatOptions = Object.entries(REPEAT_LABELS).map(([val, label]) =>
    '<button class="repeat-option '+(task.repeat===val?'active':'')+'" onclick="setRepeat(\''+val+'\')">'+label+'</button>'
  ).join('');

  let html = '';

  // 헤더
  html += '<div class="dp-header">'
    + '<div class="dp-check-row">'
    + '<div class="task-check dp-check '+(task.completed?'is-done':'')+'" onclick="toggleCompleteFromPanel()"></div>'
    + '<textarea class="dp-title-area" id="dp-title-area" oninput="scheduleDpTitleSave()" rows="1">'+escapeHtml(task.text)+'</textarea>'
    + '</div>'
    + '<button class="dp-star task-star '+(task.starred?'starred':'')+'" onclick="toggleStarFromPanel()">'
    + (task.starred?'★':'☆')+'</button></div>';

  // 단계 섹션
  html += '<div class="dp-steps-section"><div class="dp-section-label">📋 TO DO</div>'
    + '<div id="dp-steps-list">'+stepsHtml+'</div>'
    + '<div class="dp-add-step">'
    + '<div class="task-check step-check" style="opacity:0.25;cursor:default;"></div>'
    + '<input type="text" id="dp-step-input" class="dp-step-input" placeholder="TO DO 추가" onkeydown="handleStepInput(event,'+task.id+')">'
    + '<button class="step-add-btn" onclick="addStep('+task.id+')">+</button>'
    + '</div></div>';

  html += '<div class="dp-divider"></div>';

  // 속성 섹션 (박스형 필드로 통일)
  html += '<div class="dp-properties">';

  // 🔮 프로젝트
  html += buildTaskCatHTML(task);

  // 🗓️ 시작일 (캘린더 드롭다운, 날짜만)
  const startDateStr = task.startDate ? toDateInputVal(task.startDate) : null;
  html += '<div class="field-group"><label class="field-label">🗓️ 시작일</label>'
    + buildPickerHtml('dp-start', startDateStr, null) + '</div>';

  // 📅 기한 (캘린더 드롭다운, 날짜만)
  const dpDateStr = task.dueDateTime ? toDateInputVal(task.dueDateTime) : null;
  html += '<div class="field-group"><label class="field-label">📅 기한</label>'
    + buildPickerHtml('dp-due', dpDateStr, null) + '</div>';

  // 👥 협업자 (여러 명)
  const assigneeTags = task.assignees.map(a =>
    '<span class="assignee-tag">' + escapeHtml(a)
    + '<button class="assignee-tag-del" onclick="removeAssignee(event,\'' + escapeHtml(a).replace(/'/g,'&#39;') + '\')">✕</button></span>'
  ).join('');
  html += '<div class="field-group"><label class="field-label">👥 협업자</label>'
    + '<div class="assignee-tags" id="dp-assignee-tags">' + assigneeTags + '</div>'
    + '<div style="display:flex;gap:6px;margin-top:6px;">'
    + '<input type="text" id="dp-assignee-input" class="field-input" placeholder="이름 또는 이메일" style="flex:1;" onkeydown="if(event.key===\'Enter\')addAssignee()">'
    + '<button class="sub-form-save" onclick="addAssignee()">추가</button>'
    + '</div></div>';

  // 🔗 연계 TASK (이전/다음)
  const prevTaskIds = Array.isArray(task.prevTaskIds) ? task.prevTaskIds : [];
  const nextTaskIds = Array.isArray(task.nextTaskIds) ? task.nextTaskIds : [];
  const prevTags = prevTaskIds.map(pid => {
    const pt = tasks.find(t => t.id === pid);
    if (!pt) return '';
    return '<span class="dep-tag">'
      + escapeHtml(pt.text.replace(/^\[\d{6}\] /, '').substring(0,20))
      + '<button class="dep-tag-del" onclick="removeDepTask(event,'+task.id+','+pid+',\'prev\')">✕</button></span>';
  }).join('');
  const nextTags = nextTaskIds.map(nid => {
    const nt = tasks.find(t => t.id === nid);
    if (!nt) return '';
    return '<span class="dep-tag">'
      + escapeHtml(nt.text.replace(/^\[\d{6}\] /, '').substring(0,20))
      + '<button class="dep-tag-del" onclick="removeDepTask(event,'+task.id+','+nid+',\'next\')">✕</button></span>';
  }).join('');

  html += '<div class="field-group"><label class="field-label">🔗 연계 TASK</label>'
    + '<div class="dp-dep-wrap" style="display:flex;flex-direction:column;gap:8px;">'
    + '<div class="dep-section">'
    + '<div class="dep-label">⬅️ 이전 TASK <small>(이 작업 전에 완료되어야 할 것)</small></div>'
    + '<div class="dep-tags" id="dp-prev-tags">' + prevTags + '</div>'
    + '<div style="display:flex;gap:6px;">'
    + '<select class="dep-pick-sel" id="dp-prev-sel">'
    + '<option value="">— 이전 TASK 선택 —</option>'
    + tasks.filter(t => t.id !== task.id && !prevTaskIds.includes(t.id))
        .map(t => '<option value="'+t.id+'">'+escapeHtml(t.text.replace(/^\[\d{6}\] /,'').substring(0,30))+'</option>').join('')
    + '</select>'
    + '<button class="sub-form-save" onclick="addDepTask('+task.id+',\'prev\')">추가</button>'
    + '</div></div>'
    + '<div class="dep-section">'
    + '<div class="dep-label">➡️ 다음 TASK <small>(이 작업 후에 시작될 것)</small></div>'
    + '<div class="dep-tags" id="dp-next-tags">' + nextTags + '</div>'
    + '<div style="display:flex;gap:6px;">'
    + '<select class="dep-pick-sel" id="dp-next-sel">'
    + '<option value="">— 다음 TASK 선택 —</option>'
    + tasks.filter(t => t.id !== task.id && !nextTaskIds.includes(t.id))
        .map(t => '<option value="'+t.id+'">'+escapeHtml(t.text.replace(/^\[\d{6}\] /,'').substring(0,30))+'</option>').join('')
    + '</select>'
    + '<button class="sub-form-save" onclick="addDepTask('+task.id+',\'next\')">추가</button>'
    + '</div></div>'
    + '</div></div>';

  html += '</div>'; // end dp-properties

  // 푸터
  html += '<div class="dp-footer">'
    + '<button class="dp-save-btn" onclick="saveAndClosePanel()">✓ 저장</button>'
    + '<button class="dp-close-btn" onclick="closeDetailPanel()">✕ 닫기</button>'
    + '<span class="dp-created">'+createdStr+'</span>'
    + '<button class="dp-delete-btn" onclick="deleteFromPanel()" title="작업 삭제">🗑️</button></div>';

  return html;
}

function buildStepsHtml(task) {
  return (task.steps||[]).map(s => {
    const hasDate = !!s.dueDateTime;
    const ds = hasDate ? getDueStatus(s.dueDateTime) : '';
    const dateBadge = hasDate
      ? '<span class="due-badge step-date-badge ' + ds + '" onclick="event.stopPropagation();toggleStepDateForm(' + s.id + ')">📅 '
        + formatDueDate(s.dueDateTime, s.hasTime) + '</span>'
      : '';
    const dateForm = '<div class="dp-sub-form step-date-form" id="dp-step-date-form-' + s.id + '" style="display:none;">'
      + '<input type="date" id="step-date-' + s.id + '" value="' + (hasDate ? toDateInputVal(s.dueDateTime) : '') + '">'
      + '<button class="sub-form-save" onclick="saveStepDate(' + task.id + ',' + s.id + ')">설정</button>'
      + (hasDate ? '<button class="dp-date-clear" onclick="clearStepDate(' + task.id + ',' + s.id + ')">✕ 지우기</button>' : '')
      + '</div>';
    return '<div class="dp-step" id="dp-step-' + s.id + '">'
      + '<div class="task-check step-check ' + (s.completed ? 'is-done' : '') + '" onclick="toggleStep(' + task.id + ',' + s.id + ')"></div>'
      + '<div class="step-content">'
      + '<span class="step-text ' + (s.completed ? 'is-done' : '') + '" contenteditable="true" spellcheck="false"'
      +   ' title="클릭해 텍스트 수정" onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"'
      +   ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"'
      +   ' onblur="saveStepTextEdit(' + task.id + ',' + s.id + ',this)">' + escapeHtml(s.text) + '</span>'
      + (dateBadge ? '<div class="step-meta">' + dateBadge + '</div>' : '')
      + '</div>'
      + '<button class="step-cal-btn' + (hasDate ? ' has-date' : '') + '" onclick="event.stopPropagation();toggleStepDateForm(' + s.id + ')" title="기한 설정">'
      + (hasDate ? '📅 ' + formatDueDate(s.dueDateTime, s.hasTime) : '📅 기한')
      + '</button>'
      + '<button class="step-delete" onclick="deleteStep(' + task.id + ',' + s.id + ')">✕</button></div>'
      + dateForm;
  }).join('');
}

// 상세창 = 생성창과 동일한 통합 템플릿(수정 모드)으로 통일
function openDetailPanel(id) {
  var task = tasks.find(function(t){ return t.id === id; });
  if (!task) return;
  openNewTaskPanel(id);
  renderTasks();
}

// ============================================
//  🏷 공통 카테고리 선택 (영역/목표)
// ============================================

// ── SECTION 선택 시 핵심목표(만다라트 subGoal) 자동 연결 ──
// SECTION[i] === 핵심목표[i] (1:1 동일 개념, 별도 선택 불필요)

// ============================================
//  🔮 프로젝트(만다라트 실행과제) 커스텀 드롭다운 + 즐겨찾기
// ============================================
var MDT_FAV_KEY = 'mdtFavActions';
var _projDDCallbacks = {};

function getMdtFavs() {
  try { return JSON.parse(localStorage.getItem(MDT_FAV_KEY)) || []; } catch (e) { return []; }
}
function saveMdtFavs(arr) { localStorage.setItem(MDT_FAV_KEY, JSON.stringify(arr)); }
function isMdtFav(key) { return getMdtFavs().indexOf(key) !== -1; }
function toggleMdtFavKey(key) {
  var f = getMdtFavs(); var i = f.indexOf(key);
  if (i === -1) f.push(key); else f.splice(i, 1);
  saveMdtFavs(f);
}

// 가장 최근(또는 현재) 만다라트의 비어있지 않은 실행과제 목록 — 즐겨찾기 우선 정렬
function getMdtProjects() {
  if (typeof loadMandalarts === 'function') loadMandalarts();
  var mdt = null, year = null;
  if (typeof mandalarts !== 'undefined' && mandalarts.length) {
    var yr = (typeof currentMdtYear !== 'undefined' && currentMdtYear) ? currentMdtYear
           : (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : null;
    mdt = (yr && typeof getMdt === 'function') ? getMdt(yr) : null;
    if (!mdt) mdt = mandalarts.slice().sort(function(a, b){ return b.year - a.year; })[0];
    if (mdt) year = mdt.year;
  }
  var list = [];
  if (mdt) {
    (mdt.subGoals || []).forEach(function(sg) {
      (sg.actions || []).forEach(function(act) {
        if (!act.text) return;
        var key = year + ':' + sg.id + ':' + act.id;
        list.push({ year: year, sgId: sg.id, sgText: sg.text, sgEmoji: sg.emoji,
                    actionId: act.id, text: act.text, key: key, fav: isMdtFav(key) });
      });
    });
  }
  var favs = getMdtFavs();
  list.sort(function(a, b) {
    if (a.fav && !b.fav) return -1;
    if (!a.fav && b.fav) return 1;
    if (a.fav && b.fav) return favs.indexOf(a.key) - favs.indexOf(b.key);
    return 0;
  });
  return list;
}

function buildProjectDropdown(domId, selected) {
  var label = (selected && selected.text) ? escapeHtml(selected.text) : '프로젝트 없음';
  return '<div class="proj-dd" id="' + domId + '">'
    + '<button type="button" class="proj-dd-trigger' + (selected && selected.text ? ' is-set' : '') + '" onclick="toggleProjDD(\'' + domId + '\')">'
    + '<span class="proj-dd-cur">' + label + '</span><span class="proj-dd-arrow">▾</span></button>'
    + '<div class="proj-dd-panel" style="display:none;"></div>'
    + '</div>';
}

function toggleProjDD(domId) {
  var dd = document.getElementById(domId); if (!dd) return;
  var panel = dd.querySelector('.proj-dd-panel'); if (!panel) return;
  var open = panel.style.display !== 'none';
  document.querySelectorAll('.proj-dd-panel').forEach(function(p){ p.style.display = 'none'; });
  if (open) { panel.style.display = 'none'; return; }
  panel.innerHTML = buildProjDDList(domId);
  panel.style.display = 'block';
}

function buildProjDDList(domId) {
  var list = getMdtProjects();
  var html = '<div class="proj-dd-opt proj-dd-none" onclick="projDDSelect(\'' + domId + '\',\'\')">— 프로젝트 없음 —</div>';
  if (!list.length) {
    return html + '<div class="proj-dd-empty">만다라트에 등록된 실행과제가 없어요</div>';
  }
  list.forEach(function(p) {
    html += '<div class="proj-dd-opt">'
      + '<button type="button" class="proj-dd-star' + (p.fav ? ' on' : '') + '" onclick="event.stopPropagation();projDDToggleFav(\'' + domId + '\',\'' + p.key + '\')">' + (p.fav ? '★' : '☆') + '</button>'
      + '<span class="proj-dd-opt-label" onclick="projDDSelect(\'' + domId + '\',\'' + p.key + '\')">'
      + '<span class="proj-dd-opt-sg">' + escapeHtml((p.sgEmoji || '') + ' ' + p.sgText) + '</span>'
      + '<span class="proj-dd-opt-txt">' + escapeHtml(p.text) + '</span>'
      + '</span></div>';
  });
  return html;
}

function projDDToggleFav(domId, key) {
  toggleMdtFavKey(key);
  var dd = document.getElementById(domId); if (!dd) return;
  var panel = dd.querySelector('.proj-dd-panel');
  if (panel) panel.innerHTML = buildProjDDList(domId);
}

function projDDSelect(domId, key) {
  var sel = null;
  if (key) {
    var p = getMdtProjects().find(function(x){ return x.key === key; });
    if (p) sel = { year: p.year, sgId: p.sgId, actionId: p.actionId, text: p.text };
  }
  var dd = document.getElementById(domId);
  if (dd) {
    var cur = dd.querySelector('.proj-dd-cur');
    if (cur) cur.textContent = (sel ? sel.text : '프로젝트 없음');
    var trig = dd.querySelector('.proj-dd-trigger');
    if (trig) trig.classList.toggle('is-set', !!sel);
    var panel = dd.querySelector('.proj-dd-panel'); if (panel) panel.style.display = 'none';
  }
  var cb = _projDDCallbacks[domId];
  if (typeof cb === 'function') cb(sel);
}

// 패널 바깥 클릭 시 닫기
document.addEventListener('click', function(e) {
  if (!e.target.closest || !e.target.closest('.proj-dd')) {
    document.querySelectorAll('.proj-dd-panel').forEach(function(p){ p.style.display = 'none'; });
  }
});

// 디테일 패널 프로젝트 행
function buildTaskCatHTML(task) {
  return '<div class="field-group">'
    + '<label class="field-label">🔮 프로젝트</label>'
    + buildProjectDropdown('dp-proj', task.mdtAction || null)
    + '</div>';
}

function dpProjectSelect(sel) {
  if (!detailTaskId) return;
  var task = tasks.find(function(t){ return t.id === detailTaskId; });
  if (!task) return;
  if (sel) task.mdtAction = sel; else delete task.mdtAction;
  saveTasks(); renderTasks();
}

function buildActionOptsForTask(task, mdt) {
  let opts = '<option value="">— Project 없음 —</option>';
  if (!mdt) return opts;
  // SECTION[i] → subGoals[i] 직접 매핑
  const idx = (task.lwSection !== null && task.lwSection !== undefined) ? task.lwSection : null;
  if (idx === null) return opts;
  const sg = mdt.subGoals[idx];
  if (!sg || !sg.actions) return opts;
  sg.actions.forEach(function(act) {
    if (!act.text) return;
    const sel = (task.mdtAction && task.mdtAction.actionId === act.id) ? ' selected' : '';
    opts += `<option value="${act.id}" data-text="${String(act.text).replace(/"/g,'&quot;')}"${sel}>${act.text}</option>`;
  });
  return opts;
}

function taskSetLwSection(taskId, sel) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const val = sel.value;
  if (!val) {
    delete task.lwSection; delete task.lwSectionName; delete task.lwSectionEmoji;
    delete task.mdtGoal;   delete task.mdtAction;
  } else {
    const idx = parseInt(val);
    if (typeof loadLifeWheel === 'function') loadLifeWheel();
    const secs = (typeof getLwSections === 'function') ? getLwSections() : [];
    const sec = secs[idx];
    task.lwSection = idx;
    task.lwSectionName  = sec ? sec.name  : '';
    task.lwSectionEmoji = sec ? sec.emoji : '';
    // SECTION = 만다라트 핵심목표 자동 연결 (subGoals[i])
    const year = (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : new Date().getFullYear();
    const mdt  = (typeof getMdt === 'function') ? getMdt(year) : null;
    if (mdt && mdt.subGoals[idx]) {
      const sg = mdt.subGoals[idx];
      task.mdtGoal = { year, sgId: sg.id, text: sg.text };
    } else {
      delete task.mdtGoal;
    }
    delete task.mdtAction;
  }
  saveTasks();
}

function taskSetAction(taskId, sel) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!sel.value) {
    delete task.mdtAction;
  } else {
    const actionId = parseInt(sel.value);
    const opt = sel.selectedOptions[0];
    const year = (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : new Date().getFullYear();
    const sgId = task.mdtGoal ? task.mdtGoal.sgId : null;
    task.mdtAction = { year, sgId, actionId, text: opt.dataset.text || sel.options[sel.selectedIndex].text };
  }
  saveTasks();
}

function saveAndClosePanel() {
  saveDpTitle();
  // 날짜 피커가 열려있으면 저장
  if (typeof saveDpDateTimeFromPicker === 'function') saveDpDateTimeFromPicker();
  closeDetailPanel();
}

function closeDetailPanel() {
  saveDpTitle();
  detailTaskId = null;
  // 새 레이아웃
  var rp = document.getElementById('right-panel');
  if (rp) rp.classList.remove('open');
  // 구 레이아웃 폴백
  var dp = document.getElementById('detail-panel');
  if (dp) dp.style.display = 'none';
  renderTasks();
  var _fnName = MENU_RENDERERS[currentMenu];
  if (_fnName && typeof window[_fnName] === 'function') window[_fnName]();
}

function toggleDpSubForm(targetId) {
  const ids = ['dp-start-inputs','dp-reminder-form','dp-date-inputs','dp-repeat-options','dp-assignee-form','dp-dep-form'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === targetId) {
      const wasOpen = el.style.display !== 'none';
      el.style.display = wasOpen ? 'none' : 'flex';
      if (!wasOpen && id === 'dp-assignee-form')
        setTimeout(() => document.getElementById('dp-assignee-input')?.focus(), 50);
    } else {
      el.style.display = 'none';
    }
  });
}

function scheduleDpTitleSave() {
  clearTimeout(dpTitleSaveTimer);
  dpTitleSaveTimer = setTimeout(saveDpTitle, 500);
  const ta = document.getElementById('dp-title-area');
  if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
}

function saveDpTitle() {
  if (!detailTaskId) return;
  const ta = document.getElementById('dp-title-area');
  if (!ta) return;
  const newText = ta.value.trim();
  if (!newText) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (task && task.text !== newText) {
    task.text = newText; saveTasks();
    const el = document.querySelector('#task-item-'+detailTaskId+' .task-title');
    if (el) el.textContent = newText;
  }
}

function toggleCompleteFromPanel() { if (detailTaskId) toggleComplete(detailTaskId); }
function toggleStarFromPanel()     { if (detailTaskId) toggleStar(detailTaskId); }

function deleteFromPanel() {
  if (!detailTaskId) return;
  const id = detailTaskId; closeDetailPanel(); deleteTask(id);
}

// ============================================
//  📝 TO DO (Steps)
// ============================================

function addStep(taskId) {
  const input = document.getElementById('dp-step-input');
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.steps) task.steps = [];
  task.steps.push({ id: Date.now(), text, completed: false, dueDateTime: null, hasTime: false });
  input.value = '';
  saveTasks(); refreshDpSteps(task); renderTasks();
  setTimeout(() => document.getElementById('dp-step-input')?.focus(), 50);
}

function toggleStep(taskId, stepId) {
  const task = tasks.find(t => t.id === taskId);
  const step = task?.steps?.find(s => s.id === stepId);
  if (!step) return;
  step.completed = !step.completed;
  step.text = applyDonePrefix(step.text, step.completed);
  saveTasks(); refreshDpSteps(task); renderTasks();
}

function saveStepTextEdit(taskId, stepId, el) {
  var task = tasks.find(function(t){ return t.id === taskId; });
  var step = (task && task.steps) ? task.steps.find(function(s){ return s.id === stepId; }) : null;
  if (!step) return;
  var v = (el.textContent || '').trim();
  if (v === '') { el.textContent = step.text; return; }   // 빈 값이면 원복
  if (v === step.text) return;
  step.text = v;
  if (typeof saveTasks === 'function') saveTasks();
}

function deleteStep(taskId, stepId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task?.steps) return;
  task.steps = task.steps.filter(s => s.id !== stepId);
  saveTasks(); refreshDpSteps(task); renderTasks();
}

function handleStepInput(event, taskId) { if (event.key === 'Enter') addStep(taskId); }

function refreshDpSteps(task) {
  const c = document.getElementById('dp-steps-list');
  if (c) c.innerHTML = buildStepsHtml(task);
}

// ============================================
//  📅 TO DO 기한
// ============================================

function toggleStepDateForm(stepId) {
  // 다른 단계의 날짜 폼은 모두 닫기
  document.querySelectorAll('.step-date-form').forEach(f => {
    if (f.id !== 'dp-step-date-form-' + stepId) f.style.display = 'none';
  });
  const form = document.getElementById('dp-step-date-form-' + stepId);
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    setTimeout(() => form.querySelector('input[type="date"]')?.focus(), 50);
  }
}

function saveStepDate(taskId, stepId) {
  const task = tasks.find(t => t.id === taskId);
  const step = task?.steps?.find(s => s.id === stepId);
  if (!step) return;
  const dateVal = document.getElementById('step-date-' + stepId)?.value;
  if (!dateVal) return;
  step.dueDateTime = dateVal + 'T09:00:00';
  step.hasTime = false;
  saveTasks(); refreshDpSteps(task); renderTasks();
}

function clearStepDate(taskId, stepId) {
  const task = tasks.find(t => t.id === taskId);
  const step = task?.steps?.find(s => s.id === stepId);
  if (!step) return;
  step.dueDateTime = null; step.hasTime = false;
  saveTasks(); refreshDpSteps(task); renderTasks();
}

// ============================================
//  📆 날짜 일정 패널
// ============================================

function openDatePlan(year, month, day) {
  if (detailTaskId) { saveDpTitle(); detailTaskId = null; document.getElementById('detail-panel').style.display = 'none'; }
  const p = document.getElementById('date-plan-panel');
  if (p) p.style.display = 'none';
  datePlanDate = {year, month, day};
  renderTasks();
}

function refreshDatePlan(year, month, day) {
  openDatePlan(year, month, day);
}

function closeDatePlan() {
  datePlanDate = null;
  const p = document.getElementById('date-plan-panel');
  if (p) p.style.display = 'none';
  // 타이틀 복원
  const activeNav = document.querySelector('#category-list li.active .nav-label');
  const titleEl = document.getElementById('category-title');
  if (titleEl && activeNav) titleEl.textContent = activeNav.textContent;
  updateDateText();
  if (currentCategory !== 'mandalart') {
    document.querySelector('.add-task-area').style.display = 'block';
  }
  renderTasks();
}

// ============================================
//  🔔 알림 설정
// ============================================

function saveReminder() {
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  const d = document.getElementById('dp-reminder-date')?.value;
  const t = document.getElementById('dp-reminder-time')?.value;
  if (!d || !t) { alert('날짜와 시간을 모두 선택해주세요.'); return; }
  task.reminder = d+'T'+t+':00';
  saveTasks(); scheduleReminder(task); openDetailPanel(detailTaskId); renderTasks();
}

function clearReminder(event) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.reminder = null;
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}

function scheduleReminder(task) {
  if (!task.reminder) return;
  const delay = new Date(task.reminder).getTime() - Date.now();
  if (delay <= 0 || delay > 2147483647) return;
  const fire = () => {
    if (Notification.permission === 'granted')
      new Notification('📝 My TaskLog', { body: task.text });
  };
  if (Notification.permission === 'granted') {
    setTimeout(fire, delay);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') setTimeout(fire, delay); });
  }
}

// ============================================
//  🔔 알림 (마감 D-3 · 주간일지) — 설정 토글로 on/off
// ============================================
function notifEnabled(kind) {
  var k = (kind === 'deadline') ? 'app-notif-deadline' : 'app-notif-journal';
  var v = localStorage.getItem(k);
  return v === null ? true : v !== '0';   // 기본 켜짐
}

function ensureNotifPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    try { Notification.requestPermission().then(function(){ runAppNotifications(); }); } catch (e) {}
  }
}

// Task 마감 D-3 ~ 당일: 하루 1번(항목별 1번)만 브라우저 알림
function runDeadlineNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!notifEnabled('deadline') || typeof tasks === 'undefined') return;
  var today = new Date(); today.setHours(0,0,0,0);
  var todayKey = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
  var shown = {};
  try { shown = JSON.parse(localStorage.getItem('notif-deadline-shown') || '{}'); } catch (e) {}
  if (shown._day !== todayKey) shown = { _day: todayKey };   // 날짜 바뀌면 초기화
  tasks.forEach(function(t) {
    if (t.completed || !t.dueDateTime) return;
    var due = new Date(t.dueDateTime); due.setHours(0,0,0,0);
    var days = Math.round((due - today) / 86400000);
    if (days < 0 || days > 3) return;
    if (shown[t.id]) return;
    var label = days === 0 ? '오늘 마감' : ('D-' + days);
    try { new Notification('📌 마감 임박 — ' + label, { body: (t.text||'').replace(/^\[\d{6}\] /,'') }); } catch (e) {}
    shown[t.id] = 1;
  });
  localStorage.setItem('notif-deadline-shown', JSON.stringify(shown));
}

// 주간일지 작성 알림: 목~일요일, 하루 1번
function runJournalNotification() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!notifEnabled('journal')) return;
  var now = new Date();
  var dow = now.getDay();                       // 0=일 ... 4=목 ... 6=토
  if ([0,4,5,6].indexOf(dow) === -1) return;    // 목·금·토·일만
  var todayKey = now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
  if (localStorage.getItem('notif-journal-shown') === todayKey) return;
  localStorage.setItem('notif-journal-shown', todayKey);
  try { new Notification('📓 주간일지 작성', { body: '이번 주 주간일지를 작성해 보세요.' }); } catch (e) {}
}

function runAppNotifications() {
  runDeadlineNotifications();
  runJournalNotification();
}

// 앱 시작 시: 권한 확인 후 즉시 1회 + 이후 1시간마다 재확인
function initAppNotifications() {
  ensureNotifPermission();
  runAppNotifications();
  if (!window.__notifTimer) {
    window.__notifTimer = setInterval(runAppNotifications, 60 * 60 * 1000);
  }
}

function scheduleAllReminders() { tasks.forEach(t => { if (t.reminder) scheduleReminder(t); }); }

// ============================================
//  🔄 반복 설정
// ============================================

function setRepeat(value) {
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.repeat = value;
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}

function clearRepeat(event) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.repeat = null;
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}

// ============================================
//  👥 협업자
// ============================================

function addAssignee() {
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  const input = document.getElementById('dp-assignee-input');
  const name = input?.value.trim();
  if (!name) { input?.focus(); return; }
  if (!Array.isArray(task.assignees)) task.assignees = [];
  if (!task.assignees.includes(name)) task.assignees.push(name);
  input.value = '';
  saveTasks(); _refreshAssigneeUI(task); renderTasks();
  setTimeout(() => document.getElementById('dp-assignee-input')?.focus(), 50);
}

function removeAssignee(event, name) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task?.assignees) return;
  task.assignees = task.assignees.filter(a => a !== name);
  saveTasks(); _refreshAssigneeUI(task); renderTasks();
}

function clearAllAssignees(event) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.assignees = [];
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}

function _refreshAssigneeUI(task) {
  const tagsEl = document.getElementById('dp-assignee-tags');
  if (tagsEl) {
    tagsEl.innerHTML = task.assignees.map(a =>
      '<span class="assignee-tag">' + escapeHtml(a)
      + '<button class="assignee-tag-del" onclick="removeAssignee(event,\'' + escapeHtml(a).replace(/'/g,'&#39;') + '\')">✕</button></span>'
    ).join('');
  }
  const rowItem = document.getElementById('dp-assignee-form')?.previousElementSibling;
  if (rowItem) {
    const lbl = rowItem.querySelector('.dp-row-label');
    if (lbl) { lbl.textContent = task.assignees.length > 0 ? task.assignees.join(', ') : '협업자 추가'; lbl.classList.toggle('is-set', task.assignees.length > 0); }
    const rmBtn = rowItem.querySelector('.dp-row-remove');
    if (task.assignees.length > 0 && !rmBtn) rowItem.insertAdjacentHTML('beforeend', '<button class="dp-row-remove" onclick="clearAllAssignees(event)">✕</button>');
    else if (task.assignees.length === 0 && rmBtn) rmBtn.remove();
  }
}

// 하위 호환 유지
function saveAssignee() { addAssignee(); }
function clearAssignee(event) { clearAllAssignees(event); }

// ============================================
//  📅 마감일 (패널 내)
// ============================================

function saveDpDateTime() {
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  const dateVal = document.getElementById('dp-date-input')?.value;
  const timeVal = document.getElementById('dp-time-input')?.value;
  if (!dateVal) return;
  task.dueDateTime = timeVal ? dateVal+'T'+timeVal+':00' : dateVal+'T09:00:00';
  task.hasTime = !!timeVal;
  saveTasks(); renderTasks();
}

function clearDpDue(event) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.dueDateTime = null; task.hasTime = false;
  delete pickerState['dp-due'];
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}
// ============================================
//  🗓️ 시작일
// ============================================

function saveDpStartFromPicker() {
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  const pv = getPickerValue('dp-start');
  task.startDate = pv.dateStr ? pv.dateStr + 'T09:00:00' : null;
  saveTasks(); renderTasks();
  // 레이블 업데이트
  const rowItem = document.getElementById('dp-start-inputs');
  if (rowItem) {
    const prev = rowItem.previousElementSibling;
    if (prev) {
      const lbl = prev.querySelector('.dp-row-label');
      if (lbl) { lbl.textContent = task.startDate ? formatDueDate(task.startDate, false) : '시작일 설정'; lbl.classList.toggle('is-set', !!task.startDate); }
      const rmBtn = prev.querySelector('.dp-row-remove');
      if (task.startDate && !rmBtn) prev.insertAdjacentHTML('beforeend','<button class="dp-row-remove" onclick="clearDpStart(event)">✕</button>');
      else if (!task.startDate && rmBtn) rmBtn.remove();
    }
  }
}

function clearDpStart(event) {
  event?.stopPropagation();
  if (!detailTaskId) return;
  const task = tasks.find(t => t.id === detailTaskId);
  if (!task) return;
  task.startDate = null;
  delete pickerState['dp-start'];
  saveTasks(); openDetailPanel(detailTaskId); renderTasks();
}

// ============================================
//  🔗 연계고리 (이전/다음 TASK)
// ============================================

function addDepTask(taskId, dir) {
  const task = tasks.find(t => t.id === taskId); if (!task) return;
  const selId = dir === 'prev' ? 'dp-prev-sel' : 'dp-next-sel';
  const sel = document.getElementById(selId); if (!sel || !sel.value) return;
  const depId = parseInt(sel.value);
  if (dir === 'prev') {
    if (!task.prevTaskIds.includes(depId)) { task.prevTaskIds.push(depId); }
    // 상대방 nextTaskIds에도 추가
    const dep = tasks.find(t => t.id === depId);
    if (dep && !dep.nextTaskIds.includes(taskId)) dep.nextTaskIds.push(taskId);
  } else {
    if (!task.nextTaskIds.includes(depId)) { task.nextTaskIds.push(depId); }
    const dep = tasks.find(t => t.id === depId);
    if (dep && !dep.prevTaskIds.includes(taskId)) dep.prevTaskIds.push(taskId);
  }
  saveTasks(); openDetailPanel(taskId);
}

function removeDepTask(event, taskId, depId, dir) {
  event?.stopPropagation();
  const task = tasks.find(t => t.id === taskId); if (!task) return;
  if (dir === 'prev') {
    task.prevTaskIds = task.prevTaskIds.filter(id => id !== depId);
    const dep = tasks.find(t => t.id === depId);
    if (dep) dep.nextTaskIds = dep.nextTaskIds.filter(id => id !== taskId);
  } else {
    task.nextTaskIds = task.nextTaskIds.filter(id => id !== depId);
    const dep = tasks.find(t => t.id === depId);
    if (dep) dep.prevTaskIds = dep.prevTaskIds.filter(id => id !== taskId);
  }
  saveTasks(); openDetailPanel(taskId);
}





// ============================================
//  ➕ 하단 할 일 추가 입력창
// ============================================

function expandTaskInput() {
  document.getElementById('add-task-trigger').style.display = 'none';
  const form = document.getElementById('add-task-form');
  form.style.display = 'flex';
  document.getElementById('task-input-field').focus();
  renderTaskCatBar();
}

// ── 빠른 추가 카테고리 바: SECTION 선택 (1단계) ──
function renderTaskCatBar() {
  const bar = document.getElementById('task-cat-bar');
  if (!bar) return;
  let html = '';
  if (_taskCat.lwIdx !== null) {
    html += '<span class="tcat-chip tcat-lw" onclick="showLwCatPicker()">'
      + _taskCat.lwEmoji + ' ' + _taskCat.lwName + '</span>';
    html += '<button class="tcat-clear" onclick="clearTaskCat()">✕</button>';
  } else {
    html = '<button class="tcat-pick-lw" onclick="showLwCatPicker()">🎡 Section 선택</button>';
  }
  bar.innerHTML = html;
}

function showLwCatPicker() {
  closeCatPickers();
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  const secs = (typeof getLwSections === 'function') ? getLwSections() : null;
  if (!secs) return;
  const picker = document.createElement('div');
  picker.id = 'lw-cat-picker';
  picker.className = 'cat-picker';
  picker.innerHTML = '<div class="cat-picker-title">Section 선택</div>'
    + secs.map(function(s, i) {
        return '<div class="cat-picker-item" onclick="selectLwCat('+i+')">'
          + s.emoji + ' ' + s.name + '</div>';
      }).join('');
  const bar = document.getElementById('task-cat-bar');
  if (bar) bar.appendChild(picker);
}

// SECTION 선택 → 만다라트 핵심목표 자동 연결 (1단계 완료)
function selectLwCat(idx) {
  closeCatPickers();
  if (typeof loadLifeWheel === 'function') loadLifeWheel();
  const secs = (typeof getLwSections === 'function') ? getLwSections() : null;
  if (!secs || !secs[idx]) return;
  _taskCat.lwIdx = idx;
  _taskCat.lwName  = secs[idx].name;
  _taskCat.lwEmoji = secs[idx].emoji;
  // SECTION = 만다라트 핵심목표 자동 연결 (subGoals[i])
  const year = (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) ? lwCurrentYear : new Date().getFullYear();
  if (typeof loadMandalarts === 'function') loadMandalarts();
  const mdt = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (mdt && mdt.subGoals[idx]) {
    const sg = mdt.subGoals[idx];
    _taskCat.sgId = sg.id; _taskCat.sgText = sg.text; _taskCat.year = year;
  } else {
    _taskCat.sgId = null; _taskCat.sgText = '';
  }
  _taskCat.actionId = null; _taskCat.actionText = '';
  renderTaskCatBar();
}

function showActionCatPicker() {
  closeCatPickers();
  if (_taskCat.lwIdx === null) { showLwCatPicker(); return; }
  if (typeof loadMandalarts === 'function') loadMandalarts();
  const year = _taskCat.year || (typeof lwCurrentYear !== 'undefined' && lwCurrentYear) || new Date().getFullYear();
  const mdt = (typeof getMdt === 'function') ? getMdt(year) : null;
  if (!mdt) { alert('Mandalart ' + year + '년 데이터가 없어요.'); return; }
  // SECTION index로 subGoal 직접 찾기
  const sg = mdt.subGoals[_taskCat.lwIdx];
  if (!sg) return;
  const actions = (sg.actions || []).filter(function(a){ return a.text; });
  if (actions.length === 0) { alert('Project 항목이 없어요. Mandalart에서 먼저 입력해주세요.'); return; }
  const picker = document.createElement('div');
  picker.id = 'action-cat-picker';
  picker.className = 'cat-picker';
  picker.innerHTML = '<div class="cat-picker-title">Project 선택</div>'
    + actions.map(function(act) {
        return '<div class="cat-picker-item" onclick="selectActionCat(' + year + ',' + sg.id + ',' + act.id + ',\'' + act.text.replace(/'/g,'') + '\')">'
          + act.text + '</div>';
      }).join('');
  const bar = document.getElementById('task-cat-bar');
  if (bar) bar.appendChild(picker);
}

function selectActionCat(year, sgId, actionId, actionText) {
  closeCatPickers();
  _taskCat.actionId = actionId;
  _taskCat.actionText = actionText;
  _taskCat.year = year;
  renderTaskCatBar();
}

function clearTaskCat() {
  _taskCat = { lwIdx:null, lwName:'', lwEmoji:'', sgId:null, sgText:'', actionId:null, actionText:'', year:null };
  closeCatPickers();
  renderTaskCatBar();
}

function closeCatPickers() {
  ['lw-cat-picker','sg-cat-picker','action-cat-picker'].forEach(function(id){
    const el = document.getElementById(id); if (el) el.remove();
  });
}

function collapseTaskInput() {
  clearTaskCat();
  document.getElementById('add-task-trigger').style.display = 'flex';
  document.getElementById('add-task-form').style.display = 'none';
  document.getElementById('task-input-field').value = '';
}

function handleAddTask() {
  const textInput = document.getElementById('task-input-field');
  if (!textInput.value.trim()) return;
  addTask(textInput.value, null, null);
  collapseTaskInput();
}

// ============================================
//  🗂 카테고리 날짜 텍스트
// ============================================

function updateDateText() {
  const el = document.getElementById('cat-date');
  if (!el) return;
  if (currentCategory === 'today') {
    el.textContent = new Date().toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'long' });
  }
}


// ============================================
//  📌 오른쪽 패널 (Task 생성/편집)
// ============================================

var rpState = {
  taskId: null,   // null = 새 Task, id = 수정
  dirty: false,
  eisenhower: null,
  status: '대기',
  steps: [],
  assignees: [],
  upstreamDepts: [],
  mdtAction: null,
  reminder: null,
  repeat: null,
  prevTaskIds: [],
  nextTaskIds: [],
  completed: false,
  starred: false,
  createdAt: null,
};

var RP_EI_COLORS = { DO:'var(--danger)', SCHEDULE:'var(--success)', DELEGATE:'var(--warning)', DROP:'var(--brand-primary)' };
var RP_EI_NAME   = { DO:'ASAP', SCHEDULE:'SCHEDULE', DELEGATE:'NEXT', DROP:'SOMEDAY' };
var RP_EI_DESC   = { DO:'지금 바로', SCHEDULE:'일정 예약', DELEGATE:'다음 차례', DROP:'언젠가' };
var RP_STATUS_OPTS = ['대기','진행','중단','완료','취소'];
var RP_STATUS_COLORS = { '대기':'var(--text-2)', '진행':'var(--success)', '중단':'var(--danger)', '완료':'var(--info)', '취소':'var(--text-3)' };

function openNewTaskPanel(taskId) {
  rpState.taskId = taskId || null;
  rpState.dirty  = false;
  var task = taskId ? tasks.find(function(t){ return t.id === taskId; }) : null;
  rpState.eisenhower = task ? (task.eisenhower || null) : null;
  rpState.status     = task ? (task.status     || '대기') : '대기';
  rpState.steps       = task ? (task.steps || []).map(function(s){ return Object.assign({}, s); }) : [];
  rpState.assignees   = task ? (task.assignees || []).slice() : [];
  rpState.upstreamDepts = task ? (Array.isArray(task.upstreamDepts) ? task.upstreamDepts.slice() : (task.upstreamDept ? [task.upstreamDept] : [])) : [];
  rpState.mdtAction   = task ? (task.mdtAction || null) : null;
  rpState.reminder    = task ? (task.reminder || null) : null;
  rpState.repeat      = task ? (task.repeat || null) : null;
  rpState.prevTaskIds = task ? (Array.isArray(task.prevTaskIds) ? task.prevTaskIds.slice() : []) : [];
  rpState.nextTaskIds = task ? (Array.isArray(task.nextTaskIds) ? task.nextTaskIds.slice() : []) : [];
  rpState.completed   = task ? !!task.completed : false;
  rpState.starred     = task ? !!task.starred : false;
  rpState.createdAt   = task ? (task.createdAt || null) : null;
  detailTaskId        = taskId || null;

  var titleEl = document.getElementById('rp-title');
  if (titleEl) titleEl.textContent = task ? 'Task 수정' : 'Task 생성';

  var body = document.getElementById('rp-body');
  if (body) { body.classList.remove('rp-body--detail'); body.innerHTML = buildRpForm(task); }
  _projDDCallbacks['rp-proj'] = function(sel){ rpState.mdtAction = sel; rpState.dirty = true; };

  // 생성/수정 모드: rp-footer(저장/취소) 복원
  var rpFoot = document.querySelector('.rp-footer');
  if (rpFoot) rpFoot.style.display = '';

  var panel = document.getElementById('right-panel');
  if (panel) panel.classList.add('open');

  setTimeout(function(){
    var inp = document.getElementById('rp-task-name');
    if (inp) inp.focus();
  }, 100);
}

// ============================================
//  📅 세그먼트형 날짜 입력 (YYYY / MM / DD)
//  - 연도 4자리 입력 시 자동으로 월(MM) 칸으로 커서 이동, 월 입력 후 일(DD)로 이동
//  - 숨김 input(hiddenId)에 'YYYY-MM-DD'를 담아 기존 저장 로직과 호환
// ============================================
function buildDateSegInput(hiddenId, dateStr) {
  var y = '', m = '', d = '';
  if (dateStr) { var p = String(dateStr).split('-'); y = p[0] || ''; m = p[1] || ''; d = p[2] || ''; }
  function inp(part, val, ph, cls, ml) {
    return '<input type="text" class="seg-part ' + cls + '" id="' + hiddenId + '-' + part + '"'
      + ' inputmode="numeric" maxlength="' + ml + '" placeholder="' + ph + '" value="' + val + '"'
      + ' oninput="dsegInput(event,\'' + hiddenId + '\',\'' + part + '\')"'
      + ' onkeydown="dsegKey(event,\'' + hiddenId + '\',\'' + part + '\')"'
      + ' onfocus="this.select()">';
  }
  return '<div class="seg-date field-input" id="' + hiddenId + '-wrap">'
    + inp('y', y, 'YYYY', 'seg-y', 4)
    + '<span class="seg-sep">-</span>'
    + inp('m', m, 'MM', 'seg-m', 2)
    + '<span class="seg-sep">-</span>'
    + inp('d', d, 'DD', 'seg-d', 2)
    + '<input type="hidden" id="' + hiddenId + '" value="' + (dateStr || '') + '">'
    + '</div>';
}
function dsegFocus(hiddenId, part, toEnd) {
  var el = document.getElementById(hiddenId + '-' + part);
  if (!el) return;
  el.focus();
  try { if (toEnd) { var L = el.value.length; el.setSelectionRange(L, L); } else { el.select(); } } catch (err) {}
}
function dsegInput(e, hiddenId, part) {
  var el = e.target;
  var v = el.value.replace(/\D/g, '');
  if (v !== el.value) el.value = v;
  if (typeof rpState !== 'undefined') rpState.dirty = true;
  // 자동 커서 이동: 연도 4자리 → 월, 월 완료 → 일
  if (part === 'y' && v.length >= 4) dsegFocus(hiddenId, 'm');
  else if (part === 'm' && (v.length >= 2 || (v.length === 1 && +v > 1))) dsegFocus(hiddenId, 'd');
  dsegSync(hiddenId);
}
function dsegKey(e, hiddenId, part) {
  // 빈 칸에서 Backspace → 이전 칸으로 이동
  if (e.key === 'Backspace' && e.target.value === '') {
    var prev = (part === 'm') ? 'y' : (part === 'd') ? 'm' : null;
    if (prev) { e.preventDefault(); dsegFocus(hiddenId, prev, true); }
  }
}
function dsegSync(hiddenId) {
  var g = function(part){ var el = document.getElementById(hiddenId + '-' + part); return el ? el.value : ''; };
  var y = g('y'), m = g('m'), d = g('d');
  var hid = document.getElementById(hiddenId); if (!hid) return;
  if (y.length === 4 && m.length >= 1 && d.length >= 1) {
    var mm = Math.min(12, Math.max(1, parseInt(m, 10) || 1));
    var dd = Math.min(31, Math.max(1, parseInt(d, 10) || 1));
    hid.value = y + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  } else {
    hid.value = '';
  }
}

function buildRpForm(task) {
  var name       = task ? (task.completed ? task.text : task.text.replace(/^\[\d{6}\] /, '')) : '';
  var startStr   = task ? (task.startDate ? toDateInputVal(task.startDate) : '') : toDateInputVal(new Date());
  var dueStr     = (task && task.dueDateTime) ? toDateInputVal(task.dueDateTime) : '';
  var dueTimeStr = (task && task.dueDateTime && task.hasTime) ? toTimeInputVal(task.dueDateTime) : '';
  var notesVal   = task ? (task.notes || '') : '';

  // Priority (ASAP / NEXT / SCHEDULE / SOMEDAY) — 내부값은 DO/DELEGATE/SCHEDULE/DROP 유지
  var eiHtml = '<div class="rp-sect"><div class="rp-section-head">Priority</div><div class="rp-ei-grid">';
  ['DO','DELEGATE','SCHEDULE','DROP'].forEach(function(k) {
    var sel = rpState.eisenhower === k;
    var selStyle = sel ? 'border-color:'+RP_EI_COLORS[k]+';background:color-mix(in srgb, '+RP_EI_COLORS[k]+' 10%, transparent);' : '';
    eiHtml += '<button class="rp-ei-btn'+(sel?' rp-ei-sel':'')+'" data-ei="'+k+'" style="'+selStyle+'" onclick="rpSetEi(\''+k+'\')">'
      + '<span class="rp-ei-name" style="color:'+RP_EI_COLORS[k]+';">'+RP_EI_NAME[k]+'</span>'
      + '<span class="rp-ei-desc">'+RP_EI_DESC[k]+'</span>'
      + '</button>';
  });
  eiHtml += '</div></div>';

  // Status (한 줄 5등분)
  var statusHtml = '<div class="rp-sect rp-tight"><div class="rp-section-head">Status</div><div class="rp-status-row">';
  RP_STATUS_OPTS.forEach(function(s) {
    var sel = rpState.status === s;
    var col = RP_STATUS_COLORS[s] || 'var(--text-2)';
    var st = sel ? 'border-color:'+col+';background:color-mix(in srgb, '+col+' 15%, transparent);color:'+col+';' : '';
    statusHtml += '<button class="rp-status-btn'+(sel?' active':'')+'" id="rp-sbtn-'+s+'" style="'+st+'" onclick="rpSetStatus(\''+s+'\')">'+s+'</button>';
  });
  statusHtml += '</div></div>';

  // To Do (단계) 섹션
  var todoHtml = '<div class="rp-sect rp-tight"><div class="rp-section-head">To Do</div>'
    + '<div class="dp-steps-section"><div id="rp-steps-list">' + rpBuildStepsHtml() + '</div>'
    + '<div class="dp-add-step">'
    + '<div class="task-check step-check" style="opacity:0.25;cursor:default;"></div>'
    + '<input type="text" id="rp-step-input" class="dp-step-input" placeholder="To Do 추가" onkeydown="rpHandleStepInput(event)">'
    + '<button class="step-add-btn" onclick="rpAddStep()">+</button>'
    + '</div></div></div>';

  // Coworker 섹션 (명칭 오른쪽에 오른쪽 정렬로 추가)
  var coworkerHtml = '<div class="rp-sect rp-tight">'
    + '<div class="rp-inline-head"><span class="rp-section-head">Coworker</span>'
    + '<div class="assignee-tags rp-inline-tags" id="rp-coworker-tags">' + rpBuildCoworkerHtml() + '</div></div>'
    + '<div class="rp-inline-input">'
    + '<input type="text" id="rp-coworker-input" class="field-input" placeholder="이름" onkeydown="rpHandleCoworkerInput(event)">'
    + '<button class="sub-form-save" onclick="rpAddCoworker()">추가</button>'
    + '</div></div>';

  // UpStream Dept. 섹션 (Coworker 처럼 여러 개 입력)
  var upstreamHtml = '<div class="rp-sect rp-tight">'
    + '<div class="rp-inline-head"><span class="rp-section-head">UpStream Dept.</span>'
    + '<div class="assignee-tags rp-inline-tags" id="rp-upstream-tags">' + rpBuildUpstreamHtml() + '</div></div>'
    + '<div class="rp-inline-input">'
    + '<input type="text" id="rp-upstream-input" class="field-input" placeholder="부서명" onkeydown="rpHandleUpstreamInput(event)">'
    + '<button class="sub-form-save" onclick="rpAddUpstream()">추가</button>'
    + '</div></div>';

  var isEdit = !!task;

  // Linked Tasks (선행 1 / 후행 1 — Start·Due 처럼 한 줄)
  var depHtml = '<div class="rp-sect rp-tight"><div class="rp-section-head">Linked Tasks</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<div class="field-group" style="flex:1;"><label class="field-label">이전 (선행)</label>'
    + '<select class="field-input" id="rp-prev-sel" onchange="rpSetDep(\'prev\',this.value)">'+rpDepSingleOptions('prev')+'</select></div>'
    + '<div class="field-group" style="flex:1;"><label class="field-label">다음 (후행)</label>'
    + '<select class="field-input" id="rp-next-sel" onchange="rpSetDep(\'next\',this.value)">'+rpDepSingleOptions('next')+'</select></div>'
    + '</div></div>';

  // 생성일 / 삭제 (수정 모드)
  var editFooter = '';
  if (isEdit) {
    var cs = rpState.createdAt ? new Date(rpState.createdAt) : null;
    var createdStr = cs ? (cs.getMonth()+1)+'월 '+cs.getDate()+'일 생성됨' : '';
    editFooter = '<div class="rp-edit-footer"><span class="rp-created">'+createdStr+'</span>'
      + '<button class="rp-delete-btn" onclick="rpDeleteTask()" title="삭제">🗑️ 삭제</button></div>';
  }

  return '<div class="rp-form">'
    + '<div class="field-group"><label class="field-label">Task</label>'
    + '<div class="rp-task-row">'
    + '<div class="task-check rp-task-check'+(rpState.completed?' is-done':'')+'" onclick="rpToggleComplete()" title="완료 여부"></div>'
    + '<input class="field-input" id="rp-task-name" placeholder="할 일을 입력하세요" value="'+rpEsc(name)+'" oninput="rpState.dirty=true">'
    + '</div></div>'
    + '<div style="display:flex;gap:10px;">'
    + '<div class="field-group" style="flex:1;"><label class="field-label">Start</label>'
    + buildDateSegInput('rp-start-date', startStr) + '</div>'
    + '<div class="field-group" style="flex:1;"><label class="field-label">Due</label>'
    + buildDateSegInput('rp-due-date', dueStr) + '</div>'
    + '</div>'
    + todoHtml
    + eiHtml
    + statusHtml
    + coworkerHtml
    + upstreamHtml
    + '<div class="field-group"><label class="field-label">Project</label>'
    + buildProjectDropdown('rp-proj', rpState.mdtAction || null) + '</div>'
    + depHtml
    + '<div class="field-group"><label class="field-label">Memo</label>'
    + '<textarea class="field-textarea" id="rp-notes" placeholder="\uba54\ubaa8\ub97c \uc785\ub825\ud558\uc138\uc694" rows="3" oninput="rpState.dirty=true">'+rpEsc(notesVal)+'</textarea></div>'
    + editFooter
    + '</div>';
}

// ── TO DO (rp-form draft) ──
function rpBuildStepsHtml() {
  return rpState.steps.map(function(s) {
    var linkedTask = s.linkedTaskId ? tasks.find(function(t){ return t.id === s.linkedTaskId; }) : null;
    var linkBadge = linkedTask
      ? '<span class="due-badge" style="cursor:default;">🔗 ' + escapeHtml(linkedTask.text.replace(/^\[\d{6}\] /,'').substring(0,16)) + '</span>'
      : '';
    var hasDate = !!s.dueDateTime;
    var dateForm = '<div class="dp-sub-form step-date-form rp-step-date-form" id="rp-step-date-form-'+s.id+'" style="display:none;">'
      + buildPickerHtml('rp-step-'+s.id, hasDate ? toDateInputVal(s.dueDateTime) : null, null)
      + '</div>';
    return '<div class="dp-step rp-dnd-step" id="rp-step-'+s.id+'" data-step-id="'+s.id+'"'
      +   ' ondragover="rpStepDragOver(event,'+s.id+')" ondragleave="rpStepDragLeave(event)" ondrop="rpStepDrop(event,'+s.id+')">'
      + '<span class="step-drag-handle" draggable="true" title="드래그해 순서 변경"'
      +   ' onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"'
      +   ' ondragstart="rpStepDragStart(event,'+s.id+')" ondragend="rpStepDragEnd(event)">\u283F</span>'
      + '<div class="task-check step-check '+(s.completed?'is-done':'')+'" onclick="rpToggleStep('+s.id+')"></div>'
      + '<div class="step-content">'
      + '<span class="step-text '+(s.completed?'is-done':'')+'" contenteditable="true" spellcheck="false"'
      +   ' title="클릭해 텍스트 수정" onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"'
      +   ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"'
      +   ' onblur="rpSaveStepText('+s.id+',this)">'+escapeHtml(s.text)+'</span>'
      + (linkBadge ? '<div class="step-meta">'+linkBadge+'</div>' : '')
      + '</div>'
      + '<button class="step-cal-btn'+(hasDate?' has-date':'')+'" onclick="event.stopPropagation();rpToggleStepDateForm('+s.id+')" title="마감일 설정">'
      + (hasDate ? '📅 '+formatDueDate(s.dueDateTime, false) : '📅')
      + '</button>'
      + '<button class="step-delete" onclick="rpDeleteStep('+s.id+')">✕</button></div>'
      + dateForm;
  }).join('');
}

// 완료/미완료 무관하게 TO DO 텍스트 인라인 수정 (rp-form 초안에 반영, 저장 시 확정)
function rpSaveStepText(stepId, el) {
  var s = rpState.steps.find(function(x){ return x.id === stepId; });
  if (!s) return;
  var v = (el.textContent || '').trim();
  if (v === '') { el.textContent = s.text; return; }   // 빈 값이면 원복
  if (v === s.text) return;
  s.text = v;
  rpState.dirty = true;
}

// ── TO DO 마감일 (rp-form draft) ──
function rpToggleStepDateForm(stepId) {
  document.querySelectorAll('.step-date-form').forEach(function(f){
    if (f.id !== 'rp-step-date-form-'+stepId) f.style.display = 'none';
  });
  var form = document.getElementById('rp-step-date-form-'+stepId);
  if (!form) return;
  var isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) setTimeout(function(){ openPickerCal('rp-step-'+stepId); }, 30);
}

function rpSaveStepFromPicker(id) {
  var stepId = +id.replace('rp-step-', '');
  var s = rpState.steps.find(function(x){ return x.id === stepId; });
  if (!s) return;
  var pv = getPickerValue(id);
  if (pv.dateStr) { s.dueDateTime = pv.dateStr + 'T09:00:00'; s.hasTime = false; }
  else { s.dueDateTime = null; s.hasTime = false; }
  rpState.dirty = true;
  rpRefreshSteps();
}

// 연계 TASK 드롭다운: 완료된 TASK는 목록에서 제외
function rpStepLinkOptions() {
  var opts = '<option value="">연계 TASK 없음</option>';
  opts += tasks.filter(function(t){ return !t.completed && t.id !== rpState.taskId; })
    .map(function(t){ return '<option value="'+t.id+'">'+escapeHtml(t.text.replace(/^\[\d{6}\] /,'').substring(0,20))+'</option>'; })
    .join('');
  return opts;
}

function rpAddStep() {
  var input = document.getElementById('rp-step-input');
  var text = input ? input.value.trim() : '';
  if (!text) { if (input) input.focus(); return; }
  var linkSel = document.getElementById('rp-step-link-sel');
  var linkedTaskId = (linkSel && linkSel.value) ? parseInt(linkSel.value) : null;
  rpState.steps.push({ id: Date.now() + Math.floor(Math.random()*1000), text: text, completed: false, linkedTaskId: linkedTaskId });
  rpState.dirty = true;
  input.value = '';
  if (linkSel) linkSel.value = '';
  rpRefreshSteps();
  setTimeout(function(){ var i = document.getElementById('rp-step-input'); if (i) i.focus(); }, 50);
}

function rpToggleStep(stepId) {
  var s = rpState.steps.find(function(x){ return x.id === stepId; });
  if (!s) return;
  s.completed = !s.completed;
  s.text = applyDonePrefix(s.text, s.completed);
  rpState.dirty = true;
  rpRefreshSteps();
}

function rpDeleteStep(stepId) {
  rpState.steps = rpState.steps.filter(function(x){ return x.id !== stepId; });
  rpState.dirty = true;
  rpRefreshSteps();
}

function rpHandleStepInput(event) { if (event.key === 'Enter') rpAddStep(); }

function rpRefreshSteps() {
  var list = document.getElementById('rp-steps-list');
  if (list) list.innerHTML = rpBuildStepsHtml();
}

// ── TO DO 순서 변경 (드래그 & 드롭) ──
var _rpDragStepId = null;

function rpStepDragStart(ev, stepId) {
  _rpDragStepId = stepId;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(stepId)); } catch (e) {}
  var row = document.getElementById('rp-step-' + stepId);
  if (row) setTimeout(function(){ row.classList.add('rp-step-dragging'); }, 0);
}

function rpStepDragEnd() {
  _rpDragStepId = null;
  document.querySelectorAll('.rp-step-dragging').forEach(function(el){ el.classList.remove('rp-step-dragging'); });
  document.querySelectorAll('.rp-step-over, .rp-step-over-after').forEach(function(el){
    el.classList.remove('rp-step-over'); el.classList.remove('rp-step-over-after');
  });
}

function rpStepDragOver(ev, stepId) {
  if (_rpDragStepId == null) return;            // 우리 핸들에서 시작한 드래그만 처리
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  var row = document.getElementById('rp-step-' + stepId);
  if (!row || stepId === _rpDragStepId) return;
  document.querySelectorAll('.rp-step-over, .rp-step-over-after').forEach(function(el){
    if (el !== row) { el.classList.remove('rp-step-over'); el.classList.remove('rp-step-over-after'); }
  });
  var r = row.getBoundingClientRect();
  var after = ev.clientY > r.top + r.height / 2;   // 행 중앙 기준 위/아래 삽입 방향
  row.classList.toggle('rp-step-over-after', after);
  row.classList.toggle('rp-step-over', !after);
}

function rpStepDragLeave(ev) {
  var row = ev.currentTarget;
  if (row) { row.classList.remove('rp-step-over'); row.classList.remove('rp-step-over-after'); }
}

function rpStepDrop(ev, targetStepId) {
  ev.preventDefault();
  var fromId = _rpDragStepId;
  if (fromId == null || fromId === targetStepId) { rpStepDragEnd(); return; }
  var arr = rpState.steps;
  var fromIdx = arr.findIndex(function(s){ return s.id === fromId; });
  if (fromIdx < 0) { rpStepDragEnd(); return; }
  var row = document.getElementById('rp-step-' + targetStepId);
  var after = false;
  if (row) { var r = row.getBoundingClientRect(); after = ev.clientY > r.top + r.height / 2; }
  var moved = arr.splice(fromIdx, 1)[0];         // 먼저 제거
  var toIdx = arr.findIndex(function(s){ return s.id === targetStepId; });
  if (toIdx < 0) toIdx = arr.length;
  else if (after) toIdx += 1;
  arr.splice(toIdx, 0, moved);                   // 대상 앞/뒤에 삽입
  rpState.dirty = true;                          // 저장 시 순서 확정
  rpStepDragEnd();
  rpRefreshSteps();
}

// ── COWORKER (rp-form draft) ──
function rpBuildCoworkerHtml() {
  return rpState.assignees.map(function(a) {
    return '<span class="assignee-tag">' + escapeHtml(a)
      + '<button class="assignee-tag-del" onclick="rpRemoveCoworker(\''+escapeHtml(a).replace(/'/g,'&#39;')+'\')">✕</button></span>';
  }).join('');
}

function rpAddCoworker() {
  var input = document.getElementById('rp-coworker-input');
  var name = input ? input.value.trim() : '';
  if (!name) { if (input) input.focus(); return; }
  if (rpState.assignees.indexOf(name) === -1) rpState.assignees.push(name);
  rpState.dirty = true;
  input.value = '';
  rpRefreshCoworkers();
  setTimeout(function(){ var i = document.getElementById('rp-coworker-input'); if (i) i.focus(); }, 50);
}

function rpRemoveCoworker(name) {
  rpState.assignees = rpState.assignees.filter(function(a){ return a !== name; });
  rpState.dirty = true;
  rpRefreshCoworkers();
}

function rpHandleCoworkerInput(event) { if (event.key === 'Enter') rpAddCoworker(); }

function rpRefreshCoworkers() {
  var tagsEl = document.getElementById('rp-coworker-tags');
  if (tagsEl) tagsEl.innerHTML = rpBuildCoworkerHtml();
}

// ── UpStream Dept. (rp-form draft) ──
function rpBuildUpstreamHtml() {
  return rpState.upstreamDepts.map(function(d) {
    return '<span class="assignee-tag">' + escapeHtml(d)
      + '<button class="assignee-tag-del" onclick="rpRemoveUpstream(\''+escapeHtml(d).replace(/'/g,'&#39;')+'\')">✕</button></span>';
  }).join('');
}

function rpAddUpstream() {
  var input = document.getElementById('rp-upstream-input');
  var name = input ? input.value.trim() : '';
  if (!name) { if (input) input.focus(); return; }
  if (rpState.upstreamDepts.indexOf(name) === -1) rpState.upstreamDepts.push(name);
  rpState.dirty = true;
  input.value = '';
  rpRefreshUpstream();
  setTimeout(function(){ var i = document.getElementById('rp-upstream-input'); if (i) i.focus(); }, 50);
}

function rpRemoveUpstream(name) {
  rpState.upstreamDepts = rpState.upstreamDepts.filter(function(d){ return d !== name; });
  rpState.dirty = true;
  rpRefreshUpstream();
}

function rpHandleUpstreamInput(event) { if (event.key === 'Enter') rpAddUpstream(); }

function rpRefreshUpstream() {
  var tagsEl = document.getElementById('rp-upstream-tags');
  if (tagsEl) tagsEl.innerHTML = rpBuildUpstreamHtml();
}

// ── 완료 체크 (Task 이름 왼쪽) ──
function rpToggleComplete() {
  rpState.completed = !rpState.completed;
  rpState.dirty = true;
  var c = document.querySelector('.rp-task-check');
  if (c) c.classList.toggle('is-done', rpState.completed);
  // To Do처럼 완료일([YYMMDD])을 Task 이름 왼쪽에 즉시 표시/제거 → 그 자리에서 바로 수정 가능
  var inp = document.getElementById('rp-task-name');
  if (inp) {
    inp.value = applyDonePrefix(inp.value, rpState.completed);
    if (rpState.completed && /^\[\d{6}\] /.test(inp.value)) {
      // 완료일 숫자 6자리를 선택해 두어 바로 수정할 수 있게
      try { inp.focus(); inp.setSelectionRange(1, 7); } catch (e) {}
    }
  }
}

// ── Linked Tasks (선행 1 / 후행 1) ──
function rpDepIds(dir) { return dir === 'prev' ? rpState.prevTaskIds : rpState.nextTaskIds; }

function rpDepSingleOptions(dir) {
  var cur = rpDepIds(dir)[0] || '';
  var opts = '<option value="">— 선택 안 함 —</option>';
  opts += tasks.filter(function(t){ return t.id !== rpState.taskId; })
    .map(function(t){
      var s = (t.id === cur) ? ' selected' : '';
      return '<option value="'+t.id+'"'+s+'>'+escapeHtml(t.text.replace(/^\[\d{6}\] /,'').substring(0,30))+'</option>';
    }).join('');
  return opts;
}

function rpSetDep(dir, val) {
  var id = val ? parseInt(val) : null;
  if (dir === 'prev') rpState.prevTaskIds = id ? [id] : [];
  else rpState.nextTaskIds = id ? [id] : [];
  rpState.dirty = true;
}

// ── 삭제 (rp-form) ──
function rpDeleteTask() {
  if (!rpState.taskId) return;
  if (!confirm('이 작업을 삭제하시겠습니까?')) return;
  var id = rpState.taskId;
  // 양방향 연계 정리
  tasks.forEach(function(o){
    if (o.prevTaskIds) o.prevTaskIds = o.prevTaskIds.filter(function(x){ return x !== id; });
    if (o.nextTaskIds) o.nextTaskIds = o.nextTaskIds.filter(function(x){ return x !== id; });
  });
  rpState.dirty = false;
  rpState.taskId = null; detailTaskId = null;
  var panel = document.getElementById('right-panel');
  if (panel) panel.classList.remove('open');
  deleteTask(id);
  var _fnName = MENU_RENDERERS[currentMenu];
  if (_fnName && typeof window[_fnName] === 'function') window[_fnName]();
  updateCategoryCounts();
}

function rpSetEi(key) {
  rpState.eisenhower = (rpState.eisenhower === key) ? null : key;
  rpState.dirty = true;
  document.querySelectorAll('.rp-ei-btn').forEach(function(btn) {
    var k = btn.getAttribute('data-ei');
    if (!RP_EI_COLORS[k]) return;
    var sel = rpState.eisenhower === k;
    btn.classList.toggle('rp-ei-sel', sel);
    btn.style.borderColor = sel ? RP_EI_COLORS[k] : '';
    btn.style.background  = sel ? 'color-mix(in srgb, '+RP_EI_COLORS[k]+' 10%, transparent)' : '';
  });
}

function rpSetStatus(s) {
  rpState.status = s;
  rpState.dirty  = true;
  RP_STATUS_OPTS.forEach(function(opt) {
    var btn = document.getElementById('rp-sbtn-'+opt);
    if (!btn) return;
    var sel = opt === s;
    var col = RP_STATUS_COLORS[opt] || 'var(--text-2)';
    btn.classList.toggle('active', sel);
    btn.style.borderColor = sel ? col : '';
    btn.style.background  = sel ? 'color-mix(in srgb, '+col+' 15%, transparent)' : '';
    btn.style.color       = sel ? col : '';
    btn.textContent = opt;
  });
}

function closeRightPanel() {
  if (rpState.dirty) {
    if (!confirm('저장하지 않은 변경사항이 있습니다. 닫겠습니까?')) return;
  }
  var panel = document.getElementById('right-panel');
  if (panel) panel.classList.remove('open');
  detailTaskId = null;
  rpState.dirty = false; rpState.taskId = null;
}

function saveRightPanel() {
  var nameEl = document.getElementById('rp-task-name');
  var name   = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (nameEl) { nameEl.style.outline = '2px solid var(--danger)'; nameEl.focus(); }
    return;
  }

  var dueDate   = (document.getElementById('rp-due-date')   || {}).value  || '';
  var startDate = (document.getElementById('rp-start-date') || {}).value  || '';
  var notesVal  = (document.getElementById('rp-notes')      || {}).value  || '';
  var upstreamDepts = rpState.upstreamDepts.slice();
  var upstreamDeptVal = upstreamDepts.join(', ');

  var dueDateTime = null, hasTime = false;
  if (dueDate) { dueDateTime = dueDate+'T09:00:00'; hasTime = false; }

  var reminderDate = (document.getElementById('rp-reminder-date') || {}).value || '';
  var reminderVal = reminderDate ? reminderDate+'T09:00:00' : null;

  function applyCompletePrefix(baseName, completed, existingText) {
    // 이름칸에 이미 들어있는 [YYMMDD] 완료일(사용자가 직접 수정 가능)을 최우선 처리
    var bm = baseName.match(/^(\[\d{6}\] )/);
    var pure = bm ? baseName.slice(bm[1].length) : baseName;
    if (!completed) return pure;                 // 미완료: 접두사 제거
    if (bm) return bm[1] + pure;                 // 사용자가 입력/수정한 완료일 유지
    var m = existingText && existingText.match(/^(\[\d{6}\] )/);
    if (m) return m[1] + pure;                   // 기존 완료일 유지
    var now = new Date();
    var yy = String(now.getFullYear()).slice(2);
    var mm = String(now.getMonth()+1).padStart(2,'0');
    var dd = String(now.getDate()).padStart(2,'0');
    return '[' + yy + mm + dd + '] ' + pure;
  }

  var savedTask = null;
  if (rpState.taskId) {
    var task = tasks.find(function(t){ return t.id === rpState.taskId; });
    if (task) {
      task.text        = applyCompletePrefix(name, rpState.completed, task.text);
      task.completed   = rpState.completed;
      task.starred     = rpState.starred;
      task.eisenhower  = rpState.eisenhower;
      task.status      = rpState.status;
      task.startDate   = startDate ? startDate+'T09:00:00' : null;
      task.dueDateTime = dueDateTime;
      task.hasTime     = hasTime;
      task.notes       = notesVal;
      task.steps       = rpState.steps;
      task.assignees   = rpState.assignees.slice();
      task.upstreamDepts = upstreamDepts;
      task.upstreamDept = upstreamDeptVal;
      task.reminder    = reminderVal;
      task.repeat      = rpState.repeat || null;
      task.prevTaskIds = rpState.prevTaskIds.slice();
      task.nextTaskIds = rpState.nextTaskIds.slice();
      if (rpState.mdtAction) task.mdtAction = rpState.mdtAction; else delete task.mdtAction;
      savedTask = task;
    }
  } else {
    var newTask = {
      id: Date.now(), text: applyCompletePrefix(name, rpState.completed, ''),
      completed: rpState.completed, starred: rpState.starred,
      createdAt: new Date().toISOString(),
      dueDateTime: dueDateTime, hasTime: hasTime,
      startDate: startDate ? startDate+'T09:00:00' : null,
      eisenhower: rpState.eisenhower, status: rpState.status, notes: notesVal,
      steps: rpState.steps, reminder: reminderVal, assignee: '', assignees: rpState.assignees.slice(),
      repeat: rpState.repeat || null,
      upstreamDepts: upstreamDepts,
      upstreamDept: upstreamDeptVal,
      mdtAction: rpState.mdtAction || null,
      prevTaskIds: rpState.prevTaskIds.slice(), nextTaskIds: rpState.nextTaskIds.slice(),
    };
    tasks.push(newTask);
    savedTask = newTask;
  }

  // 연계 TASK 양방향 정합성 동기화
  if (savedTask) {
    var myId = savedTask.id;
    tasks.forEach(function(o){
      if (o.id === myId) return;
      o.prevTaskIds = Array.isArray(o.prevTaskIds) ? o.prevTaskIds : [];
      o.nextTaskIds = Array.isArray(o.nextTaskIds) ? o.nextTaskIds : [];
      if (savedTask.prevTaskIds.indexOf(o.id) !== -1) { if (o.nextTaskIds.indexOf(myId) === -1) o.nextTaskIds.push(myId); }
      else { o.nextTaskIds = o.nextTaskIds.filter(function(x){ return x !== myId; }); }
      if (savedTask.nextTaskIds.indexOf(o.id) !== -1) { if (o.prevTaskIds.indexOf(myId) === -1) o.prevTaskIds.push(myId); }
      else { o.prevTaskIds = o.prevTaskIds.filter(function(x){ return x !== myId; }); }
    });
    if (savedTask.reminder) scheduleReminder(savedTask);
    saveTasks();
  }

  rpState.dirty = false; rpState.taskId = null; detailTaskId = null;
  var panel = document.getElementById('right-panel');
  if (panel) panel.classList.remove('open');

  var _fnName = MENU_RENDERERS[currentMenu];
  if (_fnName && typeof window[_fnName] === 'function') window[_fnName]();
  updateCategoryCounts();
}

function rpEsc(text) { var d = document.createElement('div'); d.textContent = text||''; return d.innerHTML; }

// ============================================
//  🧭 사이드바 내비게이션
// ============================================

var currentMenu = 'home';

var _SVG = {
  todo:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6"/></svg>',
  home:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-120v-480l320-240 320 240v480H560v-280H400v280H160Z"/></svg>',
  cloud:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1.5V22.5M1.5 12H22.5M4.58 4.58 19.42 19.42M19.42 4.58 4.58 19.42"/><path d="M12 5 16.95 7.05 19 12 16.95 16.95 12 19 7.05 16.95 5 12 7.05 7.05Z"/><path d="M12 8.2 14.69 9.31 15.8 12 14.69 14.69 12 15.8 9.31 14.69 8.2 12 9.31 9.31Z"/></svg>',
  mvv:       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.8"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M14 10 L21.5 2.5"/><path d="M21.5 2.5 L17.6 3 M21.5 2.5 L21 6.4"/><path d="M12 12 L15.1 11 L13 8.9 Z" fill="currentColor" stroke="none"/></svg>',
  wheel:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="m233-80 54-122q-14-11-27-21.5T235-246q-8 3-15.5 4.5T203-240q-33 0-56.5-23.5T123-320q0-20 8.5-36.5T155-384q-8-23-11-46.5t-3-49.5q0-26 3-49.5t11-46.5q-15-11-23.5-27.5T123-640q0-33 23.5-56.5T203-720q9 0 16.5 1.5T235-714q33-36 75.5-60t90.5-36q5-30 27.5-50t52.5-20q30 0 52.5 20.5T561-810q48 12 90.5 35.5T727-716q8-3 15-4.5t15-1.5q33 0 56.5 23.5T837-642q0 20-8 35.5T807-580q8 24 11 49t3 51q0 26-3 50.5T807-382q14 11 22 26.5t8 35.5q0 33-23.5 56.5T757-240q-8 0-15-1.5t-15-4.5q-12 12-24.5 23.5T675-200l52 120h-74l-38-88q-14 6-27 10.5t-27 7.5q-5 29-27.5 49.5T481-80q-30 0-52.5-20T401-150q-15-3-28.5-7.5T345-168l-38 88h-74Zm76-174 62-140q-14-18-22-40t-8-46q0-57 41.5-98.5T481-620q57 0 98.5 41.5T621-480q0 24-8.5 47T589-392l62 138q9-8 17.5-14.5T685-284q-5-8-6.5-17.5T677-320q0-32 22-55t54-25q6-20 9-39.5t3-40.5q0-21-3-41.5t-9-40.5q-32-2-54-25t-22-55q0-9 2.5-17.5T685-676q-29-29-64-49t-74-31q-11 17-28 26.5t-38 9.5q-21 0-38-9.5T415-756q-41 11-76 31.5T275-674q3 8 5.5 16.5T283-640q0 32-21 54.5T209-560q-6 20-9 39.5t-3 40.5q0 21 3 40.5t9 39.5q32 2 53 25t21 55q0 9-1.5 17.5T275-286q8 9 16.5 16.5T309-254Zm60 34q11 5 22.5 9t23.5 7q11-17 28-26.5t38-9.5q21 0 38 9.5t28 26.5q12-3 22.5-7t21.5-9l-58-130q-12 5-25 7.5t-27 2.5q-15 0-28.5-3t-25.5-9l-58 132Zm112-200q24 0 42-17t18-43q0-24-18-42t-42-18q-26 0-43 18t-17 42q0 26 17 43t43 17Zm0-60Z"/></svg>',
  mandalart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M183.5-183.5Q160-207 160-240t23.5-56.5Q207-320 240-320t56.5 23.5Q320-273 320-240t-23.5 56.5Q273-160 240-160t-56.5-23.5Zm240 0Q400-207 400-240t23.5-56.5Q447-320 480-320t56.5 23.5Q560-273 560-240t-23.5 56.5Q513-160 480-160t-56.5-23.5Zm240 0Q640-207 640-240t23.5-56.5Q687-320 720-320t56.5 23.5Q800-273 800-240t-23.5 56.5Q753-160 720-160t-56.5-23.5Zm-480-240Q160-447 160-480t23.5-56.5Q207-560 240-560t56.5 23.5Q320-513 320-480t-23.5 56.5Q273-400 240-400t-56.5-23.5Zm240 0Q400-447 400-480t23.5-56.5Q447-560 480-560t56.5 23.5Q560-513 560-480t-23.5 56.5Q513-400 480-400t-56.5-23.5Zm240 0Q640-447 640-480t23.5-56.5Q687-560 720-560t56.5 23.5Q800-513 800-480t-23.5 56.5Q753-400 720-400t-56.5-23.5Zm-480-240Q160-687 160-720t23.5-56.5Q207-800 240-800t56.5 23.5Q320-753 320-720t-23.5 56.5Q273-640 240-640t-56.5-23.5Zm240 0Q400-687 400-720t23.5-56.5Q447-800 480-800t56.5 23.5Q560-753 560-720t-23.5 56.5Q513-640 480-640t-56.5-23.5Zm240 0Q640-687 640-720t23.5-56.5Q687-800 720-800t56.5 23.5Q800-753 800-720t-23.5 56.5Q753-640 720-640t-56.5-23.5Z"/></svg>',
  project:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-280h240v-80H240v80Zm120-160h240v-80H360v80Zm120-160h240v-80H480v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>',
  wbs:       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M176,152h32a16,16,0,0,0,16-16V104a16,16,0,0,0-16-16H176a16,16,0,0,0-16,16v8H88V80h8a16,16,0,0,0,16-16V32A16,16,0,0,0,96,16H64A16,16,0,0,0,48,32V64A16,16,0,0,0,64,80h8V192a24,24,0,0,0,24,24h64v8a16,16,0,0,0,16,16h32a16,16,0,0,0,16-16V192a16,16,0,0,0-16-16H176a16,16,0,0,0-16,16v8H96a8,8,0,0,1-8-8V128h72v8A16,16,0,0,0,176,152ZM64,32H96V64H64ZM176,192h32v32H176Zm0-88h32v32H176Z"/></svg>',
  journal:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h240v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Z"/></svg>',
};

var MENUS = [
  { id:'home',      icon:_SVG.home,      label:'Home',         short:'Home' },
  { id:'cloud',     icon:_SVG.cloud,     label:'Web',          short:'Web'  },
  { id:'todo',      icon:_SVG.todo,      label:'Board',        short:'Board'},
  { id:'journal',   icon:_SVG.journal,   label:'WD',           short:'WD'   },
  { divider:true },
  { id:'mvv',       icon:_SVG.mvv,       label:'MVV',          short:'MVV'  },
  { id:'wheel',     icon:_SVG.wheel,     label:'LW',           short:'LW'   },
  { id:'mandalart', icon:_SVG.mandalart, label:'M',            short:'M'    },
  { id:'project',   icon:_SVG.project,   label:'Gantt',        short:'Gantt'},
  { id:'wbs',       icon:_SVG.wbs,       label:'WBS',          short:'WBS'  },
];

var MENU_TITLES = {
  home:'Home', todo:'Board', cloud:'Web', mvv:'Mission Vision Value',
  wheel:'Life Wheel', mandalart:'Mandalart',
  project:'Gantt', wbs:'Work Breakdown Structure', journal:'Work Diary',
};

var MENU_EMOJI = {
  home:'🏠', todo:'📅', cloud:'☁️', mvv:'🎯',
  wheel:'🎡', mandalart:'🔮', project:'📊',
  wbs:'🌳', journal:'📓',
};

// 📐 사이드바 고정(접힘) — 열고 닫는 기능 제거
function initSidebarCollapse() {
  var sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.add('collapsed');
  if (typeof updateDarkModeBtn === 'function') updateDarkModeBtn(); // 테마 스위치 초기 동기화
}

function initSidebar() {
  var nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = MENUS.map(function(m) {
    if (m.divider) return '<div class="nav-divider"></div>';
    var full = MENU_TITLES[m.id] || m.label;
    return '<button class="nav-item" id="nav-'+m.id+'" title="'+full+'" onclick="navToMenu(\''+m.id+'\')">'
      + '<span class="nav-item-icon">'+m.icon+'</span>'
      + '<span class="nav-item-label">'+full+'</span>'
      + '</button>';
  }).join('');
  var act = document.getElementById('nav-'+currentMenu);
  if (act) act.classList.add('active');
}

// 메뉴 id → 각 화면 렌더 함수 이름
var MENU_RENDERERS = {
  home:      'renderHomeView',
  todo:      'renderTodoView',
  cloud:     'renderNotesView',
  mvv:       'renderMVVPage',
  wheel:     'renderLifeWheelView',
  mandalart: 'renderMdtView',
  project:   'renderGanttView',
  wbs:       'renderWbsView',
  journal:   'renderJournalView',
};

// 📱 모바일 사이드바 드로어 토글
function openSidebar() {
  document.querySelector('.app')?.classList.add('sidebar-open');
}
function closeSidebar() {
  document.querySelector('.app')?.classList.remove('sidebar-open');
}
function toggleSidebar() {
  document.querySelector('.app')?.classList.toggle('sidebar-open');
}
// ESC로 드로어 닫기
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeSidebar();
});

// 🧭 화면 전환 엔진
function navToMenu(id) {
  if (!id) return;
  currentMenu = id;

  // 📱 모바일: 메뉴 선택 시 드로어 자동 닫기
  closeSidebar();

  // 1) 사이드바 활성 표시
  var navButtons = document.querySelectorAll('#sidebar-nav .nav-item');
  for (var i = 0; i < navButtons.length; i++) navButtons[i].classList.remove('active');
  var activeBtn = document.getElementById('nav-' + id);
  if (activeBtn) activeBtn.classList.add('active');

  // 2) 탑바 제목 / 날짜
  var titleEl = document.getElementById('topbar-title');
  if (titleEl) {
    var _icon = _SVG[id] || '';
    var _title = MENU_TITLES[id] || '';
    titleEl.innerHTML = _title;   // 아이콘 제거, 텍스트만
  }
  var dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    if (id === 'home') {
      var now = new Date();
      var days = ['일','월','화','수','목','금','토'];
      dateEl.textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일 (' + days[now.getDay()] + ')';
    } else {
      dateEl.textContent = '';
    }
  }

  // 3) '+Task' 버튼 제거 (Board 우측 상단 버튼 미표시)
  var newBtn = document.getElementById('new-task-btn');
  if (newBtn) newBtn.style.display = 'none';

  // 4) 우측 패널 닫기
  if (typeof closeRightPanel === 'function') closeRightPanel();

  // 4.5) 만다라트 연도 슬롯 초기화 (다른 메뉴로 이동 시 비움)
  var mdtYearSlot = document.getElementById('topbar-mdt-year-slot');
  if (mdtYearSlot) mdtYearSlot.innerHTML = '';

  // 5) 본문 렌더
  var fnName = MENU_RENDERERS[id];
  var content = document.getElementById('page-content');
  if (fnName && typeof window[fnName] === 'function') {
    window[fnName]();
  } else if (content) {
    content.innerHTML = '<div style="padding:40px;color:var(--text-2);text-align:center;">준비 중인 페이지입니다.</div>';
  }
}

// ============================================
//  🚀 앱 시작
// ============================================
function bootApp() {
  if (typeof initTheme === 'function') initTheme();
  if (typeof initSettings === 'function') initSettings();
  loadTasks();
  if (typeof appBootYearSync === 'function') appBootYearSync();
  initSidebar();
  initSidebarCollapse();
  navToMenu('home');
  if (typeof renderSidebarCalendar === 'function') renderSidebarCalendar();
  if (typeof updateCategoryCounts === 'function') updateCategoryCounts();
  if (typeof scheduleAllReminders === 'function') scheduleAllReminders();
  if (typeof initAppNotifications === 'function') initAppNotifications();
  if (typeof updateBackupStatus === 'function') updateBackupStatus();
  if (typeof initAutoBackup === 'function') initAutoBackup();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (typeof closeRightPanel === 'function') closeRightPanel();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
