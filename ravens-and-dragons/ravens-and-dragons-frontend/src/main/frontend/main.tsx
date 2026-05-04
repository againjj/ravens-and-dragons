import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import { App } from "./App.js";
import { store } from "./app/store.js";

const container = document.querySelector<HTMLDivElement>("#root");

if (!container) {
    throw new Error("Root element is missing.");
}

createRoot(container).render(
    <StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </StrictMode>
);
