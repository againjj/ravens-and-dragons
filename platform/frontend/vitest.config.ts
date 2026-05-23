import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/test/frontend/**/*.test.ts", "src/test/frontend/**/*.test.tsx"]
  }
});
