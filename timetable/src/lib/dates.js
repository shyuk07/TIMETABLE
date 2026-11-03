// 날짜/시간 유틸. "지금"이 필요한 함수는 호출 시점의 시각을 쓴다
// (앱을 켜 둔 채 자정이 지나도 '오늘'이 어긋나지 않도록).

export const DAY_START = 0;
export const DAY_END = 24 * 60;
export const PX_PER_MIN = 1.6;
export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr() {
  return toDateStr(new Date());
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** weekStart: 0=일요일 시작, 1=월요일 시작. d가 속한 주의 첫날을 돌려준다. */
export function startOfWeek(d, weekStart = 0) {
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(startOfDay(d), -diff);
}

/** 요일 라벨을 주 시작 요일에 맞춰 돌려준다. 예) weekStart=1 → 월 화 수 목 금 토 일 */
export function weekdayLabels(weekStart = 0) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY[(i + weekStart) % 7]);
}

export function fmtDateLabel(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`;
}

export function minsNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:MM" 또는 "HH:MM:SS" → 분 */
export function toMin(hhmm) {
  const p = hhmm.split(":");
  return +p[0] * 60 + +p[1];
}

export function fmtHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/** Postgres time("09:00:00") → 앱에서 쓰는 "09:00" */
export function normTime(t) {
  return typeof t === "string" ? t.slice(0, 5) : t;
}

export function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  if (!mins) return "0분";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/** 두 날짜("YYYY-MM-DD") 사이의 일수: to − from (서머타임과 무관하게 달력 날짜로 센다) */
export function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * 디데이 표시: 남았으면 "D-3", 당일 "D-Day", 지났으면 "D+n".
 * 지난 날은 한국식 기념일 계산처럼 그날을 1일째로 센다 (예: 9/28 → 11/3 은 37일째라 D+37, 다음 날은 D+2부터).
 */
export function ddayLabel(dateStr, today = todayStr()) {
  const n = daysBetween(today, dateStr);
  if (n > 0) return `D-${n}`;
  if (n === 0) return "D-Day";
  return `D+${-n + 1}`;
}
