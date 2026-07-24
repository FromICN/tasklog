// ============================================
//  🗄️ Archiving 보드 (Archiving / TASK / TO DO)
//  - Archiving: 작성한 메모 보관
//  - TASK: 미완료 Task 전체(실데이터)
//  - TO DO: 미완료 To Do(step) 전체(실데이터)
//  세 칼럼 간 드래그로 자유롭게 이동, 카드 클릭 시 오른쪽 상세 패널
// ============================================

const NOTES_KEY = 'my-tasklog-notes';
var notesData = [];
var _nbDrag = null;       // 드래그 중인 카드 정보
var _nbPending = null;    // step 연결 대기(picker) 정보

function loadNotes() {
  var saved = localStorage.getItem(NOTES_KEY);
  if (saved) { try { notesData = JSON.parse(saved); } catch(e) { notesData = []; } }
}

function saveNotes() {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notesData));
}

// 메모(Archiving) 생성
function createNote(text, dueDate, dueTime) {
  text = (text || '').trim();
  if (!text) return null;
  var note = { id: Date.now() + Math.random(), text: text, type: 'memo', taskId: null,
    dueDate: dueDate || null, dueTime: dueTime || null, createdAt: new Date().toISOString() };
  notesData.unshift(note);
  saveNotes();
  return note;
}

function deleteNote(id) {
  notesData = notesData.filter(function(n){ return String(n.id) !== String(id); });
  saveNotes();
  renderNoteBoard();
}

function getNotesByType(type) {
  return notesData.filter(function(n){ return n.type === type; });
}

// Archiving 칼럼에 표시할 메모만 (type === 'memo')
function getArchivingNotes() {
  return notesData.filter(function(n){ return n.type === 'memo'; });
}

// 마감일 오름차순 정렬 헬퍼 (마감일 없음 = 맨 뒤, Infinity-Infinity NaN 방지)
function nbDueMs(iso) { return iso ? new Date(iso).getTime() : Infinity; }
function nbCmpMs(x, y) { if (x < y) return -1; if (x > y) return 1; return 0; }

// ── Web 페이지 수동 정렬 순서 (드래그로 변경, localStorage 저장) ──
//    저장된 순서가 우선, 순서에 없는 항목은 마감일 오름차순(기본) 뒤에 유지
function nbLoadOrder(k){ try{ var r=localStorage.getItem(k); if(r){ var o=JSON.parse(r); if(Array.isArray(o)) return o; } }catch(e){} return []; }
function nbSaveOrder(k,arr){ try{ localStorage.setItem(k, JSON.stringify(arr)); }catch(e){} }
function nbApplyManualOrder(items, order, keyFn){
  if(!order || !order.length) return items;
  var pos={}; order.forEach(function(k,i){ pos[String(k)]=i; });
  return items.slice().sort(function(a,b){
    var pa=pos[keyFn(a)]; var pb=pos[keyFn(b)];
    if(pa===undefined) pa=Infinity;
    if(pb===undefined) pb=Infinity;
    if(pa!==pb) return pa-pb;   // 수동 순서 우선
    return 0;                    // 나머지는 기존(마감일) 순서 유지 (안정 정렬)
  });
}

// 미완료 Task / To Do 수집 (마감일 오름차순 정렬)
function getActiveTasks() {
  if (typeof tasks === 'undefined') return [];
  var active = tasks.filter(function(t){ return !t.completed; })
              .sort(function(a, b){ return nbCmpMs(nbDueMs(a.dueDateTime), nbDueMs(b.dueDateTime)); });
  return nbApplyManualOrder(active, nbLoadOrder('nbTaskOrder'), function(t){ return String(t.id); });
}
function getActiveSteps() {
  var out = [];
  if (typeof tasks === 'undefined') return out;
  tasks.forEach(function(t){
    (t.steps || []).forEach(function(s){
      if (!s.completed) out.push({ task: t, step: s });
    });
  });
  // To Do 마감일 우선(없으면 상위 Task 마감일)으로 오름차순 정렬
  out.sort(function(a, b){
    var da = (a.step && a.step.dueDateTime) ? a.step.dueDateTime : a.task.dueDateTime;
    var db = (b.step && b.step.dueDateTime) ? b.step.dueDateTime : b.task.dueDateTime;
    return nbCmpMs(nbDueMs(da), nbDueMs(db));
  });
  return nbApplyManualOrder(out, nbLoadOrder('nbStepOrder'), function(e){ return e.task.id + ':' + e.step.id; });
}

