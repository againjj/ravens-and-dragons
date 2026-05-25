import { type ReactNode, useRef } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import { ginRummyReducer } from "./gin-rummy-slice";

export const createGinRummyStore = () => configureStore({
    reducer: {
        ginRummy: ginRummyReducer
    }
});

export type GinRummyStore = ReturnType<typeof createGinRummyStore>;
export type GinRummyRootState = ReturnType<GinRummyStore["getState"]>;
export type GinRummyDispatch = GinRummyStore["dispatch"];

export const GinRummyReduxProvider = ({ children }: { children: ReactNode }) => {
    const storeRef = useRef<GinRummyStore | null>(null);
    if (!storeRef.current) {
        storeRef.current = createGinRummyStore();
    }
    return <Provider store={storeRef.current}>{children}</Provider>;
};

export const useGinRummyDispatch = () => useDispatch<GinRummyDispatch>();
export const useGinRummySelector: TypedUseSelectorHook<GinRummyRootState> = useSelector;
