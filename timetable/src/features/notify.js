// 일정 시작 알림 (best-effort).
// 브라우저 알림은 서버 푸시 없이는 '앱이 열려 있는 동안'에만 동작한다.
// 시스템 알림이 막힌 환경(임베드 화면, 권한 거부)에서는 앱 안 배너로 대신한다.
// 앱을 닫아도 오는 알림은 네이티브 앱(Capacitor) 로컬 알림으로 확장해야 한다 — README 참고.

import { state, bus, categoryById } from "../state/store.js";
import { toMin, todayStr } from "../lib/dates.js";

let timers = [];
// 이미 보낸 알림 (날짜|id|시작|알림시점). 다시 예약할 때 같은 알림이 또 뜨지 않게 한다
const fired = new Set();

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export function systemNotificationsGranted() {
  return notificationsSupported() && Notification.permission === "granted";
}

/**
 * 알림을 켜려 할 때 호출. 시스템(브라우저) 알림 권한을 요청하되, 막혀 있어도 실패로 두지 않는다.
 * 권한이 없으면 앱 안 알림(화면 위쪽 배너)으로 대신 알려 준다.
 * 반환: { system: boolean } — 시스템 알림이 가능한지
 */
export async function enableNotifications() {
  if (!notificationsSupported()) return { system: false };
  if (Notification.permission === "granted") return { system: true };
  if (Notification.permission === "denied") return { system: false };
  try {
    return { system: (await Notification.requestPermission()) === "granted" };
  } catch (e) {
    return { system: false }; // 임베드된 화면 등에서 요청 자체가 막힌 경우
  }
}

export const IN_APP_NOTICE = "이 환경에서는 시스템 알림이 막혀 있어, 앱이 열려 있는 동안 화면 위쪽 알림으로 알려 드려요.";

let alertEl = null;
let alertTimer = null;
function showInAppAlert(title, body) {
  if (!alertEl) {
    alertEl = document.createElement("div");
    alertEl.className = "inapp-alert";
    alertEl.setAttribute("role", "alert");
    alertEl.innerHTML =
      '<div class="inapp-alert-text"><b></b><span></span></div><button type="button" class="inapp-alert-ok">확인</button>';
    alertEl.querySelector("button").addEventListener("click", () => (alertEl.hidden = true));
    document.body.appendChild(alertEl);
  }
  alertEl.querySelector("b").textContent = title;
  alertEl.querySelector("span").textContent = body;
  alertEl.hidden = false;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => (alertEl.hidden = true), 20000);
}

function notify(title, body, tag) {
  if (systemNotificationsGranted()) {
    try {
      new Notification(title, { body, tag });
      return;
    } catch (e) {
      /* 일부 모바일 브라우저는 생성이 막혀 있다 → 아래 앱 안 알림으로 */
    }
  }
  showInAppAlert(title, body);
}

function fire(item, before) {
  const cat = categoryById(item.categoryId);
  const body = before > 0 ? `${before}분 뒤 시작해요 · ${item.start} ${cat.name}` : `지금 시작해요 · ${item.start} ${cat.name}`;
  notify(item.title, body, item.id);
}

// ---- 디데이·메모 당일 알림: 그날이 되자마자(00:00, 자정이 지나 "daychange" 로 다시 예약될 때).
//      그때 앱이 닫혀 있었으면 그날 처음 열 때 한 번 ----
const DAY_NOTICE_KEY = "timetable:day-notices";
// 새로고침해도 같은 날 같은 알림이 또 뜨지 않도록, 보낸 기록을 오늘 것만 저장해 둔다
function loadDayNotices(day) {
  try {
    const list = JSON.parse(localStorage.getItem(DAY_NOTICE_KEY) || "[]");
    return new Set(list.filter((k) => k.startsWith(day + "|")));
  } catch (e) {
    return new Set();
  }
}
function markDayNotice(key, day) {
  const set = loadDayNotices(day);
  set.add(key);
  try {
    localStorage.setItem(DAY_NOTICE_KEY, JSON.stringify([...set]));
  } catch (e) {
    /* 저장소 사용 불가 — 이번 방문 동안은 fired 로 막힌다 */
  }
}

function sendDayNotices(day) {
  const done = loadDayNotices(day);
  const notices = [
    ...state.ddays.filter((d) => d.date === day).map((d) => ({ key: `${day}|dday|${d.id}`, title: d.title, body: "오늘이 디데이예요 · D-Day" })),
    ...state.memos.filter((m) => m.date === day).map((m) => ({ key: `${day}|memo|${m.id}`, title: "오늘의 메모", body: m.title })),
  ];
  notices.forEach((n) => {
    if (done.has(n.key) || fired.has(n.key)) return;
    fired.add(n.key);
    markDayNotice(n.key, day);
    notify(n.title, n.body, n.key);
  });
}

export async function rescheduleNotifications() {
  timers.forEach(clearTimeout);
  timers = [];
  const { notifyEnabled, notifyMinutesBefore } = state.settings;
  if (!notifyEnabled) return;

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const now = Date.now();
  const day = todayStr();
  sendDayNotices(day);

  let items = [];
  try {
    items = await state.repo.schedules.listByDate(day);
  } catch (e) {
    return;
  }
  items.forEach((it) => {
    const key = `${day}|${it.id}|${it.start}|${notifyMinutesBefore}`;
    if (fired.has(key)) return;
    const startAt = midnight.getTime() + toMin(it.start) * 60000;
    const at = startAt - notifyMinutesBefore * 60000;
    const send = (before) => {
      fired.add(key);
      fire(it, before);
    };
    if (at > now) {
      timers.push(setTimeout(() => send(notifyMinutesBefore), at - now));
    } else if (startAt > now) {
      // 알림 시각은 지났지만 아직 시작 전 (예: 5분 뒤 시작하는 일정을 방금 추가) → 남은 시간으로 바로 알린다
      send(Math.ceil((startAt - now) / 60000));
    }
    // 이미 시작한 일정은 알리지 않는다
  });
}

export function initNotifications() {
  let debounce = null;
  const later = () => {
    clearTimeout(debounce);
    debounce = setTimeout(rescheduleNotifications, 300);
  };
  bus.on("items", later);
  bus.on("settings", later);
  bus.on("ddays", later);
  bus.on("memos", later);
  bus.on("daychange", later); // 자정이 지나면 새 날의 일정으로 다시 예약
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") later();
  });
  later();
}
