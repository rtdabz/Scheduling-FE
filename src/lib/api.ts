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
        idempotencyFingerprint?: string | null;
        retryAttempt?: number;
        ownsSignal?: boolean;
        startedAt?: number;
    }
}

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

let loggingOut = false;
const pendingControllers = new Set<AbortController>();

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
        if (error.response) settleIdempotencyKey(error.config?.idempotencyFingerprint);
        if (!axios.isCancel(error)) reportOutcome(error.config, Boolean(error.response));

        if (loggingOut && requestUrl !== '/logout') {
            return new Promise(() => undefined);
        }

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

            const reason = error.response.data?.reason === 'session_replaced' ? 'replaced' : 'expired';
            if (!announceSessionEnded(reason)) {
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
