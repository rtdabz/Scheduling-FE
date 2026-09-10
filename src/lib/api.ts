import axios from 'axios';
import { clearDataCache } from './dataCache';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 30000,
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

const releaseController = (signal?: unknown): void => {
    if (!signal) return;
    pendingControllers.forEach((controller) => {
        if (controller.signal === signal) pendingControllers.delete(controller);
    });
};

export const beginLogout = (): void => {
    loggingOut = true;
};

export const cancelPendingRequests = (): void => {
    pendingControllers.forEach((controller) => controller.abort());
    pendingControllers.clear();
};

api.interceptors.request.use((config) => {
    if (config.url === '/login' || config.url === '/auth/google/exchange') {
        // A subsequent login starts a fresh authenticated lifecycle.
        loggingOut = false;
        return config;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    if (!config.signal) {
        const controller = new AbortController();
        config.signal = controller.signal;
        pendingControllers.add(controller);
    }
    return config;
});

api.interceptors.response.use(
    (response) => {
        releaseController(response.config.signal);
        return response;
    },
    (error) => {
        const requestUrl = error.config?.url;
        releaseController(error.config?.signal);

        // Requests canceled or rejected while the old route is being torn
        // down must not reach page-level catch handlers and show a flash of
        // an error after the user has already signed out.
        if (loggingOut && requestUrl !== '/logout') {
            return new Promise(() => undefined);
        }

        if (error.response?.status === 401 && requestUrl !== '/login' && requestUrl !== '/logout') {
            clearDataCache();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;
