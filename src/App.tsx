import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import { fetchCurrentUser } from './lib/currentUser';
import { getStoredUser, getStoredUserRole, requiresDepartmentProgram, type StoredUser } from './lib/storedUser';
import LockedModuleView from './components/ui/LockedModuleView';
import { lazyPage, registerPagePrefetch } from './lib/pagePrefetch';

// VPAA Pages
const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const VpaaSchedules = lazyPage(() => import('./pages/vpaa/Schedules'));
// Dean and VPAA review through one page; `stage` picks the queue and endpoints.
const ScheduleApprovalPage = lazyPage(() => import('./pages/shared/ScheduleApprovalPage'));
const VpaaCalendarPage = lazyPage(() => import('./pages/vpaa/CalendarPage'));
// One instructor roster for every portal; what a role may change is decided inside it.
const Faculty = lazyPage(() => import('./pages/shared/Faculty'));
// One room page for every portal; what a role may change is decided inside it.
const Rooms = lazyPage(() => import('./pages/shared/Rooms'));
const VpaaUsers = lazyPage(() => import('./pages/vpaa/Users'));
const Departments = lazyPage(() => import('./pages/vpaa/Departments'));
const Reports = lazyPage(() => import('./pages/shared/Reports'));
const RoomRequests = lazyPage(() => import('./pages/shared/RoomRequests'));
const VpaaActivityLog = lazyPage(() => import('./pages/vpaa/ActivityLog'));
const VpaaScheduleHistory = lazyPage(() => import('./pages/vpaa/ScheduleHistory'));
const VpaaArchive = lazyPage(() => import('./pages/vpaa/Archive'));
const Settings = lazyPage(() => import('./pages/vpaa/Settings'));

// Other Role Pages
const DeanSchedules = lazyPage(() => import('./pages/dean/Schedules'));
const SecretaryScheduleBuilder = lazyPage(() => import('./pages/secretary/ScheduleBuilder'));
const SecretarySchedules = lazyPage(() => import('./pages/secretary/Schedules'));
const SecretaryProgramRooms = lazyPage(() => import('./pages/secretary/ProgramRooms'));
const SecretarySectionTimetables = lazyPage(() => import('./pages/secretary/SectionTimetables'));
const ProgramHeadScheduleBuilder = lazyPage(() => import('./pages/program_head/ScheduleBuilder'));
const ProgramHeadSchedules = lazyPage(() => import('./pages/program_head/Schedules'));
const ProgramHeadSectionTimetables = lazyPage(() => import('./pages/program_head/SectionTimetables'));
// VPAA-only: a designation rewrites an instructor's Basic Load, so the list is
// maintained by the office that owns faculty loading. Other roles read the
// designation badge on their roster screens but have no route to this page.
const Designations = lazyPage(() => import('./pages/shared/Designations'));
const InstructorAssignment = lazyPage(() => import('./pages/ClassSchedules/InstructorAssignment'));
const CrossDepartmentAssignments = lazyPage(() => import('./pages/ClassSchedules/CrossDepartmentAssignments'));
const CourseTeachingAssignments = lazyPage(() => import('./pages/ClassSchedules/CourseTeachingAssignments'));
const SecretaryCourses = lazyPage(() => import('./pages/secretary/Courses'));

const CurriculumListPage = lazyPage(() => import('./pages/curriculum/CurriculumListPage'));
const CurriculumDetailPage = lazyPage(() => import('./pages/curriculum/CurriculumDetailPage'));
const SecretarySections = lazyPage(() => import('./pages/secretary/Sections'));

// Menu path -> page chunk, so the sidebar can start the download on hover.
// Paths that share a page share its chunk; a path missing here still works,
// it just loads on click. Keep in step with the routes below.
registerPagePrefetch([
  [VpaaSchedules, ['/schedules']],
  [ScheduleApprovalPage, ['/schedules/approval', '/dean/schedules/approval']],
  [VpaaCalendarPage, ['/calendar']],
  [Faculty, ['/instructors', '/dean/instructors', '/secretary/instructors', '/program_head/instructors']],
  [Designations, ['/designations']],
  [Rooms, ['/facilities', '/dean/facilities', '/secretary/facilities', '/program_head/facilities']],
  [CurriculumListPage, ['/curriculum', '/dean/curriculum', '/secretary/curriculum', '/program_head/curriculum']],
  [VpaaUsers, ['/users']],
  [Departments, ['/departments', '/dean/departments', '/secretary/departments', '/program_head/departments']],
  [Reports, ['/reports', '/dean/reports', '/secretary/reports', '/program_head/reports']],
  [RoomRequests, ['/secretary/room-requests']],
  [VpaaActivityLog, ['/activity-log']],
  [VpaaScheduleHistory, ['/schedule-history', '/dean/schedule-history', '/secretary/schedule-history', '/program_head/schedule-history']],
  [VpaaArchive, ['/archive']],
  [Settings, ['/settings']],
  [DeanSchedules, ['/dean/schedules']],
  [SecretaryScheduleBuilder, ['/secretary/schedule-management']],
  [SecretarySchedules, ['/secretary/schedules']],
  [SecretarySectionTimetables, ['/secretary/section-timetables']],
  [SecretaryProgramRooms, ['/secretary/program-rooms']],
  [SecretaryCourses, ['/secretary/courses', '/program_head/courses', '/dean/courses']],
  [SecretarySections, ['/secretary/sections', '/program_head/sections', '/dean/sections']],
  [InstructorAssignment, ['/secretary/instructor-assignment', '/program_head/instructor-assignment']],
  [CrossDepartmentAssignments, ['/secretary/cross-department-assignments', '/program_head/cross-department-assignments']],
  [CourseTeachingAssignments, ['/secretary/course-assignments', '/program_head/course-assignments']],
  [ProgramHeadScheduleBuilder, ['/program_head/schedule-management']],
  [ProgramHeadSchedules, ['/program_head/schedules']],
  [ProgramHeadSectionTimetables, ['/program_head/section-timetables']],
]);

