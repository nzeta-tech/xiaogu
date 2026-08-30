import { apiPath } from "./url.ts";

export type CurrentUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
};

let currentUserRequest: Promise<CurrentUser | null> | null = null;

export function getCurrentUser() {
  if (!currentUserRequest) {
    currentUserRequest = fetch(apiPath("/api/auth/me"), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = await response.json() as { user?: CurrentUser | null };
        return payload.user ?? null;
      })
      .catch((error) => {
        currentUserRequest = null;
        throw error;
      });
  }
  return currentUserRequest;
}

export function clearCurrentUserCache() {
  currentUserRequest = null;
}
