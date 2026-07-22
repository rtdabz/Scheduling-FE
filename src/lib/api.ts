import axios from 'axios';
import { clearDataCache } from './dataCache';

const api = axios.create({
    baseURL: 'http://localhost:8000/api',
    timeout: 30000,
    withCredentials: false,
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
    }
    return config;
});

api.interceptors.response.use(
    (response) => {
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
