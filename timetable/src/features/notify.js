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

function fire(item, before) {
  const cat = categoryById(item.categoryId);
  const body = before > 0 ? `${before}분 뒤 시작해요 · ${item.start} ${cat.name}` : `지금 시작해요 · ${item.start} ${cat.name}`;
  if (systemNotificationsGranted()) {
    try {
      new Notification(item.title, { body, tag: item.id });
      return;
    } catch (e) {
      /* 일부 모바일 브라우저는 생성이 막혀 있다 → 아래 앱 안 알림으로 */
    }
  }
  showInAppAlert(item.title, body);
}

export async function rescheduleNotifications() {
  timers.forEach(clearTimeout);
  timers = [];
  const { notifyEnabled, notifyMinutesBefore } = state.settings;
  if (!notifyEnabled) return;

  let items = [];
  try {
    items = await state.repo.schedules.listByDate(todayStr());
  } catch (e) {
    return;
  }
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const now = Date.now();
  const day = todayStr();
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
  bus.on("daychange", later); // 자정이 지나면 새 날의 일정으로 다시 예약
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") later();
  });
  later();
}
