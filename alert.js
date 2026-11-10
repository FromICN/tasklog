// ============================================
//  🔔 알림 (Task)
//
//  alertMin = 기준 시각보다 몇 분 앞에 울릴까. 칸이 없으면 안 울린다.
//  기준 시각 = Task 가 달력에 놓이는 시각 (calpage.js _calTaskPlace). 시간이 없으면 그날 오전 9시.
//  폰은 앱을 꺼도 울려야 하므로 안드로이드(Schedule.java · TaskAlarms.java)가 맡고, 웹은 탭이 열려 있을 때만 울린다.
//  ⚠️ 기준 시각 규칙을 바꾸면 Schedule.java baseIso 도 같이 고칠 것.
//
//  (2026-11-10) 예전에는 recur.js 안에 있었다. 일정·반복을 없애면서 알림만 이 파일로 옮겼다.
// ============================================

var ALERT_TIMED = [[0, '정시'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전'], [60, '1시간 전'], [1440, '1일 전']];
var ALERT_ALLDAY = [[0, '당일 오전 9시'], [1440, '전날 오전 9시']];
var ALERT_FIRED_KEY = 'alert-fired';     // 이 기기에서 이미 울린 것. 동기화하지 않는다.
var ALERT_GRACE_MS = 5 * 60 * 1000;      // 앱을 막 열었을 때 이만큼 지난 알림까지는 울린다

function _aPad(n) { return (n < 10 ? '0' : '') + n; }
// 문자열의 날짜 'YYYY-MM-DD' (이 기기 기준)
function _aLocalKey(iso) {
  var s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + _aPad(d.getMonth() + 1) + '-' + _aPad(d.getDate());
}

function alertBase(t) {
  var s = t.startDate, e = t.dueDateTime;
  var same = s && e && _aLocalKey(s) === _aLocalKey(e);
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
// fromMs 초과 ~ toMs 이하에 울리면 그 알림, 아니면 null
function alertFire(t, fromMs, toMs) {
  if (!alertHas(t) || t.completed) return null;
  var b = alertBase(t);
  if (!b) return null;
  var min = +t.alertMin, day = _aLocalKey(b.iso);
  if (!day) return null;
  var at = new Date(b.timed ? b.iso : (day + 'T09:00:00')).getTime() - min * 60000;
  if (!(at > fromMs && at <= toMs)) return null;
  // 키 모양은 Schedule.java alerts() 와 같다 — 'id@날짜@분'
  return { key: t.id + '@' + day + '@' + min, at: at, day: day, iso: b.iso, timed: b.timed };
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
    var a = alertFire(t, from, now);
    if (!a || fired[a.key]) return;
    fired[a.key] = a.at;
    changed = true;
    var when = a.timed ? (function (d) { return _aPad(d.getHours()) + ':' + _aPad(d.getMinutes()); })(new Date(a.iso)) : a.day.slice(5).replace('-', '/');
    try {
      var n = new Notification(String(t.text || '').replace(/^\[\d{6}\]\s?/, ''), { body: when + (t.location ? ' · ' + t.location : ''), tag: a.key });
      n.onclick = function () {
        window.focus();
        if (typeof navToMenu === 'function') navToMenu('calendar');
        if (typeof calGoDate === 'function') calGoDate(a.day, 'day');
        n.close();
      };
    } catch (e) {}
  });
  if (changed) {
    Object.keys(fired).forEach(function (k) { if (now - fired[k] > 2 * 86400000) delete fired[k]; });
    try { localStorage.setItem(ALERT_FIRED_KEY, JSON.stringify(fired)); } catch (e) {}
  }
}
// 입력 폼의 Alert 칸. 종일 여부에 따라 보기가 달라진다.
function rpAlertSync() {
  var el = document.getElementById('rp-alert');
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
