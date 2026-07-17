import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { clearDataCache } from '../lib/dataCache';

const TIMEOUT_MS = 120 * 60 * 1000; // 120 minutes
const WARNING_MS = 60 * 1000; // 1 minute
const CHECK_INTERVAL_MS = 10000; // 10 seconds
const THROTTLE_MS = 2000; // Throttle localStorage updates to 2 seconds

type SessionModalState = 'active' | 'warning' | 'expired';

export function useSessionTimeout() {
  const lastWriteRef = useRef<number>(0);
  const modalStateRef = useRef<SessionModalState>('active');
  const [modalState, setModalState] = useState<SessionModalState>('active');
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const updateModalState = (state: SessionModalState) => {
    modalStateRef.current = state;
    setModalState(state);
  };

  const clearSession = async () => {
    clearDataCache();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastActivity');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');

    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });

    try {
      await api.post('/logout');
    } catch {
      // Ignore failures
    }
  };

  const staySignedIn = () => {
    const now = Date.now();
    localStorage.setItem('lastActivity', now.toString());
    lastWriteRef.current = now;
    setRemainingSeconds(0);
    updateModalState('active');
  };

  const signInAgain = async () => {
    sessionStorage.setItem('session_expired', 'true');
    await clearSession();
    window.location.href = '/';
  };

  useEffect(() => {
    const handleActivity = () => {
      if (modalStateRef.current !== 'active') return;
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
      const idleMs = now - lastActivity;
      const remainingMs = TIMEOUT_MS - idleMs;

      if (remainingMs <= 0) {
        if (modalStateRef.current !== 'expired') {
          await clearSession();
          updateModalState('expired');
        }
        return;
      }

      if (remainingMs <= WARNING_MS) {
        setRemainingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
        if (modalStateRef.current !== 'warning') {
          updateModalState('warning');
        }
        return;
      }

      if (modalStateRef.current !== 'active') {
        updateModalState('active');
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

  return {
    isWarningOpen: modalState === 'warning',
    isExpiredOpen: modalState === 'expired',
    remainingSeconds,
    staySignedIn,
    signInAgain,
  };
}
