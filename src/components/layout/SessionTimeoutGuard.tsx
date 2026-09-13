import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import { useIdleSession } from '../../hooks/useIdleSession';
import { logoutCurrentSession } from '../../lib/authSession';
import {
  IDLE_TIMEOUT_MS,
  SESSION_ENDED_EVENT,
  type SessionEndedReason,
} from '../../lib/sessionTimeout';

const IDLE_MINUTES = Math.round(IDLE_TIMEOUT_MS / 60000);

const NOTICE: Record<SessionEndedReason, { eyebrow: string; title: string; body: string; Icon: typeof Clock }> = {
  idle: {
    eyebrow: 'Session Timed Out',
    title: 'You have been signed out',
    body: `For your security, this session ended after ${IDLE_MINUTES} minutes of inactivity. Any unsaved work on this page was not submitted.`,
    Icon: Clock,
  },
  expired: {
    eyebrow: 'Session Expired',
    title: 'Your session is no longer valid',
    body: 'Your sign-in has expired or was ended elsewhere, so the server declined the last request. Any unsaved work on this page was not submitted.',
    Icon: ShieldAlert,
  },
};

/**
 * The single place a signed-in page explains that its session is over. It
 * covers both ways that happens — this app's inactivity policy, and the server
 * rejecting the token — rather than bouncing the user to the login screen with
 * no account of why.
 */
export default function SessionTimeoutGuard() {
  const [reason, setReason] = useState<SessionEndedReason | null>(null);
  const backToLogin = useRef<HTMLButtonElement>(null);

  const handleIdle = useCallback(() => {
    // End the session at the moment it lapses; the notice is an explanation,
    // not a grace period during which the page stays usable.
    logoutCurrentSession();
    setReason('idle');
  }, []);

  // Once the session is over there is nothing left to time out.
  useIdleSession({ enabled: reason === null, onIdle: handleIdle });

  useEffect(() => {
    const handleSessionEnded = (event: Event) => {
      // Claiming the event tells the API layer that the expiry is being shown
      // here, so it does not fall back to a redirect.
      event.preventDefault();
      const detail = (event as CustomEvent<SessionEndedReason>).detail;
      setReason((current) => current ?? detail ?? 'expired');
    };

    window.addEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, handleSessionEnded);
  }, []);

  useEffect(() => {
    if (reason) backToLogin.current?.focus();
  }, [reason]);

  if (!reason) return null;

  const { eyebrow, title, body, Icon } = NOTICE[reason];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-description"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border-t-4 border-t-amber-500 bg-[#F7F4F0] shadow-2xl">
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-8 ring-amber-100/60">
            <Icon size={22} />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{eyebrow}</p>
          <h2 id="session-timeout-title" className="text-lg font-bold text-slate-800">
            {title}
          </h2>
          <p id="session-timeout-description" className="text-xs leading-relaxed text-slate-600">
            {body} Please sign in again to continue.
          </p>
        </div>
        <div className="border-t border-slate-200 p-4">
          <button
            ref={backToLogin}
            type="button"
            onClick={() => window.location.assign('/')}
            className="w-full rounded-lg bg-[#4e0a10] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#3b070c] focus:outline-none focus:ring-2 focus:ring-[#4e0a10] focus:ring-offset-2"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
