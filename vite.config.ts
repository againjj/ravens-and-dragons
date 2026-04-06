import { defineConfig } from "vite";

export default defineConfig({
    root: "src/main/frontend",
    build: {
        outDir: "../../../build/generated/frontend",
        emptyOutDir: false
    },
    test: {
        environment: "jsdom",
        globals: false,
        include: ["../../test/frontend/**/*.{test,spec}.{ts,tsx}"],
        setupFiles: "../../test/frontend/setup-tests.ts"
    }
});
