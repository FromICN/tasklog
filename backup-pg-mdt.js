// ============================================
//  📊 페이지별 엑셀 [4/4] — Mandalart · 통합 복원
// ============================================

/* ⑤ Mandalart */
var MDT_HEADERS = ['연도', '핵심목표', '섹션No', '섹션명(section)', '프로젝트No', '프로젝트명(project)',
  '유형', '완료', '연간목표', '단위', '분기별달성', '습관달성일자', '목표(세부목표)'];
function mdtQuartersToStr(quarters) {
  if (!Array.isArray(quarters)) return '';
  return quarters.map(function (q, i) {
    return 'Q' + (i + 1) + ':' + (q && q.value != null ? q.value : 0) + (q && q.done ? '✓' : '');
  }).join(' | ');
}
function mdtStrToQuarters(raw) {
  var qs = [{ done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }];
  if (!raw) return qs;
  String(raw).split('|').forEach(function (seg) {
    var m = seg.match(/Q\s*([1-4])\s*:\s*(-?\d+(?:\.\d+)?)?\s*(✓)?/i);
    if (m) { var i = parseInt(m[1]) - 1; qs[i] = { value: m[2] ? +m[2] : 0, done: !!m[3] }; }
  });
  return qs;
}
function mdtHabitLogToStr(log) {
  if (!log || typeof log !== 'object') return '';
  return Object.keys(log).filter(function (k) { return log[k]; }).sort().join(', ');
}
function mdtStrToHabitLog(raw) {
  var log = {};
  if (!raw) return log;
  String(raw).split(/[,\s]+/).forEach(function (d) { d = d.trim(); if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) log[d] = true; });
  return log;
}
function exportMandalartXlsx() {
  if (!pxHasXLSX()) return pxAlertNoXLSX();
  var mdts = pxReadJSON(PX_KEY_MANDALART, []) || [];
  if (!Array.isArray(mdts)) mdts = [];
  var rows = [];
  mdts.forEach(function (m) {
    var core = (m.coreGoal && m.coreGoal.text) || '';
    (m.subGoals || []).forEach(function (sg, si) {
      var sgName = (sg.emoji ? sg.emoji + ' ' : '') + (sg.text || '');
      var sgGoal = (sg.smart && sg.smart.specific) || sg.notes || '';
      (sg.actions || []).forEach(function (a, ai) {
        if (!a.text && a.trackingType === 'task' && !a.annualTarget && (!a.habitLog || !Object.keys(a.habitLog).length)) {
          if (!a.completed) return; // 완전히 빈 액션은 내보내지 않음
        }
        rows.push([
          pxStr(m.year), core, (si + 1), sgName, (ai + 1), pxStr(a.text),
          a.trackingType === 'habit' ? '습관' : '달성',
          a.completed ? 'O' : '',
          pxStr(a.annualTarget), pxStr(a.annualUnit),
          mdtQuartersToStr(a.quarters), mdtHabitLogToStr(a.habitLog), sgGoal
        ]);
      });
    });
  });
  if (!rows.length) {
    rows.push([new Date().getFullYear(), '핵심 목표 예시', 1, '🎯 건강', 1, '주 3회 운동', '습관', '', '', '', 'Q1:0 | Q2:0 | Q3:0 | Q4:0', '2026-01-02, 2026-01-04', '체력 향상']);
    rows.push([new Date().getFullYear(), '핵심 목표 예시', 1, '🎯 건강', 2, '독서 12권', '달성', '', 12, '권', 'Q1:3✓ | Q2:3 | Q3:0 | Q4:0', '', '지식 확장']);
  }
  var guide = [
    ['📊 TaskLog — Mandalart 백업/복원 서식'], [''],
    ['• 한 줄이 프로젝트(실행항목) 1개입니다. 연도 1개 = 섹션 8개 × 프로젝트 8개.'],
    ['• 이 파일을 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 그대로 복원됩니다.'], [''],
    ['열 설명'],
    ['연도', '예: 2026 (필수).'],
    ['핵심목표', '그 해의 중앙 핵심 목표(같은 연도 줄에 반복 기입).'],
    ['섹션No', '1~8. 같은 연도 안에서 섹션을 구분합니다.'],
    ['섹션명(section)', '세부목표(섹션) 이름.'],
    ['프로젝트No', '1~8. 그 섹션 안의 실행항목 번호.'],
    ['프로젝트명(project)', '실행항목(프로젝트) 이름.'],
    ['유형', '달성(실적형) 또는 습관.'],
    ['완료', '완료했으면 O.'],
    ['연간목표 / 단위', '달성형의 1년 목표 수치와 단위(예: 12 / 권).'],
    ['분기별달성', '"Q1:값✓ | Q2:값 | Q3:값 | Q4:값" 형식. ✓는 그 분기 달성 표시.'],
    ['습관달성일자', '습관형 달성 날짜를 YYYY-MM-DD 로, 쉼표로 구분.'],
    ['목표(세부목표)', '섹션의 목표(SMART 구체적 목표). 같은 섹션 줄에 반복 기입.'], [''],
    ['⚠️ 복원하면 현재 Mandalart 전체가 이 엑셀 내용으로 교체됩니다.']
  ];
  pxBuildAndSave('Mandalart', MDT_HEADERS, rows,
    [8, 22, 8, 18, 10, 22, 8, 6, 10, 8, 30, 30, 24], guide,
    'tasklog-Mandalart-' + pxFileDate() + '.xlsx');
}
function mdtBlankAction(id) {
  return { id: id, text: '', completed: false, trackingType: 'task', taskMode: 'cumulative',
    habitMode: 'daily', successThreshold: 80, habitLog: {}, annualTarget: 0, annualUnit: '',
    quarters: [{ done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }, { done: false, value: 0 }],
    months: (function () { var a = []; for (var i = 0; i < 12; i++) a.push({ value: 0, done: false, set: false }); return a; })(),
    weeklyTarget: 1 };
}
function mandalartRowsToYears(rows) {
  var hIdx = pxFindHeaderIdx(rows, ['섹션No', '프로젝트명(project)', '연도']);
  var map = pxColMap(rows[hIdx]);
  var c = {
    year: map['연도'], core: map['핵심목표'], sNo: map['섹션No'], sName: map['섹션명(section)'],
    pNo: map['프로젝트No'], pName: map['프로젝트명(project)'], type: map['유형'], done: map['완료'],
    target: map['연간목표'], unit: map['단위'], quarters: map['분기별달성'], habit: map['습관달성일자'], goal: map['목표(세부목표)']
  };
  var existing = pxReadJSON(PX_KEY_MANDALART, []) || []; if (!Array.isArray(existing)) existing = [];
  var exByYear = {}; existing.forEach(function (m) { exByYear[String(m.year)] = m; });
  var EMOJIS = ['🎯', '💼', '🏃', '🧘', '📚', '🔧', '🎓', '🎸', '🎮'];
  var COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#16a085', '#e67e22', '#8e44ad', '#1abc9c'];
  function ensureYear(y) {
    var ex = exByYear[String(y)];
    if (ex) return JSON.parse(JSON.stringify(ex));
    return {
      id: Date.now() + Math.floor(Math.random() * 1000), year: y,
      coreGoal: { text: y + '년 핵심 목표', emoji: '🎯', connections: ['', '', '', ''] },
      subGoals: Array.from({ length: 8 }, function (_, i) {
        return { id: i + 1, text: 'Section' + (i + 1), emoji: EMOJIS[i + 1], color: COLORS[i], badge: 'Section' + (i + 1),
          smart: { specific: '', measurable: '', achievable: '', relevant: '', timeBound: '' }, notes: '',
          actions: Array.from({ length: 8 }, function (_, j) { return mdtBlankAction(j + 1); }) };
      })
    };
  }
  var yearMap = {};
  for (var r = hIdx + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row) continue;
    var y = parseInt(pxTrim(pxCell(row, c.year))); if (!y) continue;
    var sNo = parseInt(pxTrim(pxCell(row, c.sNo))), pNo = parseInt(pxTrim(pxCell(row, c.pNo)));
    if (!sNo || sNo < 1 || sNo > 8 || !pNo || pNo < 1 || pNo > 8) continue;
    if (!yearMap[y]) yearMap[y] = ensureYear(y);
    var m = yearMap[y];
    var core = pxTrim(pxCell(row, c.core)); if (core) m.coreGoal.text = core;
    var sg = m.subGoals[sNo - 1];
    var sNameRaw = pxTrim(pxCell(row, c.sName));
    if (sNameRaw) {
      var em = sNameRaw.match(/^(\S+?)\s+(.+)$/);
      if (em && /[^\w가-힣]/.test(em[1])) { sg.emoji = em[1]; sg.text = em[2]; } else { sg.text = sNameRaw; }
      sg.badge = sg.text;
    }
    var goal = pxTrim(pxCell(row, c.goal)); if (goal) { sg.smart = sg.smart || {}; sg.smart.specific = goal; }
    var a = sg.actions[pNo - 1] || mdtBlankAction(pNo);
    a.text = pxStr(pxCell(row, c.pName));
    a.completed = pxTruthy(pxCell(row, c.done));
    a.trackingType = (pxTrim(pxCell(row, c.type)) === '습관') ? 'habit' : 'task';
    var tgt = pxTrim(pxCell(row, c.target)); a.annualTarget = tgt ? (+tgt || 0) : 0;
    a.annualUnit = pxStr(pxCell(row, c.unit));
    a.quarters = mdtStrToQuarters(pxTrim(pxCell(row, c.quarters)));
    a.habitLog = mdtStrToHabitLog(pxTrim(pxCell(row, c.habit)));
    sg.actions[pNo - 1] = a;
  }
  return Object.keys(yearMap).map(function (y) { return yearMap[y]; });
}

