export type OnboardingRole = 'vpaa' | 'dean' | 'secretary' | 'program_head';

export interface OnboardingTask {
  title: string;
  description: string;
  path: string;
  optional?: boolean;
}

export interface OnboardingTourStep {
  element?: string;
  title: string;
  description: string;
  placement?: 'right-start' | 'bottom' | 'bottom-end';
}

export interface RoleOnboardingFlow {
  eyebrow: string;
  title: string;
  introduction: string;
  tasks: OnboardingTask[];
  tourSteps: OnboardingTourStep[];
}

const departmentTasks = (role: 'secretary' | 'program_head'): OnboardingTask[] => {
  const prefix = `/${role}`;
  return [
    {
      title: 'Create and activate the curriculum',
      description: 'Set the curriculum first because it defines which courses the department or program offers.',
      path: `${prefix}/curriculum`,
    },
    {
      title: 'Add and review curriculum courses',
      description: 'Confirm course codes, units, year levels, semesters, categories, and room requirements.',
      path: `${prefix}/courses`,
    },
    {
      title: 'Create sections for the active term',
      description: 'Add the student sections that will receive schedules for each required year level.',
      path: `${prefix}/sections`,
    },
    {
      title: 'Review instructors',
      description: role === 'secretary'
        ? 'Check teaching loads and availability before assigning classes.'
        : 'Confirm the instructors available to your program before scheduling.',
      path: role === 'secretary' ? `${prefix}/instructors` : `${prefix}/faculty`,
    },
    {
      title: 'Review rooms and scheduling rules',
      description: 'Check the rooms available to the department and review the scheduling settings that affect generation.',
      path: `${prefix}/rooms`,
    },
    {
      title: 'Confirm course-teaching assignments',
      description: 'Record which department teaches delegable service courses before instructor assignment.',
      path: `${prefix}/course-teaching-assignments`,
    },
    {
      title: 'Generate or build the schedules',
      description: 'Generate proposals or plot manually, then resolve all room, faculty, and time conflicts.',
      path: `${prefix}/schedules`,
    },
    {
      title: 'Complete and submit the schedules',
      description: 'Finish every required section and submit the department package to the Dean for review.',
      path: `${prefix}/schedules`,
    },
    {
      title: 'Assign instructors after approval',
      description: 'After VPAA approval moves the workflow forward, assign eligible instructors and finalize the sections.',
      path: `${prefix}/instructor-assignment`,
    },
  ];
};

const departmentTourSteps: OnboardingTourStep[] = [
  {
    title: 'Welcome to the scheduling workflow',
    description: 'Follow the recommended setup order before generating schedules. You can reopen Getting Started from the bottom of the sidebar at any time.',
  },
  { element: '#sidebar-dashboard', title: 'Start from the dashboard', description: 'Use the dashboard to see active-term progress, missing schedules, and returned work.', placement: 'right-start' },
  { element: '#sidebar-courses', title: '1. Curriculum and courses', description: 'Create and activate the curriculum first, then verify the courses placed in it.', placement: 'right-start' },
  { element: '#sidebar-sections', title: '2. Sections', description: 'Create the active-term sections only after the curriculum and course offerings are ready.', placement: 'right-start' },
  { element: '#sidebar-instructors', title: '3. Instructors', description: 'Review instructor eligibility, teaching load, and availability before assignments.', placement: 'right-start' },
  { element: '#sidebar-rooms', title: '4. Rooms', description: 'Review room availability and room types used by schedule generation.', placement: 'right-start' },
  { element: '#sidebar-schedules', title: '5. Build and submit schedules', description: 'Confirm teaching assignments, generate or plot schedules, resolve conflicts, and submit completed sections.', placement: 'right-start' },
  { element: '#sidebar-settings', title: 'Scheduling settings', description: 'Review special scheduling rules before generation when your department needs exceptions.', placement: 'right-start' },
  { element: '#sidebar-getting-started', title: 'Getting Started stays available', description: 'Use this sidebar button whenever you need to review the recommended workflow again.', placement: 'right-start' },
];

