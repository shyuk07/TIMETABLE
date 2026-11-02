// 상태를 바꾸는 모든 동작은 여기를 지나간다: repo 호출 → state 갱신 → bus 알림.
// 화면 모듈은 repo를 직접 부르지 않는다.

import { state, bus } from "./store.js";
import { startOfDay, toDateStr } from "../lib/dates.js";

export async function loadCore() {
  const { repo } = state;
  const [profile, settings, categories, goals] = await Promise.all([repo.profile.get(), repo.settings.get(), repo.categories.list(), repo.goals.list()]);
  state.profile = profile;
  state.settings = settings;
  state.categories = categories;
  state.goals = goals;
  bus.emit("settings");
  bus.emit("categories");
}

let itemsToken = 0;
export async function reloadItems() {
  const token = ++itemsToken;
  const date = state.viewDateStr;
  const items = await state.repo.schedules.listByDate(date);
  if (token !== itemsToken) return; // 그 사이 다른 날짜로 이동했으면 버린다
  state.items = items;
  bus.emit("items");
}

export async function setViewDate(d) {
  state.viewDate = startOfDay(d);
  state.viewDateStr = toDateStr(state.viewDate);
  state.items = [];
  bus.emit("viewdate");
  await reloadItems();
}

// ---- 일정 ----
export async function saveSchedule({ id, title, start, end, categoryId }) {
  const payload = { date: state.viewDateStr, title, start, end, categoryId };
  if (id) await state.repo.schedules.update(id, payload);
  else await state.repo.schedules.create(payload);
  await reloadItems();
}

export async function removeSchedule(id) {
  await state.repo.schedules.remove(id);
  await reloadItems();
}

export async function removeAllSchedules() {
  await state.repo.schedules.removeAll();
  await reloadItems();
}

// ---- 카테고리 ----
async function reloadCategories() {
  state.categories = await state.repo.categories.list();
  state.goals = await state.repo.goals.list();
  bus.emit("categories");
}

export async function createCategory({ name, bg, ink }) {
  const c = await state.repo.categories.create({ name, bg, ink });
  await reloadCategories();
  return c;
}

export async function updateCategory(id, patch) {
  await state.repo.categories.update(id, patch);
  await reloadCategories();
  bus.emit("items"); // 블록 색/이름 다시 그리기
}

export async function deleteCategory(id) {
  await state.repo.categories.remove(id); // 일정은 '기타'로 옮겨진다 (DB 트리거 / 로컬 repo 동일 규칙)
  await reloadCategories();
  await reloadItems();
}

export async function moveCategory(id, dir) {
  const ids = state.categories.map((c) => c.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await state.repo.categories.reorder(ids);
  await reloadCategories();
}

export async function setWeeklyGoal(categoryId, minutes) {
  await state.repo.goals.set(categoryId, "week", minutes);
  state.goals = await state.repo.goals.list();
  bus.emit("goals");
}

// ---- 설정 / 프로필 ----
export async function updateSettings(patch) {
  state.settings = await state.repo.settings.update(patch);
  bus.emit("settings");
}

export async function updateProfile(patch) {
  state.profile = await state.repo.profile.update(patch);
}
