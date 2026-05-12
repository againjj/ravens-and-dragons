import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    root: "src/main/frontend",
    server: {
        fs: {
            allow: ["../../.."]
        }
    },
    resolve: {
        alias: [
            { find: /^react$/, replacement: fileURLToPath(new URL("./node_modules/react/index.js", import.meta.url)) },
            { find: /^react-dom$/, replacement: fileURLToPath(new URL("./node_modules/react-dom/index.js", import.meta.url)) },
            { find: /^react-redux$/, replacement: fileURLToPath(new URL("./node_modules/react-redux/dist/react-redux.mjs", import.meta.url)) }
        ],
        dedupe: ["react", "react-dom", "react-redux"]
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