export const roleOnboardingFlows: Record<OnboardingRole, RoleOnboardingFlow> = {
  vpaa: {
    eyebrow: 'Institution Setup and Final Review',
    title: 'VPAA onboarding',
    introduction: 'Configure institution-wide prerequisites, monitor every department, and complete final schedule approval.',
    tasks: [
      { title: 'Configure departments and programs', description: 'Create the academic units and programs that own users, curricula, courses, and schedules.', path: '/departments' },
      { title: 'Create users and faculty records', description: 'Add role-based accounts and maintain the institution-wide instructor roster.', path: '/users' },
      { title: 'Set the active academic term', description: 'Create or activate the term that sections and schedules will use.', path: '/settings' },
      { title: 'Configure rooms and timeslots', description: 'Maintain the room inventory and institution-level scheduling availability.', path: '/rooms' },
      { title: 'Monitor curriculum and scheduling progress', description: 'Review curricula, department schedules, conflicts, and incomplete work.', path: '/schedules' },
      { title: 'Review Dean-approved schedules', description: 'Approve correct schedule packages or return them with a clear revision reason.', path: '/schedules/approval' },
      { title: 'Review reports and audit history', description: 'Use reports, schedule history, and activity logs to monitor institutional scheduling.', path: '/reports' },
    ],
    tourSteps: [
      { title: 'Welcome to VPAA onboarding', description: 'Your workflow combines institution setup, monitoring, and final approval.' },
      { element: '#sidebar-dashboard', title: 'Institution overview', description: 'Monitor scheduling readiness and approval progress across departments.', placement: 'right-start' },
      { element: '#sidebar-departments', title: '1. Departments and programs', description: 'Create the academic structure before users, curricula, and schedules are prepared.', placement: 'right-start' },
      { element: '#sidebar-users', title: '2. Users and faculty ownership', description: 'Create role-based accounts and maintain the official faculty roster.', placement: 'right-start' },
      { element: '#sidebar-settings', title: '3. Academic term and system settings', description: 'Activate the correct term and review institution-level scheduling settings.', placement: 'right-start' },
      { element: '#sidebar-rooms', title: '4. Rooms', description: 'Maintain the institution-wide room inventory used during generation and validation.', placement: 'right-start' },
      { element: '#sidebar-schedules', title: '5. Monitor and approve schedules', description: 'Review schedules, then complete final approval after the Dean approves them.', placement: 'right-start' },
      { element: '#sidebar-reports', title: '6. Reports and audit trail', description: 'Review reports, history, and activity logs after scheduling operations.', placement: 'right-start' },
      { element: '#sidebar-getting-started', title: 'Reopen Getting Started', description: 'Use this sidebar button to restart the VPAA workflow guide whenever needed.', placement: 'right-start' },
    ],
  },
  dean: {
    eyebrow: 'Review and Approval',
    title: 'Dean onboarding',
    introduction: 'The Dean reviews department work. You do not create sections, edit curricula, generate schedules, or maintain rooms.',
    tasks: [
      { title: 'Monitor department readiness', description: 'Use the dashboard to see submitted, returned, and approved schedule progress.', path: '/dean/dashboard' },
      { title: 'View department schedules', description: 'Inspect section timetables, courses, instructors, rooms, and detected conflicts.', path: '/dean/schedules' },
      { title: 'Review pending approval requests', description: 'Open each submitted package and verify it before taking action.', path: '/dean/schedules/approval' },
      { title: 'Approve or return the package', description: 'Approve valid schedules or return them with a clear and actionable revision reason.', path: '/dean/schedules/approval' },
      { title: 'Review faculty and room references', description: 'Use these pages as read-only references while checking submitted schedules.', path: '/dean/faculty', optional: true },
      { title: 'Monitor reports and schedule history', description: 'Track completed reviews, revisions, and historical scheduling changes.', path: '/dean/reports', optional: true },
    ],
    tourSteps: [
      { title: 'Welcome to Dean onboarding', description: 'Your role is review and approval. Scheduling setup and CRUD operations remain with the operational roles.' },
      { element: '#sidebar-dashboard', title: 'Review readiness', description: 'Start here to see submitted schedules and departments that still need action.', placement: 'right-start' },
      { element: '#sidebar-schedules', title: 'Inspect and approve schedules', description: 'View department schedules and open Schedule Approval to approve or return submissions.', placement: 'right-start' },
      { element: '#sidebar-faculty', title: 'Faculty reference', description: 'Review faculty information as read-only supporting data during approval.', placement: 'right-start' },
      { element: '#sidebar-rooms', title: 'Room reference', description: 'Review room information as read-only supporting data. Room management belongs to VPAA.', placement: 'right-start' },
      { element: '#sidebar-reports', title: 'Reports and history', description: 'Monitor approval results and schedule history after reviews are completed.', placement: 'right-start' },
      { element: '#sidebar-getting-started', title: 'Reopen Getting Started', description: 'Use this sidebar button to reopen the Dean review guide.', placement: 'right-start' },
    ],
  },
  secretary: {
    eyebrow: 'Department Schedule Preparation',
    title: 'Secretary onboarding',
    introduction: 'Prepare the department data in order, build conflict-free schedules, and submit the completed package for approval.',
    tasks: departmentTasks('secretary'),
    tourSteps: departmentTourSteps,
  },
  program_head: {
    eyebrow: 'Program Schedule Preparation',
    title: 'Program Head onboarding',
    introduction: 'Prepare program-scoped academic data, build schedules, and complete instructor assignments within your program authority.',
    tasks: departmentTasks('program_head'),
    tourSteps: departmentTourSteps,
  },
};

export const resolveOnboardingRole = (role?: string): OnboardingRole | null => {
  const normalized = role?.toLowerCase();
  return normalized === 'vpaa' || normalized === 'dean' || normalized === 'secretary' || normalized === 'program_head'
    ? normalized
    : null;
};
