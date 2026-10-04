import api from './api';
import type { StoredUser } from './storedUser';

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

export const fetchCurrentUser = <T = StoredUser>(options: { force?: boolean } = {}): Promise<T> => {
  const token = currentToken();
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
        }
        last = { token, user: data, at: Date.now() };
        return data;
      })
      .finally(() => { inFlight = null; });
  }

  return inFlight as Promise<T>;
};

export const forgetCurrentUser = (): void => {
  last = null;
};
