import type {
    AuthSessionResponse,
    DeleteAccountRequest,
    LocalProfileResponse,
    LoginRequest,
    SignupRequest,
    UpdateProfileRequest
} from "./auth-types";

export interface ErrorMessage {
    message?: string;
}

export interface ApiResult<T> {
    data?: T;
    errorMessage?: string;
    status?: number;
}

export interface EventSourceLike {
    addEventListener(type: string, listener: (event: Event) => void): void;
    close(): void;
    onopen: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
}

export type FetchLike = typeof fetch;
export type EventSourceFactory = (url: string) => EventSourceLike;

export declare const defaultCommandErrorMessage: string;
export declare const getOAuthLoginUrl: (provider: string, nextPath?: string) => string;
export declare const parseJson: <T>(response: { json(): Promise<unknown> }) => Promise<T>;
export declare const parseErrorMessage: (response: { json(): Promise<unknown> }) => Promise<string>;
export declare const fetchAuthSession: (fetchImpl?: FetchLike) => Promise<AuthSessionResponse>;
export declare const loginAsGuest: (fetchImpl?: FetchLike) => Promise<AuthSessionResponse>;
export declare const signupRequest: (
    request: SignupRequest,
    fetchImpl?: FetchLike
) => Promise<AuthSessionResponse>;
export declare const loginRequest: (
    request: LoginRequest,
    fetchImpl?: FetchLike
) => Promise<AuthSessionResponse>;
export declare const logoutRequest: (fetchImpl?: FetchLike) => Promise<void>;
export declare const fetchLocalProfile: (fetchImpl?: FetchLike) => Promise<LocalProfileResponse>;
export declare const updateLocalProfileRequest: (
    request: UpdateProfileRequest,
    fetchImpl?: FetchLike
) => Promise<AuthSessionResponse>;
export declare const deleteLocalAccountRequest: (
    request: DeleteAccountRequest,
    fetchImpl?: FetchLike
) => Promise<void>;