// ── 날짜 변환 헬퍼 ─────────────────────────
function nbIsoToDateStr(iso) { return iso && typeof toDateInputVal === 'function' ? toDateInputVal(iso) : null; }
function nbIsoToTimeStr(iso, hasTime) { return (iso && hasTime && typeof toTimeInputVal === 'function') ? toTimeInputVal(iso) : null; }
function nbDueToIso(dueDate, dueTime) {
  if (!dueDate) return null;
  return dueTime ? (dueDate + 'T' + dueTime + ':00') : (dueDate + 'T09:00:00');
}

// ============================================
//  화면 렌더
// ============================================
function renderNotesView() {
  loadNotes();
  var content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML =
    '<div class="nb-layout">'
    + '<div class="nb-write-panel">'
    + '<div class="nb-write-header">+ Memo</div>'
    + '<textarea class="nb-textarea" id="nb-input" placeholder="메모를 입력하세요..." onkeydown="nbInputKeyDown(event)"></textarea>'
    + '<button class="nb-add-btn" onclick="nbAddNote()">+ Archiving에 추가</button>'
    + '</div>'
    + '<div class="nb-board" id="nb-board">'
    + buildNbColumn('memo', 'Archiving', '작성한 메모가 여기 쌓여요')
    + buildNbColumn('task', 'Task', '미완료 Task가 모두 표시돼요')
    + buildNbColumn('step', 'To Do', '미완료 To Do가 모두 표시돼요')
    + '</div>'
    + '</div>';
  renderNoteBoard();
  setTimeout(function(){ var ta=document.getElementById('nb-input'); if(ta) ta.focus(); }, 50);
}

function buildNbColumn(type, title, hint) {
  return '<div class="nb-col" id="nbcol-'+type+'"'
    + ' ondragover="nbDragOver(event)" ondragleave="nbDragLeave(event)" ondrop="nbDrop(event, this)">'
    + '<div class="nb-col-header"><span class="nb-col-title">'+title+'</span><span class="nb-col-count" id="nbcount-'+type+'">0</span></div>'
    + '<div class="nb-col-hint" id="nbhint-'+type+'">'+hint+'</div>'
    + '<div class="nb-col-cards" id="nbcards-'+type+'"></div>'
    + '</div>';
}

function renderNoteBoard() {
  removeStepPickers();
  // Archiving (메모)
  var memos = getArchivingNotes();
  _nbFillColumn('memo', memos.length, memos.map(function(n){ return buildMemoCard(n); }).join(''));
  // TASK
  var actTasks = getActiveTasks();
  _nbFillColumn('task', actTasks.length, actTasks.map(function(t){ return buildTaskCard(t); }).join(''));
  // TO DO
  var actSteps = getActiveSteps();
  _nbFillColumn('step', actSteps.length, actSteps.map(function(e){ return buildStepCard(e.task, e.step); }).join(''));
}

function _nbFillColumn(type, count, html) {
  var container = document.getElementById('nbcards-'+type);
  var countEl   = document.getElementById('nbcount-'+type);
  var hintEl    = document.getElementById('nbhint-'+type);
  if (countEl) countEl.textContent = count;
  if (hintEl)  hintEl.style.display = count ? 'none' : 'block';
  if (container) container.innerHTML = html;
}

// ── 카드 빌더 ──────────────────────────────
function nbDueBadgeIso(iso, hasTime) {
  if (!iso) return '';
  var dfl = (typeof formatDueDate === 'function') ? formatDueDate(iso, hasTime) : iso;
  return '<span class="nb-card-due">📅 ' + escNb(dfl) + '</span>';
}

