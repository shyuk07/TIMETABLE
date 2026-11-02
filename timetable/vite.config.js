import { defineConfig } from "vite";

// base "./" → 어떤 하위 경로(GitHub Pages 등)에 올려도 동작한다
export default defineConfig({
  base: "./",
  build: { target: "es2019", sourcemap: false },
  test: { environment: "jsdom", include: ["tests/**/*.test.js"] },
});
