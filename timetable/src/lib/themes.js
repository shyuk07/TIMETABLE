// 배경 테마 프리셋. 실제 색 값은 src/styles/themes.css (id 와 같아야 함),
// 여기에는 선택 UI용 미리보기 색(themes.css 의 --bg 와 같은 단색)만 둔다.
// DB(user_settings.theme)는 id 형식만 검사하므로 테마를 추가해도 마이그레이션이 필요 없다.

export const THEMES = [
  { id: "black", name: "블랙", color: "#101010" },
  { id: "white", name: "화이트", color: "#e2e2e2" },
  { id: "ember", name: "브라운", color: "#2e221b" },
  { id: "cream", name: "네이비", color: "#fff6e9" },
  { id: "green-gold", name: "그린", color: "#e0ecde" },
  { id: "neo-pastel", name: "파스텔", color: "#f0e1e8" },
  // 새 테마는 여기에 { id, name, color } 를 추가하고, src/styles/themes.css 에 같은 id 의 블록을 만든다.
];
export const DEFAULT_THEME = "black";
const IDS = THEMES.map((t) => t.id);
const CACHE_KEY = "timetable:theme";

export function isTheme(id) {
  return IDS.includes(id);
}

/** 화면에 테마를 적용한다. (저장은 settings 가 담당 — 여기 localStorage 는 첫 화면 깜빡임 방지용 캐시일 뿐) */
export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme.id);
  try {
    if (theme.id === DEFAULT_THEME) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, theme.id);
  } catch (e) {
    /* 저장소 사용 불가 — 무시 */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.color);
}

/** 선택할 테마가 2개 이상일 때만 쓰는 UI */
export function hasThemeChoice() {
  return THEMES.length > 1;
}

/** 테마 선택 버튼들의 HTML (설정 · 온보딩 공용). 클릭은 [data-theme-id] 로 받는다. */
export function themePickerHtml(selectedId) {
  if (THEMES.length < 2) return ""; // 테마가 하나뿐이면 선택 UI를 보여 주지 않는다
  return `<div class="theme-grid" role="radiogroup" aria-label="배경 테마">${THEMES.map(
    (t) => `
    <button type="button" class="theme-opt" role="radio" aria-checked="${t.id === selectedId}" data-theme-id="${t.id}">
      <span class="theme-swatch" style="--swatch:${t.color};background:var(--swatch)"></span>
      <span class="theme-name">${t.name}</span>
    </button>`
  ).join("")}</div>`;
}
