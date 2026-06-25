// ============================================
//  📊 페이지별 엑셀 [3/4] — WD(주간기록) · Life Wheel
// ============================================

/* ③ WD (주간기록 / Journal) */
function exportWdXlsx() {
  if (!pxHasXLSX()) return pxAlertNoXLSX();
  var jnl = pxReadJSON(PX_KEY_JOURNAL, {}) || {};
  var headers = ['연도', '주차', '주요성과', '다음주계획', '회고', '메모'];
  var keys = Object.keys(jnl).sort();
  var rows = keys.map(function (k) {
    var e = jnl[k] || {}; var sec = e.sections || {};
    var parts = k.split('-W');
    return [parts[0] || '', parts[1] ? parseInt(parts[1]) : '',
      pxStr(sec.achievement), pxStr(sec.plan), pxStr(sec.issue), pxStr(e.memo)];
  });
  if (!rows.length) rows.push([new Date().getFullYear(), 26, '예) 프로젝트 A 완료', '예) B 착수', '예) 일정관리 개선 필요', '']);
  var guide = [
    ['📊 TaskLog — WD(주간기록) 백업/복원 서식'], [''],
    ['• 한 줄이 한 주(週)의 기록입니다.'],
    ['• 이 파일을 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 그대로 복원됩니다.'], [''],
    ['열 설명'],
    ['연도', '예: 2026 (필수).'],
    ['주차', 'ISO 주차 번호 1~53 (필수).'],
    ['주요성과', '이번 주 완료·달성한 것.'],
    ['다음주계획', '다음 주 예정 일.'],
    ['회고', '돌아보며 배운 점·개선점.'],
    ['메모', '기타 메모(선택).'], [''],
    ['⚠️ 복원하면 현재 주간기록 전체가 이 엑셀 내용으로 교체됩니다.']
  ];
  pxBuildAndSave('WD', headers, rows, [8, 8, 40, 40, 40, 30], guide, 'tasklog-WD-' + pxFileDate() + '.xlsx');
}
function wdRowsToJournal(rows) {
  var hIdx = pxFindHeaderIdx(rows, ['주차', '주요성과', '연도']);
  var map = pxColMap(rows[hIdx]);
  var cY = map['연도'], cW = map['주차'], cA = map['주요성과'], cP = map['다음주계획'], cI = map['회고'], cM = map['메모'];
  var out = {};
  for (var r = hIdx + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row) continue;
    var y = parseInt(pxTrim(pxCell(row, cY))), w = parseInt(pxTrim(pxCell(row, cW)));
    if (!y || !w) continue;
    var key = y + '-W' + pxPad2(w);
    out[key] = {
      weekLabel: (typeof getWeekLabel === 'function') ? getWeekLabel(key) : (y + '년 ' + w + '주'),
      sections: { achievement: pxStr(pxCell(row, cA)), issue: pxStr(pxCell(row, cI)), plan: pxStr(pxCell(row, cP)) },
      memo: pxStr(pxCell(row, cM)),
      savedAt: new Date().toISOString()
    };
  }
  return out;
}

/* ④ Life Wheel */
var LW_HEADERS = ['연도', 'section', 'point', 'status', 'info', 'ideal', 'value',
  '중요도', '우선순위', '목표(SMART최종)', 'SMART-구체적', 'SMART-측정', 'SMART-실현', 'SMART-관련', 'SMART-기한'];
