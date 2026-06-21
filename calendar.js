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
    
    const response = await gapi.client.calendar.events.insert({
      calendarId: 'primary',  // 기본 캘린더
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
    
    await gapi.client.calendar.events.delete({
      calendarId: 'primary',
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

// 마감일이 있지만 아직 캘린더에 없는 Task를 구글 캘린더에 자동 등록
async function autoPushTasksToCalendar() {
  if (!isSignedIn() || typeof tasks === 'undefined') return 0;

  let pushed = 0;
  for (const task of tasks) {
    if (task.completed) continue;          // 완료된 항목 제외
    if (!task.dueDateTime) continue;       // 날짜 없는 항목 제외
    if (task.calendarEventId) continue;    // 이미 등록된 항목 제외 (중복 방지)

    try {
      const event = _buildCalEventFromTask(task);
      const response = await gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      task.calendarEventId = response.result.id;
      pushed++;
    } catch (error) {
      console.error('⚠️ 자동 등록 실패:', task.text, error);
    }
  }

  if (pushed > 0) {
    console.log(`📤 ${pushed}개의 Task를 구글 캘린더에 자동 등록했어요.`);
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