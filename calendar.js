// ============================================
//  📅 구글 캘린더 연동
// ============================================

// 로그인 상태인지 확인하는 도우미 함수
function isSignedIn() {
  const token = gapi.client.getToken();
  return token !== null;
}

// Task → 구글 캘린더 이벤트 형식 변환 (수동/자동 등록 공용)
function _buildCalEventFromTask(task) {
  const startDateTime = new Date(task.dueDateTime);

  if (task.hasTime) {
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(endDateTime.getHours() + 1);
    return {
      summary: task.text,
      description: 'My TaskLog에서 추가한 일정 📝',
      start: { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end:   { dateTime: endDateTime.toISOString(),   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
  }
  // 종일 일정 (로컬 날짜 기준 YYYY-MM-DD)
  const dateStr = startDateTime.getFullYear() + '-'
    + String(startDateTime.getMonth() + 1).padStart(2, '0') + '-'
    + String(startDateTime.getDate()).padStart(2, '0');
  return {
    summary: task.text,
    description: 'My TaskLog에서 추가한 일정 📝',
    start: { date: dateStr },
    end:   { date: dateStr },
  };
}


// ============================================
//  📁 'Tasks' 캘린더 찾기/사용 (TaskLog 일정 저장 대상)
// --------------------------------------------
//  사용자가 만들어 둔 'Tasks' 캘린더에 저장한다.
//  못 찾으면 생성 시도(전체 calendar 권한 필요) → 권한 없으면 기본 캘린더로 대체.
// ============================================
const TASK_CAL_NAME = 'Tasks';
let taskCalendarId = null;          // 한 번 찾으면 캐시

async function resolveTaskCalendarId() {
  if (taskCalendarId) return taskCalendarId;
  try {
    const list = await gapi.client.calendar.calendarList.list({ maxResults: 250 });
    const items = (list.result && list.result.items) ? list.result.items : [];
    const match = items.find(c => (c.summary || '').trim().toLowerCase() === TASK_CAL_NAME.toLowerCase());
    if (match) {
      taskCalendarId = match.id;
      console.log("📁 'Tasks' 캘린더 사용:", match.id);
      return taskCalendarId;
    }
    // 'Tasks' 캘린더가 없으면 생성 시도 (전체 calendar 권한 필요)
    try {
      const created = await gapi.client.calendar.calendars.insert({ resource: { summary: TASK_CAL_NAME } });
      taskCalendarId = created.result.id;
      console.log("📁 'Tasks' 캘린더 생성:", taskCalendarId);
      return taskCalendarId;
    } catch (e2) {
      console.warn("'Tasks' 캘린더 생성 권한이 없어 기본 캘린더(primary)로 저장해요.", e2);
      taskCalendarId = 'primary';
      return taskCalendarId;
    }
  } catch (e) {
    console.warn('캘린더 목록을 불러오지 못해 기본 캘린더(primary)로 저장해요.', e);
    return 'primary';   // 캐시하지 않음 → 다음에 재시도
  }
}

// ─── 중복 저장 방지용 키 유틸 ───────────────────
function _pad2(n) { return String(n).padStart(2, '0'); }
function _taskStartKey(task) {
  const d = new Date(task.dueDateTime);
  const ymd = d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate());
  return task.hasTime ? (ymd + '|' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes())) : (ymd + '|allday');
}
function _eventStartKey(start) {
  if (!start) return '';
  if (start.date) return start.date + '|allday';
  const d = new Date(start.dateTime);
  return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate()) + '|' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
}
function _dedupKey(text, startKey) { return (text || '').trim() + '||' + startKey; }

