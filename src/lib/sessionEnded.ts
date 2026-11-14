import { CanceledError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Once the session ends (sign-out, expiry, or sign-in elsewhere), requests still in flight are
 * rejected with a recognizable cancellation instead of being left pending, so callers' `finally`
 * cleanup runs. Their error notices are suppressed centrally while the session-ended screen shows.
 */
let sessionEnded = false;

export const markSessionEnded = (): void => {
  sessionEnded = true;
};

export const clearSessionEnded = (): void => {
  sessionEnded = false;
};

export const isSessionEnded = (): boolean => sessionEnded;

export type SessionEndedError = CanceledError<unknown> & { sessionEnded: true };

export const sessionEndedError = (config?: InternalAxiosRequestConfig): SessionEndedError =>
  Object.assign(new CanceledError('The session has ended.', CanceledError.ERR_CANCELED, config), {
    sessionEnded: true as const,
  });

export const isSessionEndedError = (error: unknown): error is SessionEndedError =>
  (error as { sessionEnded?: unknown } | null | undefined)?.sessionEnded === true;
