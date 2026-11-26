// ============================================================
//  🧭 PC 레이아웃 — Gmail 형 (2026-11-26, 사용자 요청)
// ------------------------------------------------------------
//  · 왼쪽 레일: 평소 아이콘만, 마우스를 올리면 펼쳐져 이름이 보인다.
//    Home · Life Log(MVV · LW · M · HT) · Task Log(Calendar · Web · WD · WBS).
//    펼침은 CSS(:hover · :focus-within) 만으로 한다 — theme.css 'PC 레이아웃 — Gmail 형'.
//    묶음은 script.js MENU_GROUPS · initSidebar 가 그린다.
//  · 위쪽 막대(#tl-appbar): TASK LOG · 전체 검색 · 설정 · 로그인 정보
//  · 본문 3분할(.tl-panes): 기본 화면 | Task 창(#right-panel) | To Do 창(#todo-pane)
//    새 창은 오른쪽에 붙는다(사용자 결정). Task 창의 To Do 줄을 누르면 To Do 창이 열린다.
//  폰(768px 이하)은 예전 화면 그대로다 — 막대는 숨고, To Do 창은 전체 화면으로 덮는다.
//  index.html 에서 script.js 다음, pwa.js 앞에 로드한다.
// ============================================================

function tlEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tlCleanTitle(t) { return String(t || '').replace(/^\[\d{6}\]\s?/, ''); }
function tlTasks() { try { return Array.isArray(tasks) ? tasks : []; } catch (e) { return []; } }
function tlPanelOpen(id) {
  var el = document.getElementById(id);
  return !!(el && el.classList.contains('open'));
}

// 열린 Task 창에 저장 안 한 변경이 있으면 묻는다. 계속해도 되면 true
function tlCanLeavePanel() {
  if (!tlPanelOpen('right-panel') || typeof rpState === 'undefined' || !rpState.dirty) return true;
  if (!confirm('저장하지 않은 변경사항이 있습니다. 닫겠습니까?')) return false;
  rpState.dirty = false;
  return true;
}
// Task 창 열기 (검색 결과 등)
function tlOpenTask(taskId) {
  if (!tlCanLeavePanel()) return;
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
}
// To Do 를 연다 = 그 Task 창 + 그 오른쪽 To Do 창.
//  이미 그 Task 가 열려 있으면 Task 창을 다시 만들지 않는다 — 적던 것이 지워지지 않게.
function tlOpenStep(taskId, stepId) {
  if (tlPanelOpen('right-panel') && typeof rpState !== 'undefined' && rpState.taskId === taskId) {
    tdOpen(stepId);
    return;
  }
  if (!tlCanLeavePanel()) return;
  if (typeof openDetailPanel === 'function') openDetailPanel(taskId);
  tdOpen(stepId);
}

// ============================================================
//  ✅ To Do 창 (#todo-pane)
//  Task 창이 들고 있는 rpState.steps 사본의 그 줄을 고친다. 저장은 Task 와 함께
//  (이 창의 '저장' = Task 창의 '저장'). Task 창이 닫히면 이 창도 닫힌다.
// ============================================================
var _td = null;          // { stepId } — 열려 있는 To Do
var _tdQuiet = false;    // 이 창에서 고친 값을 반영할 때는 이 창을 다시 그리지 않는다(입력칸·커서 유지)

function tdStep() {
  if (!_td || typeof rpState === 'undefined' || !Array.isArray(rpState.steps)) return null;
  return rpState.steps.find(function (s) { return s.id === _td.stepId; }) || null;
}
// Task 창의 To Do 목록만 다시 그린다 (어느 줄이 열려 있는지 칠한 것도 함께)
function tdPaintRows() {
  var list = document.getElementById('rp-steps-list');
  if (list && typeof rpBuildStepsHtml === 'function') list.innerHTML = rpBuildStepsHtml();
}