// 'Tasks' 캘린더의 기존 이벤트 (내용+시작시각) → eventId 맵. 같은 내용 중복 생성 방지용.
async function _listTaskCalendarKeys(calId) {
  const map = new Map();
  try {
    const timeMin = new Date(); timeMin.setDate(timeMin.getDate() - 365);
    const timeMax = new Date(); timeMax.setDate(timeMax.getDate() + 365);
    const resp = await gapi.client.calendar.events.list({
      calendarId: calId, timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
      showDeleted: false, singleEvents: true, maxResults: 2500,
    });
    const items = (resp.result && resp.result.items) ? resp.result.items : [];
    items.forEach(ev => {
      if (!ev.summary || !ev.start) return;
      const key = _dedupKey(ev.summary, _eventStartKey(ev.start));
      if (!map.has(key)) map.set(key, ev.id);
    });
  } catch (e) { console.warn('중복 검사용 캘린더 조회 실패(검사 생략):', e); }
  return map;
}


// ============================================
//  📤 할 일을 구글 캘린더에 추가
// ============================================

async function addTaskToCalendar(taskId) {
  // 1. 로그인 확인
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  
  // 2. 해당 할 일 찾기
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    console.error('할 일을 찾을 수 없어요:', taskId);
    return;
  }
  
  // 3. 마감일이 있는지 확인
  if (!task.dueDateTime) {
    alert('날짜가 있는 할 일만 캘린더에 추가할 수 있어요! 📅');
    return;
  }
  
  // 4. 캘린더 이벤트 형식으로 변환
  const event = _buildCalEventFromTask(task);

  // 5. 구글 캘린더 API 호출!
  try {
    console.log('📤 캘린더에 일정 추가 중...', event);

    const calId = await resolveTaskCalendarId();

    // 같은 내용의 일정이 'Tasks' 캘린더에 이미 있으면 → 중복 생성하지 않고 연결만
    const existing = await _listTaskCalendarKeys(calId);
    const dkey = _dedupKey(task.text, _taskStartKey(task));
    if (existing.has(dkey)) {
      task.calendarEventId = existing.get(dkey);
      saveTasks();
      renderTasks();
      alert(`"${task.text}"은(는) 이미 'Tasks' 캘린더에 있어요. (중복 저장 안 함) 📅`);
      return;
    }

    const response = await gapi.client.calendar.events.insert({
      calendarId: calId,
      resource: event,
    });

    console.log('✅ 캘린더 추가 성공!', response);
    
    // 6. 할 일에 "캘린더 등록됨" 표시 저장
    task.calendarEventId = response.result.id;
    saveTasks();
    renderTasks();
    
    alert(`"${task.text}"이(가) 구글 캘린더에 추가됐어요! 📅✨`);
    
  } catch (error) {
    console.error('❌ 캘린더 추가 실패:', error);
    alert('캘린더 추가에 실패했어요. 콘솔(F12)을 확인해주세요.');
  }
}


// ============================================
//  🗑️ 캘린더에서 일정 삭제
// ============================================

async function removeTaskFromCalendar(taskId) {
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.calendarEventId) {
    console.error('캘린더에 등록되지 않은 할 일이에요.');
    return;
  }
  
  try {
    console.log('🗑️ 캘린더에서 일정 삭제 중...');

    const calId = await resolveTaskCalendarId();
    await gapi.client.calendar.events.delete({
      calendarId: calId,
      eventId: task.calendarEventId,
    });
    
    console.log('✅ 캘린더 삭제 성공!');
    
    // 등록 표시 제거
    delete task.calendarEventId;
    saveTasks();
    renderTasks();
    
    alert(`"${task.text}"이(가) 캘린더에서 제거됐어요.`);
    
  } catch (error) {
    console.error('❌ 캘린더 삭제 실패:', error);
    // 이미 캘린더에서 수동 삭제된 경우 등을 대비
    delete task.calendarEventId;
    saveTasks();
    renderTasks();
  }
}// ============================================
//  📥 구글 캘린더에서 일정 가져오기
// ============================================

let calendarEvents = [];  // 캘린더에서 가져온 일정 보관

