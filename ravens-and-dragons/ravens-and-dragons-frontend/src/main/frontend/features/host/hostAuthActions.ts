import { createAction } from "@reduxjs/toolkit";

import type { AuthSessionResponse } from "@ravensanddragons/platform-frontend/auth-types";

export const hostAuthSessionSet = createAction<AuthSessionResponse>("auth/authSessionSet");
