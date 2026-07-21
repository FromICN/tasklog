// ============================================
//  ☁️ 구글 드라이브 백업 — 시간대별 24개 순환
// --------------------------------------------
//  ▸ 매시 정각 + 변경 시 자동으로 현재 "시(hour)" 슬롯 파일에 저장
//  ▸ 파일명: tasklog-backup-h{HH}.json  (HH = 00~23, 하루 24개)
//  ▸ 같은 시간대(예: 14시)에 여러 번 저장하면 그 시간대 파일에 덮어씀
//  ▸ 24시간(수정 시각 기준) 지난 파일은 자동 삭제 → 항상 최근 24개만 유지
//  ▸ 복원/동기화는 가장 최근에 저장된 슬롯 파일을 사용
// ============================================

// 구버전 단일 백업 파일명 (하위호환 복원용)
const BACKUP_FILENAME = 'my-tasklog-backup.json';

// 시간대별 파일 접두사
const HOURLY_PREFIX = 'tasklog-backup-h';

// 복원/동기화 대상 파일 ID 기억
let backupFileId = null;

// 현재 시(hour) 슬롯 파일명
function hourlyFilename(d) {
  d = d || new Date();
  return HOURLY_PREFIX + String(d.getHours()).padStart(2, '0') + '.json';
}

// ============================================
//  🔧 드라이브 공통 헬퍼
// ============================================

// 이름으로 파일 1개 찾기
async function _driveFindByName(name) {
  try {
    const r = await gapi.client.drive.files.list({
      q: "name='" + name + "' and trashed=false",
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
    });
    const f = r.result.files;
    return (f && f.length) ? f[0] : null;
  } catch (e) {
    console.error('파일 검색 실패(' + name + '):', e);
    return null;
  }
}

// 지정한 이름의 파일에 업로드(있으면 덮어쓰기 PATCH, 없으면 생성 POST)
async function _driveUpload(name, contentObj) {
  const fileContent = JSON.stringify(contentObj, null, 2);
  const existing = await _driveFindByName(name);

  const metadata = { name: name, mimeType: 'application/json' };
  const boundary = 'foo_bar_baz';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const multipartBody =
    delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) +
    delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent +
    closeDelimiter;

  const method = existing ? 'PATCH' : 'POST';
  const path = existing
    ? `/upload/drive/v3/files/${existing.id}`
    : '/upload/drive/v3/files';

  const response = await gapi.client.request({
    path: path,
    method: method,
    params: { uploadType: 'multipart' },
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });
  return response.result;
}

// 24시간 지난 시간대 백업 파일 삭제 (순서대로 순환 삭제)
async function _pruneHourlyBackups() {
  try {
    const r = await gapi.client.drive.files.list({
      q: "name contains '" + HOURLY_PREFIX + "' and trashed=false",
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
      pageSize: 100,
    });
    const files = r.result.files || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;   // 24시간 전
    for (let i = 0; i < files.length; i++) {
      const t = Date.parse(files[i].modifiedTime || '') || 0;
      if (t && t < cutoff) {
        try {
          await gapi.client.drive.files.delete({ fileId: files[i].id });
          console.log('🗑️ 24시간 지난 백업 삭제:', files[i].name);
        } catch (e) { /* 개별 삭제 실패는 무시 */ }
      }
    }
  } catch (e) {
    console.error('오래된 백업 정리 실패:', e);
  }
}

// 현재 시간대 슬롯에 백업 쓰기 + 오래된 파일 정리 (공통 코어)
async function _writeHourlyBackup() {
  const backupData = collectBackupData();          // 모든 페이지 데이터 + 환경설정
  const res = await _driveUpload(hourlyFilename(), backupData);
  localStorage.setItem('last-backup-time', new Date().toISOString());
  updateBackupStatus();
  await _pruneHourlyBackups();
  return res;
}

// ============================================
//  🔍 복원/동기화용 — 가장 최근 백업 파일 찾기
// ============================================
async function findBackupFile() {
  try {
    // 1) 시간대별 파일 중 가장 최근에 수정된 것
    const r = await gapi.client.drive.files.list({
      q: "name contains '" + HOURLY_PREFIX + "' and trashed=false",
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });
    const files = r.result.files || [];
    if (files.length) {
      backupFileId = files[0].id;
      console.log('🔍 최근 백업 파일:', files[0].name);
      return files[0];
    }
    // 2) 하위호환: 구버전 단일 파일
    const legacy = await _driveFindByName(BACKUP_FILENAME);
    if (legacy) {
      backupFileId = legacy.id;
      console.log('🔍 구버전 백업 파일 발견:', legacy.name);
      return legacy;
    }
    console.log('🔍 백업 파일 없음');
    return null;
  } catch (e) {
    console.error('백업 파일 검색 실패:', e);
    return null;
  }
}

