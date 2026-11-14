import { useEffect, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import type { StoredUser } from '../../lib/storedUser';
import { isDepartmentOfficeRole } from '../../lib/roles';

/** How long the banner stays up after a login before closing itself. */
export const DEPARTMENT_SETUP_BANNER_MS = 10_000;
const SEEN_KEY = 'wicars:department-setup-banner-seen';

// The banner is shown once per login: we remember the token it was shown for, so a page
// refresh keeps it closed while a fresh login (new token) shows it again.
const currentToken = (): string => {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

const alreadySeen = (token: string): boolean => {
  try {
    return token !== '' && localStorage.getItem(SEEN_KEY) === token;
  } catch {
    return false;
  }
};

const markSeen = (token: string) => {
  try {
    if (token) localStorage.setItem(SEEN_KEY, token);
  } catch {
    /* storage unavailable: the banner simply shows again next load */
  }
};

export default function DepartmentSetupBanner({ user }: { user: StoredUser | null }) {
  const role = user?.role?.toLowerCase();
  const applies = user?.scheduling_ready === false && (isDepartmentOfficeRole(role) || role === 'program_head');
  const [visible, setVisible] = useState(() => !alreadySeen(currentToken()));

  useEffect(() => {
    if (!applies || !visible) return;
    markSeen(currentToken());
    const timer = window.setTimeout(() => setVisible(false), DEPARTMENT_SETUP_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [applies, visible]);

  if (!applies || !visible) return null;

  return (
    <div
      role="status"
      className="relative flex items-start gap-3 overflow-hidden border-b border-amber-200 bg-amber-50 py-3 pl-4 pr-20 text-sm font-semibold leading-6 text-amber-800 sm:pr-24"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Your department has no program yet, so sections, schedules and course assignments cannot be created.
        Ask the VPAA to add a program to your department under Departments, then refresh this page.
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss notice"
        className="mt-0.5 rounded p-0.5 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-0.5 bg-amber-400"
        style={{ animation: `department-setup-banner-countdown ${DEPARTMENT_SETUP_BANNER_MS}ms linear forwards` }}
      />
      <style>{'@keyframes department-setup-banner-countdown { from { width: 100%; } to { width: 0%; } }'}</style>
    </div>
  );
}
