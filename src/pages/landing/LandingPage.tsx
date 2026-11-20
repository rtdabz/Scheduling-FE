import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ExternalLink, LogIn, Mail, Menu, UserRound, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import logo from '../../assets/logo.jpg';
import campusBg from '../../assets/campus-bg.webp';
import {
  ABOUT_POINTS,
  ADVISER,
  FEATURES,
  LOGIN_PATH,
  NAV_LINKS,
  ROLES,
  SCREENSHOTS,
  STEPS,
  SUPPORT_EMAIL,
  TEAM,
  type Screenshot,
  type ScreenshotView,
  type TeamMember,
} from './landingContent';

/** Frame title for one view, e.g. "VPAA Dashboard" for a screen with several role views. */
const viewName = (shot: Screenshot, view: ScreenshotView) =>
  view.name ?? (shot.views.length > 1 ? `${view.label} ${shot.label.replace(/s$/, '')}` : shot.label);

const ALL_SCREENSHOTS_READY = SCREENSHOTS.every((shot) => shot.views.every((view) => view.src));

/** Sections the nav highlights. Unlisted sections (product tour, roles) keep the previous link active. */
const NAV_SECTION_IDS = NAV_LINKS.map((link) => link.href.slice(1));

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fades content up once when it first scrolls into view. Content stays visible without JS support. */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (shown || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShown(true);
        observer.disconnect();
      }
      // The root extends far above the viewport, so content jumped past (anchor links, fast
      // scrolling) still counts as intersecting and never stays hidden.
    }, { rootMargin: '100000px 0px -10% 0px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'} print:translate-y-0 print:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}

/** Primary call to action. Always routes to the existing sign-in page. */
function GetStartedButton({ className = '', size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const sizing = size === 'lg' ? 'h-14 px-9 text-base' : 'h-12 px-6 text-[15px]';
  return (
    <Link
      to={LOGIN_PATH}
      className={`group inline-flex ${sizing} items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-[#2a0508] shadow-[0_10px_30px_-10px_rgba(201,149,42,0.7)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-accent-light hover:shadow-[0_14px_34px_-10px_rgba(245,200,66,0.75)] motion-safe:active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${className}`}
    >
      Get Started
      <ArrowRight className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function SectionHeading({ eyebrow, title, description, invert = false }: { eyebrow: string; title: string; description?: string; invert?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className={`text-xs font-bold uppercase tracking-[0.18em] ${invert ? 'text-accent-light' : 'text-accent'}`}>{eyebrow}</p>
      <h2 className={`mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl ${invert ? 'text-white' : 'text-text'}`}>{title}</h2>
      {description && <p className={`mt-4 text-base leading-relaxed ${invert ? 'text-[#E8D5C4]' : 'text-muted'}`}>{description}</p>}
    </div>
  );
}

/** A screenshot framed as a browser window. */
function BrowserFrame({ name, view, eager = false, className = '' }: { name: string; view: ScreenshotView; eager?: boolean; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_30px_80px_-24px_rgba(26,20,16,0.45)] ${className}`}>
      <div className="flex items-center gap-3 border-b border-border bg-[#F7F4F0] px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#E2D9D0]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#E2D9D0]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#E2D9D0]" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md border border-border bg-white px-3 py-1 text-center text-[11px] text-muted">
          tccsched.site{view.path}
        </div>
      </div>
      {view.src ? (
        <img
          src={view.src}
          alt={`${name} screen in TCCSched`}
          width={1600}
          height={800}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="block aspect-[2/1] w-full bg-[#F7F5F2] object-cover object-top"
        />
      ) : (
        <div role="img" aria-label={`${name} screenshot coming soon`} className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-3 bg-[#F7F5F2] bg-[radial-gradient(#E2D9D0_1px,transparent_1px)] [background-size:18px_18px] p-6 text-center">
          <img src={logo} alt="" className="h-14 w-14 rounded-full object-cover opacity-80 ring-4 ring-accent/30" />
          <p className="font-display text-xl font-bold text-primary">{name}</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Screenshot coming soon</p>
        </div>
      )}
    </figure>
  );
}

function NavBar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState(NAV_SECTION_IDS[0]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
      // The last nav section whose top has passed a line just under the header.
      const line = window.scrollY + 120;
      let current = NAV_SECTION_IDS[0];
      for (const id of NAV_SECTION_IDS) {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= line) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = NAV_SECTION_IDS[NAV_SECTION_IDS.length - 1];
      setActiveId(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const solid = scrolled || open;

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${solid ? 'border-b border-white/10 bg-[#36060b]/90 shadow-lg backdrop-blur-md' : 'border-b border-transparent bg-transparent'}`}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Main">
        <a href="#home" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <img src={logo} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-accent/50" />
          <span className="font-display text-xl font-bold text-white">TCC<span className="text-accent-light">Sched</span></span>
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === `#${activeId}`;
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={active ? 'true' : undefined}
                  className={`relative block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'text-white' : 'text-[#E8D5C4]/90'}`}
                >
                  {link.label}
                  <span className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent-light transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <Link to={LOGIN_PATH} className="hidden items-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:border-accent hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex">
            <LogIn className="h-4 w-4" aria-hidden="true" /> Login
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="landing-mobile-nav" className="animate-dropdownIn border-t border-white/10 px-4 pb-5 pt-2 lg:hidden">
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={link.href === `#${activeId}` ? 'true' : undefined}
                  className={`block rounded-lg border-l-2 px-3 py-2.5 text-[15px] font-medium hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${link.href === `#${activeId}` ? 'border-accent-light bg-white/5 text-white' : 'border-transparent text-[#E8D5C4]'}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link to={LOGIN_PATH} className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 text-sm font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <LogIn className="h-4 w-4" aria-hidden="true" /> Login
          </Link>
        </div>
      )}
    </header>
  );
}

