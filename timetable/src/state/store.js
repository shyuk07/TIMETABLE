// 앱 전체가 공유하는 상태. 화면 모듈은 여기 값을 읽고, 변화는 bus 이벤트로 받는다.
//   bus 이벤트: "categories" | "items" | "settings" | "viewdate" | "goals"

import { createEmitter } from "../lib/emitter.js";
import { startOfDay, toDateStr } from "../lib/dates.js";
import { DEFAULT_SETTINGS } from "../data/defaults.js";

export const bus = createEmitter();

const today = startOfDay(new Date());

export const state = {
  repo: null,
  user: null,
  profile: { displayName: "", onboarded: false },
  settings: { ...DEFAULT_SETTINGS },
  categories: [], // [{id,name,bg,ink,sortOrder,defaultKey}] sortOrder 순
  goals: [], // [{categoryId, period, targetMinutes}]
  items: [], // 지금 보고 있는 날짜의 일정
  viewDate: today,
  viewDateStr: toDateStr(today),
};

const FALLBACK = { id: "", name: "기타", bg: "#8fa9c9", ink: "#101a26", sortOrder: 999, defaultKey: "other" };

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || state.categories.find((c) => c.defaultKey === "other") || FALLBACK;
}

export function isDefaultCategory(c) {
  return !!(c && c.defaultKey);
}

export function weeklyGoalMinutes(categoryId) {
  const g = state.goals.find((x) => x.categoryId === categoryId && x.period === "week");
  return g ? g.targetMinutes : 0;
}
