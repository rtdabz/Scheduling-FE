/**
 * Copy and data for the public landing page. Kept apart from the layout so the team, screenshots
 * and wording can be updated without touching the page components.
 */
import {
  BarChart3,
  CalendarCog,
  CalendarRange,
  ClipboardCheck,
  FileCheck2,
  GitPullRequestArrow,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/**
 * Real screenshots of the system, picked up by file name from src/assets/landing/
 * (e.g. dashboard.webp). Until a file exists its frame shows a labelled placeholder.
 * Frames are 2:1: capture a full-width 1920px browser window (about 1920x940) and export
 * at 1600px wide as WebP.
 */
const screenshotFiles = import.meta.glob<string>('../../assets/landing/*.{webp,png,jpg,jpeg}', { eager: true, import: 'default' });

const screenshot = (name: string): string | null => {
  const match = Object.entries(screenshotFiles).find(([path]) => path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') === name);
  return match ? match[1] : null;
};

/** The one sign-in route. Every Get Started and Login link points here. */
export const LOGIN_PATH = '/login';

export const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#about', label: 'About' },
  { href: '#team', label: 'Meet the Team' },
] as const;

export interface ScreenshotView {
  /** Tab label when a screen has several views, e.g. one dashboard per role. */
  label: string;
  /** Null until the screenshot file is added. */
  src: string | null;
  /** Path shown in the mock browser address bar. */
  path: string;
  /** Replaces the screen caption while this view is selected. */
  caption?: string;
  /** Frame title for this view; defaults to "<label> <screen label>", e.g. "VPAA Dashboard". */
  name?: string;
}

export interface Screenshot {
  id: string;
  label: string;
  title: string;
  caption: string;
  /** At least one. Several views show a switcher, e.g. the three role dashboards. */
  views: ScreenshotView[];
}

const singleView = (file: string, path: string): ScreenshotView[] => [{ label: '', src: screenshot(file), path }];

export const SCREENSHOTS: Screenshot[] = [
  {
    id: 'dashboard',
    label: 'Dashboards',
    title: 'A dashboard for every role',
    caption: 'Each role signs in to its own dashboard, built around the scheduling and approval work it is responsible for.',
    views: [
      {
        label: 'VPAA',
        src: screenshot('dashboard-vpaa'),
        path: '/dashboard',
        caption: 'Institution-wide view of every department’s scheduling and approval progress.',
      },
      {
        label: 'Dean',
        src: screenshot('dashboard-dean'),
        path: '/dean/dashboard',
        caption: 'Department view of schedules awaiting approval, scheduling completion and the department timetable.',
      },
      {
        label: 'Secretary · Program Head · Director',
        src: screenshot('dashboard-department'),
        path: '/secretary/dashboard',
        caption: 'One shared dashboard for the department office: items needing attention, room and laboratory alerts, drafting completion and the department timetable.',
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule Management',
    title: 'Build section timetables in one workspace',
    caption: 'Plot each section’s classes by hand or generate them, track how many sections the department has plotted, and submit to the Dean once every section is ready. Instructors are assigned after approval.',
    views: singleView('schedule-management', '/secretary/schedule-management'),
  },
  {
    id: 'conflicts',
    label: 'Conflict Detection',
    title: 'Catch clashes before they are saved',
    caption: 'Conflicts are checked when each class is placed on a timetable and again when instructors are assigned.',
    views: [
      {
        label: 'Class placement',
        name: 'Conflict Detection · Class placement',
        src: screenshot('conflict-placement'),
        path: '/secretary/schedule-management',
        caption: 'A placement that clashes is blocked with the exact reason, such as a room already booked by another class at that time, and View Alternatives offers valid options.',
      },
      {
        label: 'Instructor assignment',
        name: 'Conflict Detection · Instructor assignment',
        src: screenshot('conflict-detection'),
        path: '/secretary/schedule-management',
        caption: 'Sections that clash with an instructor’s existing classes are marked as conflicts with the reason shown, and loads past an instructor’s limit are flagged as overload.',
      },
    ],
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    title: 'Get conflict-free alternatives in one click',
    caption: 'When a placement does not fit, Suggested Alternatives lists ranked, conflict-free rooms and times for each meeting, by best match, weekdays or weekend. Choosing one fills in the form for review; nothing is saved until you confirm.',
    views: singleView('recommendations', '/secretary/schedule-management'),
  },
  {
    id: 'reports',
    label: 'Reports',
    title: 'Reports built only from approved schedules',
    caption: 'Institutional reports for each academic term use only VPAA-approved schedules and officially assigned workloads, ready to preview.',
    views: [
      {
        label: 'Department Schedule',
        name: 'Reports · Department Schedule',
        src: screenshot('reports-department-schedule'),
        path: '/reports',
        caption: 'Class schedules for every department, each marked ready once its sections are VPAA-approved, with all programs included.',
      },
      {
        label: 'Teaching Load',
        name: 'Reports · Teaching Load',
        src: screenshot('reports-teaching-load'),
        path: '/reports',
        caption: 'Instructor loads for every department: assignments, basic load, deload units and overload capacity, counted only from VPAA-approved loads.',
      },
      {
        label: 'Room Utilization',
        name: 'Reports · Room Utilization',
        src: screenshot('reports-room-utilization'),
        path: '/reports',
        caption: 'Room utilization for every department: facilities occupancy, lecture versus laboratory capacity and booked hours, from approved sections.',
      },
    ],
  },
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: Feature[] = [
  {
    icon: CalendarCog,
    title: 'Intelligent Academic Scheduling',
    description: 'Plan section timetables from curriculum, courses, rooms and instructor assignments in a single guided workspace.',
  },
  {
    icon: ShieldAlert,
    title: 'Rule-Based Conflict Detection',
    description: 'Overlapping rooms, instructors and sections are detected against defined scheduling rules before a schedule is submitted.',
  },
  {
    icon: Sparkles,
    title: 'CSP-Based Recommendations',
    description: 'A constraint satisfaction solver suggests valid rooms and time slots, so offices start from options that already fit.',
  },
  {
    icon: CalendarRange,
    title: 'Schedule Management',
    description: 'Create, revise and resubmit schedules with a full history of submissions, returns and corrections.',
  },
  {
    icon: BarChart3,
    title: 'Room Utilization Monitoring',
    description: 'Track room occupancy across the week and generate printable utilization reports for planning.',
  },
  {
    icon: GitPullRequestArrow,
    title: 'Structured Approval Workflow',
    description: 'Schedules move from the department office to the Dean and then the VPAA, with comments at every stage.',
  },
];

export interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const STEPS: Step[] = [
  { icon: ListChecks, title: 'Prepare scheduling information', description: 'Set up curriculum, courses, sections, rooms and instructor assignments for the semester.' },
  { icon: ClipboardCheck, title: 'Validate requirements', description: 'Check each section against required hours, room types and instructor availability.' },
  { icon: Sparkles, title: 'Generate recommendations', description: 'Let the solver propose placements that satisfy the scheduling constraints.' },
  { icon: ShieldAlert, title: 'Review and resolve conflicts', description: 'Inspect flagged overlaps and adjust rooms, times or instructors before submitting.' },
  { icon: FileCheck2, title: 'Submit and approve', description: 'Submit to the Dean for review, then to the VPAA for final approval and publication.' },
];

export interface RoleCard {
  role: string;
  summary: string;
  duties: string[];
}

export const ROLES: RoleCard[] = [
  {
    role: 'VPAA',
    summary: 'Gives final approval and oversees scheduling institution-wide.',
    duties: ['Final schedule approval', 'Manages accounts, departments and facilities', 'Reviews reports and activity logs'],
  },
  {
    role: 'Dean',
    summary: 'Reviews department schedules before they go to the VPAA.',
    duties: ['First-level schedule review', 'Returns schedules with comments', 'Monitors department progress'],
  },
  {
    role: 'Program Head',
    summary: 'Builds and maintains the timetables for their program.',
    duties: ['Plots program section schedules', 'Assigns instructors to classes', 'Resolves program-level conflicts'],
  },
  {
    role: 'Secretary',
    summary: 'Runs the department office that prepares and submits schedules.',
    duties: ['Sets up sections, courses and rooms', 'Builds and submits department schedules', 'Handles room requests and corrections'],
  },
];

export const ABOUT_POINTS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Workflow, title: 'One shared source', description: 'Department offices, Deans and the VPAA read and act on the same schedule data instead of passing files around.' },
  { icon: ClipboardCheck, title: 'Recorded accountability', description: 'Every submission, return and approval is kept in the schedule history with its comments.' },
  { icon: ListChecks, title: 'Rules applied evenly', description: 'Every department and program is checked against the same scheduling rules.' },
  { icon: BarChart3, title: 'Data for planning', description: 'Approved schedules become a dependable basis for room, faculty and semester planning.' },
];

export interface TeamMember {
  name: string;
  role: string;
  /** Short personal introduction, shown in the profile dialog. */
  intro?: string;
  /** What they were responsible for in the project, one item per line. */
  responsibilities?: string[];
  /** Their specific contribution to TCCSched. */
  contribution?: string;
  /** Imported image URL. Leave null to show the placeholder portrait. */
  photo: string | null;
  /** CSS object-position for the portrait crop, e.g. '50% 30%'. Defaults to '50% 25%' (face in the upper third). */
  photoPosition?: string;
  github?: string;
  linkedin?: string;
}

/*
 * Placeholders until the team provides real names, roles and photos. Clicking a card opens a
 * profile dialog; any of intro / responsibilities / contribution left unset shows
 * "To be provided" there instead of invented text.
 * Put portraits in src/assets/team/ (4:5 ratio, at least 480x600), import them at the top of
 * this file and set `photo`. Do not use generated or stock images.
 */

/** Shown on its own, above the development team. */
export const ADVISER: TeamMember = {
  name: 'Kay Rejoice C. Waga',
  role: 'Project Adviser',
  photo: null,
};

/**
 * Exactly six, in this order; they share one row on desktop. Names and positions are the official
 * ones provided by the team; keep their spelling and initials. Add `photo`, `intro`,
 * `responsibilities` and `contribution` per person as the team provides them.
 */
export const TEAM: TeamMember[] = [
  { name: 'Cardinez, Dessa Mae Krism B.', role: 'Project Manager', photo: null },
  { name: 'Bacarro, Rexyl Ann A.', role: 'Technical Writer', photo: null },
  { name: 'Villarosa, John Carlo T.', role: 'System Analyst 1', photo: null },
  { name: 'Salcedo, Carrex Lawren M.', role: 'System Analyst 2', photo: null },
  { name: 'Vestal, Lochinvar Kyle C.', role: 'Programmer 1', photo: null },
  { name: 'Dadubo, Richie T.', role: 'Programmer 2', photo: null },
];

/** Shown in the footer only when set. */
export const SUPPORT_EMAIL: string | null = null;
