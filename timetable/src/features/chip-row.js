// 일정 시트의 카테고리 칩. 칩을 0.35초 이상 누르면 삭제 배지(×)가 나타난다 (기본 카테고리는 삭제 불가).

import { state, bus, isDefaultCategory } from "../state/store.js";
import { deleteCategory } from "../state/actions.js";
import { $ } from "../lib/dom.js";
import { showToast } from "../lib/toast.js";
import { openCategorySheet } from "./category-sheet.js";

const LONGPRESS_MS = 350;
const LONGPRESS_MOVE_TOLERANCE = 8;

const chipRow = $("chipRow");
let selectedId = null;
let armedChip = null;
let armedDocHandler = null;

export function getSelectedCategoryId() {
  return selectedId;
}

function defaultSelection() {
  const study = state.categories.find((c) => c.defaultKey === "study");
  return (study || state.categories[0] || {}).id || null;
}

export function setChip(id) {
  selectedId = id;
  Array.prototype.forEach.call(chipRow.children, (c) => {
    c.dataset.active = c.dataset.cat === id ? "true" : "false";
  });
}

export function resetChipSelection() {
  setChip(defaultSelection());
}

function disarmChipDelete() {
  if (armedChip) {
    armedChip.classList.remove("delete-armed");
    const badge = armedChip.querySelector(".chip-delete-badge");
    if (badge) badge.remove();
    armedChip = null;
  }
  if (armedDocHandler) {
    document.removeEventListener("pointerdown", armedDocHandler, true);
    armedDocHandler = null;
  }
}

async function removeCat(cat) {
  try {
    await deleteCategory(cat.id); // 일정은 '기타'로 옮겨진다
    showToast("카테고리를 삭제했어요");
  } catch (err) {
    showToast(err.message || "삭제하지 못했어요");
  }
}

function armChipDelete(chip, cat) {
  disarmChipDelete();
  armedChip = chip;
  chip.classList.add("delete-armed");
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "chip-delete-badge";
  badge.setAttribute("aria-label", `${cat.name} 삭제`);
  badge.textContent = "×";
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    removeCat(cat);
  });
  chip.appendChild(badge);
  armedDocHandler = (e) => {
    if (!chip.contains(e.target)) disarmChipDelete();
  };
  setTimeout(() => document.addEventListener("pointerdown", armedDocHandler, true), 0);
}

function attachChipLongPress(chip, cat) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  chip.addEventListener("contextmenu", (e) => e.preventDefault());
  chip.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      chip.dataset.longpress = "1"; // 뒤따라오는 click이 '선택'으로 처리되지 않게 막는 표식
      if (isDefaultCategory(cat)) {
        showToast("기본 카테고리는 삭제할 수 없어요");
        return;
      }
      armChipDelete(chip, cat);
    }, LONGPRESS_MS);
  });
  chip.addEventListener("pointermove", (e) => {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > LONGPRESS_MOVE_TOLERANCE) clear();
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((t) => chip.addEventListener(t, clear));
}

export function renderChipRow() {
  disarmChipDelete();
  if (!state.categories.some((c) => c.id === selectedId)) selectedId = defaultSelection();
  chipRow.innerHTML = "";
  state.categories.forEach((cat) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.dataset.cat = cat.id;
    chip.textContent = cat.name;
    chip.style.setProperty("--chip-bg", cat.bg);
    chip.style.setProperty("--chip-ink", cat.ink);
    chip.dataset.active = cat.id === selectedId ? "true" : "false";
    chipRow.appendChild(chip);
    attachChipLongPress(chip, cat);
  });
}

export function initChipRow() {
  chipRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (chip.dataset.longpress === "1") {
      delete chip.dataset.longpress;
      return;
    }
    if (chip.classList.contains("delete-armed")) return;
    setChip(chip.dataset.cat);
  });
  $("addCatBtn").addEventListener("click", () =>
    openCategorySheet({
      onDone: (created) => {
        renderChipRow();
        setChip(created.id);
      },
    })
  );
  bus.on("categories", renderChipRow);
}
