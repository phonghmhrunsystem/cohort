import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  // testTimeout is well above what any single test needs; the suite runs its files in
  // parallel, and on a loaded machine the 5s default fails tests that are merely waiting.
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", env: { TZ: "UTC" }, testTimeout: 20000 },
});
