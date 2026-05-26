export type AuthType = "guest" | "local" | "oauth";

export interface AuthUserSummary {
    id: string;
    displayName: string;
    authType: AuthType;
}

export interface AuthSessionResponse {
    authenticated: boolean;
    user: AuthUserSummary | null;
    oauthProviders: string[];
}

export interface LocalProfileResponse {
    id: string;
    username: string | null;
    displayName: string;
    authType: AuthType;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface SignupRequest {
    username: string;
    password: string;
    displayName: string;
    email?: string;
}

export interface UpdateProfileRequest {
    displayName: string;
}

export interface DeleteAccountRequest {
    password: string;
}
