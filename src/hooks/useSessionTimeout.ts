import { useEffect, useRef } from 'react';
import api from '../lib/api';

const TIMEOUT_MS = 120 * 60 * 1000; // 120 minutes
const CHECK_INTERVAL_MS = 10000; // 10 seconds
const THROTTLE_MS = 2000; // Throttle localStorage updates to 2 seconds

export function useSessionTimeout() {
  const lastWriteRef = useRef<number>(0);

  useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current > THROTTLE_MS) {
        localStorage.setItem('lastActivity', now.toString());
        lastWriteRef.current = now;
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    // Initialize activity tracking if not already set
    if (!localStorage.getItem('lastActivity')) {
      localStorage.setItem('lastActivity', Date.now().toString());
    }

    const checkTimeout = async () => {
      const lastActivityStr = localStorage.getItem('lastActivity');
      if (!lastActivityStr) return;

      const lastActivity = parseInt(lastActivityStr, 10);
      const now = Date.now();

      if (now - lastActivity > TIMEOUT_MS) {
        // Clear frontend storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        sessionStorage.setItem('session_expired', 'true');

        // Clear cookies
        document.cookie.split(';').forEach((c) => {
          document.cookie = c
            .replace(/^ +/, '')
            .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
        });

        // Backend logout to delete the database token (best effort)
        try {
          await api.post('/logout');
        } catch {
          // Ignore failures
        }

        // Full reload to redirect to public route cleanly
        window.location.href = '/';
      }
    };

    const interval = setInterval(checkTimeout, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(interval);
    };
  }, []);
}