// Old path -> current path. URLs now follow the menu labels
// (Instructors, Facility, Schedule Management, Course Assignment).
const LEGACY_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ['/faculty', '/instructors'],
  ['/rooms', '/facilities'],
  ['/vpaa/calendar', '/calendar'],
  ['/dean/faculty', '/dean/instructors'],
  ['/dean/rooms', '/dean/facilities'],
  ['/secretary/rooms', '/secretary/facilities'],
  ['/secretary/schedule-builder', '/secretary/schedule-management'],
  ['/secretary/course-teaching-assignments', '/secretary/course-assignments'],
  ['/secretary/course-list', '/secretary/courses'],
  ['/secretary/subjects', '/secretary/courses'],
  ['/program_head/faculty', '/program_head/instructors'],
  ['/program_head/rooms', '/program_head/facilities'],
  ['/program_head/schedule-builder', '/program_head/schedule-management'],
  ['/program_head/course-teaching-assignments', '/program_head/course-assignments'],
  ['/program_head/course-list', '/program_head/courses'],
];

type CapabilityUser = Pick<StoredUser, 'permissions' | 'scheduling_ready' | 'capability_catalog'>;

const hasRequestedCapability = (user: CapabilityUser | null, capability: string | string[]): boolean => {
  if (!user) return false;
  const requested = Array.isArray(capability) ? capability : [capability];
  // Only the capabilities the server declares as program-dependent are withheld
  // from a program-less department; the rest stay usable, as the API allows.
  const usable = user.scheduling_ready === false
    ? requested.filter((name) => !requiresDepartmentProgram(name, user.capability_catalog))
    : requested;
  return usable.some((name) => (user.permissions ?? []).includes(name));
};

const getStoredRole = (): string => {
  return getStoredUserRole();
};

const getDashboardRole = (): UserRole | string => getStoredRole();

const getDashboardPath = (role: string): string => {
  if (role === 'dean') return '/dean/dashboard';
  if (role === 'secretary') return '/secretary/dashboard';
  if (role === 'program_head') return '/program_head/dashboard';
  return '/dashboard';
};

const DashboardRoute = () => <Dashboard role={getDashboardRole()} />;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const CapabilityRoute = ({
  capability,
  moduleName,
  children,
}: {
  capability: string | string[];
  moduleName?: string;
  children: React.ReactNode;
}) => {
  const [hasAccess, setHasAccess] = useState<boolean | null>(() => {
    const storedUser = getStoredUser();
    return storedUser ? hasRequestedCapability(storedUser, capability) : null;
  });

  useEffect(() => {
    let active = true;

    fetchCurrentUser()
      .then((data) => {
        if (active) setHasAccess(hasRequestedCapability(data, capability));
      })
      .catch(() => {
        // A failed refresh (offline, server down) says nothing about access, so
        // keep the stored session's answer; locking here showed "Access
        // Restricted" to accounts that hold the capability. Only fail closed
        // when there is no stored session to go on. The API still enforces it.
        if (active) setHasAccess((current) => current ?? false);
      });

    return () => {
      active = false;
    };
  }, [capability]);

  if (hasAccess === null) {
    return <div className="flex min-h-[60vh] items-center justify-center" aria-label="Checking access" />;
  }

  if (!hasAccess) {
    return <LockedModuleView moduleName={moduleName} requiredCapability={capability} />;
  }
  return <>{children}</>;
};

const RoleRoute = ({
  role,
  moduleName,
  children,
}: {
  role: string;
  moduleName: string;
  children: React.ReactNode;
}) => {
  if (getStoredUserRole() !== role) {
    return <LockedModuleView moduleName={moduleName} />;
  }
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) return <Navigate to={getDashboardPath(getStoredRole())} replace />;
  return <>{children}</>;
};