function buildMemoCard(note) {
  var dueStr = '';
  if (note.dueDate) {
    var dp = note.dueDate.split('-');
    dueStr = parseInt(dp[1],10) + '월 ' + parseInt(dp[2],10) + '일';
    if (note.dueTime) dueStr += ' ' + note.dueTime;
  }
  var dueHtml = dueStr ? '<span class="nb-card-due">📅 ' + dueStr + '</span>' : '';
  var timeStr = note.createdAt ? new Date(note.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  return '<div class="nb-card" draggable="true" data-kind="memo" data-note-id="' + note.id + '"'
    + ' ondragstart="nbDragStart(event)">'
    + '<div class="nb-card-strip" style="background:#555;"></div>'
    + '<div class="nb-card-body">'
    + '<div class="nb-card-text">'+escNb(note.text)+'</div>'
    + dueHtml
    + '<div class="nb-card-footer">'
    + '<span class="nb-card-time">'+timeStr+'</span>'
    + '<button class="nb-card-del" onclick="event.stopPropagation();deleteNote(this.closest(\'.nb-card\').dataset.noteId)">✕</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function buildTaskCard(task) {
  var dueBadge = nbDueBadgeIso(task.dueDateTime, task.hasTime);
  var progBadge = '';
  if (task.steps && task.steps.length) {
    var done = task.steps.filter(function(s){ return s.completed; }).length;
    progBadge = '<span class="nb-card-progress">📝 '+done+'/'+task.steps.length+'</span>';
  }
  var proj = '';
  // Project 이모지: 연계된 상위 Section 이모지와 통일 (todo.js 공용 해석기)
  var _em = (typeof todoSectionEmoji === 'function') ? todoSectionEmoji(task) : (task.lwSectionEmoji || '');
  if (task.mdtAction && task.mdtAction.text) proj = (_em || '🔮') + ' ' + task.mdtAction.text;
  else if (task.lwSectionName) proj = (_em ? _em + ' ' : '') + task.lwSectionName;
  var projHtml = proj ? '<div class="nb-card-taskref">'+escNb(proj)+'</div>' : '';
  return '<div class="nb-card" draggable="true" data-kind="task" data-task-id="' + task.id + '"'
    + ' style="cursor:pointer;" title="클릭하면 상세 보기"'
    + ' onclick="openDetailPanel(' + task.id + ')"'
    + ' ondragstart="nbDragStart(event)" ondragover="nbCardDragOver(event,this)" ondrop="nbCardDrop(event,this)">'
    + '<div class="nb-card-strip" style="background:var(--success);"></div>'
    + '<div class="nb-card-body">'
    + '<div class="nb-card-topline">'
    + '<div class="nb-card-textwrap"><span class="nb-card-text">'+escNb(task.text)+'</span>'+progBadge+'</div>'
    + dueBadge
    + '</div>'
    + projHtml
    + '</div>'
    + '</div>';
}

function buildStepCard(task, step) {
  var dueHtml = nbDueBadgeIso(step.dueDateTime, step.hasTime);
  return '<div class="nb-card" draggable="true" data-kind="step" data-task-id="' + task.id + '" data-step-id="' + step.id + '"'
    + ' style="cursor:pointer;" title="클릭하면 상위 Task 상세 보기"'
    + ' onclick="openDetailPanel(' + task.id + ')"'
    + ' ondragstart="nbDragStart(event)" ondragover="nbCardDragOver(event,this)" ondrop="nbCardDrop(event,this)">'
    + '<div class="nb-card-strip" style="background:var(--info);"></div>'
    + '<div class="nb-card-body">'
    + '<div class="nb-card-topline">'
    + '<div class="nb-card-textwrap"><span class="nb-card-text">'+escNb(step.text)+'</span></div>'
    + dueHtml
    + '</div>'
    + '<div class="nb-card-taskref">↳ '+escNb(task.text)+'</div>'
    + '</div>'
    + '</div>';
}

function escNb(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ── 메모 추가 ──────────────────────────────
function nbAddNote() {
  var ta = document.getElementById('nb-input');
  if (!ta) return;
  var note = createNote(ta.value);
  if (!note) return;
  ta.value = '';
  ta.focus();
  renderNoteBoard();
}

function nbInputKeyDown(e) {
  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); nbAddNote(); }
}

// ============================================
//  드래그 & 드롭
// ============================================
function nbDragStart(e) {
  var card = e.currentTarget;
  _nbDrag = {
    kind:   card.dataset.kind,
    noteId: card.dataset.noteId || null,
    taskId: card.dataset.taskId ? Number(card.dataset.taskId) : null,
    stepId: card.dataset.stepId || null
  };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', card.dataset.kind);
  setTimeout(function(){ card.classList.add('nb-dragging'); }, 0);
}

function nbDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('nb-col-over');
}

function nbDragLeave(e) {
  e.currentTarget.classList.remove('nb-col-over');
}

function nbDrop(e, colEl) {
  e.preventDefault();
  colEl.classList.remove('nb-col-over');
  var targetType = colEl.id.replace('nbcol-', '');   // memo | task | step
  var d = _nbDrag; _nbDrag = null;
  if (!d) return;
  nbApplyMove(d, targetType);
}

document.addEventListener('dragend', function() {
  document.querySelectorAll('.nb-col-over').forEach(function(el){ el.classList.remove('nb-col-over'); });
  document.querySelectorAll('.nb-dragging').forEach(function(el){ el.classList.remove('nb-dragging'); });
  document.querySelectorAll('.nb-card-drop-before, .nb-card-drop-after').forEach(function(el){ el.classList.remove('nb-card-drop-before'); el.classList.remove('nb-card-drop-after'); });
});

// ── 같은 칼럼 내 카드 순서 변경 (Task / To Do) ──
function nbCardDragOver(e, card){
  if(!_nbDrag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  var sameKind=(_nbDrag.kind===card.dataset.kind)&&(card.dataset.kind==='task'||card.dataset.kind==='step');
  document.querySelectorAll('.nb-card-drop-before, .nb-card-drop-after').forEach(function(el){ if(el!==card){ el.classList.remove('nb-card-drop-before'); el.classList.remove('nb-card-drop-after'); } });
  if(sameKind){
    var r=card.getBoundingClientRect(); var after=e.clientY>r.top+r.height/2;
    card.classList.toggle('nb-card-drop-after',after);
    card.classList.toggle('nb-card-drop-before',!after);
  }
}
function nbCardDrop(e, card){
  e.preventDefault(); e.stopPropagation();
  card.classList.remove('nb-card-drop-before'); card.classList.remove('nb-card-drop-after');
  var d=_nbDrag; _nbDrag=null; if(!d) return;
  var cardKind=card.dataset.kind;
  var sameKind=(d.kind===cardKind)&&(cardKind==='task'||cardKind==='step');
  if(!sameKind){ nbApplyMove(d, cardKind); return; }   // 다른 종류 → 칼럼 이동 로직
  var r=card.getBoundingClientRect(); var after=e.clientY>r.top+r.height/2;
  if(cardKind==='task'){
    var fromKey=String(d.taskId), toKey=String(card.dataset.taskId);
    if(fromKey===toKey) return;
    nbReorderSave('nbTaskOrder', getActiveTasks().map(function(t){ return String(t.id); }), fromKey, toKey, after);
  } else {
    var fromKeyS=d.taskId+':'+d.stepId, toKeyS=card.dataset.taskId+':'+card.dataset.stepId;
    if(fromKeyS===toKeyS) return;
    nbReorderSave('nbStepOrder', getActiveSteps().map(function(x){ return x.task.id+':'+x.step.id; }), fromKeyS, toKeyS, after);
  }
  renderNoteBoard();
}
function nbReorderSave(storeKey, keyList, fromKey, toKey, after){
  var arr=keyList.slice();
  var fi=arr.indexOf(fromKey); if(fi<0) return;
  arr.splice(fi,1);
  var ti=arr.indexOf(toKey); if(ti<0) ti=arr.length; else if(after) ti+=1;
  arr.splice(ti,0,fromKey);
  nbSaveOrder(storeKey, arr);
}

// ── 이동 로직 (모든 방향) ───────────────────
function nbApplyMove(d, target) {
  if (d.kind === target) return; // 같은 칼럼이면 무시

  // 1) Archiving(memo) 출발
  if (d.kind === 'memo') {
    var note = notesData.find(function(n){ return String(n.id) === String(d.noteId); });
    if (!note) return;
    if (target === 'task') {
      nbRemoveNote(note.id);
      if (typeof addTask === 'function') addTask(note.text, note.dueDate, note.dueTime);
      showNbToast('✅ TASK로 이동했어요');
    } else if (target === 'step') {
      nbStartStepLink({ mode:'memo', sourceId:note.id, text:note.text, dueDate:note.dueDate, dueTime:note.dueTime });
    }
    return;
  }

  // 2) TASK 출발
  if (d.kind === 'task') {
    var task = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === d.taskId; }) : null;
    if (!task) return;
    if (target === 'memo') {
      createNote(task.text, nbIsoToDateStr(task.dueDateTime), nbIsoToTimeStr(task.dueDateTime, task.hasTime));
      if (typeof deleteTask === 'function') deleteTask(task.id);
      showNbToast('🗄️ Archiving으로 이동했어요');
    } else if (target === 'step') {
      nbStartStepLink({ mode:'task', sourceId:task.id, text:task.text,
        dueDate:nbIsoToDateStr(task.dueDateTime), dueTime:nbIsoToTimeStr(task.dueDateTime, task.hasTime),
        excludeTaskId:task.id });
    }
    return;
  }

  // 3) TO DO(step) 출발
  if (d.kind === 'step') {
    var pt = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === d.taskId; }) : null;
    var st = (pt && pt.steps) ? pt.steps.find(function(s){ return String(s.id) === String(d.stepId); }) : null;
    if (!st) return;
    var sDate = nbIsoToDateStr(st.dueDateTime), sTime = nbIsoToTimeStr(st.dueDateTime, st.hasTime);
    if (target === 'task') {
      nbRemoveStep(pt.id, st.id);
      if (typeof addTask === 'function') addTask(st.text, sDate, sTime);
      showNbToast('✅ TASK로 승격했어요');
    } else if (target === 'memo') {
      nbRemoveStep(pt.id, st.id);
      createNote(st.text, sDate, sTime);
      renderNoteBoard();
      showNbToast('🗄️ Archiving으로 이동했어요');
    }
    return;
  }
}

