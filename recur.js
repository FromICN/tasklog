// ============================================
//  🔁 반복 (Task · 일정 공통)
//
//  문서에 붙는 칸
//    rrule     'FREQ=WEEKLY;BYDAY=MO;UNTIL=20271231' — RFC 5545 의 부분집합 문자열.
//              문자열이어야 3-way 병합에서 통째로 한 칸이 된다.
//    exdates   { 'YYYY-MM-DD': true } — 없앤 회차. 배열이 아니라 맵이라 두 기기가 다른 회차를
//              지워도 둘 다 남는다 (_deepMerge3 가 키 단위로 합친다).
//    recurOf · recurKey  마스터에서 떨어져 나온 회차 문서 (완료했거나 '이 일정만' 고친 것).
//
//  ⚠️ 마스터의 startDate·dueDateTime 은 첫 회차가 아니라 '지금 회차'다.
//     Board·WBS·Web·Gantt·위젯은 반복을 몰라도 지금 회차 한 줄을 그대로 보여 준다.
//     끝난 회차는 완료된 문서로 떨어져 나오므로 Work Diary·Mandalart 도 고칠 것이 없다.
//     앞으로 올 회차는 문서가 없다 — 달력이 규칙에서 펼쳐 그린다.
// ============================================

var RECUR_WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
var RECUR_WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
var RECUR_NTH_KO = { 1: '첫째', 2: '둘째', 3: '셋째', 4: '넷째', 5: '다섯째', '-1': '마지막' };
var RECUR_CATCHUP = 366;   // 한 번에 만드는 지난 회차 문서의 상한 (시작일을 먼 과거로 잡았을 때)

// ── 날짜 키 'YYYY-MM-DD' 계산 (UTC 로 세어 시간대·서머타임과 무관하게 한다) ──
function _rPad(n) { return (n < 10 ? '0' : '') + n; }
function recurDays(key) {
  var p = String(key).split('-');
  return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
}
function recurKey(days) {
  var d = new Date(days * 86400000);
  return d.getUTCFullYear() + '-' + _rPad(d.getUTCMonth() + 1) + '-' + _rPad(d.getUTCDate());
}
function recurAdd(key, n) { return recurKey(recurDays(key) + n); }
function _rDow(days) { return ((days + 4) % 7 + 7) % 7; }    // 1970-01-01 은 목요일
function _rDim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }   // m 은 0부터
function _rStrip(text) { return String(text || '').replace(/^\[\d{6}\]\s?/, ''); }
function _rClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── 규칙 문자열 ↔ 객체 ──
var _rCache = {};
function recurParse(str) {
  if (!str || typeof str !== 'string') return null;
  if (_rCache[str] !== undefined) return _rCache[str];
  var r = { freq: null, interval: 1, byDay: [], byMonthDay: [], byMonth: [], until: null, wkst: 1 };
  var setPos = 0;
  function ints(v) { return v.split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x) && x !== 0; }); }
  str.replace(/^RRULE:/i, '').split(';').forEach(function (part) {
    var i = part.indexOf('=');
    if (i < 0) return;
    var k = part.slice(0, i).toUpperCase(), v = part.slice(i + 1).toUpperCase();
    if (k === 'FREQ') r.freq = v;
    else if (k === 'INTERVAL') r.interval = Math.max(1, parseInt(v, 10) || 1);
    else if (k === 'BYDAY') {
      v.split(',').forEach(function (s) {
        var m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s);
        if (m) r.byDay.push({ n: m[1] ? parseInt(m[1], 10) : 0, d: RECUR_WD.indexOf(m[2]) });
      });
    }
    else if (k === 'BYMONTHDAY') r.byMonthDay = ints(v);
    else if (k === 'BYMONTH') r.byMonth = ints(v);
    else if (k === 'UNTIL') {
      var u = /^(\d{4})(\d{2})(\d{2})/.exec(v);
      if (u) r.until = u[1] + '-' + u[2] + '-' + u[3];
    }
    else if (k === 'WKST') { var w = RECUR_WD.indexOf(v); if (w >= 0) r.wkst = w; }
    else if (k === 'BYSETPOS') setPos = parseInt(v, 10) || 0;
  });
  if (setPos && r.byDay.length === 1 && !r.byDay[0].n) r.byDay[0].n = setPos;
  if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(r.freq) < 0) r = null;
  _rCache[str] = r;
  return r;
}
function recurFormat(r) {
  var p = ['FREQ=' + r.freq];
  if (r.interval > 1) p.push('INTERVAL=' + r.interval);
  if (r.byMonth.length) p.push('BYMONTH=' + r.byMonth.join(','));
  if (r.byMonthDay.length) p.push('BYMONTHDAY=' + r.byMonthDay.join(','));
  if (r.byDay.length) p.push('BYDAY=' + r.byDay.map(function (b) { return (b.n || '') + RECUR_WD[b.d]; }).join(','));
  if (r.wkst !== 1) p.push('WKST=' + RECUR_WD[r.wkst]);
  if (r.until) p.push('UNTIL=' + r.until.replace(/-/g, ''));
  return p.join(';');
}
function recurWithUntil(str, untilKey) {
  var r = _rClone(recurParse(str));
  r.until = untilKey;
  return recurFormat(r);
}
// 그 날이 그 달의 몇 번째 그 요일인가
function recurNthOf(key) {
  var p = key.split('-'), day = +p[2], y = +p[0], m = +p[1] - 1;
  return { d: _rDow(recurDays(key)), n: Math.ceil(day / 7), isLast: day + 7 > _rDim(y, m), day: day, month: m + 1 };
}

