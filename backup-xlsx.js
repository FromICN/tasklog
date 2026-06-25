// ============================================
//  📊 페이지별 엑셀(.xlsx) 백업/복원 [1/4] — 공통 헬퍼 · WEB
// --------------------------------------------
//  ▸ 한 페이지를 엑셀 표로 내보내고, 같은 파일로 복원합니다(통일 서식).
//  ▸ 페이지 종류는 시트 이름으로 자동 인식(통합 복원: backup-pg-mdt.js).
//  ▸ Gantt·WBS 는 Board 데이터를 불러올 뿐이라 별도 백업이 없습니다.
//  ▸ 모듈 구성: [1]헬퍼·WEB  [2]Board  [3]WD·LifeWheel  [4]Mandalart·통합복원
//  ▸ SheetJS(XLSX) 라이브러리 필요 (index.html CDN 로드).
// ============================================

var PX_KEY_TASK      = 'my-tasklog-data';
var PX_KEY_NOTES     = 'my-tasklog-notes';
var PX_KEY_JOURNAL   = 'my-tasklog-journal';
var PX_KEY_LIFEWHEEL = 'my-tasklog-lifewheel';
var PX_KEY_MANDALART = 'my-tasklog-mandalart';

function pxAlertNoXLSX() { alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
function pxHasXLSX() { return typeof XLSX !== 'undefined'; }
function pxReadJSON(key, fallback) {
  try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return (v === null ? fallback : v); }
  catch (e) { return fallback; }
}
function pxPad2(n) { n = parseInt(n) || 0; return (n < 10 ? '0' + n : '' + n); }
function pxStr(v) { return (v === null || v === undefined) ? '' : String(v); }
function pxTrim(v) { return pxStr(v).trim(); }
function pxTruthy(v) {
  if (v === true) return true;
  if (v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'o' || s === '완료' || s === 'y' || s === 'yes' || s === '예'
      || s === '1' || s === 'true' || s === '✓' || s === 'v' || s === 'x';
}
function pxFileDate() { return (typeof fmtDateForFile === 'function') ? fmtDateForFile(new Date()) : String(Date.now()); }
function pxDateStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.getFullYear() + '-' + pxPad2(v.getMonth() + 1) + '-' + pxPad2(v.getDate());
  return String(v).trim();
}
function pxTimeStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return pxPad2(v.getHours()) + ':' + pxPad2(v.getMinutes());
  var s = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
}
function pxBuildAndSave(sheetName, headers, rows, colWidths, guideRows, filename) {
  var aoa = [headers].concat(rows);
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws['!cols'] = colWidths.map(function (w) { return { wch: w }; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  if (guideRows && guideRows.length) {
    var wsG = XLSX.utils.aoa_to_sheet(guideRows);
    wsG['!cols'] = [{ wch: 18 }, { wch: 82 }];
    XLSX.utils.book_append_sheet(wb, wsG, '사용법');
  }
  XLSX.writeFile(wb, filename);
}
function pxSheetRows(wb, sheetName) {
  var ws = wb.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}
function pxFindHeaderIdx(rows, markers) {
  for (var r = 0; r < rows.length; r++) {
    var joined = (rows[r] || []).join('|');
    for (var i = 0; i < markers.length; i++) { if (joined.indexOf(markers[i]) >= 0) return r; }
  }
  return 0;
}
function pxColMap(headerRow) {
  var map = {};
  (headerRow || []).forEach(function (h, i) { map[pxTrim(h)] = i; });
  return map;
}
function pxCell(row, idx) { return (idx === undefined || idx < 0 || row[idx] === undefined) ? '' : row[idx]; }

/* ① WEB (Archiving) */
function exportWebXlsx() {
  if (!pxHasXLSX()) return pxAlertNoXLSX();
  var notes = pxReadJSON(PX_KEY_NOTES, []) || [];
  if (!Array.isArray(notes)) notes = [];
  var memos = notes.filter(function (n) { return n && (n.type === 'memo' || n.type === undefined); });
  var headers = ['ID', 'Archiving(내용)', '마감일', '마감시간', '작성일'];
  var rows = memos.map(function (n) {
    return [pxStr(n.id), pxStr(n.text), pxStr(n.dueDate), pxStr(n.dueTime), pxStr(n.createdAt)];
  });
  if (!rows.length) rows.push(['', '예) 참고 자료 메모', '', '', '']);
  var guide = [
    ['📊 TaskLog — WEB(Archiving) 백업/복원 서식'], [''],
    ['• 한 줄이 아카이빙 카드 1개입니다. 맨 아래 빈 줄에 새 메모를 추가할 수 있습니다.'],
    ['• 이 파일을 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 그대로 복원됩니다.'], [''],
    ['열 설명'],
    ['ID', '비워 두면 새 메모로 추가됩니다. 그대로 두면 같은 메모를 수정합니다.'],
    ['Archiving(내용)', '메모 본문(필수).'],
    ['마감일', 'YYYY-MM-DD (선택).'],
    ['마감시간', 'HH:MM (선택).'],
    ['작성일', '자동 기록값. 비워 두면 복원 시 현재 시각으로 채워집니다.'], [''],
    ['⚠️ 복원하면 현재 Archiving 메모 전체가 이 엑셀 내용으로 교체됩니다.']
  ];
  pxBuildAndSave('WEB', headers, rows, [22, 50, 12, 10, 24], guide, 'tasklog-WEB-' + pxFileDate() + '.xlsx');
}
function webRowsToNotes(rows) {
  var hIdx = pxFindHeaderIdx(rows, ['Archiving', '내용']);
  var map = pxColMap(rows[hIdx]);
  var ci = map['Archiving(내용)']; if (ci === undefined) ci = map['내용']; if (ci === undefined) ci = 1;
  var out = [];
  for (var r = hIdx + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row) continue;
    var text = pxTrim(pxCell(row, ci)); if (!text) continue;
    out.push({
      id: pxTrim(pxCell(row, map['ID'])) || (Date.now() + Math.random()),
      text: text, type: 'memo', taskId: null,
      dueDate: pxTrim(pxCell(row, map['마감일'])) || null,
      dueTime: pxTrim(pxCell(row, map['마감시간'])) || null,
      createdAt: pxTrim(pxCell(row, map['작성일'])) || new Date().toISOString()
    });
  }
  return out;
}
