import type { Options, Props } from 'react-joyride';

const JOYRIDE_START_EVENT = 'wicars:joyride-start';

interface JoyrideStartDetail {
  id: string;
}

export const coachMarkOptions = {
  arrowColor: '#4e0a10',
  backgroundColor: '#ffffff',
  blockTargetInteraction: false,
  buttons: ['back', 'close', 'primary', 'skip'],
  closeButtonAction: 'skip',
  dismissKeyAction: 'close',
  offset: 12,
  overlayClickAction: false,
  overlayColor: 'rgba(15, 23, 42, 0.62)',
  primaryColor: '#4e0a10',
  scrollDuration: 250,
  scrollOffset: 24,
  showProgress: true,
  skipBeacon: true,
  spotlightPadding: 7,
  spotlightRadius: 12,
  targetWaitTimeout: 900,
  textColor: '#475569',
  width: 'min(360px, calc(100vw - 24px))',
  zIndex: 120,
} satisfies Partial<Options>;

export const coachMarkStyles = {
  buttonBack: {
    borderRadius: '0.7rem',
    color: '#475569',
    fontSize: '0.75rem',
    fontWeight: 800,
    padding: '0.6rem 0.8rem',
  },
  buttonClose: {
    color: 'rgba(255, 255, 255, 0.78)',
    height: '2rem',
    right: '0.7rem',
    top: '0.7rem',
    width: '2rem',
  },
  buttonPrimary: {
    borderRadius: '0.7rem',
    fontSize: '0.75rem',
    fontWeight: 800,
    padding: '0.65rem 0.95rem',
  },
  buttonSkip: {
    color: '#64748b',
    fontSize: '0.72rem',
    fontWeight: 800,
  },
  tooltip: {
    border: '1px solid rgba(201, 149, 42, 0.45)',
    borderRadius: '18px',
    boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
    overflow: 'hidden',
    padding: 0,
  },
  tooltipContainer: {
    padding: 0,
    textAlign: 'left' as const,
  },
  tooltipContent: {
    fontSize: '0.82rem',
    lineHeight: 1.6,
    padding: '1rem 1.1rem 0.65rem',
  },
  tooltipFooter: {
    gap: '0.5rem',
    marginTop: 0,
    padding: '0.65rem 1.1rem 1rem',
  },
  tooltipTitle: {
    background: '#4e0a10',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: 800,
    margin: 0,
    padding: '1rem 3rem 1rem 1.1rem',
  },
} satisfies NonNullable<Props['styles']>;

export const announceJoyrideStart = (id: string): void => {
  window.dispatchEvent(new CustomEvent<JoyrideStartDetail>(JOYRIDE_START_EVENT, { detail: { id } }));
};

export const listenForOtherJoyrides = (id: string, stop: () => void): (() => void) => {
  const listener = (event: Event) => {
    const startedId = (event as CustomEvent<JoyrideStartDetail>).detail?.id;
    if (startedId && startedId !== id) stop();
  };

  window.addEventListener(JOYRIDE_START_EVENT, listener);
  return () => window.removeEventListener(JOYRIDE_START_EVENT, listener);
};