function tdOpen(stepId) {
  if (!tlPanelOpen('right-panel')) return;
  if (!(rpState.steps || []).some(function (s) { return s.id === stepId; })) return;
  _td = { stepId: stepId };
  var pane = document.getElementById('todo-pane');
  if (!pane) return;
  tdRender();
  pane.classList.add('open');
  pane.setAttribute('aria-hidden', 'false');
  tdPaintRows();
  setTimeout(tdFitName, 320);   // transitionend 가 오지 않는 환경(애니메이션 끔 등) 대비
  // 폰·태블릿은 글자판이 화면을 덮으므로 저절로 포커스하지 않는다
  var touch = (typeof tlTouchKeyboard === 'function') && tlTouchKeyboard();
  if (!touch) setTimeout(function () { var n = document.getElementById('td-name'); if (n) n.focus(); }, 60);
}

function tdClose(quiet) {
  var pane = document.getElementById('todo-pane');
  var wasOpen = !!_td || (pane && pane.classList.contains('open'));
  _td = null;
  if (pane) { pane.classList.remove('open'); pane.setAttribute('aria-hidden', 'true'); }
  if (wasOpen && !quiet) tdPaintRows();
}

function tdRefresh() {
  if (!_td || _tdQuiet) return;
  if (!tdStep()) { tdClose(true); return; }   // 줄이 지워졌다
  tdRender();
}

function tdSlotRowHtml(sl) {
  var a = slotDate(sl.start), b = slotDate(sl.end);
  var d = a ? toDateInputVal(a) : '', ts = a ? toTimeInputVal(a) : '', te = b ? toTimeInputVal(b) : '';
  var next = (a && b && toDateInputVal(b) !== d) ? '<span class="rp-slot-next" title="다음 날 끝남">+1</span>' : '';
  var id = 'td-sl-' + sl.id;
  return '<div class="rp-slot" data-slot="' + sl.id + '">'
    + '<input class="field-input rp-dtinput rp-slot-d" id="' + id + '-d" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" value="' + d + '"'
    +   ' oninput="rpDtInput(this)" onchange="tdSlotEdit(' + sl.id + ')" onfocus="try{this.select()}catch(e){}">'
    + '<input class="field-input rp-dtinput rp-tminput rp-slot-s" id="' + id + '-s" inputmode="numeric" placeholder="시작" value="' + ts + '"'
    +   ' oninput="rpTmMask(this)" onblur="rpTmBlur(this)" onchange="tdSlotEdit(' + sl.id + ')" onfocus="try{this.select()}catch(e){}">'
    + '<span class="rp-slot-sep">~</span>'
    + '<input class="field-input rp-dtinput rp-tminput rp-slot-e" id="' + id + '-e" inputmode="numeric" placeholder="끝" value="' + te + '"'
    +   ' oninput="rpTmMask(this)" onblur="rpTmBlur(this)" onchange="tdSlotEdit(' + sl.id + ')" onfocus="try{this.select()}catch(e){}">'
    + next
    + '<button type="button" class="rp-slot-del" onclick="tdSlotDelete(' + sl.id + ')" title="이 수행 시간 지우기">✕</button>'
    + '</div>';
}