/** The login page's campus photo and maroon gradient, reused as-is. */
function CampusBackdrop({ priority = false }: { priority?: boolean }) {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <img src={campusBg} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" className="h-full w-full object-cover object-center opacity-45 contrast-105 saturate-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#36060b] via-[#4e0a10]/75 to-[#5A1220]/65 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/55" />
    </div>
  );
}

function Hero() {
  return (
    <section id="home" className="relative scroll-mt-16 overflow-hidden bg-[#4e0a10] pb-24 pt-32 sm:pt-36 lg:pb-32">
      <CampusBackdrop priority />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:px-8">
        <div className="text-center lg:text-left">
          <p className="animate-fadeInUp inline-flex items-center gap-2 rounded-full border border-accent/30 bg-[#5A1220]/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#E8D5C4] backdrop-blur-sm">
            Tagoloan Community College
          </p>
          <h1 className="animate-fadeInUp mt-6 font-display text-4xl font-bold leading-[1.1] text-white drop-shadow-md sm:text-5xl xl:text-6xl">
            <span className="block">Smarter Academic Scheduling.</span>
            <span className="block text-accent-light">Better Campus Coordination.</span>
          </h1>
          <p className="animate-fadeInUp mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#E8D5C4] sm:text-lg lg:mx-0">
            An intelligent academic scheduling platform designed to simplify schedule management, identify conflicts, and provide informed scheduling recommendations for Tagoloan Community College.
          </p>
          <div className="animate-fadeInUp mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <GetStartedButton className="w-full sm:w-auto" />
            <a href="#features" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/30 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto">
              Explore Features
            </a>
          </div>
        </div>

        <div className="animate-fadeInUp relative [animation-delay:150ms] [animation-fill-mode:both]">
          <div className="absolute -inset-6 rounded-[2rem] bg-accent/20 blur-3xl" aria-hidden="true" />
          <BrowserFrame name={viewName(SCREENSHOTS[0], SCREENSHOTS[0].views[0])} view={SCREENSHOTS[0].views[0]} eager className="relative" />
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  const [active, setActive] = useState(0);
  const [viewIndex, setViewIndex] = useState(0);
  const shot = SCREENSHOTS[active];
  const view = shot.views[Math.min(viewIndex, shot.views.length - 1)];
  const hasViews = shot.views.length > 1;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectTab = (index: number, focus = false) => {
    setActive(index);
    setViewIndex(0);
    if (focus) tabRefs.current[index]?.focus();
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = SCREENSHOTS.length - 1;
    const keys: Record<string, number> = { ArrowRight: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, Home: 0, End: last };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(next, true);
  };

  return (
    <section id="showcase" className="scroll-mt-16 bg-parchment py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="Product tour" title="The actual system, screen by screen" description={ALL_SCREENSHOTS_READY ? 'Every view below is captured from TCCSched itself.' : 'A look at the main screens of TCCSched.'} />
        </Reveal>

        <Reveal className="mt-10">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label="System screens" onKeyDown={onTabKeyDown} className="mx-auto flex w-max gap-1 rounded-full border border-border bg-white p-1 shadow-sm">
            {SCREENSHOTS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`showcase-tab-${item.id}`}
                aria-selected={index === active}
                aria-controls="showcase-panel"
                tabIndex={index === active ? 0 : -1}
                ref={(element) => { tabRefs.current[index] = element; }}
                onClick={() => selectTab(index)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${index === active ? 'bg-primary text-white shadow-sm' : 'text-text hover:bg-parchment hover:text-primary'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          </div>

          <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${shot.id}`} className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_2fr]">
            <div key={shot.id} className="animate-fadeInUp text-center lg:text-left">
              <h3 className="font-display text-2xl font-bold text-text">{shot.title}</h3>
              <p className="mt-3 leading-relaxed text-muted">{shot.caption}</p>
              {hasViews && (
                <div className="mt-6">
                  <div role="group" aria-label={`${shot.label} views`} className="flex flex-col gap-2">
                    {shot.views.map((item, index) => (
                      <button
                        key={item.label}
                        type="button"
                        aria-pressed={item === view}
                        onClick={() => setViewIndex(index)}
                        className={`rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${item === view ? 'border-primary/30 bg-white shadow-sm' : 'border-transparent hover:border-border hover:bg-white/60'}`}
                      >
                        <span className={`block text-sm font-bold ${item === view ? 'text-primary' : 'text-text'}`}>{item.label}</span>
                        {item.caption && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{item.caption}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <BrowserFrame key={`frame-${shot.id}-${view.label}`} name={viewName(shot, view)} view={view} className="animate-fadeInUp" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="Core features" title="Everything an academic office needs to schedule with confidence" />
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 60}>
              <article className="group h-full rounded-2xl border border-border bg-white p-7 shadow-sm transition-[border-color,box-shadow,transform] duration-300 motion-safe:hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_40px_-18px_rgba(78,10,16,0.35)]">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#640d14] to-[#36060b] text-accent-light shadow-sm ring-2 ring-accent/0 transition-shadow duration-300 group-hover:ring-accent/50">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-text">{feature.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.7] text-muted">{feature.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-parchment py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="How it works" title="From preparation to final approval" description="The same five stages every department follows each semester." />
        </Reveal>
        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent lg:block" aria-hidden="true" />
          <ol className="relative grid gap-6 lg:grid-cols-5 lg:gap-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                {index < STEPS.length - 1 && (
                  <span className="absolute -bottom-6 left-6 top-12 w-px bg-primary/20 lg:hidden" aria-hidden="true" />
                )}
                <Reveal delay={index * 80} className="flex h-full gap-4 lg:flex-col lg:items-center lg:text-center">
                  <span className="relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-parchment bg-primary font-display text-lg font-bold text-accent-light shadow-md">
                    {index + 1}
                  </span>
                  <div className="flex-1 rounded-2xl border border-border bg-white p-5 shadow-sm lg:mt-5 lg:w-full">
                    <div className="flex items-center gap-2 lg:justify-center">
                      <step.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Step {index + 1}</span>
                    </div>
                    <h3 className="mt-2 font-bold leading-snug text-text">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.description}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Roles() {
  return (
    <section id="roles" className="relative scroll-mt-16 overflow-hidden bg-gradient-to-br from-[#640d14] via-[#4e0a10] to-[#36060b] py-24">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading invert eyebrow="Who uses TCCSched" title="Built around the people who schedule and approve" description="Each role sees the tools and approvals that match its responsibilities." />
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role, index) => (
            <Reveal key={role.role} delay={index * 70}>
              <article className="h-full rounded-2xl border border-white/15 bg-white/[0.09] p-6 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-colors duration-300 hover:border-accent/50 hover:bg-white/[0.13]">
                <h3 className="font-display text-2xl font-bold text-white">{role.role}</h3>
                <span className="mt-3 block h-0.5 w-10 rounded-full bg-accent" aria-hidden="true" />
                <p className="mt-4 text-[15px] font-medium leading-relaxed text-white">{role.summary}</p>
                <ul className="mt-5 space-y-2.5 border-t border-white/15 pt-5">
                  {role.duties.map((duty) => (
                    <li key={duty} className="flex gap-2.5 text-sm leading-snug text-[#E8D5C4]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-light" aria-hidden="true" />
                      {duty}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="scroll-mt-16 bg-white py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">About TCCSched</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-text sm:text-4xl">Academic scheduling, built for Tagoloan Community College</h2>
          <p className="mt-5 leading-relaxed text-muted">
            TCCSched replaces scattered spreadsheets and manual cross-checking with one shared system for planning class schedules. Department offices build timetables, the system checks them against scheduling rules and suggests valid placements, and Deans and the VPAA review and approve them in a clear, recorded sequence.
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            The result is a schedule that is consistent across departments, free of avoidable conflicts, and backed by data the college can use for planning.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {ABOUT_POINTS.map((point, index) => (
            <Reveal key={point.title} delay={index * 70}>
              <div className="h-full rounded-2xl border border-border bg-parchment p-6">
                <point.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-bold text-text">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{point.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Portrait with a consistent crop, or a placeholder until a real photo is provided. */
function Portrait({ member, compact = false }: { member: TeamMember; compact?: boolean }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-[#640d14] to-[#36060b]">
      {member.photo ? (
        <img
          src={member.photo}
          alt={`Portrait of ${member.name}`}
          width={480}
          height={600}
          loading="lazy"
          decoding="async"
          style={{ objectPosition: member.photoPosition ?? '50% 25%' }}
          className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-[#E8D5C4]/70">
          <UserRound className={compact ? 'h-10 w-10' : 'h-14 w-14'} strokeWidth={1.25} aria-hidden="true" />
          <span className={`font-semibold uppercase tracking-widest ${compact ? 'hidden text-[10px] sm:inline' : 'text-xs'}`}>Photo coming soon</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-accent to-accent-light" aria-hidden="true" />
    </div>
  );
}

function ProfileLinks({ member, className = '' }: { member: TeamMember; className?: string }) {
  if (!member.github && !member.linkedin) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {([['GitHub', member.github], ['LinkedIn', member.linkedin]] as const).map(([label, href]) => href && (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on ${label} (opens in a new tab)`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

/**
 * Covers a whole profile card (the card must be `relative`) so a click anywhere opens its dialog.
 * It has no visible text; the accessible name comes from `aria-label`, and the heading inside the
 * card keeps its semantics. One tab stop per card; the card shows the focus ring.
 */
function ViewProfileButton({ member, onOpen }: { member: TeamMember; onOpen: (member: TeamMember) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      aria-haspopup="dialog"
      aria-label={`View profile: ${member.name}, ${member.role}`}
      className="absolute inset-0 z-10 rounded-[inherit] focus:outline-none"
    />
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-accent">{title}</h3>
      <div className="mt-2 text-[15px] leading-relaxed text-text">{children}</div>
    </section>
  );
}

const Pending = () => <p className="text-sm italic text-muted">To be provided by the development team.</p>;

const CLOSE_ANIMATION_MS = 160;

/** Profile of one team member, on the shared app dialog (Escape, backdrop, focus trap, scroll lock). */
function TeamProfileModal({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) onClose();
    else setClosing(true);
  }, [onClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  if (!member) return null;
  const isAdviser = member === ADVISER;

  return (
    <Modal
      isOpen
      onClose={requestClose}
      title={member.name}
      description={member.role}
      size="form"
      closeLabel="Close profile"
      headerClassName="bg-gradient-to-r from-[#640d14] via-[#4e0a10] to-[#36060b]"
      titleClassName="font-display text-xl font-bold leading-tight text-white"
      className={`transition-[opacity,transform] duration-150 ease-out ${closing ? 'scale-[0.97] opacity-0' : 'motion-safe:animate-modalIn'}`}
    >
      <div className="grid gap-6 p-5 sm:grid-cols-[200px_1fr] sm:p-6">
        <div className="mx-auto w-44 sm:mx-0 sm:w-full">
          <div className="overflow-hidden rounded-2xl shadow-md ring-4 ring-accent/25">
            <Portrait member={member} />
          </div>
          <p className="mt-3 text-center">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${isAdviser ? 'bg-primary text-accent-light' : 'bg-primary/[0.07] text-primary'}`}>{member.role}</span>
          </p>
          <ProfileLinks member={member} className="mt-3 justify-center" />
        </div>

        <div className="space-y-5">
          <ProfileSection title="Introduction">
            {member.intro ? <p>{member.intro}</p> : <Pending />}
          </ProfileSection>
          <ProfileSection title={isAdviser ? 'Role in the project' : 'Responsibilities'}>
            {member.responsibilities?.length ? (
              <ul className="space-y-2">
                {member.responsibilities.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : <Pending />}
          </ProfileSection>
          <ProfileSection title="Contribution to TCCSched">
            {member.contribution ? <p>{member.contribution}</p> : <Pending />}
          </ProfileSection>
        </div>
      </div>
    </Modal>
  );
}

function Team() {
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const closeProfile = useCallback(() => setSelected(null), []);

  return (
    <section id="team" className="scroll-mt-16 bg-parchment py-24">
      {/* Wider than other sections so six cards fit each full name on one line. */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Behind the System"
            title="Meet the Team Behind TCCSched"
            description="Behind every feature and solution is a team working together through collaboration, creativity, and dedication. Meet the people behind TCCSched who helped bring an intelligent academic scheduling platform to life."
          />
        </Reveal>

        <Reveal className="mt-14">
          <article className="group relative mx-auto flex max-w-xl cursor-pointer flex-col items-center gap-6 rounded-3xl border border-accent/40 bg-white p-6 shadow-[0_22px_50px_-28px_rgba(78,10,16,0.45)] transition-[border-color,box-shadow,transform] duration-300 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-parchment hover:border-accent/70 hover:shadow-[0_26px_56px_-24px_rgba(78,10,16,0.5)] motion-safe:hover:-translate-y-0.5 sm:flex-row sm:items-center sm:p-7">
            <div className="w-48 shrink-0 overflow-hidden rounded-2xl ring-4 ring-accent/25 sm:w-56">
              <Portrait member={ADVISER} />
            </div>
            <div className="text-center sm:text-left">
              <span className="inline-flex rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-light">{ADVISER.role}</span>
              <h3 className="mt-3 font-display text-2xl font-bold leading-tight text-text">{ADVISER.name}</h3>
              <ViewProfileButton member={ADVISER} onOpen={setSelected} />
            </div>
          </article>
        </Reveal>

        <div className="mx-auto mt-12 flex max-w-xs items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Development Team</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/*
          Names never wrap. Six columns only where each card is wide enough for the longest name
          (about 1400px); otherwise three, two, or one compact row per member on phones.
        */}
        <ul className="mx-auto mt-8 grid max-w-md grid-cols-1 gap-3 sm:max-w-2xl sm:grid-cols-2 sm:gap-4 lg:max-w-4xl lg:grid-cols-3 min-[1400px]:max-w-none min-[1400px]:grid-cols-6 min-[1400px]:gap-3">
          {TEAM.map((member, index) => (
            <li key={member.role}>
              <Reveal delay={index * 60} className="h-full">
                <article className="group relative flex h-full cursor-pointer flex-row overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-300 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-parchment hover:border-primary/25 hover:shadow-[0_18px_36px_-20px_rgba(78,10,16,0.4)] motion-safe:hover:-translate-y-1 sm:flex-col">
                  <div className="w-[4.5rem] shrink-0 sm:w-auto">
                    <Portrait member={member} compact />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1.5 px-3 py-3 text-left sm:items-center sm:justify-start sm:px-3 sm:py-4 sm:text-center min-[1400px]:px-2.5">
                    <h3 className="whitespace-nowrap font-display text-[15px] max-[359px]:whitespace-normal font-bold leading-snug text-text sm:text-base min-[1400px]:text-sm min-[1400px]:tracking-tight">
                      {member.name}
                    </h3>
                    <p className="whitespace-nowrap rounded-full bg-primary/[0.07] px-2 py-0.5 text-xs font-semibold text-primary">{member.role}</p>
                    <ViewProfileButton member={member} onOpen={setSelected} />
                  </div>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
      <TeamProfileModal member={selected} onClose={closeProfile} />
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#4e0a10] py-24">
      <CampusBackdrop />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[min(42rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
      <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">Ready to Simplify Academic Scheduling?</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-[#E8D5C4]">Experience a more organized and intelligent approach to academic scheduling with TCCSched.</p>
        <GetStartedButton size="lg" className="mt-10 w-full sm:w-auto" />
        <p className="mt-5 text-sm text-[#E8D5C4]">For authorized Tagoloan Community College personnel.</p>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#36060b] text-[#E8D5C4]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-accent/40" />
            <span className="font-display text-xl font-bold text-white">TCC<span className="text-accent-light">Sched</span></span>
          </div>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-[#E8D5C4]">
            Academic Scheduling System of Tagoloan Community College, Tagoloan, Misamis Oriental.
          </p>
        </div>
        <nav aria-label="Footer">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-accent-light">Explore</h3>
          <ul className="mt-4 space-y-3 text-[15px]">
            {NAV_LINKS.map((link) => (
              <li key={link.href}><a href={link.href} className="rounded transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">{link.label}</a></li>
            ))}
          </ul>
        </nav>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-accent-light">Access</h3>
          <ul className="mt-4 space-y-3 text-[15px]">
            <li><Link to={LOGIN_PATH} className="inline-flex items-center gap-1.5 rounded font-semibold text-white transition-colors hover:text-accent-light focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><LogIn className="h-4 w-4" aria-hidden="true" /> Login</Link></li>
            {SUPPORT_EMAIL && (
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 rounded transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Mail className="h-4 w-4" aria-hidden="true" /> {SUPPORT_EMAIL}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-[13px] text-[#E8D5C4]/85 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} TCCSched · Tagoloan Community College. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  // Smooth in-page anchor scrolling while the landing page is mounted, unless motion is reduced.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'smooth';
    return () => { root.style.scrollBehavior = previous; };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = 'TCCSched · Academic Scheduling for Tagoloan Community College';
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans text-text antialiased">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary">
        Skip to content
      </a>
      <NavBar />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <Showcase />
        <Features />
        <HowItWorks />
        <Roles />
        <About />
        <Team />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
