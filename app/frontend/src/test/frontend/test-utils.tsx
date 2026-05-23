import type { ReactElement } from "react";
import { Provider } from "react-redux";
import { render } from "@testing-library/react";

import { createAppStore, type AppStore, type PreloadedAppState } from "../../main/frontend/app/store.js";

interface RenderWithStoreOptions {
    preloadedState?: PreloadedAppState;
    store?: AppStore;
}

export const renderWithStore = (
    ui: ReactElement,
    { preloadedState, store = createAppStore(preloadedState) }: RenderWithStoreOptions = {}
) => ({
    store,
    ...render(<Provider store={store}>{ui}</Provider>)
});
