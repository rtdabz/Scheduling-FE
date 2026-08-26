import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import Shepherd, { type Tour } from 'shepherd.js';
import 'shepherd.js/dist/css/shepherd.css';
import { ArrowRight, CheckCircle2, Compass, Play, X } from 'lucide-react';
import { getStoredUser } from '../../lib/storedUser';
import { roleOnboardingFlows, resolveOnboardingRole } from '../../onboarding/roleOnboarding';
import { cancelActiveTour, startExclusiveTour } from '../../onboarding/shepherdTour';
import '../../styles/onboarding.css';

interface RoleOnboardingProps {
  onOpenSidebar: () => void;
}

const AUTO_GUIDE_PATHS = new Set(['/dashboard', '/dean/dashboard', '/secretary/dashboard', '/program_head/dashboard']);

export default function RoleOnboarding({ onOpenSidebar }: RoleOnboardingProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const role = resolveOnboardingRole(user?.role);
  const flow = role ? roleOnboardingFlows[role] : null;
  const userKey = user?.id ?? user?.email ?? 'current';
  const completionKey = role ? `wicars_role_onboarding_v2_${role}_${userKey}` : '';
  const [open, setOpen] = useState(false);
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const mountedRef = useRef(true);

  const closeWizard = useCallback(() => {
    if (completionKey) localStorage.setItem(completionKey, 'true');
    setOpen(false);
  }, [completionKey]);

  const startTour = useCallback(() => {
    if (!flow || !role) return;
    closeWizard();
    onOpenSidebar();

    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      const tour = new Shepherd.Tour({
        id: `wicars-${role}-onboarding`,
        useModalOverlay: true,
        keyboardNavigation: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true, label: 'Close onboarding tour' },
          classes: 'wicars-shepherd-step',
          canClickTarget: false,
          scrollTo: { block: 'center', inline: 'nearest' },
          skipMissingElement: true,
          waitForElement: 800,
          modalOverlayOpeningPadding: 7,
          modalOverlayOpeningRadius: 12,
        },
      });

      flow.tourSteps.forEach((step, index) => {
        const isLast = index === flow.tourSteps.length - 1;
        tour.addStep({
          id: `${role}-onboarding-${index + 1}`,
          title: step.title,
          text: `<p>${step.description}</p><span class="wicars-shepherd-progress">${index + 1} of ${flow.tourSteps.length}</span>`,
          attachTo: step.element ? { element: step.element, on: step.placement ?? 'right-start' } : undefined,
          buttons: [
            ...(index > 0 ? [{ text: 'Back', secondary: true, action(this: Tour) { void this.back(); } }] : []),
            { text: isLast ? 'Finish' : 'Next', action(this: Tour) { if (isLast) this.complete(); else void this.next(); } },
          ],
        });
      });

      void startExclusiveTour(tour);
    });
  }, [closeWizard, flow, onOpenSidebar, role]);

  useEffect(() => {
    mountedRef.current = true;
    if (!flow || !completionKey || !AUTO_GUIDE_PATHS.has(location.pathname)) return;
    if (localStorage.getItem(completionKey)) return;
    const timeoutId = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(timeoutId);
  }, [completionKey, flow, location.pathname]);

  useEffect(() => {
    const restart = () => {
      cancelActiveTour();
      setOpen(true);
    };
    window.addEventListener('restart-tour', restart);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('restart-tour', restart);
    };
  }, []);

  const taskCountLabel = useMemo(() => {
    if (!flow) return '';
    return `${activeTaskIndex + 1} of ${flow.tasks.length}`;
  }, [activeTaskIndex, flow]);

  if (!open || !flow || !role) return null;

  return createPortal(
    <div className="wicars-onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="role-onboarding-title">
      <section className="wicars-onboarding-card">
        <button type="button" onClick={closeWizard} className="wicars-onboarding-close" aria-label="Close Getting Started guide">
          <X size={17} />
        </button>
        <div className="wicars-onboarding-kicker"><Compass size={14} /> {flow.eyebrow}</div>
        <h2 id="role-onboarding-title" className="wicars-onboarding-title">Get started</h2>
        <p className="wicars-onboarding-subtitle">{flow.title}</p>
        <div className="wicars-onboarding-progress-row">
          <div className="wicars-onboarding-progress-track"><span style={{ width: `${Math.max(8, ((activeTaskIndex + 1) / flow.tasks.length) * 100)}%` }} /></div>
          <span>{taskCountLabel}</span>
        </div>
        <ol className="wicars-onboarding-task-list">
          {flow.tasks.map((task, index) => (
            <li key={`${task.path}-${task.title}`} className={`wicars-onboarding-task ${index === activeTaskIndex ? 'is-active' : ''}`}>
              <button type="button" onClick={() => { setActiveTaskIndex(index); closeWizard(); navigate(task.path); }}>
                <span className="wicars-onboarding-task-icon">{index < activeTaskIndex ? <CheckCircle2 size={18} /> : <span />}</span>
                <span className="wicars-onboarding-task-copy">
                  <strong>{task.title}</strong>
                  {index === activeTaskIndex && <small>{task.description}</small>}
                </span>
                <ArrowRight size={17} className="wicars-onboarding-task-arrow" />
              </button>
            </li>
          ))}
        </ol>
        <div className="wicars-onboarding-actions">
          <button type="button" onClick={closeWizard} className="wicars-onboarding-dismiss">Maybe later</button>
          <button type="button" onClick={startTour} className="wicars-onboarding-start"><Play size={14} fill="currentColor" /> Get Started</button>
        </div>
        <div className="wicars-onboarding-hint"><CheckCircle2 size={14} /> Reopen from Getting Started at the bottom of the sidebar.</div>
      </section>
    </div>,
    document.body,
  );
}
