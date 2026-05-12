import { defineConfig } from "vite";

export default defineConfig({
    root: "src/main/frontend",
    server: {
        fs: {
            allow: ["../../.."]
        }
    },
    resolve: {
        dedupe: ["react", "react-dom"]
    },
    build: {
        outDir: "../../../build/generated/frontend",
        emptyOutDir: true
    },
    test: {
        environment: "jsdom",
        globals: false,
        include: ["../../test/frontend/**/*.{test,spec}.{ts,tsx}"],
        setupFiles: "../../test/frontend/setup-tests.ts"
    }
});