// ============================================
//  ☁️ 지금 백업 (수동) — 현재 시간대 파일에 덮어쓰기
// ============================================
async function backupToDrive() {
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  const btn = document.getElementById('backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 백업 중...'; }

  try {
    await _writeHourlyBackup();
    console.log('✅ 백업 성공!');
    alert(`☁️ 백업 완료!\n${(typeof tasks !== 'undefined' ? tasks.length : 0)}개의 할 일을 포함한 모든 데이터를 이 시간대(${hourlyFilename()}) 파일에 저장했어요.`);
  } catch (error) {
    console.error('❌ 백업 실패:', error);
    alert('백업에 실패했어요. 콘솔(F12)을 확인해주세요.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '☁️ 백업'; }
  }
}

// ============================================
//  🕐 백업 상태 표시
// ============================================
function updateBackupStatus() {
  const statusEl = document.getElementById('backup-status');
  const lastBackup = localStorage.getItem('last-backup-time');
  const text = lastBackup
    ? (function () {
        const d = new Date(lastBackup);
        return `마지막 백업: ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : '백업 기록 없음';
  if (statusEl) statusEl.textContent = text;
}

// ============================================
//  📥 드라이브에서 복원하기 (가장 최근 슬롯)
// ============================================
async function restoreFromDrive() {
  if (!isSignedIn()) {
    alert('먼저 구글 로그인을 해주세요! 🔑');
    return;
  }
  const btn = document.getElementById('restore-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 복원 중...'; }

  try {
    const backupFile = await findBackupFile();
    if (!backupFile) {
      alert('드라이브에 백업 파일이 없어요. 먼저 백업을 해주세요! ☁️');
      return;
    }

    console.log('📥 백업 파일 읽는 중...');
    const response = await gapi.client.drive.files.get({ fileId: backupFileId, alt: 'media' });
    const backupData = JSON.parse(response.body);

    if (!isValidBackup(backupData)) {
      alert('백업 파일 형식이 올바르지 않아요. 😢');
      return;
    }

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
    if (!confirmed) { console.log('복원 취소됨'); return; }

    const restoredCount = applyBackupData(backupData);
    console.log('✅ 복원 완료!');
    alert(`📥 복원 완료!\n${restoredCount}개 항목을 되살렸어요. 페이지를 새로고침합니다.`);
    location.reload();
  } catch (error) {
    console.error('❌ 복원 실패:', error);
    alert('복원에 실패했어요. 콘솔(F12)을 확인해주세요.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 복원'; }
  }
}

// ============================================
//  🔄 자동 백업 (변경 디바운스 + 매시 정각)
// ============================================
let autoBackupTimer = null;       // 변경 디바운스 타이머
let hourlyBackupTimer = null;     // 매시 정각 타이머
let autoBackupEnabled = false;    // 자동 백업 켜짐/꺼짐

function toggleAutoBackup() {
  autoBackupEnabled = !autoBackupEnabled;
  localStorage.setItem('auto-backup-enabled', autoBackupEnabled);
  updateAutoBackupUI();

  if (autoBackupEnabled) {
    console.log('🔄 자동 백업 켜짐');
    scheduleAutoBackup();     // 변경분 즉시 1회
    scheduleHourlyBackup();   // 매시 정각 예약 시작
  } else {
    console.log('⏸️ 자동 백업 꺼짐');
    if (autoBackupTimer) { clearTimeout(autoBackupTimer); autoBackupTimer = null; }
    if (hourlyBackupTimer) { clearTimeout(hourlyBackupTimer); hourlyBackupTimer = null; }
  }
}

// 변경이 생길 때마다 호출 (디바운스 3초) → 현재 시간대 파일 갱신
function scheduleAutoBackup() {
  if (!autoBackupEnabled || !isSignedIn()) return;
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    console.log('🔄 변경 자동 백업 실행...');
    silentBackupToDrive();
  }, 3000);
}

// 매시 정각(+5초) 자동 백업 예약 — 한 시간마다 스스로 재예약
function scheduleHourlyBackup() {
  if (hourlyBackupTimer) { clearTimeout(hourlyBackupTimer); hourlyBackupTimer = null; }
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 5, 0);
  const delay = Math.max(1000, next - now);
  hourlyBackupTimer = setTimeout(function () {
    if (autoBackupEnabled && isSignedIn()) {
      console.log('🕐 매시 정각 자동 백업 실행...');
      silentBackupToDrive();
    }
    scheduleHourlyBackup();   // 다음 정각 재예약
  }, delay);
}

// 조용한 백업 (alert 없이) — 현재 시간대 파일에 저장
async function silentBackupToDrive() {
  if (!isSignedIn()) return;
  try {
    await _writeHourlyBackup();
    console.log('✅ 자동 백업 완료!');
  } catch (error) {
    console.error('❌ 자동 백업 실패:', error);
  }
}

// 자동 백업 버튼 UI 업데이트
function updateAutoBackupUI() {
  const btn = document.getElementById('auto-backup-btn');
  if (btn) {
    btn.textContent = autoBackupEnabled ? '🔄 자동 백업: 켜짐' : '⏸️ 자동 백업: 꺼짐';
    autoBackupEnabled ? btn.classList.add('active') : btn.classList.remove('active');
  }
  const settingsBtn = document.getElementById('settings-auto-btn');
  if (settingsBtn) {
    settingsBtn.textContent = autoBackupEnabled ? '켜짐' : '꺼짐';
    autoBackupEnabled ? settingsBtn.classList.add('on') : settingsBtn.classList.remove('on');
  }
  const toggleBtn = document.getElementById('settings-auto-backup');
  if (toggleBtn) toggleBtn.classList.toggle('on', autoBackupEnabled);
}

// ============================================
//  🔁 드라이브 = 원본(소스 오브 트루스) 자동 동기화
// ============================================
function driveDiffersFromLocal(backupData) {
  var drive = (backupData && backupData.data) ? backupData.data : {};
  var local = collectBackupData().data || {};
  var keys = Object.keys(drive);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var dv = drive[key];
    if (dv === null || dv === undefined) continue;
    if (JSON.stringify(dv) !== JSON.stringify(local[key])) return true;
  }
  return false;
}

async function silentSyncFromDrive() {
  if (!isSignedIn()) return false;
  try {
    var backupFile = await findBackupFile();
    if (!backupFile) {
      console.log('🔁 클라우드에 데이터 없음 → 불러올 것 없음(첫 로그인)');
      return false;
    }
    var response = await gapi.client.drive.files.get({ fileId: backupFileId, alt: 'media' });
    var backupData = JSON.parse(response.body);
    if (!isValidBackup(backupData)) {
      console.warn('🔁 드라이브 백업 형식이 올바르지 않음 → 동기화 건너뜀');
      return false;
    }
    if (!driveDiffersFromLocal(backupData)) {
      console.log('🔁 이미 최신 상태 — 동기화 불필요');
      return false;
    }
    var _driveTime = Date.parse(backupData.backupDate || '') || 0;
    var _localChange = parseInt(localStorage.getItem('tasklog-last-change') || '0', 10) || 0;
    if (_localChange && _driveTime && _localChange > _driveTime) {
      console.log('🔁 로컬이 더 최신 → 드라이브 덮어쓰기 취소하고 로컬을 백업');
      if (typeof scheduleAutoBackup === 'function') scheduleAutoBackup();
      return false;
    }
    applyBackupData(backupData);
    console.log('🔁 드라이브 내용을 불러와 로컬에 반영함');
    return true;
  } catch (e) {
    console.error('🔁 동기화 불러오기 실패:', e);
    return false;
  }
}

// 자동 백업 ON + 즉시 1회 백업 + 매시 정각 예약 (동기화 완료 후에만 호출)
function enableAutoBackupNow() {
  if (!isSignedIn()) return;
  if (!autoBackupEnabled) {
    autoBackupEnabled = true;
    localStorage.setItem('auto-backup-enabled', 'true');
    if (typeof updateAutoBackupUI === 'function') updateAutoBackupUI();
  }
  scheduleHourlyBackup();
  setTimeout(function () {
    if (isSignedIn()) silentBackupToDrive();
  }, 1500);
}

// 🔑 로그인 직후 — 먼저 불러오고(동기화), 그 다음 자동 백업 켜기
async function onSignInSync() {
  if (!isSignedIn()) return;
  try {
    var changed = await silentSyncFromDrive();
    if (changed && !sessionStorage.getItem('tasklog-synced')) {
      sessionStorage.setItem('tasklog-synced', '1');
      console.log('🔁 새 내용 반영 → 새로고침');
      location.reload();
      return;
    }
    sessionStorage.setItem('tasklog-synced', '1');
    enableAutoBackupNow();
    window.__backupReady = true;
    console.log('🔑 로그인 감지 → 동기화 완료, 자동 백업 활성화');
  } catch (e) {
    console.error('로그인 동기화 실패:', e);
    enableAutoBackupNow();
    window.__backupReady = true;
  }
}

// 하위 호환 별칭
function onSignInBackup() { return onSignInSync(); }

// 앱 시작 시 저장된 설정 불러오기 (+ 켜져 있으면 매시 정각 예약 시작)
function initAutoBackup() {
  const saved = localStorage.getItem('auto-backup-enabled');
  autoBackupEnabled = (saved === 'true');
  updateAutoBackupUI();
  if (autoBackupEnabled && typeof isSignedIn === 'function' && isSignedIn()) {
    scheduleHourlyBackup();
  }
  console.log('자동 백업 설정 불러옴:', autoBackupEnabled ? '켜짐' : '꺼짐');
}