// ── 회차 계산 ──
function _rMonthDays(r, y, m, anchorDay) {
  var dim = _rDim(y, m), out = [];
  if (r.byMonthDay.length) {
    r.byMonthDay.forEach(function (d) { var x = d > 0 ? d : dim + 1 + d; if (x >= 1 && x <= dim) out.push(x); });
  } else if (r.byDay.length) {
    var first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    r.byDay.forEach(function (b) {
      var hit = 1 + ((b.d - first + 7) % 7);
      if (b.n > 0) { var x = hit + (b.n - 1) * 7; if (x <= dim) out.push(x); }
      else if (b.n < 0) { var last = hit + Math.floor((dim - hit) / 7) * 7, z = last + (b.n + 1) * 7; if (z >= 1) out.push(z); }
      else { for (var w = hit; w <= dim; w += 7) out.push(w); }
    });
  } else if (anchorDay <= dim) {
    out.push(anchorDay);       // 31일 반복은 31일이 없는 달을 건너뛴다 (구글과 같다)
  }
  return out.filter(function (x, i) { return out.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
}
// anchor 이후, from~to 안의 회차 날짜들. anchor 는 간격(2주마다 등)의 기준이다.
function recurBetween(str, anchor, from, to, limit) {
  var r = recurParse(str), out = [];
  if (!r || !anchor) return out;
  var lo = from > anchor ? from : anchor;
  var hi = (r.until && r.until < to) ? r.until : to;
  if (lo > hi) return out;
  var max = limit || 1000, iv = r.interval;
  var ad = recurDays(anchor), ld = recurDays(lo), hd = recurDays(hi);
  function add(days) { if (days >= ld && days <= hd && out.length < max) out.push(recurKey(days)); }
  var i;
  if (r.freq === 'DAILY') {
    var only = r.byDay.length ? r.byDay.map(function (b) { return b.d; }) : null;
    i = Math.floor((ld - ad) / iv);
    for (var d = ad + i * iv; d <= hd && out.length < max; d += iv) {
      if (!only || only.indexOf(_rDow(d)) >= 0) add(d);
    }
  } else if (r.freq === 'WEEKLY') {
    var dows = r.byDay.length ? r.byDay.map(function (b) { return b.d; }) : [_rDow(ad)];
    var offs = dows.map(function (w) { return (w - r.wkst + 7) % 7; })
      .filter(function (x, n, a) { return a.indexOf(x) === n; }).sort(function (a, b) { return a - b; });
    var wk0 = ad - ((_rDow(ad) - r.wkst + 7) % 7);
    i = Math.max(0, Math.floor((ld - wk0) / (7 * iv)));
    for (var wk = wk0 + i * 7 * iv; wk <= hd && out.length < max; wk += 7 * iv) {
      offs.forEach(function (o) { add(wk + o); });
    }
  } else {
    var ap = anchor.split('-'), lp = lo.split('-'), hp = hi.split('-');
    var ay = +ap[0], am = +ap[1] - 1, aday = +ap[2];
    var dayNum = function (y, m, dn) { return Math.floor(Date.UTC(y, m, dn) / 86400000); };
    if (r.freq === 'MONTHLY') {
      var a = ay * 12 + am, l = +lp[0] * 12 + (+lp[1] - 1), h = +hp[0] * 12 + (+hp[1] - 1);
      i = Math.max(0, Math.floor((l - a) / iv));
      for (var mi = a + i * iv; mi <= h && out.length < max; mi += iv) {
        (function (y, m) { _rMonthDays(r, y, m, aday).forEach(function (dn) { add(dayNum(y, m, dn)); }); })(Math.floor(mi / 12), mi % 12);
      }
    } else {
      var months = (r.byMonth.length ? r.byMonth.map(function (x) { return x - 1; }) : [am]).sort(function (x, y) { return x - y; });
      i = Math.max(0, Math.floor((+lp[0] - ay) / iv));
      for (var yr = ay + i * iv; yr <= +hp[0] && out.length < max; yr += iv) {
        months.forEach(function (m) {
          (function (y) { _rMonthDays(r, y, m, aday).forEach(function (dn) { add(dayNum(y, m, dn)); }); })(yr);
        });
      }
    }
  }
  return out;
}

// ── 문서 도우미 ──
function _rLocalKey(iso) {
  var s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + _rPad(d.getMonth() + 1) + '-' + _rPad(d.getDate());
}
function _rShiftIso(iso, n) {
  if (!iso || !n) return iso;
  var s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return recurAdd(s.slice(0, 10), n) + s.slice(10);
  var d = new Date(s);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function recurIs(t) { return !!(t && t.rrule && recurParse(t.rrule) && recurKeyOf(t)); }
// 회차를 대표하는 날짜: 일정은 시작일, Task 는 달력에 놓이는 Due (없으면 Start)
function recurKeyOf(t) {
  var iso = t.kind === 'event' ? (t.startDate || t.dueDateTime) : (t.dueDateTime || t.startDate);
  return iso ? _rLocalKey(iso) : null;
}
// ⚠️ 여러 기기가 같은 회차를 처리해도 같은 문서가 되도록 id 를 회차에서 계산한다.
//    정수 ms 라는 약속(문서 ID = String(id))은 그대로 지킨다.
function recurOccId(baseId, key) {
  var s = String(baseId), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 86399000;
  return recurDays(key) * 86400000 + 500 + h;
}
function recurNextKey(t, afterKey, minKey) {
  var ex = t.exdates || {}, anchor = recurKeyOf(t);
  var from = recurAdd(afterKey, 1);
  if (minKey && minKey > from) from = minKey;
  var spans = [62, 800, 6000, 40000];
  for (var i = 0; i < spans.length; i++) {
    var list = recurBetween(t.rrule, anchor, from, recurAdd(from, spans[i]), 500);
    for (var j = 0; j < list.length; j++) if (!ex[list[j]]) return list[j];
  }
  return null;
}
// 지금 회차 뒤로 from~to 안에 올 회차들 (달력이 그리는 것)
function recurOccurrences(t, fromKey, toKey) {
  var cur = recurKeyOf(t), ex = t.exdates || {};
  return recurBetween(t.rrule, cur, fromKey, toKey, 800).filter(function (k) { return k !== cur && !ex[k]; });
}
// 시작·끝이 며칠에 걸치는가 (앞에서 시작해 범위에 걸치는 회차를 찾을 때 쓴다)
function recurSpanDays(t) {
  var s = t.startDate ? _rLocalKey(t.startDate) : null, e = t.dueDateTime ? _rLocalKey(t.dueDateTime) : null;
  return (s && e) ? Math.abs(recurDays(e) - recurDays(s)) : 0;
}
// 달력 표시용: 날짜 칸만 옮긴 가벼운 사본
function recurOccLite(t, key) {
  var n = recurDays(key) - recurDays(recurKeyOf(t));
  return { kind: t.kind, hasTime: t.hasTime, startHasTime: t.startHasTime, startDate: _rShiftIso(t.startDate, n), dueDateTime: _rShiftIso(t.dueDateTime, n) };
}
function _rFreshSteps(steps, n, key) {
  return (steps || []).map(function (s) {
    var c = _rClone(s);
    c.id = recurOccId(s.id, key);
    c.completed = false;
    c.text = _rStrip(s.text);
    ['completedAt', 'wdDurMin', 'wdTimed', 'wdLogAt', 'focusSessions'].forEach(function (k) { delete c[k]; });
    if (c.dueDateTime) c.dueDateTime = _rShiftIso(c.dueDateTime, n);
    return c;
  });
}
// 문서를 다른 회차로 옮긴다 — 날짜를 밀고, 완료 흔적과 To Do 체크를 새로 시작한다
function _rMoveTo(t, key) {
  var n = recurDays(key) - recurDays(recurKeyOf(t));
  t.startDate = _rShiftIso(t.startDate, n);
  t.dueDateTime = _rShiftIso(t.dueDateTime, n);
  if (t.reminder) t.reminder = _rShiftIso(t.reminder, n);
  t.completed = false;
  t.text = _rStrip(t.text);
  ['completedAt', 'wdTimed', 'wdLogAt', 'autoDone'].forEach(function (k) { delete t[k]; });
  if (t.status === '완료') t.status = '대기';
  t.steps = _rFreshSteps(t.steps, n, key);
  if (t.exdates) {
    Object.keys(t.exdates).forEach(function (k) { if (k <= key) delete t.exdates[k]; });
    if (!Object.keys(t.exdates).length) delete t.exdates;
  }
}
// 어떤 회차의 온전한 사본 (패널·요약창이 쓴다). 규칙은 뺀다.
function recurOccDoc(t, key) {
  var c = _rClone(t);
  var cur = recurKeyOf(t);
  delete c.exdates;
  delete c.rrule;
  if (key && key !== cur) _rMoveTo(c, key);
  return c;
}
function _rRemove(id) {
  tasks = tasks.filter(function (x) { return x.id !== id; });
  tasks.forEach(function (o) {
    if (o.prevTaskIds) o.prevTaskIds = o.prevTaskIds.filter(function (x) { return x !== id; });
    if (o.nextTaskIds) o.nextTaskIds = o.nextTaskIds.filter(function (x) { return x !== id; });
  });
}
// 이 회차를 시리즈에서 뺀다. 지금 회차면 다음으로 넘어가고, 다음이 없으면 마스터가 사라진다.
function recurExclude(m, key) {
  if (key !== recurKeyOf(m)) {
    m.exdates = m.exdates || {};
    m.exdates[key] = true;
    return;
  }
  var next = recurNextKey(m, key);
  if (next) _rMoveTo(m, next);
  else _rRemove(m.id);
}
// 회차를 독립 문서로 떼어 낸다 ('이 일정만' · 앞날 회차를 미리 완료)
function recurDetach(m, key) {
  var c = recurOccDoc(m, key);
  c.id = recurOccId(m.id, key);
  c.recurOf = m.id;
  c.recurKey = key;
  c.prevTaskIds = [];
  c.nextTaskIds = [];
  var had = tasks.find(function (x) { return x.id === c.id; });
  if (!had) tasks.push(c);
  recurExclude(m, key);
  return had || c;
}
// '이후 모두' — key 부터 새 시리즈로 나눈다. 앞쪽은 전날까지로 끝난다.
function recurSplit(m, key) {
  var n = recurOccDoc(m, key);
  var id = Date.now();
  while (tasks.some(function (x) { return x.id === id; })) id++;
  n.id = id;
  n.createdAt = new Date().toISOString();
  delete n.recurOf;
  delete n.recurKey;
  n.rrule = m.rrule;
  if (m.exdates) {
    Object.keys(m.exdates).forEach(function (k) {
      if (k >= key) { n.exdates = n.exdates || {}; n.exdates[k] = true; delete m.exdates[k]; }
    });
    if (!Object.keys(m.exdates).length) delete m.exdates;
  }
  m.rrule = recurWithUntil(m.rrule, recurAdd(key, -1));
  tasks.forEach(function (x) { if (x.recurOf === m.id && x.recurKey >= key) x.recurOf = id; });
  tasks.push(n);
  return n;
}
// 날짜를 옮겼을 때 규칙도 따라간다 (월요일 → 화요일로 끌면 '매주 화요일')
function recurRebase(str, oldKey, newKey) {
  if (oldKey === newKey) return str;
  var r = _rClone(recurParse(str)), o = recurNthOf(oldKey), v = recurNthOf(newKey);
  if (r.freq === 'WEEKLY') {
    if (r.byDay.length) {
      var ds = r.byDay.map(function (b) { return b.d === o.d ? v.d : b.d; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      r.byDay = ds.map(function (d) { return { n: 0, d: d }; });
    }
  } else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
    if (r.freq === 'YEARLY' && r.byMonth.length) r.byMonth = [v.month];
    if (r.byMonthDay.length === 1 && r.byMonthDay[0] > 0) r.byMonthDay = [v.day];
    if (r.byDay.length === 1 && r.byDay[0].n) {
      r.byDay = [{ n: r.byDay[0].n < 0 ? (v.isLast ? -1 : v.n) : (v.n === 5 ? -1 : v.n), d: v.d }];
    }
  }
  return recurFormat(r);
}
// 날짜를 옮긴 뒤에 — 규칙과 없앤 회차를 함께 민다
function recurAfterMove(t, oldKey) {
  var cur = recurKeyOf(t);
  if (!t.rrule || !cur || cur === oldKey) return;
  t.rrule = recurRebase(t.rrule, oldKey, cur);
  recurShiftExdates(t, recurDays(cur) - recurDays(oldKey));
}
function recurShiftExdates(t, n) {
  if (!t.exdates || !n) return;
  var out = {};
  Object.keys(t.exdates).forEach(function (k) { out[recurAdd(k, n)] = true; });
  t.exdates = out;
}
// 시작일이 규칙에 안 맞으면(맞춤 요일에서 그 요일을 뺀 경우) 첫 회차로 옮긴다
function recurFirstOn(t) {
  if (!recurIs(t)) return;
  var key = recurKeyOf(t);
  if (recurBetween(t.rrule, key, key, key, 1).length) return;
  var next = recurNextKey(t, key);
  if (!next) return;
  var n = recurDays(next) - recurDays(key);
  t.startDate = _rShiftIso(t.startDate, n);
  t.dueDateTime = _rShiftIso(t.dueDateTime, n);
}
// '모든 일정' — 제목·장소·메모·Project 중 바뀐 칸을 지난 회차에도 옮긴다.
//  그 회차만 따로 고쳐 둔 칸은 건드리지 않는다.
function recurPropagate(m, before) {
  var was = _rStrip(before.text), now = _rStrip(m.text);
  tasks.forEach(function (x) {
    if (x.recurOf !== m.id) return;
    if (was !== now && _rStrip(x.text) === was) {
      var pre = /^\[\d{6}\]\s?/.exec(x.text || '');
      x.text = (pre ? pre[0] : '') + now;
    }
    ['location', 'notes', 'mdtAction'].forEach(function (f) {
      var a = JSON.stringify(before[f]);
      if (a === JSON.stringify(m[f]) || JSON.stringify(x[f]) !== a) return;
      if (m[f] === undefined) delete x[f]; else x[f] = _rClone(m[f]);
    });
  });
}
function recurHistoryCount(m) {
  return tasks.filter(function (x) { return x.recurOf === m.id; }).length;
}
// 회차 삭제
function recurDelete(m, key, scope) {
  if (scope === 'this') { recurExclude(m, key); return; }
  var id = m.id;
  if (scope === 'following') {
    tasks = tasks.filter(function (x) { return !(x.recurOf === id && x.recurKey >= key && !x.completed); });
    if (key === recurKeyOf(m)) { _rRemove(id); return; }
    m.rrule = recurWithUntil(m.rrule, recurAdd(key, -1));
    if (m.exdates) {
      Object.keys(m.exdates).forEach(function (k) { if (k >= key) delete m.exdates[k]; });
      if (!Object.keys(m.exdates).length) delete m.exdates;
    }
    return;
  }
  tasks = tasks.filter(function (x) { return x.recurOf !== id; });
  _rRemove(id);
}

// ── 지나간 회차 정리 ─────────────────────────────────────────
//  · 어디서 완료했든(목록 체크·위젯·옛 탭) 완료된 마스터를 발견하면 회차를 떼어 남기고 다음으로 넘어간다.
//    그래서 완료를 처리하는 코드 네 곳(toggleComplete·toggleStep·setDone·applyDone)은 반복을 몰라도 된다.
//  · 일정은 끝나면 저절로 완료된다 (단건과 같은 규칙).
//  ⚠️ 값은 전부 회차에서 계산한다. 여러 기기가 동시에 돌려도 같은 결과라 병합에서 충돌하지 않는다.
function _rFinish(m, minKey) {
  var cur = recurKeyOf(m);
  var next = recurNextKey(m, cur, minKey);
  if (!next) {            // 마지막 회차: 문서 자체가 완료된 한 건으로 남는다
    delete m.rrule;
    delete m.exdates;
    return;
  }
  var id = recurOccId(m.id, cur);
  if (!tasks.some(function (x) { return x.id === id; })) {
    var c = _rClone(m);
    delete c.rrule;
    delete c.exdates;
    c.id = id;
    c.recurOf = m.id;
    c.recurKey = cur;
    c.prevTaskIds = [];
    c.nextTaskIds = [];
    c.reminder = null;
    tasks.push(c);
  }
  _rMoveTo(m, next);
}
// 서버 값을 받기 전에는 시간이 흘러서 생기는 처리를 하지 않는다.
//  오래 꺼 둔 기기가 낡은 마스터로 지난 회차를 다시 만들어 지운 회차가 되살아나는 것을 막는다.
function _rServerReady() {
  try {
    if (typeof firebaseReady !== 'undefined' && !firebaseReady) return true;
    if (typeof tasklogSyncStatus !== 'function') return true;
    var s = tasklogSyncStatus();
    if (!s || !s['동작중']) return true;
    return !!s['서버값수신'];
  } catch (e) { return true; }
}
function recurSweep() {
  if (!Array.isArray(tasks)) return 0;
  var n = 0, now = Date.now();
  var today = recurKey(Math.floor((now - new Date().getTimezoneOffset() * 60000) / 86400000));
  var ready = null;
  tasks.filter(recurIs).forEach(function (m) {
    if (m.completed) {
      // 밀린 Task 를 끝내면 밀린 회차는 건너뛰고 오늘 이후로 간다 — 매일 반복을 30번 눌러 따라잡게 하지 않는다
      _rFinish(m, m.kind === 'event' ? null : today);
      n++;
    }
    if (m.kind !== 'event' || !m.rrule) return;
    if (eventEndMs(m) > now) return;
    if (ready === null) ready = _rServerReady();
    if (!ready) return;
    var past = recurBetween(m.rrule, recurKeyOf(m), recurKeyOf(m), today, 20000);
    if (past.length > RECUR_CATCHUP) _rMoveTo(m, past[past.length - RECUR_CATCHUP]);
    for (var guard = 0; guard <= RECUR_CATCHUP && m.rrule && !m.completed; guard++) {
      var end = eventEndMs(m);
      if (end === null || end > now) break;
      eventStampDone(m, end);
      m.autoDone = true;
      _rFinish(m, null);
      n++;
    }
  });
  return n;
}

// ── 알림 ─────────────────────────────────────────────────────
//  alertMin = 기준 시각보다 몇 분 앞에 울릴까. 칸이 없으면 안 울린다.
//  기준 시각 = 일정은 시작, Task 는 달력에 놓이는 시각. 시간이 없으면 그날 오전 9시.
//  상대값이라 반복의 모든 회차에 그대로 쓰인다.
//  폰은 앱을 꺼도 울려야 하므로 안드로이드(Schedule.java · TaskAlarms.java)가 맡고, 웹은 탭이 열려 있을 때만 울린다.
//  ⚠️ 기준 시각 규칙을 바꾸면 Schedule.java baseIso 도 같이 고칠 것.
var ALERT_TIMED = [[0, '정시'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전'], [60, '1시간 전'], [1440, '1일 전']];
var ALERT_ALLDAY = [[0, '당일 오전 9시'], [1440, '전날 오전 9시']];
var ALERT_FIRED_KEY = 'alert-fired';     // 이 기기에서 이미 울린 것. 동기화하지 않는다.
var ALERT_GRACE_MS = 5 * 60 * 1000;      // 앱을 막 열었을 때 이만큼 지난 알림까지는 울린다

function alertBase(t) {
  var s = t.startDate, e = t.dueDateTime;
  if (t.kind === 'event') {
    if (!s && !e) return null;
    return { iso: s || e, timed: s ? !!t.startHasTime : !!t.hasTime };
  }
  var same = s && e && _rLocalKey(s) === _rLocalKey(e);
  if (s && t.startHasTime && (!e || same)) return { iso: s, timed: true };
  if (e) return { iso: e, timed: !!t.hasTime };
  return s ? { iso: s, timed: false } : null;
}
function alertHas(t) { return !!t && t.alertMin !== null && t.alertMin !== undefined; }
function alertLabel(t) {
  if (!alertHas(t)) return '';
  var b = alertBase(t), list = (b && b.timed) ? ALERT_TIMED : ALERT_ALLDAY;
  var hit = list.filter(function (o) { return o[0] === +t.alertMin; })[0];
  return hit ? hit[1] : (t.alertMin + '분 전');
}
// fromMs 초과 ~ toMs 이하에 울릴 것들
function alertFires(t, fromMs, toMs) {
  if (!alertHas(t) || t.completed) return [];
  var b = alertBase(t);
  if (!b) return [];
  var min = +t.alertMin, cur = recurKeyOf(t), out = [];
  var keys = [cur];
  if (recurIs(t)) {
    var from = _rLocalKey(new Date(fromMs).toISOString());
    var to = _rLocalKey(new Date(toMs + min * 60000).toISOString());
    keys = keys.concat(recurOccurrences(t, recurAdd(from, -1), to));
  }
  keys.forEach(function (k) {
    var iso = _rShiftIso(b.iso, recurDays(k) - recurDays(cur));
    var at = new Date(b.timed ? iso : (_rLocalKey(iso) + 'T09:00:00')).getTime() - min * 60000;
    if (at > fromMs && at <= toMs) out.push({ key: t.id + '@' + k + '@' + min, at: at, occ: k, iso: iso, timed: b.timed });
  });
  return out;
}
var _alertLast = null;
function alertTick() {
  // 폰 앱은 안드로이드 알람이 울린다. 여기서도 울리면 두 번이 된다.
  if (window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !Array.isArray(tasks)) return;
  var now = Date.now(), from = _alertLast === null ? now - ALERT_GRACE_MS : _alertLast;
  _alertLast = now;
  var fired = {};
  try { fired = JSON.parse(localStorage.getItem(ALERT_FIRED_KEY) || '{}'); } catch (e) {}
  var changed = false;
  tasks.forEach(function (t) {
    alertFires(t, from, now).forEach(function (a) {
      if (fired[a.key]) return;
      fired[a.key] = a.at;
      changed = true;
      var when = a.timed ? (function (d) { return _rPad(d.getHours()) + ':' + _rPad(d.getMinutes()); })(new Date(a.iso)) : a.occ.slice(5).replace('-', '/');
      try {
        var n = new Notification(_rStrip(t.text), { body: when + (t.location ? ' · ' + t.location : ''), tag: a.key });
        n.onclick = function () {
          window.focus();
          if (typeof navToMenu === 'function') navToMenu('calendar');
          if (typeof calGoDate === 'function') calGoDate(a.occ, 'day');
          n.close();
        };
      } catch (e) {}
    });
  });
  if (changed) {
    Object.keys(fired).forEach(function (k) { if (now - fired[k] > 2 * 86400000) delete fired[k]; });
    try { localStorage.setItem(ALERT_FIRED_KEY, JSON.stringify(fired)); } catch (e) {}
  }
}
// 입력 폼의 Alert 칸. 종일 여부에 따라 보기가 달라진다.
function rpAlertSync() {
  var el = _rEl('rp-alert');
  if (!el) return;
  var list = rpState.allDay ? ALERT_ALLDAY : ALERT_TIMED, v = rpState.alertMin;
  if (v !== null && v !== undefined && !list.some(function (o) { return o[0] === +v; })) {
    v = +v >= 1440 ? 1440 : 0;     // 시간 ↔ 종일을 바꾸면 가까운 값으로
    rpState.alertMin = v;
  }
  el.innerHTML = '<option value="">없음</option>' + list.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
  el.value = (v === null || v === undefined) ? '' : String(v);
}
function rpAlertPick(v) {
  rpState.alertMin = v === '' ? null : +v;
  rpState.dirty = true;
}

// ── 설명 문구 ──
function _rDayList(days) { return days.map(function (d) { return RECUR_WD_KO[d]; }).join('·') + '요일'; }
function recurDescribe(str, baseKey) {
  var r = recurParse(str);
  if (!r) return '';
  var b = recurNthOf(baseKey || recurKey(Math.floor(Date.now() / 86400000)));
  var iv = r.interval, txt = '';
  function nthText(list) {
    var x = list[0];
    return RECUR_NTH_KO[x.n] ? RECUR_NTH_KO[x.n] + ' ' + RECUR_WD_KO[x.d] + '요일' : RECUR_WD_KO[x.d] + '요일';
  }
  if (r.freq === 'DAILY') {
    txt = iv > 1 ? iv + '일마다' : '매일';
  } else if (r.freq === 'WEEKLY') {
    var ds = r.byDay.length ? r.byDay.map(function (x) { return x.d; }) : [b.d];
    var mf = ds.length === 5 && [1, 2, 3, 4, 5].every(function (x) { return ds.indexOf(x) >= 0; });
    var order = ds.slice().sort(function (p, q) { return ((p + 6) % 7) - ((q + 6) % 7); });
    txt = (iv > 1 ? iv + '주마다 ' : '매주 ') + (mf ? '월~금' : _rDayList(order));
    if (mf && iv === 1) txt = '주중 매일 (월~금)';
  } else if (r.freq === 'MONTHLY') {
    var pm = iv > 1 ? iv + '개월마다 ' : '매월 ';
    if (r.byDay.length) txt = pm + nthText(r.byDay);
    else if (r.byMonthDay.length) txt = pm + (r.byMonthDay[0] === -1 ? '마지막 날' : r.byMonthDay[0] + '일');
    else txt = pm + b.day + '일';
  } else {
    var py = iv > 1 ? iv + '년마다 ' : '매년 ';
    var mon = r.byMonth.length ? r.byMonth[0] : b.month;
    if (r.byDay.length) txt = py + mon + '월 ' + nthText(r.byDay);
    else txt = py + mon + '월 ' + (r.byMonthDay.length ? r.byMonthDay[0] : b.day) + '일';
  }
  return txt + (r.until ? ' · ' + r.until + '까지' : '');
}
function recurMarkHtml(t) {
  if (!t || !t.rrule) return '';
  var tip = recurDescribe(t.rrule, recurKeyOf(t)).replace(/"/g, '&quot;');
  return '<span class="recur-mark" title="' + tip + '" aria-label="반복">↻</span>';
}

// ── 범위를 묻는 창 ───────────────────────────────────────────
//  o: { title, noun:'일정'|'Task', scopes:['this','following','all'], note }
var _rAsk = null;
function recurAskScope(o, cb) {
  recurScopeDone(false);
  var label = { this: '이 ' + o.noun + '만', following: '이후 ' + o.noun + ' 모두', all: '모든 ' + o.noun };
  var html = '<div class="recur-dlg" role="dialog" aria-modal="true" aria-label="' + o.title + '">'
    + '<div class="recur-dlg-t">' + o.title + '</div>'
    + o.scopes.map(function (s, i) {
        return '<label class="recur-dlg-opt"><input type="radio" name="recur-scope" value="' + s + '"' + (i === 0 ? ' checked' : '') + '>' + label[s] + '</label>';
      }).join('')
    + (o.note ? '<div class="recur-dlg-note">' + o.note + '</div>' : '')
    + '<div class="recur-dlg-foot">'
    +   '<button type="button" class="recur-dlg-btn" onclick="recurScopeDone(false)">취소</button>'
    +   '<button type="button" class="recur-dlg-btn is-main" onclick="recurScopeDone(true)">확인</button>'
    + '</div></div>';
  var wrap = document.createElement('div');
  wrap.className = 'recur-dlg-wrap';
  wrap.id = 'recur-dlg';
  wrap.innerHTML = html;
  wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) recurScopeDone(false); });
  document.body.appendChild(wrap);
  _rAsk = cb;
  var first = wrap.querySelector('input[type=radio]');
  if (first) first.focus();
}
function recurScopeDone(ok) {
  var wrap = document.getElementById('recur-dlg');
  if (!wrap) return;
  var pick = ok ? ((wrap.querySelector('input[name=recur-scope]:checked') || {}).value || null) : null;
  wrap.remove();
  var cb = _rAsk;
  _rAsk = null;
  if (cb) cb(pick);
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.getElementById('recur-dlg')) { e.stopPropagation(); recurScopeDone(false); }
}, true);
function recurNoun(t) { return t.kind === 'event' ? '일정' : 'Task'; }
// 이 회차에서 고를 수 있는 범위. 지금 회차에 지난 기록도 없으면 '이후'와 '모두'는 같은 말이다.
function recurScopesFor(m, key, withThis) {
  var out = withThis ? ['this'] : [];
  if (key !== recurKeyOf(m) || recurHistoryCount(m) > 0) out.push('following');
  out.push('all');
  return out;
}
function recurAskDelete(m, key, after) {
  var hist = recurHistoryCount(m), noun = recurNoun(m);
  recurAskScope({
    title: '반복 ' + noun + ' 삭제', noun: noun, scopes: recurScopesFor(m, key, true),
    note: hist ? '모든 ' + noun + '을 고르면 지난 기록 ' + hist + '건도 함께 지워집니다.' : '',
  }, function (scope) {
    if (!scope) return;
    recurDelete(m, key, scope);
    saveTasks();
    if (after) after();
  });
}

// ── 입력 폼의 Repeat 칸 ──────────────────────────────────────
function _rRepBlank() {
  return { preset: 'none', n: 1, unit: 'week', days: [], month: 'day', end: 'none', until: '', count: '' };
}
// 규칙 문자열 → 폼 상태. 앞에 있는 보기와 똑같으면 그 보기로, 아니면 '맞춤'으로 보여 준다.
function recurRepFromRule(str, base) {
  var rep = _rRepBlank(), r = recurParse(str);
  if (!r || !base) return rep;
  var b = recurNthOf(base);
  if (r.until) { rep.end = 'date'; rep.until = r.until; }
  rep.n = r.interval;
  rep.unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq];
  rep.days = r.byDay.map(function (x) { return x.d; });
  rep.month = (r.byDay.length && r.byDay[0].n) ? (r.byDay[0].n < 0 ? 'last' : 'nth') : 'day';
  var one = r.interval === 1, x = r.byDay[0];
  if (one && r.freq === 'DAILY' && !r.byDay.length) rep.preset = 'daily';
  else if (one && r.freq === 'WEEKLY' && r.byDay.length === 1 && x.d === b.d) rep.preset = 'weekly';
  else if (one && r.freq === 'WEEKLY' && r.byDay.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return rep.days.indexOf(d) >= 0; })) rep.preset = 'weekdays';
  else if (one && r.freq === 'MONTHLY' && r.byMonthDay.length === 1 && r.byMonthDay[0] === b.day) rep.preset = 'month-day';
  else if (one && r.freq === 'MONTHLY' && r.byDay.length === 1 && x.d === b.d && x.n > 0 && x.n === b.n) rep.preset = 'month-nth';
  else if (one && r.freq === 'MONTHLY' && r.byDay.length === 1 && x.d === b.d && x.n === -1 && b.isLast) rep.preset = b.n === 5 ? 'month-nth' : 'month-last';
  else if (one && r.freq === 'YEARLY' && !r.byDay.length && (!r.byMonth.length || r.byMonth[0] === b.month) && (!r.byMonthDay.length || r.byMonthDay[0] === b.day)) rep.preset = 'yearly';
  else rep.preset = 'custom';
  return rep;
}
// 폼 상태 → 규칙 문자열. { rule, error } — error 는 잘못된 칸의 id.
function recurRepBuild(rep, base) {
  if (!rep || rep.preset === 'none') return { rule: null };
  var key = base || recurKey(Math.floor(Date.now() / 86400000));
  var b = recurNthOf(key), r = { freq: 'DAILY', interval: 1, byDay: [], byMonthDay: [], byMonth: [], until: null, wkst: 1 };
  var nth = b.n === 5 ? -1 : b.n;
  function monthly(mode) {
    r.freq = 'MONTHLY';
    if (mode === 'day') r.byMonthDay = [b.day];
    else r.byDay = [{ n: mode === 'last' ? -1 : nth, d: b.d }];
  }
  switch (rep.preset) {
    case 'daily': break;
    case 'weekly': r.freq = 'WEEKLY'; r.byDay = [{ n: 0, d: b.d }]; break;
    case 'weekdays': r.freq = 'WEEKLY'; r.byDay = [1, 2, 3, 4, 5].map(function (d) { return { n: 0, d: d }; }); break;
    case 'month-day': monthly('day'); break;
    case 'month-nth': monthly('nth'); break;
    case 'month-last': monthly('last'); break;
    case 'yearly': r.freq = 'YEARLY'; r.byMonth = [b.month]; r.byMonthDay = [b.day]; break;
    case 'custom':
      r.interval = Math.max(1, parseInt(rep.n, 10) || 0);
      if (!parseInt(rep.n, 10)) return { rule: null, error: 'rp-rep-n' };
      if (rep.unit === 'week') {
        r.freq = 'WEEKLY';
        var ds = rep.days.length ? rep.days : [b.d];
        r.byDay = ds.slice().sort(function (p, q) { return ((p + 6) % 7) - ((q + 6) % 7); }).map(function (d) { return { n: 0, d: d }; });
      } else if (rep.unit === 'month') monthly(rep.month);
      else if (rep.unit === 'year') { r.freq = 'YEARLY'; r.byMonth = [b.month]; r.byMonthDay = [b.day]; }
      break;
    default: return { rule: null };
  }
  if (rep.end === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rep.until) || recurKey(recurDays(rep.until)) !== rep.until || rep.until < key) return { rule: null, error: 'rp-rep-until' };
    r.until = rep.until;
  } else if (rep.end === 'count') {
    var c = parseInt(rep.count, 10);
    if (!c || c < 1) return { rule: null, error: 'rp-rep-count' };
    // 횟수는 날짜로 바꿔 저장한다 — 지금 회차가 앞으로 옮겨 가므로 남은 횟수를 세기 어렵다
    var list = recurBetween(recurFormat(r), key, key, '9999-12-31', Math.min(c, 5000));
    if (list.length) r.until = list[list.length - 1];
  }
  return { rule: recurFormat(r) };
}
function _rEl(id) { return document.getElementById(id); }
// 폼에서 회차를 대표하는 날짜 (없으면 null)
function rpRepBase() {
  var s = parseRpDateTime('rp-start-dt').dateStr, d = parseRpDateTime('rp-due-dt').dateStr;
  return rpState.kind === 'event' ? (s || d) : (d || s);
}
function rpRepInit(formDoc, ruleStr) {
  var base = (formDoc && recurKeyOf(formDoc)) || null;
  rpState.rep = ruleStr ? recurRepFromRule(ruleStr, base) : _rRepBlank();
  rpState.repOrig = JSON.stringify(rpState.rep);
  rpState.repBase = undefined;
}
function rpRepChanged() { return JSON.stringify(rpState.rep) !== rpState.repOrig; }
// 날짜가 바뀌면 '매주 월요일' 같은 문구도 따라가야 한다
function rpRepSync() {
  if (!_rEl('rp-rep-body') || !rpState.rep) return;
  var base = rpRepBase();
  if (base === rpState.repBase) return;
  rpRepRender();
}
function rpRepRender() {
  var el = _rEl('rp-rep-body'), rep = rpState.rep;
  if (!el || !rep) return;
  var base = rpRepBase();
  rpState.repBase = base;
  var key = base || recurKey(Math.floor(Date.now() / 86400000));
  var b = recurNthOf(key), wd = RECUR_WD_KO[b.d] + '요일';
  var nthName = RECUR_NTH_KO[b.n === 5 ? -1 : b.n];
  var opts = [
    ['none', '반복 안 함'], ['daily', '매일'], ['weekly', '매주 ' + wd], ['weekdays', '주중 매일 (월~금)'],
    ['month-day', '매월 ' + b.day + '일'], ['month-nth', '매월 ' + nthName + ' ' + wd],
  ];
  if (b.isLast && b.n === 4) opts.push(['month-last', '매월 마지막 ' + wd]);
  opts.push(['yearly', '매년 ' + b.month + '월 ' + b.day + '일'], ['custom', '맞춤…']);
  if (rep.preset === 'month-last' && !(b.isLast && b.n === 4)) rep.preset = 'month-nth';
  var sel = function (id, onchange, list, val) {
    return '<select class="field-input" id="' + id + '" onchange="' + onchange + '">'
      + list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
      + '</select>';
  };
  var html = sel('rp-rep-sel', 'rpRepPick(this.value)', opts, rep.preset);
  if (rep.preset === 'custom') {
    html += '<div class="rp-rep-row"><span>매</span>'
      + '<input type="text" inputmode="numeric" class="field-input rp-rep-num" id="rp-rep-n" value="' + rep.n + '" oninput="rpRepField(\'n\',this)" onfocus="try{this.select()}catch(e){}">'
      + sel('rp-rep-unit', 'rpRepUnit(this.value)', [['day', '일'], ['week', '주'], ['month', '개월'], ['year', '년']], rep.unit)
      + '<span>마다</span></div>';
    if (rep.unit === 'week') {
      var on = rep.days.length ? rep.days : [b.d];
      html += '<div class="rp-rep-days" role="group" aria-label="요일">'
        + [1, 2, 3, 4, 5, 6, 0].map(function (d) {
            return '<button type="button" class="rp-rep-day' + (on.indexOf(d) >= 0 ? ' is-on' : '') + '" onclick="rpRepDay(' + d + ')">' + RECUR_WD_KO[d] + '</button>';
          }).join('')
        + '</div>';
    } else if (rep.unit === 'month') {
      var mOpts = [['day', b.day + '일에'], ['nth', nthName + ' ' + wd + '에']];
      if (b.isLast && b.n === 4) mOpts.push(['last', '마지막 ' + wd + '에']);
      var mVal = mOpts.some(function (o) { return o[0] === rep.month; }) ? rep.month : 'day';
      html += '<div class="rp-rep-row">' + sel('rp-rep-month', 'rpRepMonth(this.value)', mOpts, mVal) + '</div>';
    }
  }
  if (rep.preset !== 'none') {
    html += '<div class="rp-rep-row"><span>종료</span>'
      + sel('rp-rep-end', 'rpRepEnd(this.value)', [['none', '없음'], ['date', '날짜'], ['count', '횟수']], rep.end);
    if (rep.end === 'date') html += '<input type="text" inputmode="numeric" class="field-input rp-dtinput rp-rep-until" id="rp-rep-until" placeholder="YYYY-MM-DD" value="' + rep.until + '" oninput="rpDtInput(this);rpRepField(\'until\',this)">';
    if (rep.end === 'count') html += '<input type="text" inputmode="numeric" class="field-input rp-rep-num" id="rp-rep-count" placeholder="10" value="' + rep.count + '" oninput="rpRepField(\'count\',this)"><span>회</span>';
    html += '</div>';
  }
  el.innerHTML = html;
}
function rpRepPick(v) {
  var rep = rpState.rep;
  // 맞춤을 처음 열 때는 고르던 보기에서 이어 간다
  if (v === 'custom' && rep.preset !== 'custom') {
    var rule = recurRepBuild(Object.assign({}, rep, { end: 'none' }), rpRepBase()).rule;
    if (rule) {
      var from = recurRepFromRule(rule, rpRepBase() || recurKey(Math.floor(Date.now() / 86400000)));
      rep.n = from.n; rep.unit = from.unit; rep.days = from.days; rep.month = from.month;
    } else {
      rep.n = 1; rep.unit = 'week'; rep.days = [];
    }
  }
  rep.preset = v;
  rpState.dirty = true;
  rpRepRender();
}
function rpRepUnit(v) { rpState.rep.unit = v; rpState.rep.days = []; rpState.dirty = true; rpRepRender(); }
function rpRepMonth(v) { rpState.rep.month = v; rpState.dirty = true; }
function rpRepEnd(v) { rpState.rep.end = v; rpState.dirty = true; rpRepRender(); }
function rpRepField(k, el) {
  el.style.outline = '';
  if (k !== 'until') el.value = el.value.replace(/\D/g, '').slice(0, 3);
  rpState.rep[k] = el.value;
  rpState.dirty = true;
}
function rpRepDay(d) {
  var rep = rpState.rep, base = rpRepBase() || recurKey(Math.floor(Date.now() / 86400000));
  var on = rep.days.length ? rep.days.slice() : [recurNthOf(base).d];
  var i = on.indexOf(d);
  if (i >= 0) { if (on.length > 1) on.splice(i, 1); }   // 하나는 남아야 한다
  else on.push(d);
  rep.days = on;
  rpState.dirty = true;
  rpRepRender();
}
