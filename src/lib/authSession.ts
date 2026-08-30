import api from './api';
import { clearDataCache } from './dataCache';

const clearStoredSession = (): void => {
  clearDataCache();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
};

export const logoutCurrentSession = (): void => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  // Preserve the captured token for server-side revocation while the UI signs out immediately.
  void api.post('/logout', undefined, { headers }).catch(() => undefined);
  clearStoredSession();
};