function tdRender() {
  var body = document.getElementById('td-body');
  var s = tdStep();
  if (!body || !s) return;

  // 다시 그려도 쓰던 칸과 커서는 그대로
  var ae = document.activeElement, keepId = (ae && ae.id && body.contains(ae)) ? ae.id : null, ss = null, se = null;
  if (keepId) { try { ss = ae.selectionStart; se = ae.selectionEnd; } catch (e) {} }

  var done = !!s.completed;
  var name = done ? (s.text || '') : tlCleanTitle(s.text);
  var taskName = ((document.getElementById('rp-task-name') || {}).value || '').trim() || '(이름 없는 Task)';
  var dueD = s.dueDateTime ? toDateInputVal(s.dueDateTime) : '';
  var dueT = (s.dueDateTime && s.hasTime) ? toTimeInputVal(s.dueDateTime) : '';
  var slots = stepSlots(s).slice().sort(function (x, y) { return String(x.start).localeCompare(String(y.start)); });
  var min = stepSlotMin(s);
  var doneAt = done ? (doneFullTip(s) || '') : '';
  var linked = null;
  if (s.linkedTaskId) linked = tlTasks().find(function (t) { return t.id === s.linkedTaskId; }) || null;

  body.innerHTML =
    '<div class="td-parent">'
    +   '<span class="td-parent-label">상위 Task</span>'
    +   '<button type="button" class="td-parent-name" onclick="tdFocusTask()" title="Task 창으로">' + tlEsc(tlCleanTitle(taskName)) + '</button>'
    + '</div>'
    + '<div class="field-group">'
    +   '<label class="field-label" for="td-name">To Do</label>'
    +   '<div class="rp-task-row td-name-row">'
    +     '<div class="task-check td-check' + (done ? ' is-done' : '') + '" role="checkbox" aria-checked="' + done + '" tabindex="0"'
    +       ' onclick="tdToggle()" onkeydown="if(event.key===\' \'||event.key===\'Enter\'){event.preventDefault();tdToggle();}" title="완료 여부"></div>'
    +     '<textarea class="field-input td-name" id="td-name" rows="1" spellcheck="false"'
    +       ' onkeydown="if(event.key===\'Enter\'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();this.blur();}"'
    +       ' oninput="rpState.dirty=true;tdFitName()" onchange="tdSaveName(this)">' + tlEsc(name) + '</textarea>'
    +   '</div>'
    +   (done ? '<div class="td-hint">완료 ' + tlEsc(doneAt) + ' · 이름 앞 [YYMMDD] 를 고치면 완료일이 바뀝니다</div>' : '')
    + '</div>'
    + '<div class="field-group">'
    +   '<label class="field-label" for="td-due-d">마감일</label>'
    +   '<div class="rp-dt-pair">'
    +     '<input type="text" class="field-input rp-dtinput" id="td-due-d" inputmode="numeric" placeholder="YYYY-MM-DD" value="' + dueD + '"'
    +       ' oninput="rpDtInput(this)" onchange="tdSaveDue()" onfocus="try{this.select()}catch(e){}">'
    +     '<input type="text" class="field-input rp-dtinput rp-tminput" id="td-due-t" inputmode="numeric" placeholder="시간" aria-label="마감 시간 (비우면 날짜만)" value="' + dueT + '"'
    +       ' oninput="rpTmMask(this);rpState.dirty=true" onblur="rpTmBlur(this)" onchange="tdSaveDue()" onfocus="try{this.select()}catch(e){}">'
    +   '</div>'
    + '</div>'
    + '<div class="field-group">'
    +   '<div class="td-slot-head"><span class="field-label">수행 시간</span><span class="td-slot-sum" id="td-slot-sum">' + (min ? '합계 ' + fmtWorkMin(min) : '') + '</span></div>'
    +   '<div class="rp-slot-form td-slots" id="td-slots">'
    +     (slots.length ? slots.map(tdSlotRowHtml).join('') : '<div class="rp-slot-empty">아직 적은 수행 시간이 없습니다</div>')
    +     '<div class="rp-slot-foot"><button type="button" class="rp-slot-add" onclick="tdSlotAdd()">+ 수행 시간</button></div>'
    +   '</div>'
    + '</div>'
    + (linked ? '<div class="field-group"><span class="field-label">연계 Task</span><div class="td-linked">🔗 ' + tlEsc(tlCleanTitle(linked.text)) + '</div></div>' : '')
    + '<div class="rp-edit-footer">'
    +   '<span class="rp-created">저장은 Task 와 함께 됩니다</span>'
    +   '<button type="button" class="rp-delete-btn" onclick="tdDelete()" title="이 To Do 지우기">🗑️ 삭제</button>'
    + '</div>';

  tdFitName();
  if (keepId) {
    var el = document.getElementById(keepId);
    if (el) { el.focus(); try { if (ss != null) el.setSelectionRange(ss, se); } catch (e) {} }
  }
}

