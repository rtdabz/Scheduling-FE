import axios from 'axios';
import { clearDataCache } from './dataCache';

const api = axios.create({
    baseURL: 'http://localhost:8000/api',
    timeout: 30000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    if (config.url === '/login') {
        return config;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        localStorage.setItem('lastActivity', Date.now().toString());
    }
    return config;
});

api.interceptors.response.use(
    (response) => {
        if (localStorage.getItem('token') || sessionStorage.getItem('token')) {
            localStorage.setItem('lastActivity', Date.now().toString());
        }
        return response;
    },
    (error) => {
        const requestUrl = error.config?.url;
        if (error.response?.status === 401 && requestUrl !== '/login') {
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