function exportLifeWheelXlsx() {
  if (!pxHasXLSX()) return pxAlertNoXLSX();
  var years = pxReadJSON(PX_KEY_LIFEWHEEL, []) || [];
  if (!Array.isArray(years)) years = [];
  var rows = [];
  years.forEach(function (yr) {
    (yr.sections || []).forEach(function (s) {
      var sm = s.smart || {};
      rows.push([
        pxStr(yr.year), pxStr((s.emoji ? s.emoji + ' ' : '') + (s.name || '')),
        pxStr(s.score), pxStr(s.status), pxStr(s.info), pxStr(s.ideal),
        Array.isArray(s.values) ? s.values.join(', ') : pxStr(s.values),
        pxStr(s.importance), pxStr(s.priority), pxStr(sm.finalGoal),
        pxStr(sm.specific), pxStr(sm.measurable), pxStr(sm.achievable), pxStr(sm.relevant), pxStr(sm.timeBound)
      ]);
    });
  });
  if (!rows.length) rows.push([new Date().getFullYear(), '💼 커리어/학업', 7, 'improve', '직장에서의 성취', '이상적 모습', '성장, 도전', 3, 5, '', '', '', '', '', '']);
  var guide = [
    ['📊 TaskLog — Life Wheel 백업/복원 서식'], [''],
    ['• 한 줄이 한 연도의 한 섹션(영역)입니다. 보통 연도당 8개 섹션.'],
    ['• 이 파일을 [설정 > 백업 & 복원 > 파일로 복원]에 올리면 그대로 복원됩니다.'], [''],
    ['열 설명'],
    ['연도', '예: 2026 (필수).'],
    ['section', '영역 이름(이모지 포함 가능). 같은 연도 안에서 위→아래 순서가 1~8번 섹션이 됩니다.'],
    ['point', '수레바퀴 점수 0~10.'],
    ['status', 'maintain(유지) / improve(개선) / focus(집중) 등.'],
    ['info', '영역 설명.'],
    ['ideal', '이상적인 모습.'],
    ['value', '핵심 가치(쉼표로 구분).'],
    ['중요도 / 우선순위', '숫자(선택).'],
    ['목표(SMART최종)', 'SMART 최종 목표 한 줄.'],
    ['SMART-구체적/측정/실현/관련/기한', 'SMART 세부 항목(선택).'], [''],
    ['⚠️ 복원하면 현재 Life Wheel 전체가 이 엑셀 내용으로 교체됩니다.']
  ];
  pxBuildAndSave('LifeWheel', LW_HEADERS, rows,
    [8, 18, 7, 10, 26, 26, 20, 8, 8, 26, 20, 20, 20, 20, 16], guide,
    'tasklog-LifeWheel-' + pxFileDate() + '.xlsx');
}
function lifeWheelRowsToYears(rows) {
  var hIdx = pxFindHeaderIdx(rows, ['section', 'point', '연도']);
  var map = pxColMap(rows[hIdx]);
  var c = {
    year: map['연도'], name: map['section'], point: map['point'], status: map['status'],
    info: map['info'], ideal: map['ideal'], value: map['value'], imp: map['중요도'], pri: map['우선순위'],
    goal: map['목표(SMART최종)'], sp: map['SMART-구체적'], me: map['SMART-측정'],
    ac: map['SMART-실현'], re: map['SMART-관련'], tb: map['SMART-기한']
  };
  var existing = pxReadJSON(PX_KEY_LIFEWHEEL, []) || []; if (!Array.isArray(existing)) existing = [];
  var exByYear = {}; existing.forEach(function (y) { exByYear[String(y.year)] = y; });
  var byYear = {};
  for (var r = hIdx + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row) continue;
    var y = parseInt(pxTrim(pxCell(row, c.year))); if (!y) continue;
    var nameRaw = pxTrim(pxCell(row, c.name)); if (!nameRaw) continue;
    if (!byYear[y]) byYear[y] = [];
    var idx = byYear[y].length;
    var exYr = exByYear[String(y)];
    var base = (exYr && exYr.sections && exYr.sections[idx]) ? JSON.parse(JSON.stringify(exYr.sections[idx]))
      : (typeof makeLwSection === 'function' ? makeLwSection({}, idx) : { smart: {}, values: [] });
    var emoji = base.emoji || '', name = nameRaw;
    var em = nameRaw.match(/^(\S+?)\s+(.+)$/);
    if (em && /[^\w가-힣]/.test(em[1])) { emoji = em[1]; name = em[2]; }
    base.emoji = emoji; base.name = name; base.badge = name;
    var pt = pxTrim(pxCell(row, c.point)); if (pt !== '') base.score = +pt || 0;
    var st = pxTrim(pxCell(row, c.status)); if (st) base.status = st;
    base.info = pxStr(pxCell(row, c.info));
    base.ideal = pxStr(pxCell(row, c.ideal));
    var val = pxTrim(pxCell(row, c.value));
    base.values = val ? val.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    var imp = pxTrim(pxCell(row, c.imp)); if (imp !== '') base.importance = +imp || base.importance;
    var pri = pxTrim(pxCell(row, c.pri)); if (pri !== '') base.priority = +pri || base.priority;
    base.smart = base.smart || {};
    base.smart.finalGoal  = pxStr(pxCell(row, c.goal));
    base.smart.specific   = pxStr(pxCell(row, c.sp));
    base.smart.measurable = pxStr(pxCell(row, c.me));
    base.smart.achievable = pxStr(pxCell(row, c.ac));
    base.smart.relevant   = pxStr(pxCell(row, c.re));
    base.smart.timeBound  = pxStr(pxCell(row, c.tb));
    byYear[y].push(base);
  }
  return Object.keys(byYear).map(function (y) { return { year: parseInt(y), sections: byYear[y] }; });
}
