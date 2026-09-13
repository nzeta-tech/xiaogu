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
    const request = fetch(apiPath("/api/auth/me"), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          if (currentUserRequest === request) currentUserRequest = null;
          return null;
        }
        const payload = await response.json() as { user?: CurrentUser | null };
        const user = payload.user ?? null;
        if (!user && currentUserRequest === request) currentUserRequest = null;
        return user;
      })
      .catch((error) => {
        if (currentUserRequest === request) currentUserRequest = null;
        throw error;
      });
    currentUserRequest = request;
  }
  return currentUserRequest;
}

export function clearCurrentUserCache() {
  currentUserRequest = null;
}
