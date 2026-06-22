// ============================================
//  ☁️ 구글 드라이브 백업
// ============================================

// 백업 파일 이름 (드라이브에서 이 이름으로 저장돼요)
const BACKUP_FILENAME = 'my-tasklog-backup.json';

// 백업 파일의 ID를 기억해둘 변수 (덮어쓰기용)
let backupFileId = null;


// ============================================
//  🔍 기존 백업 파일 찾기
// ============================================

async function findBackupFile() {
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${BACKUP_FILENAME}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
    });
    
    const files = response.result.files;
    if (files && files.length > 0) {
      backupFileId = files[0].id;
      console.log('🔍 기존 백업 파일 발견:', backupFileId);
      return files[0];
    }
    
    console.log('🔍 기존 백업 파일 없음 (새로 만들 예정)');
    return null;
    
  } catch (error) {
    console.error('백업 파일 검색 실패:', error);
    return null;
  }
}


// ============================================
//  ☁️ 드라이브에 백업하기
// ============================================

async function backupToDrive() {
  // 1. 로그인 확인
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  
  // 버튼 비활성화 (중복 클릭 방지)
  const btn = document.getElementById('backup-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 백업 중...';
  }
  
  try {
    // 2. 백업할 데이터 준비 (모든 페이지 데이터 + 환경설정 — 통합 엔진)
    const backupData = collectBackupData();
    const fileContent = JSON.stringify(backupData, null, 2);

    // 3. 기존 백업 파일이 있는지 확인
    await findBackupFile();
    
    // 4. 파일 메타데이터
    const metadata = {
      name: BACKUP_FILENAME,
      mimeType: 'application/json',
    };
    
    // 5. 업로드 (multipart 방식)
    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    
    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;
    
    // 6. 기존 파일이 있으면 업데이트(PATCH), 없으면 새로 생성(POST)
    const method = backupFileId ? 'PATCH' : 'POST';
    const path = backupFileId
      ? `/upload/drive/v3/files/${backupFileId}`
      : '/upload/drive/v3/files';
    
    const response = await gapi.client.request({
      path: path,
      method: method,
      params: { uploadType: 'multipart' },
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    
    console.log('✅ 백업 성공!', response);
    backupFileId = response.result.id;
    
    // 7. 마지막 백업 시간 저장 & 표시
    const now = new Date();
    localStorage.setItem('last-backup-time', now.toISOString());
    updateBackupStatus();
    
    alert(`☁️ 백업 완료!\n${tasks.length}개의 할 일을 포함한 모든 페이지 데이터가 구글 드라이브에 안전하게 저장됐어요.`);
    
  } catch (error) {
    console.error('❌ 백업 실패:', error);
    alert('백업에 실패했어요. 콘솔(F12)을 확인해주세요.');
  } finally {
    // 버튼 원상복구
    if (btn) {
      btn.disabled = false;
      btn.textContent = '☁️ 백업';
    }
  }
}


// ============================================
//  🕐 백업 상태 표시
// ============================================

function updateBackupStatus() {
  const statusEl = document.getElementById('backup-status');
  if (!statusEl) return;
  
  const lastBackup = localStorage.getItem('last-backup-time');
  if (lastBackup) {
    const date = new Date(lastBackup);
    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    statusEl.textContent = `마지막 백업: ${timeStr}`;
  } else {
    statusEl.textContent = '백업 기록 없음';
  }
}

// ============================================
//  📥 드라이브에서 복원하기
// ============================================

async function restoreFromDrive() {
  // 1. 로그인 확인
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  
  const btn = document.getElementById('restore-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 복원 중...';
  }
  
  try {
    // 2. 백업 파일 찾기
    const backupFile = await findBackupFile();
    
    if (!backupFile) {
      alert('드라이브에 백업 파일이 없어요. 먼저 백업을 해주세요! ☁️');
      return;
    }
    
    // 3. 파일 내용 읽기
    console.log('📥 백업 파일 읽는 중...');
    const response = await gapi.client.drive.files.get({
      fileId: backupFileId,
      alt: 'media',  // 파일 내용을 직접 가져오기
    });
    
    // 4. JSON 파싱
    const backupData = JSON.parse(response.body);
    console.log('📦 백업 데이터:', backupData);

    if (!isValidBackup(backupData)) {
      alert('백업 파일 형식이 올바르지 않아요. 😢');
      return;
    }

    // 5. 사용자에게 확인 (실수 방지!)
    const backupDate = backupData.backupDate
      ? new Date(backupData.backupDate).toLocaleString('ko-KR')
      : '알 수 없음';
    const taskN = backupTaskCount(backupData);

    const confirmed = confirm(
      `드라이브의 백업으로 복원할까요?\n\n` +
      `📅 백업 시점: ${backupDate}\n` +
      `📝 할 일 개수: ${taskN}개 (+ 모든 페이지 데이터·환경설정)\n\n` +
      `⚠️ 현재 앱의 데이터가 백업 내용으로 교체되고 페이지가 새로고침됩니다.`
    );

    if (!confirmed) {
      console.log('복원 취소됨');
      return;
    }

    // 6. 복원 실행! (모든 페이지 데이터 — 통합 엔진)
    const restoredCount = applyBackupData(backupData);

    console.log('✅ 복원 완료!');
    alert(`📥 복원 완료!\n${restoredCount}개 항목을 되살렸어요. 페이지를 새로고침합니다.`);
    location.reload();   // 모든 모듈이 새 데이터를 다시 읽도록 새로고침
    
  } catch (error) {
    console.error('❌ 복원 실패:', error);
    alert('복원에 실패했어요. 콘솔(F12)을 확인해주세요.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 복원';
    }
  }
}

// ============================================
//  🔄 자동 백업 (디바운스 적용)
// ============================================

let autoBackupTimer = null;       // 타이머 보관
let autoBackupEnabled = false;    // 자동 백업 켜짐/꺼짐

// 자동 백업 켜기/끄기 토글
function toggleAutoBackup() {
  autoBackupEnabled = !autoBackupEnabled;
  localStorage.setItem('auto-backup-enabled', autoBackupEnabled);
  updateAutoBackupUI();
  
  if (autoBackupEnabled) {
    console.log('🔄 자동 백업 켜짐');
    // 켜는 순간 한 번 백업
    scheduleAutoBackup();
  } else {
    console.log('⏸️ 자동 백업 꺼짐');
    // 예약된 백업 취소
    if (autoBackupTimer) {
      clearTimeout(autoBackupTimer);
      autoBackupTimer = null;
    }
  }
}

// 자동 백업 예약 (변경이 생길 때마다 호출됨)
function scheduleAutoBackup() {
  // 자동 백업이 꺼져있거나 로그인 안 했으면 무시
  if (!autoBackupEnabled || !isSignedIn()) return;
  
  // 기존 예약이 있으면 취소 (디바운스의 핵심!)
  if (autoBackupTimer) {
    clearTimeout(autoBackupTimer);
  }
  
  // 3초 후에 백업 실행 예약
  autoBackupTimer = setTimeout(() => {
    console.log('🔄 자동 백업 실행...');
    silentBackupToDrive();  // 조용히 백업 (알림창 없이)
  }, 3000);
}

// 조용한 백업 (자동 백업용 - alert 없이)
async function silentBackupToDrive() {
  if (!isSignedIn()) return;
  
  try {
    const backupData = collectBackupData();   // 모든 페이지 데이터 + 환경설정
    const fileContent = JSON.stringify(backupData, null, 2);

    await findBackupFile();

    const metadata = {
      name: BACKUP_FILENAME,
      mimeType: 'application/json',
    };

    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    const method = backupFileId ? 'PATCH' : 'POST';
    const path = backupFileId
      ? `/upload/drive/v3/files/${backupFileId}`
      : '/upload/drive/v3/files';

    const response = await gapi.client.request({
      path: path,
      method: method,
      params: { uploadType: 'multipart' },
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    backupFileId = response.result.id;

    const now = new Date();
    localStorage.setItem('last-backup-time', now.toISOString());
    updateBackupStatus();

    console.log('✅ 자동 백업 완료!');
    
  } catch (error) {
    console.error('❌ 자동 백업 실패:', error);
  }
}

// 자동 백업 버튼 UI 업데이트 (설정 패널 버튼도 함께 처리)
function updateAutoBackupUI() {
  // 구버전 사이드바 버튼 (없어도 무시)
  const btn = document.getElementById('auto-backup-btn');
  if (btn) {
    btn.textContent = autoBackupEnabled ? '🔄 자동 백업: 켜짐' : '⏸️ 자동 백업: 꺼짐';
    autoBackupEnabled ? btn.classList.add('active') : btn.classList.remove('active');
  }
  // 설정 패널 버튼 (열려있을 때만)
  const settingsBtn = document.getElementById('settings-auto-btn');
  if (settingsBtn) {
    settingsBtn.textContent = autoBackupEnabled ? '켜짐' : '꺼짐';
    autoBackupEnabled ? settingsBtn.classList.add('on') : settingsBtn.classList.remove('on');
  }
}

// ============================================
//  🔁 드라이브 = 원본(소스 오브 트루스) 자동 동기화
// --------------------------------------------
//  ▸ 어느 기기에서 로그인하든, 드라이브에 저장된 마지막 내용을
//    자동으로 불러와 화면에 그대로 표시합니다("복원" 버튼 불필요).
//  ▸ 핵심 순서: 로그인 → 먼저 드라이브에서 불러오기 → 그 다음 자동 백업 ON
//    (이 순서 덕분에 빈 데이터로 드라이브를 덮어쓰는 사고가 발생하지 않습니다.)
// ============================================

// 드라이브 백업이 현재 로컬 데이터와 "실질적으로" 다른지 검사
//  ▸ 드라이브의 빈 값(null)은 비교에서 제외 — applyBackupData 가 빈 값을
//    덮어쓰지 않는 동작과 일치시켜, 불필요한 새로고침 루프를 방지합니다.
function driveDiffersFromLocal(backupData) {
  var drive = (backupData && backupData.data) ? backupData.data : {};
  var local = collectBackupData().data || {};
  var keys = Object.keys(drive);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var dv = drive[key];
    if (dv === null || dv === undefined) continue;      // 빈 값은 무시
    if (JSON.stringify(dv) !== JSON.stringify(local[key])) return true;
  }
  return false;
}

// 드라이브에서 조용히 불러와 로컬에 반영 (확인창·알림 없음)
//  반환: true = 로컬이 바뀜(호출부에서 새로고침 필요), false = 변화 없음/데이터 없음
async function silentSyncFromDrive() {
  if (!isSignedIn()) return false;
  try {
    var backupFile = await findBackupFile();
    if (!backupFile) {
      console.log('🔁 클라우드에 데이터 없음 → 불러올 것 없음(첫 로그인)');
      return false;
    }
    var response = await gapi.client.drive.files.get({
      fileId: backupFileId,
      alt: 'media',
    });
    var backupData = JSON.parse(response.body);
    if (!isValidBackup(backupData)) {
      console.warn('🔁 드라이브 백업 형식이 올바르지 않음 → 동기화 건너뜀');
      return false;
    }
    if (!driveDiffersFromLocal(backupData)) {
      console.log('🔁 이미 최신 상태 — 동기화 불필요');
      return false;
    }
    // 드라이브가 원본 → 로컬에 덮어쓰기 (빈 값은 건드리지 않음)
    applyBackupData(backupData);
    console.log('🔁 드라이브 내용을 불러와 로컬에 반영함');
    return true;
  } catch (e) {
    console.error('🔁 동기화 불러오기 실패:', e);
    return false;
  }
}

// 자동 백업 ON + 즉시 1회 백업 (동기화가 끝난 뒤에만 호출 — 안전)
function enableAutoBackupNow() {
  if (!isSignedIn()) return;
  if (!autoBackupEnabled) {
    autoBackupEnabled = true;
    localStorage.setItem('auto-backup-enabled', 'true');
    if (typeof updateAutoBackupUI === 'function') updateAutoBackupUI();
  }
  // 토큰 안정화를 위해 약간 지연 후 조용히 1회 백업
  setTimeout(function () {
    if (isSignedIn()) silentBackupToDrive();
  }, 1500);
}

// 🔑 로그인 직후 실행 — 먼저 불러오고(동기화), 그 다음 자동 백업 켜기
async function onSignInSync() {
  if (!isSignedIn()) return;
  try {
    var changed = await silentSyncFromDrive();
    // 새로고침은 탭 세션당 1회만 (혹시 모를 무한 새로고침 루프 차단)
    if (changed && !sessionStorage.getItem('tasklog-synced')) {
      sessionStorage.setItem('tasklog-synced', '1');
      console.log('🔁 새 내용 반영 → 새로고침');
      location.reload();
      return;   // 새로고침 중이므로 백업 설정은 다음 로드 때 진행됨
    }
    // 변화 없음(또는 이미 동기화함) → 이제부터 자동 백업 ON
    sessionStorage.setItem('tasklog-synced', '1');
    enableAutoBackupNow();
    console.log('🔑 로그인 감지 → 동기화 완료, 자동 백업 활성화');
  } catch (e) {
    console.error('로그인 동기화 실패:', e);
    enableAutoBackupNow();   // 동기화 실패해도 백업은 켜둠
  }
}

// 하위 호환: 예전 이름으로 호출되는 곳이 있어도 동작하도록 별칭 제공
function onSignInBackup() { return onSignInSync(); }

// 앱 시작 시 저장된 설정 불러오기
function initAutoBackup() {
  const saved = localStorage.getItem('auto-backup-enabled');
  autoBackupEnabled = (saved === 'true');
  updateAutoBackupUI();
  console.log('자동 백업 설정 불러옴:', autoBackupEnabled ? '켜짐' : '꺼짐');
}