// silent=true 이면 알림창 없이 조용히 동작 (자동 동기화용)
async function fetchCalendarEvents(silent) {
  if (!isSignedIn()) {
    if (!silent) alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }

  try {
    console.log('📥 캘린더 일정 가져오는 중...');

    // 지난 30일 ~ 앞으로 90일 범위의 일정 가져오기 (위젯에서 이전/다음 달 탐색 대응)
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);

    const response = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      showDeleted: false,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = response.result.items;
    console.log(`✅ ${events.length}개의 일정을 가져왔어요!`, events);

    // 우리 앱 형식으로 변환
    calendarEvents = events.map(event => {
      // 종일 일정은 event.start.date, 시간 일정은 event.start.dateTime
      const start = event.start.dateTime || event.start.date;
      const hasTime = !!event.start.dateTime;

      return {
        id: 'gcal-' + event.id,        // 구글 캘린더 일정임을 표시
        text: event.summary || '(제목 없음)',
        dueDateTime: start,
        hasTime: hasTime,
        isFromCalendar: true,          // 캘린더에서 온 일정 표시
        calendarEventId: event.id,
        completed: false,
        starred: false,
      };
    });

    // 화면 갱신 (목록 + 홈 캘린더 위젯)
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderHomeCalendar === 'function') renderHomeCalendar();

    // 수동 동기화일 때만 안내 (자동 동기화는 조용히)
    if (!silent && currentCategory !== 'planned') {
      alert(`📆 ${calendarEvents.length}개의 캘린더 일정을 가져왔어요!`);
    }

  } catch (error) {
    console.error('❌ 캘린더 일정 가져오기 실패:', error);
    if (!silent) alert('캘린더 일정을 가져오지 못했어요. 콘솔(F12)을 확인해주세요.');
  }
}


// ============================================
//  🔁 자동 양방향 동기화 (접속/새로고침 시 1회)
// ============================================

// 마감일이 있지만 아직 'Tasks' 캘린더에 없는 Task를 자동 등록
async function autoPushTasksToCalendar() {
  if (!isSignedIn() || typeof tasks === 'undefined') return 0;

  const calId = await resolveTaskCalendarId();
  // 중복 방지: 'Tasks' 캘린더의 기존 이벤트를 한 번만 조회해 (내용+시각) 맵 구성
  const existing = await _listTaskCalendarKeys(calId);

  let pushed = 0, linked = 0;
  for (const task of tasks) {
    if (task.completed) continue;          // 완료된 항목 제외
    if (!task.dueDateTime) continue;       // 날짜 없는 항목 제외
    if (task.calendarEventId) continue;    // 이미 등록 표시가 있으면 제외 (1차 중복 방지)

    const dkey = _dedupKey(task.text, _taskStartKey(task));
    if (existing.has(dkey)) {
      // 같은 내용의 이벤트가 이미 캘린더에 있음 → 새로 만들지 않고 연결만 (2차 중복 방지)
      task.calendarEventId = existing.get(dkey);
      linked++;
      continue;
    }

    try {
      const event = _buildCalEventFromTask(task);
      const response = await gapi.client.calendar.events.insert({
        calendarId: calId,
        resource: event,
      });
      task.calendarEventId = response.result.id;
      existing.set(dkey, response.result.id);   // 같은 실행 내 중복도 방지
      pushed++;
    } catch (error) {
      console.error('⚠️ 자동 등록 실패:', task.text, error);
    }
  }

  if (pushed > 0 || linked > 0) {
    console.log(`📤 'Tasks' 캘린더에 신규 ${pushed}건 등록, 기존 ${linked}건 연결(중복 방지).`);
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof renderTasks === 'function') renderTasks();
  }
  return pushed;
}

// 세션(페이지 로드)당 1회만 실행되도록 가드
let _calAutoSyncDone = false;

async function autoSyncCalendar() {
  if (_calAutoSyncDone) return;
  if (!isSignedIn()) return;
  _calAutoSyncDone = true;

  console.log('🔁 구글 캘린더 자동 동기화 시작...');
  await autoPushTasksToCalendar();  // 1) TaskLog → 구글 캘린더 (보내기)
  await fetchCalendarEvents(true);  // 2) 구글 캘린더 → TaskLog (가져오기, 조용히)
  console.log('✅ 자동 동기화 완료');
}