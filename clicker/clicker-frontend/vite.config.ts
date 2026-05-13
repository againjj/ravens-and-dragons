import { defineConfig } from "vite";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: false,
        include: ["src/test/frontend/**/*.{test,spec}.{ts,tsx}"]
    }
});