// 이름 칸 높이를 글에 맞춘다. 창이 열리는 동안(폭이 0 → 300px)에 재면 글이 한 자씩 접혀
//  칸이 지나치게 커지므로, 창 폭이 다 늘어난 뒤(transitionend)에도 한 번 더 잰다.
function tdFitName() {
  var ta = document.getElementById('td-name');
  if (ta && ta.offsetWidth > 120 && typeof tlAutosize === 'function') tlAutosize(ta, 160);
}
(function () {
  function hook() {
    var pane = document.getElementById('todo-pane');
    if (pane) pane.addEventListener('transitionend', function (e) { if (e.target === pane && e.propertyName === 'width') tdFitName(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();

function tdFocusTask() {
  var n = document.getElementById('rp-task-name');
  if (n) { n.focus(); try { n.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
}

function tdToggle() {
  if (!_td || typeof rpToggleStep !== 'function') return;
  rpToggleStep(_td.stepId);   // rpRefreshSteps → tdRefresh 가 이 창도 다시 그린다
}

// 이름: Task 창 줄과 같은 규칙(완료면 앞의 [YYMMDD] 로 완료일을 고친다)
function tdSaveName(el) {
  var s = tdStep();
  if (!s || typeof rpSaveStepText !== 'function') return;
  _tdQuiet = true;
  try { rpSaveStepText(s.id, { textContent: String(el.value || '').replace(/\s*\n+\s*/g, ' ') }); }
  finally { _tdQuiet = false; }
}

function tdSaveDue() {
  var s = tdStep();
  if (!s) return;
  var dEl = document.getElementById('td-due-d'), tEl = document.getElementById('td-due-t');
  var dv = (dEl && dEl.value || '').trim();
  var tv = tEl ? rpTmParse(tEl.value) : null;
  if (!dv) {
    s.dueDateTime = null; s.hasTime = false;
  } else {
    var ok = /^\d{4}-\d{2}-\d{2}$/.test(dv) && !isNaN(new Date(dv + 'T00:00:00').getTime());
    if (dEl) dEl.style.outline = ok ? '' : '2px solid var(--danger)';
    if (!ok) return;
    s.dueDateTime = dv + 'T' + (tv || '09:00') + ':00';
    s.hasTime = !!tv;
  }
  rpState.dirty = true;
  _tdQuiet = true;
  try { if (typeof rpRefreshSteps === 'function') rpRefreshSteps(); } finally { _tdQuiet = false; }
}

// 새 줄: 오늘, 지금을 30분 단위로 내린 시각부터 1시간 (Task 창 rpSlotAdd 와 같다)
function tdSlotAdd() {
  var s = tdStep();
  if (!s) return;
  var a = new Date(); a.setMinutes(a.getMinutes() < 30 ? 0 : 30, 0, 0);
  var b = new Date(a.getTime() + 3600000);
  if (!Array.isArray(s.slots)) s.slots = [];
  s.slots.push({ id: newSlotId(), start: slotLocal(a), end: slotLocal(b) });
  rpState.dirty = true;
  rpRefreshSteps();
}
function tdSlotDelete(slotId) {
  if (_td && typeof rpSlotDelete === 'function') rpSlotDelete(_td.stepId, slotId);
}
// 칸을 고치면 바로 그 줄에 쓴다. 잘못 적었으면 빨갛게만 두고 예전 값을 지킨다 (rpSlotEdit 와 같은 규칙)
function tdSlotEdit(slotId) {
  var s = tdStep();
  var sl = s && stepSlots(s).find(function (x) { return x.id === slotId; });
  var p = 'td-sl-' + slotId;
  var dEl = document.getElementById(p + '-d'), sEl = document.getElementById(p + '-s'), eEl = document.getElementById(p + '-e');
  if (!sl || !dEl || !sEl || !eEl) return;
  var dv = dEl.value.trim(), sv = rpTmParse(sEl.value), ev = rpTmParse(eEl.value);
  var okD = /^\d{4}-\d{2}-\d{2}$/.test(dv) && !isNaN(new Date(dv + 'T00:00:00').getTime());
  dEl.style.outline = okD ? '' : '2px solid var(--danger)';
  sEl.style.outline = sv ? '' : '2px solid var(--danger)';
  eEl.style.outline = (ev && ev !== sv) ? '' : '2px solid var(--danger)';
  if (!okD || !sv || !ev || ev === sv) return;
  var a = slotDate(dv + 'T' + sv), b = slotDate(dv + 'T' + ev);
  if (b <= a) b = new Date(b.getTime() + 86400000);
  sl.start = slotLocal(a);
  sl.end = slotLocal(b);
  rpState.dirty = true;
  _tdQuiet = true;
  try { rpRefreshSteps(); } finally { _tdQuiet = false; }
  var sum = document.getElementById('td-slot-sum');
  if (sum) { var m = stepSlotMin(s); sum.textContent = m ? '합계 ' + fmtWorkMin(m) : ''; }
}

function tdDelete() {
  if (!_td || typeof rpDeleteStep !== 'function') return;
  var id = _td.stepId;
  tdClose(true);
  rpDeleteStep(id);   // Task 창 목록에서 빠진다 — 저장해야 반영된다
}

// Task 창 이름을 고치면 To Do 창의 '상위 Task' 도 따라간다
document.addEventListener('input', function (e) {
  if (!_td || !e.target || e.target.id !== 'rp-task-name') return;
  var b = document.querySelector('#todo-pane .td-parent-name');
  if (b) b.textContent = tlCleanTitle(e.target.value.trim()) || '(이름 없는 Task)';
});

// Task 창이 닫히면(저장 · 취소 · 삭제 · 메뉴 이동 — 닫는 길이 여러 곳이다) To Do 창도 닫는다
(function watchTaskPane() {
  function hook() {
    var rp = document.getElementById('right-panel');
    if (!rp || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      if (!rp.classList.contains('open') && _td) tdClose(true);
    }).observe(rp, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();

// ============================================================
//  🔍 전체 검색 (위쪽 막대)
//  Task · To Do · 메모를 찾는다. 띄어 쓴 낱말은 모두 들어 있어야 맞다.
//  Task 는 제목 · 메모 · 장소, To Do 는 제목 · 상위 Task 제목, 메모는 글.
//  누르면 Task → Task 창, To Do → Task 창 + To Do 창, 메모 → Web 에서 그 메모를 고치는 칸.
// ============================================================
var TLS_MAX = 8;   // 묶음마다 보여 줄 줄 수
var _tls = { q: '', flat: [], sel: 0, open: false };

function tlsWords(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
function tlsHit(words, hay) {
  hay = String(hay || '').toLowerCase();
  for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
  return true;
}
function tlsMark(text, words) {
  var s = String(text || '');
  if (!words.length) return tlEsc(s);
  var low = s.toLowerCase(), marks = [];
  words.forEach(function (w) {
    var i = 0;
    while (w && (i = low.indexOf(w, i)) >= 0) { marks.push([i, i + w.length]); i += w.length; }
  });
  if (!marks.length) return tlEsc(s);
  marks.sort(function (a, b) { return a[0] - b[0]; });
  var out = '', pos = 0;
  marks.forEach(function (m) {
    if (m[0] < pos) { if (m[1] > pos) { out += '<mark>' + tlEsc(s.slice(pos, m[1])) + '</mark>'; pos = m[1]; } return; }
    out += tlEsc(s.slice(pos, m[0])) + '<mark>' + tlEsc(s.slice(m[0], m[1])) + '</mark>';
    pos = m[1];
  });
  return out + tlEsc(s.slice(pos));
}
function tlsDay(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var now = new Date();
  return (d.getFullYear() !== now.getFullYear() ? String(d.getFullYear()).slice(2) + '.' : '') + (d.getMonth() + 1) + '/' + d.getDate();
}
function tlsProj(t) {
  if (t.mdtAction && t.mdtAction.text) return t.mdtAction.text;
  if (t.mdtGoal && t.mdtGoal.text) return t.mdtGoal.text;
  return t.lwSectionName || '';
}

function tlsCollect(q) {
  var words = tlsWords(q);
  var res = { task: [], step: [], memo: [] };
  if (!words.length) return res;
  tlTasks().forEach(function (t) {
    var title = tlCleanTitle(t.text);
    if (tlsHit(words, title + '\n' + (t.notes || '') + '\n' + (t.location || ''))) {
      res.task.push({ kind: 'task', id: t.id, title: title, sub: tlsProj(t), done: !!t.completed,
        when: t.dueDateTime || t.startDate || t.createdAt || '' });
    }
    (t.steps || []).forEach(function (s) {
      var st = tlCleanTitle(s.text);
      if (tlsHit(words, st + '\n' + title)) {
        res.step.push({ kind: 'step', taskId: t.id, id: s.id, title: st, sub: '↳ ' + title, done: !!s.completed,
          when: s.dueDateTime || s.completedAt || '' });   // 상위 Task 날짜는 쓰지 않는다 — To Do 날짜로 읽힌다
      }
    });
  });
  var memos = [];
  try { memos = (typeof getArchivingNotes === 'function') ? getArchivingNotes() : []; } catch (e) {}
  memos.forEach(function (n) {
    if (tlsHit(words, n.text)) {
      var one = String(n.text || '').replace(/\s*\n+\s*/g, ' ');
      res.memo.push({ kind: 'memo', id: n.id, title: one, sub: '', done: false, when: n.dueDate || n.createdAt || '' });
    }
  });
  // 끝나지 않은 것 먼저, 그 안에서는 날짜가 최근인 것 먼저
  function cmp(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return String(b.when).localeCompare(String(a.when));
  }
  res.task.sort(cmp); res.step.sort(cmp); res.memo.sort(cmp);
  return res;
}

function tlsRender() {
  var pop = document.getElementById('tl-search-pop');
  if (!pop) return;
  var q = _tls.q.trim();
  if (!q) { tlsClose(); return; }
  var words = tlsWords(q);
  var res = tlsCollect(q);
  var groups = [['task', 'Task'], ['step', 'To Do'], ['memo', '메모']];
  var flat = [], html = '';
  groups.forEach(function (g) {
    var list = res[g[0]];
    if (!list.length) return;
    html += '<div class="tls-group"><div class="tls-group-head">' + g[1] + '<span>' + list.length + '</span></div>';
    list.slice(0, TLS_MAX).forEach(function (it) {
      var i = flat.length;
      flat.push(it);
      html += '<button type="button" class="tls-item' + (i === _tls.sel ? ' is-sel' : '') + (it.done ? ' is-done' : '') + '" data-i="' + i + '"'
        + ' onmousedown="event.preventDefault()" onclick="tlsPick(' + i + ')" onmousemove="tlsHover(' + i + ')">'
        + '<span class="tls-mark tls-mark-' + it.kind + '" aria-hidden="true">' + (it.done ? '✓' : '') + '</span>'
        + '<span class="tls-main"><span class="tls-title">' + tlsMark(it.title, words) + '</span>'
        + (it.sub ? '<span class="tls-sub">' + tlsMark(it.sub, words) + '</span>' : '') + '</span>'
        + '<span class="tls-when">' + tlsDay(it.when) + '</span>'
        + '</button>';
    });
    if (list.length > TLS_MAX) html += '<div class="tls-more">' + (list.length - TLS_MAX) + '건 더 — 낱말을 더 적어 좁혀 주세요</div>';
    html += '</div>';
  });
  if (!flat.length) html = '<div class="tls-empty">\'' + tlEsc(q) + '\' 에 맞는 Task · To Do · 메모가 없습니다</div>';
  _tls.flat = flat;
  if (_tls.sel >= flat.length) _tls.sel = 0;
  pop.innerHTML = html;
  pop.hidden = false;
  _tls.open = true;
  var box = document.getElementById('tl-search');
  if (box) box.classList.add('is-open');
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.setAttribute('aria-expanded', 'true');
}

function tlsClose() {
  var pop = document.getElementById('tl-search-pop');
  if (pop) { pop.hidden = true; pop.innerHTML = ''; }
  _tls.open = false;
  var box = document.getElementById('tl-search');
  if (box) box.classList.remove('is-open');
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.setAttribute('aria-expanded', 'false');
}

function tlsInput(el) {
  _tls.q = el.value;
  _tls.sel = 0;
  var clr = document.getElementById('tl-search-clear');
  if (clr) clr.hidden = !el.value;
  tlsRender();
}
function tlsClear() {
  var inp = document.getElementById('tl-search-input');
  if (inp) { inp.value = ''; inp.focus(); tlsInput(inp); }
}
function tlsHover(i) {
  if (i === _tls.sel) return;
  _tls.sel = i;
  document.querySelectorAll('#tl-search-pop .tls-item').forEach(function (b) {
    b.classList.toggle('is-sel', +b.dataset.i === i);
  });
}
function tlsMove(d) {
  if (!_tls.flat.length) return;
  _tls.sel = (_tls.sel + d + _tls.flat.length) % _tls.flat.length;
  tlsHover(_tls.sel);
  var el = document.querySelector('#tl-search-pop .tls-item[data-i="' + _tls.sel + '"]');
  if (el) try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
}
function tlsKey(e) {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!_tls.open) tlsRender(); else tlsMove(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); tlsMove(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); if (_tls.flat.length) tlsPick(_tls.sel); }
  else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (_tls.open) tlsClose(); else e.target.blur();
  }
}

function tlsPick(i) {
  var it = _tls.flat[i];
  if (!it) return;
  tlsClose();
  var inp = document.getElementById('tl-search-input');
  if (inp) inp.blur();
  if (it.kind === 'task') { tlOpenTask(it.id); return; }
  if (it.kind === 'step') { tlOpenStep(it.taskId, it.id); return; }
  if (it.kind === 'memo') {
    if (!tlCanLeavePanel()) return;
    if (typeof navToMenu === 'function' && typeof currentMenu !== 'undefined' && currentMenu !== 'cloud') navToMenu('cloud');
    // Web 화면은 그린 뒤 50ms 에 위쪽 입력칸에 포커스한다 — 그다음에 메모를 연다
    setTimeout(function () {
      if (typeof memoEditOpen === 'function') memoEditOpen(it.id);
      var card = document.querySelector('.nb-card-memo[data-note-id="' + it.id + '"]');
      if (card) try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 120);
  }
}

// 바깥을 누르면 검색 창을 닫는다
document.addEventListener('mousedown', function (e) {
  if (!_tls.open) return;
  var box = document.getElementById('tl-search');
  if (box && !box.contains(e.target)) tlsClose();
});

// Esc: 검색 창 → To Do 창 순으로 먼저 닫는다 (script.js 의 Esc 는 Task 창을 닫는다)
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape' || e.isComposing) return;
  if (_tls.open) { tlsClose(); e.stopPropagation(); return; }
  if (!_td) return;
  var t = e.target;
  var mine = !t || t === document.body || t === document.documentElement || (t.closest && t.closest('#todo-pane'));
  if (mine) { e.stopPropagation(); tdClose(); }
}, true);

// 위쪽 막대 로그인 정보 — auth.js updateAuthUI 가 부른다
function tlPaintAppbarAccount(user, displayName) {
  var av = document.getElementById('appbar-avatar');
  var nm = document.getElementById('appbar-name');
  var btn = document.getElementById('tl-account');
  if (av) {
    if (user && user.picture) {
      av.innerHTML = '<img src="' + tlEsc(user.picture) + '" alt="" referrerpolicy="no-referrer">';
    } else {
      av.textContent = user ? String(displayName || '?').charAt(0).toUpperCase() : '?';
    }
  }
  if (nm) nm.textContent = user ? (displayName || '') : '로그인';
  if (btn) btn.title = user ? ((displayName || '') + (user.email ? ' · ' + user.email : '')) : '로그인';
}
