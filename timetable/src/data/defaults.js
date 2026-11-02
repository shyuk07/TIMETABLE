// 앱 전체가 공유하는 "처음 값". DB 마이그레이션(supabase/migrations)의 시드와 같은 값이어야 한다.

export const DEFAULT_CATEGORIES = [
  { defaultKey: "study", name: "공부", bg: "#e3a765", ink: "#2c1c0c" },
  { defaultKey: "break", name: "휴식", bg: "#96b78f", ink: "#16210f" },
  { defaultKey: "growth", name: "자기발전", bg: "#5fa8a3", ink: "#0d211f" },
  { defaultKey: "hobby", name: "취미", bg: "#b98fc4", ink: "#241627" },
  { defaultKey: "exercise", name: "운동", bg: "#cf6f56", ink: "#2a140c" },
  { defaultKey: "other", name: "기타", bg: "#8fa9c9", ink: "#101a26" },
];

// 새 카테고리를 만들 때 고를 수 있는 색
export const CAT_SWATCHES = [
  { bg: "#d98fa0", ink: "#1f1410" },
  { bg: "#e6c065", ink: "#1f1410" },
  { bg: "#7fc9a0", ink: "#1f1410" },
  { bg: "#7a86c9", ink: "#1f1410" },
  { bg: "#a5729c", ink: "#1f1410" },
  { bg: "#a8a35c", ink: "#1f1410" },
  { bg: "#c98a5c", ink: "#1f1410" },
  { bg: "#c96a6a", ink: "#1f1410" },
];

export const DEFAULT_SETTINGS = {
  weekStart: 0, // 0=일요일, 1=월요일
  notifyEnabled: false,
  notifyMinutesBefore: 10,
  theme: "ember", // 배경 테마 id (src/lib/themes.js)
};

export const NOTIFY_MINUTES_OPTIONS = [0, 5, 10, 15, 30, 60];
export const CATEGORY_NAME_MAX = 10;