// ── 데이터 헬퍼 ───────────────────────────
function nbRemoveNote(id) {
  notesData = notesData.filter(function(n){ return String(n.id) !== String(id); });
  saveNotes();
}
function nbRemoveStep(taskId, stepId) {
  var task = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === taskId; }) : null;
  if (!task || !task.steps) return;
  task.steps = task.steps.filter(function(s){ return String(s.id) !== String(stepId); });
  if (typeof saveTasks === 'function') saveTasks();
}
function nbAddStepToTask(taskId, text, dueDate, dueTime) {
  var task = (typeof tasks !== 'undefined') ? tasks.find(function(t){ return t.id === taskId; }) : null;
  if (!task) return false;
  if (!Array.isArray(task.steps)) task.steps = [];
  task.steps.push({ id: Date.now(), text: text, completed: false,
    dueDateTime: nbDueToIso(dueDate, dueTime), hasTime: !!dueTime });
  if (typeof saveTasks === 'function') saveTasks();
  return true;
}

// ============================================
//  TO DO로 옮길 때: 상위 Task 선택(picker)
// ============================================
function nbStartStepLink(opts) {
  _nbPending = opts;
  showStepPicker(opts.excludeTaskId);
}

var _nbPickerTasks = [];
// 마감일 내림차순 (마감일 없음 = 맨 뒤)
function nbTaskDueDescCmp(a, b){
  var da=a.dueDateTime, db=b.dueDateTime;
  if(!da && !db) return 0;
  if(!da) return 1;
  if(!db) return -1;
  return nbDueMs(db) - nbDueMs(da);
}
function nbFmtPickerDue(iso){ var d=new Date(iso); if(isNaN(d.getTime())) return ''; return (d.getMonth()+1)+'/'+d.getDate(); }
function nbPickerItemsHtml(q){
  q=(q||'').trim().toLowerCase();
  var list=_nbPickerTasks.filter(function(t){
    if(!q) return true;
    return String(t.text||'').toLowerCase().indexOf(q)>=0;
  });
  if(!list.length) return '<div class="nb-picker-empty">검색 결과가 없어요</div>';
  return list.map(function(t){
    var due=t.dueDateTime ? nbFmtPickerDue(t.dueDateTime) : '';
    var label=escNb(String(t.text||'').replace(/^\[\d{6}\] /,'')) || '(제목 없음)';
    return '<div class="nb-picker-item" onclick="nbAssignStep('+t.id+')">'
      + '<span class="nb-picker-dot">•</span>'
      + '<span class="nb-picker-item-text">'+label+'</span>'
      + (due ? '<span class="nb-picker-item-due">📅 '+due+'</span>' : '')
      + '</div>';
  }).join('');
}
function nbFilterPicker(q){
  var el=document.getElementById('nb-picker-list');
  if(el) el.innerHTML=nbPickerItemsHtml(q);
}
function showStepPicker(excludeId) {
  removeStepPickers();
  var all = (typeof tasks !== 'undefined') ? tasks.slice() : [];
  all = all.filter(function(t){ return t.id !== excludeId; });
  all.sort(nbTaskDueDescCmp);   // 마감일 내림차순, 전체 TASK
  _nbPickerTasks = all;
  if (all.length === 0) {
    _nbPending = null;
    showNbToast('연결할 TASK가 없어요. 먼저 TASK를 추가하세요.');
    return;
  }
  var picker = document.createElement('div');
  picker.className = 'nb-step-picker';
  picker.innerHTML =
    '<div class="nb-picker-header">🪜 연결할 TASK 선택</div>'
    + '<input type="text" class="nb-picker-search" id="nb-picker-search" placeholder="🔍 TASK 검색..."'
    + ' oninput="nbFilterPicker(this.value)" onkeydown="if(event.key===\'Escape\'){nbCancelStepLink();}">'
    + '<div class="nb-picker-list" id="nb-picker-list">' + nbPickerItemsHtml('') + '</div>'
    + '<div class="nb-picker-footer">'
    + '<button class="nb-picker-cancel" onclick="nbCancelStepLink()">취소</button>'
    + '</div>';
  var col = document.getElementById('nbcol-step');
  if (col) col.appendChild(picker);
  else document.body.appendChild(picker);
  setTimeout(function(){ var si=document.getElementById('nb-picker-search'); if(si) si.focus(); }, 30);
}

