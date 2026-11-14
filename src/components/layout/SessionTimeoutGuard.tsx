import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import { ModalButton } from '../ui/ModalForm';
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
    body: `You were inactive for ${IDLE_MINUTES} minutes.`,
    Icon: Clock,
  },
  expired: {
    eyebrow: 'Session Expired',
    title: 'Your session is no longer valid',
    body: 'Your sign-in has expired.',
    Icon: ShieldAlert,
  },
  replaced: {
    eyebrow: 'Signed In Elsewhere',
    title: 'You have been signed out',
    body: 'Your account was signed in on another device.',
    Icon: MonitorSmartphone,
  },
};

export default function SessionTimeoutGuard() {
  const [reason, setReason] = useState<SessionEndedReason | null>(null);
  const backToLogin = useRef<HTMLButtonElement>(null);

  const handleIdle = useCallback(() => {
    logoutCurrentSession();
    setReason('idle');
  }, []);

  useIdleSession({ enabled: reason === null, onIdle: handleIdle });

  useEffect(() => {
    const handleSessionEnded = (event: Event) => {
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
    <Modal
      isOpen
      onClose={() => undefined}
      role="alertdialog"
      title={title}
      size="sm"
      className="border-t-4 border-t-amber-500"
      showCloseButton={false}
      closeOnEscape={false}
      closeOnOverlayClick={false}
      footer={
        <ModalButton ref={backToLogin} variant="primary" className="w-full" onClick={() => window.location.assign('/')}>
          Back to Login
        </ModalButton>
      }
    >
      <div className="flex items-start gap-4 px-5 py-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-4 ring-amber-100" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase text-amber-700">{eyebrow}</p>
          <p id="session-timeout-description" className="mt-2 text-sm leading-6 text-slate-600">
            {body} Please sign in again.
          </p>
        </div>
      </div>
    </Modal>
  );
}
