// 카테고리 추가/편집 시트. 일정 시트의 '+', 설정 화면의 '카테고리 추가/편집', 온보딩이 함께 쓴다.

import { state, weeklyGoalMinutes } from "../state/store.js";
import { createCategory, updateCategory, setWeeklyGoal } from "../state/actions.js";
import { CAT_SWATCHES, CATEGORY_NAME_MAX } from "../data/defaults.js";
import { $ } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";

let initialized = false;
let els = {};
let swatches = [];
let selectedIdx = 0;
let current = null; // { category|null, onDone }
let saving = false;

function renderSwatches() {
  els.row.innerHTML = "";
  swatches.forEach((sw, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-swatch";
    btn.style.background = sw.bg;
    btn.setAttribute("aria-label", `색상 ${i + 1}`);
    btn.dataset.active = i === selectedIdx ? "true" : "false";
    btn.addEventListener("click", () => {
      selectedIdx = i;
      Array.prototype.forEach.call(els.row.children, (c, ci) => (c.dataset.active = ci === i ? "true" : "false"));
    });
    els.row.appendChild(btn);
  });
}

function showError(msg) {
  els.error.textContent = msg || "";
  els.error.hidden = !msg;
}

function close() {
  els.backdrop.hidden = true;
  els.sheet.hidden = true;
  current = null;
}

async function save() {
  if (saving || !current) return;
  const name = els.name.value.trim();
  if (!name) {
    showError("이름을 입력해 주세요");
    els.name.focus({ preventScroll: true });
    return;
  }
  const sw = swatches[selectedIdx];
  const { category, onDone } = current;
  saving = true;
  try {
    let result;
    if (category) {
      await updateCategory(category.id, { name, bg: sw.bg, ink: sw.ink });
      const raw = els.goal.value.trim().replace(",", ".");
      if (raw !== "" && !(parseFloat(raw) >= 0)) {
        showError("목표는 숫자(시간)로 입력해 주세요");
        saving = false;
        return;
      }
      const minutes = raw === "" ? 0 : Math.min(Math.round(parseFloat(raw) * 60), 168 * 60);
      if (minutes !== weeklyGoalMinutes(category.id)) await setWeeklyGoal(category.id, minutes);
      result = state.categories.find((c) => c.id === category.id);
    } else {
      result = await createCategory({ name, bg: sw.bg, ink: sw.ink });
    }
    close();
    if (onDone) onDone(result);
  } catch (err) {
    showError(err.message || "저장하지 못했어요");
  } finally {
    saving = false;
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  els = {
    backdrop: $("catBackdrop"),
    sheet: $("catSheet"),
    title: $("catSheetTitle"),
    name: $("catNameInput"),
    row: $("catSwatchRow"),
    goalField: $("catGoalField"),
    goal: $("catGoalInput"),
    error: $("catError"),
    save: $("catSaveBtn"),
  };
  els.name.maxLength = CATEGORY_NAME_MAX;
  $("catCancelBtn").addEventListener("click", close);
  els.backdrop.addEventListener("click", close);
  els.save.addEventListener("click", save);
  els.name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  els.name.addEventListener("input", () => showError(""));
}

/** category가 있으면 편집, 없으면 새로 만들기. 저장되면 onDone(카테고리) 호출 */
export function openCategorySheet({ category = null, onDone } = {}) {
  init();
  current = { category, onDone };
  swatches = CAT_SWATCHES.slice();
  selectedIdx = 0;
  if (category) {
    const found = swatches.findIndex((s) => s.bg.toLowerCase() === category.bg.toLowerCase());
    if (found >= 0) selectedIdx = found;
    else {
      swatches.unshift({ bg: category.bg, ink: category.ink }); // 지금 색을 맨 앞에 (기본 카테고리 색 유지용)
      selectedIdx = 0;
    }
  }
  els.title.textContent = category ? "카테고리 편집" : "새 카테고리";
  els.save.textContent = category ? "저장" : "추가";
  els.name.value = category ? category.name : "";
  els.goalField.hidden = !category;
  if (category) {
    const m = weeklyGoalMinutes(category.id);
    els.goal.value = m ? String(Math.round((m / 60) * 10) / 10) : "";
  }
  showError("");
  renderSwatches();
  els.backdrop.hidden = false;
  els.sheet.hidden = false;
  els.name.focus({ preventScroll: true });
}

export function toastCategoryError(err) {
  showToast(err.message || "처리하지 못했어요");
}
