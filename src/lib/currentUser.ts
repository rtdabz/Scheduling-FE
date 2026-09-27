import api from './api';
import type { StoredUser } from './storedUser';

/**
 * GET /me, shared by everything in the signed-in shell.
 *
 * The layout, the sidebar, the profile menu and every capability-gated route
 * each fetched /me on mount, so one navigation sent four or more identical
 * requests. Callers now share the request in flight and reuse its answer for a
 * short while; the server still enforces every permission on every request.
 */
const FRESH_FOR_MS = 30_000;

let inFlight: Promise<StoredUser> | null = null;
let last: { token: string; user: StoredUser; at: number } | null = null;

const currentToken = (): string => {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

/**
 * The signed-in user, refreshed at most every 30 seconds unless `force` is set.
 * `T` is the caller's view of the /me payload; screens read different fields.
 */
export const fetchCurrentUser = <T = StoredUser>(options: { force?: boolean } = {}): Promise<T> => {
  const token = currentToken();
  // Keyed by the session token, so an answer never outlives the sign-in it was for.
  if (!options.force && last && last.token === token && Date.now() - last.at < FRESH_FOR_MS) {
    return Promise.resolve(last.user as T);
  }

  if (!inFlight) {
    inFlight = api.get<StoredUser>('/me')
      .then(({ data }) => {
        try {
          const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
          storage.setItem('user', JSON.stringify(data));
        } catch {
          // Storage unavailable; the in-memory answer still serves this session.
        }
        last = { token, user: data, at: Date.now() };
        return data;
      })
      .finally(() => { inFlight = null; });
  }

  return inFlight as Promise<T>;
};

/** Drops the remembered answer, e.g. after the user edits their own profile. */
export const forgetCurrentUser = (): void => {
  last = null;
};