function nbAssignStep(taskId) {
  var p = _nbPending; _nbPending = null;
  removeStepPickers();
  if (!p) return;
  nbAddStepToTask(taskId, p.text, p.dueDate, p.dueTime);
  if (p.mode === 'memo') {
    nbRemoveNote(p.sourceId);
    renderNoteBoard();
  } else if (p.mode === 'task') {
    if (typeof deleteTask === 'function') deleteTask(p.sourceId); // 전체 재렌더
    else renderNoteBoard();
  } else {
    renderNoteBoard();
  }
  showNbToast('📋 TO DO로 연결됐어요');
}

function nbCancelStepLink() {
  _nbPending = null;
  removeStepPickers();
}

function removeStepPickers() {
  document.querySelectorAll('.nb-step-picker').forEach(function(el){ el.remove(); });
}

// ============================================
//  토스트
// ============================================
function showNbToast(msg) {
  var old = document.getElementById('nb-toast');
  if (old) old.remove();
  var toast = document.createElement('div');
  toast.id = 'nb-toast';
  toast.className = 'nb-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(function(){ toast.classList.add('show'); });
  setTimeout(function(){ toast.classList.remove('show'); setTimeout(function(){ toast.remove(); }, 300); }, 2200);
}

// ============================================
//  홈 위젯용
// ============================================
function renderHomeNotesWidget() {
  loadNotes();
  var el = document.getElementById('hw-notes-inner');
  if (!el) return;
  var recent = getArchivingNotes().slice(0, 4);
  var html = '<div class="hw-notes-write">'
    + '<input type="text" class="hw-notes-input" id="hw-notes-inp" placeholder="빠른 메모..."'
    + ' onkeydown="if(event.key===\'Enter\'){ hwQuickNote();}">'
    + '<button class="hw-notes-add" onclick="hwQuickNote()">+</button>'
    + '</div>'
    + (recent.length === 0 ? '<div class="hw-empty">메모가 없어요!</div>' : '')
    + recent.map(function(n){
        return '<div class="hw-note-item"><span class="hw-note-text">'+escNb(n.text)+'</span></div>';
      }).join('');
  el.innerHTML = html;
}

function hwQuickNote() {
  var inp = document.getElementById('hw-notes-inp');
  if (!inp || !inp.value.trim()) return;
  loadNotes();
  createNote(inp.value);
  inp.value = '';
  renderHomeNotesWidget();
}