/* 🔁 통합 복원 — 페이지 종류 자동 인식 */
function handleRestorePageXlsx(file, input) {
  if (!pxHasXLSX()) { pxAlertNoXLSX(); if (input) input.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var names = wb.SheetNames || [];
      function has(n) { return names.indexOf(n) >= 0; }
      var key = null, value = null, label = '', count = 0;
      if (has('WEB'))            { value = webRowsToNotes(pxSheetRows(wb, 'WEB'));             key = PX_KEY_NOTES;     label = 'WEB(Archiving)'; count = value.length; }
      else if (has('Board'))     { value = boardRowsToTasks(pxSheetRows(wb, 'Board'));         key = PX_KEY_TASK;      label = 'Board(Task)';    count = value.length; }
      else if (has('WD'))        { value = wdRowsToJournal(pxSheetRows(wb, 'WD'));             key = PX_KEY_JOURNAL;   label = 'WD(주간기록)';   count = Object.keys(value).length; }
      else if (has('LifeWheel')) { value = lifeWheelRowsToYears(pxSheetRows(wb, 'LifeWheel')); key = PX_KEY_LIFEWHEEL; label = 'Life Wheel';     count = value.length; }
      else if (has('Mandalart')) { value = mandalartRowsToYears(pxSheetRows(wb, 'Mandalart')); key = PX_KEY_MANDALART; label = 'Mandalart';      count = value.length; }
      else if (has('할일(Task)') || (pxSheetRows(wb, names[0]) || []).join('|').indexOf('할 일') >= 0) {
        value = boardRowsToTasks(pxSheetRows(wb, names[0])); key = PX_KEY_TASK; label = 'Task(구버전)'; count = value.length;
      }
      if (!key) throw new Error('인식할 수 있는 페이지 시트(WEB·Board·WD·LifeWheel·Mandalart)를 찾지 못했습니다.');
      if (!confirm('[' + label + '] 페이지를 이 엑셀 내용으로 복원합니다.\n(항목 ' + count + '개)\n현재 ' + label + ' 데이터는 교체됩니다. 계속할까요?')) {
        if (input) input.value = ''; return;
      }
      var backup = {
        format: (typeof BACKUP_FORMAT !== 'undefined' ? BACKUP_FORMAT : 'tasklog-backup'),
        version: (typeof BACKUP_VERSION !== 'undefined' ? BACKUP_VERSION : 2),
        backupDate: new Date().toISOString(), data: {}
      };
      backup.data[key] = value;
      applyBackupData(backup);
      alert('복원 완료! [' + label + '] (' + count + '개) 페이지를 새로고침합니다. ✅');
      location.reload();
    } catch (err) {
      alert('엑셀 복원 실패: ' + err.message);
      if (input) input.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}