export default function App() {
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (storedUser) return;

    fetchCurrentUser()
      // A rejected token is handled once, by the API layer: it clears the
      // session and hands the shell an expiry notice to show. Nothing is left
      // for this call to do but stay quiet.
      .catch(() => undefined);
  }, []);

  return (
    // Navigations commit immediately. With transitions on (the v7 default) React
    // kept the previous page on screen until the next one finished rendering,
    // which on heavy or constantly refreshing pages looked like the click did
    // nothing. The per-route Suspense in AppLayout covers the chunk download.
    <BrowserRouter useTransitions={false}>
      <Routes>
          <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
          {/* Main Layout wrapper for all authenticated routes */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {/* VPAA Routes */}
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><VpaaSchedules /></CapabilityRoute>} />
            <Route path="/schedules/approval" element={<CapabilityRoute capability="schedule.approve_vpaa" moduleName="Schedule Approval"><ScheduleApprovalPage stage="vpaa" /></CapabilityRoute>} />
            <Route path="/calendar" element={<CapabilityRoute capability="schedule.view" moduleName="Calendar"><VpaaCalendarPage /></CapabilityRoute>} />
            <Route path="/instructors" element={<RoleRoute role="vpaa" moduleName="Instructor Management"><Faculty /></RoleRoute>} />
            <Route path="/designations" element={<RoleRoute role="vpaa" moduleName="Instructor Designations"><Designations /></RoleRoute>} />
            <Route path="/facilities" element={<RoleRoute role="vpaa" moduleName="Facility Management"><Rooms /></RoleRoute>} />

            <Route path="/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/users" element={<RoleRoute role="vpaa" moduleName="User Management"><VpaaUsers /></RoleRoute>} />
            <Route path="/departments" element={<RoleRoute role="vpaa" moduleName="Department Management"><Departments /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute role="vpaa" moduleName="Reports"><Reports /></RoleRoute>} />
            <Route path="/activity-log" element={<RoleRoute role="vpaa" moduleName="Activity Log"><VpaaActivityLog /></RoleRoute>} />
            <Route path="/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/archive" element={<RoleRoute role="vpaa" moduleName="Archive"><VpaaArchive /></RoleRoute>} />
            <Route path="/settings" element={<RoleRoute role="vpaa" moduleName="Settings"><Settings /></RoleRoute>} />

            {/* Dean Routes */}
            <Route path="/dean/dashboard" element={<DashboardRoute />} />
            <Route path="/dean/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="All Schedules"><DeanSchedules /></CapabilityRoute>} />
            <Route path="/dean/schedules/approval" element={<CapabilityRoute capability="schedule.approve_dean" moduleName="Schedule Approval"><ScheduleApprovalPage stage="dean" /></CapabilityRoute>} />
            <Route path="/dean/departments" element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />
            <Route path="/dean/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/dean/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/dean/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />
            <Route path="/dean/facilities" element={<CapabilityRoute capability="schedule.view" moduleName="Facility"><Rooms /></CapabilityRoute>} />

            <Route path="/dean/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/dean/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/dean/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/dean/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            {/* Dean account settings were retired; keep old bookmarks inside the Dean shell. */}
            <Route path="/dean/settings" element={<Navigate to="/dean/dashboard" replace />} />

            {/* Secretary Routes */}
            <Route path="/secretary/dashboard" element={<DashboardRoute />} />
            <Route path="/secretary/departments" element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />
            <Route path="/secretary/schedule-management" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Management"><SecretaryScheduleBuilder /></CapabilityRoute>} />
            <Route path="/secretary/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><SecretarySchedules /></CapabilityRoute>} />
            <Route path="/secretary/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><SecretarySectionTimetables /></CapabilityRoute>} />
            <Route path="/secretary/facilities" element={<CapabilityRoute capability="schedule.view" moduleName="Facility"><Rooms /></CapabilityRoute>} />
            <Route path="/secretary/room-requests" element={<CapabilityRoute capability="room.request" moduleName="Room Requests"><RoomRequests /></CapabilityRoute>} />
            <Route path="/secretary/program-rooms" element={<CapabilityRoute capability="room.assign_program" moduleName="Program Rooms"><SecretaryProgramRooms /></CapabilityRoute>} />

            <Route path="/secretary/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/secretary/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/secretary/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/secretary/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />
            <Route path="/secretary/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/secretary/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/secretary/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/secretary/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross-Department"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/secretary/course-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Assignment"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/secretary/settings" element={<Navigate to="/secretary/schedule-management" replace />} />
            
            {/* Program Head Routes */}
            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/departments" element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />
            <Route path="/program_head/schedule-management" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Management"><ProgramHeadScheduleBuilder /></CapabilityRoute>} />
            <Route path="/program_head/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><ProgramHeadSchedules /></CapabilityRoute>} />
            <Route path="/program_head/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><ProgramHeadSectionTimetables /></CapabilityRoute>} />
            <Route path="/program_head/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />
            <Route path="/program_head/facilities" element={<CapabilityRoute capability="schedule.view" moduleName="Facility"><Rooms /></CapabilityRoute>} />

            <Route path="/program_head/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/program_head/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/program_head/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/program_head/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/program_head/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/program_head/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/program_head/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross-Department"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/program_head/course-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Assignment"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/program_head/settings" element={<Navigate to="/program_head/schedule-management" replace />} />

            {/* Old URLs from before the paths were renamed to match the menu labels.
                Kept so bookmarks and stored notification links still land. */}
            {LEGACY_REDIRECTS.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
