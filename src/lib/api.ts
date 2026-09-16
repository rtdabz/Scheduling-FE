import axios, { type AxiosRequestConfig } from 'axios';
import { reportNoResponse, reportResponse, resetConnectionStatus } from './connectionStatus';
import { clearDataCache } from './dataCache';
import {
    IDEMPOTENCY_HEADER,
    claimIdempotencyKey,
    clearIdempotencyKeys,
    settleIdempotencyKey,
    writeFingerprint,
} from './idempotency';
import { disconnectLiveUpdates, getLiveSocketId } from './liveSocket';
import { isRetryableRead, readRetryDelayMs } from './requestRetry';
import { announceSessionEnded, clearLastActivity } from './sessionTimeout';

declare module 'axios' {
    interface AxiosRequestConfig {
        /** Set by the interceptors; the write this request's key belongs to. */
        idempotencyFingerprint?: string | null;
        /** Set by the interceptors; how many times this read was resent. */
        retryAttempt?: number;
        /** Set by the interceptors; true when the abort signal is the client's own. */
        ownsSignal?: boolean;
        /** Set by the interceptors; when this attempt was sent, for the connection banner. */
        startedAt?: number;
    }
}

// The timeout covers downloading the body too, so on a slow link a shorter one
// would fail large reads that were progressing fine. Reads that do time out are
// retried (requestRetry.ts); writes get longer because they are never resent
// automatically and the server may be doing real work.
const READ_TIMEOUT_MS = 30000;
const WRITE_TIMEOUT_MS = 60000;

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: READ_TIMEOUT_MS,
    withCredentials: false,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Logout is a short-lived transition in which requests from the page being
// left must not publish stale errors into the still-mounted toast provider.
let loggingOut = false;
const pendingControllers = new Set<AbortController>();

// Only reads measure the network: a slow write may be the server doing real
// work, which is not something to warn the user about.
const reportOutcome = (config: AxiosRequestConfig | undefined, answered: boolean): void => {
    if (!answered) {
        reportNoResponse();
        return;
    }
    const isRead = (config?.method ?? 'get').toLowerCase() === 'get';
    reportResponse(isRead && config?.startedAt ? Date.now() - config.startedAt : undefined);
};

const releaseController = (signal?: unknown): void => {
    if (!signal) return;
    pendingControllers.forEach((controller) => {
        if (controller.signal === signal) pendingControllers.delete(controller);
    });
};

export const beginLogout = (): void => {
    loggingOut = true;
    clearIdempotencyKeys();
    resetConnectionStatus();
};

export const cancelPendingRequests = (): void => {
    pendingControllers.forEach((controller) => controller.abort());
    pendingControllers.clear();
};

api.interceptors.request.use((config) => {
    config.startedAt = Date.now();

    if (config.url === '/login' || config.url === '/auth/google/exchange') {
        // A subsequent login starts a fresh authenticated lifecycle.
        loggingOut = false;
        return config;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    const socketId = getLiveSocketId();
    if (socketId) {
        config.headers['X-Socket-ID'] = socketId;
    }

    if (!config.signal) {
        const controller = new AbortController();
        config.signal = controller.signal;
        config.ownsSignal = true;
        pendingControllers.add(controller);
    }

    const fingerprint = writeFingerprint(config);
    config.idempotencyFingerprint = fingerprint;
    if (fingerprint) {
        config.headers[IDEMPOTENCY_HEADER] = claimIdempotencyKey(fingerprint);
        if (config.timeout === READ_TIMEOUT_MS) config.timeout = WRITE_TIMEOUT_MS;
    }
    return config;
});

api.interceptors.response.use(
    (response) => {
        releaseController(response.config.signal);
        settleIdempotencyKey(response.config.idempotencyFingerprint);
        reportOutcome(response.config, true);
        return response;
    },
    async (error) => {
        const requestUrl = error.config?.url;
        releaseController(error.config?.signal);
        // A write the server answered has a known outcome; one that got no
        // answer keeps its key so pressing Save again cannot apply it twice.
        if (error.response) settleIdempotencyKey(error.config?.idempotencyFingerprint);
        if (!axios.isCancel(error)) reportOutcome(error.config, Boolean(error.response));

        // Requests canceled or rejected while the old route is being torn
        // down must not reach page-level catch handlers and show a flash of
        // an error after the user has already signed out.
        if (loggingOut && requestUrl !== '/logout') {
            return new Promise(() => undefined);
        }

        // A rejected token ends the session wherever it is noticed. This is the
        // one place that decides so, which is why the callers below are left
        // hanging rather than each running its own sign-out.
        if (error.response?.status === 401 && requestUrl !== '/login' && requestUrl !== '/logout') {
            beginLogout();
            cancelPendingRequests();
            disconnectLiveUpdates();
            clearDataCache();
            clearLastActivity();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');

            // The shell explains the expiry and offers the way back; without a
            // shell on screen there is nothing to explain it, so leave directly.
            if (!announceSessionEnded('expired')) {
                window.location.href = '/';
            }
            return new Promise(() => undefined);
        }

        const config = error.config;
        const attempt = config?.retryAttempt ?? 0;
        if (config && isRetryableRead(error, attempt)) {
            await new Promise((resolve) => setTimeout(resolve, readRetryDelayMs(attempt)));
            if (loggingOut) return new Promise(() => undefined);

            config.retryAttempt = attempt + 1;
            // The spent signal was released above; let the request interceptor
            // issue a fresh one so sign-out can still cancel the retry.
            if (config.ownsSignal) {
                config.signal = undefined;
                config.ownsSignal = false;
            }
            return api.request(config);
        }

        return Promise.reject(error);
    }
);

export default api;
