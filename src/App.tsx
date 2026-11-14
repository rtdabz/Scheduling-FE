import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import { fetchCurrentUser } from './lib/currentUser';
import { getStoredUser, getStoredUserRole, MULTIPLE_PROGRAMS_LOCK_MESSAGE, NO_PROGRAM_LOCK_MESSAGE, requiresDepartmentProgram, type StoredUser } from './lib/storedUser';
import { useLiveRevision } from './hooks/useLiveRefresh';
import LockedModuleView from './components/ui/LockedModuleView';
import { CROSS_DEPARTMENT_LOCKED_MESSAGE, useDepartmentScheduleStatus } from './hooks/useDepartmentScheduleStatus';
import { lazyPage, registerPagePrefetch } from './lib/pagePrefetch';
import ModuleArchiveTabs from './pages/vpaa/archive/ModuleArchiveTabs';
import ArchiveRedirect from './pages/vpaa/archive/ArchiveRedirect';
import { dashboardPathForRole } from './lib/roles';

const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const ScheduleApprovalPage = lazyPage(() => import('./pages/shared/ScheduleApprovalPage'));
const VpaaCalendarPage = lazyPage(() => import('./pages/vpaa/CalendarPage'));
const Faculty = lazyPage(() => import('./pages/shared/Faculty'));
const Rooms = lazyPage(() => import('./pages/shared/Rooms'));
const VpaaUsers = lazyPage(() => import('./pages/vpaa/Users'));
const Departments = lazyPage(() => import('./pages/vpaa/Departments'));
const Reports = lazyPage(() => import('./pages/shared/Reports'));
const RoomRequests = lazyPage(() => import('./pages/shared/RoomRequests'));
const VpaaActivityLog = lazyPage(() => import('./pages/vpaa/ActivityLog'));
const VpaaLoginDetails = lazyPage(() => import('./pages/vpaa/LoginDetailsPage'));
const VpaaScheduleHistory = lazyPage(() => import('./pages/vpaa/ScheduleHistory'));
const Settings = lazyPage(() => import('./pages/vpaa/Settings'));

const DeanSchedules = lazyPage(() => import('./pages/dean/Schedules'));
const SecretaryScheduleBuilder = lazyPage(() => import('./pages/secretary/ScheduleBuilder'));
const SecretarySchedules = lazyPage(() => import('./pages/secretary/Schedules'));
const SecretaryProgramRooms = lazyPage(() => import('./pages/secretary/ProgramRooms'));
const SecretarySectionTimetables = lazyPage(() => import('./pages/secretary/SectionTimetables'));
const ProgramHeadScheduleBuilder = lazyPage(() => import('./pages/program_head/ScheduleBuilder'));
const ProgramHeadSchedules = lazyPage(() => import('./pages/program_head/Schedules'));
const ProgramHeadSectionTimetables = lazyPage(() => import('./pages/program_head/SectionTimetables'));
const Designations = lazyPage(() => import('./pages/shared/Designations'));
const InstructorAssignment = lazyPage(() => import('./pages/ClassSchedules/InstructorAssignment'));
const CrossDepartmentAssignments = lazyPage(() => import('./pages/ClassSchedules/CrossDepartmentAssignments'));
const CourseTeachingAssignments = lazyPage(() => import('./pages/ClassSchedules/CourseTeachingAssignments'));
const SecretaryCourses = lazyPage(() => import('./pages/secretary/Courses'));

const CurriculumListPage = lazyPage(() => import('./pages/curriculum/CurriculumListPage'));
const CurriculumDetailPage = lazyPage(() => import('./pages/curriculum/CurriculumDetailPage'));
const CurriculumImportPage = lazyPage(() => import('./pages/curriculum/CurriculumImportPage'));
const SecretarySections = lazyPage(() => import('./pages/secretary/Sections'));

registerPagePrefetch([
  [ScheduleApprovalPage, ['/schedules/approval', '/dean/schedules/approval']],
  [VpaaCalendarPage, ['/calendar']],
  [Faculty, ['/instructors', '/dean/instructors', '/secretary/instructors', '/director/instructors', '/program_head/instructors']],
  [Designations, ['/designations']],
  [Rooms, ['/facilities', '/dean/facilities', '/secretary/facilities', '/director/facilities', '/program_head/facilities']],
  [CurriculumListPage, ['/curriculum', '/dean/curriculum', '/secretary/curriculum', '/director/curriculum', '/program_head/curriculum']],
  [VpaaUsers, ['/users']],
  [Departments, ['/departments', '/dean/departments', '/secretary/departments', '/director/departments', '/program_head/departments']],
  [Reports, ['/reports', '/dean/reports', '/secretary/reports', '/director/reports', '/program_head/reports']],
  [RoomRequests, ['/secretary/room-requests', '/director/room-requests']],
  [VpaaActivityLog, ['/activity-log']],
  [VpaaScheduleHistory, ['/schedule-history', '/dean/schedule-history', '/secretary/schedule-history', '/director/schedule-history', '/program_head/schedule-history']],
  [Settings, ['/settings']],
  [DeanSchedules, ['/dean/schedules']],
  [SecretaryScheduleBuilder, ['/secretary/schedule-management', '/director/schedule-management']],
  [SecretarySchedules, ['/secretary/schedules', '/director/schedules']],
  [SecretarySectionTimetables, ['/secretary/section-timetables', '/director/section-timetables']],
  [SecretaryProgramRooms, ['/secretary/program-rooms', '/director/program-rooms']],
  [SecretaryCourses, ['/secretary/courses', '/director/courses', '/program_head/courses', '/dean/courses']],
  [SecretarySections, ['/secretary/sections', '/director/sections', '/program_head/sections', '/dean/sections']],
  [InstructorAssignment, ['/secretary/instructor-assignment', '/director/instructor-assignment', '/program_head/instructor-assignment']],
  [CrossDepartmentAssignments, ['/secretary/cross-department-assignments', '/director/cross-department-assignments', '/program_head/cross-department-assignments']],
  [CourseTeachingAssignments, ['/secretary/course-assignments', '/director/course-assignments', '/program_head/course-assignments']],
  [ProgramHeadScheduleBuilder, ['/program_head/schedule-management']],
  [ProgramHeadSchedules, ['/program_head/schedules']],
  [ProgramHeadSectionTimetables, ['/program_head/section-timetables']],
]);

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
  ['/director/rooms', '/director/facilities'],
  ['/director/schedule-builder', '/director/schedule-management'],
  ['/director/course-teaching-assignments', '/director/course-assignments'],
  ['/director/course-list', '/director/courses'],
  ['/director/subjects', '/director/courses'],
  ['/program_head/faculty', '/program_head/instructors'],
  ['/program_head/rooms', '/program_head/facilities'],
  ['/program_head/schedule-builder', '/program_head/schedule-management'],
  ['/program_head/course-teaching-assignments', '/program_head/course-assignments'],
  ['/program_head/course-list', '/program_head/courses'],
];

type CapabilityUser = Pick<StoredUser, 'permissions' | 'scheduling_ready' | 'capability_catalog' | 'department_program_count'>;

const hasRequestedCapability = (user: CapabilityUser | null, capability: string | string[]): boolean => {
  if (!user) return false;
  const requested = Array.isArray(capability) ? capability : [capability];
  const usable = user.scheduling_ready === false
    ? requested.filter((name) => !requiresDepartmentProgram(name, user.capability_catalog))
    : requested;
  return usable.some((name) => (user.permissions ?? []).includes(name));
};

const getStoredRole = (): string => {
  return getStoredUserRole();
};

const getDashboardRole = (): UserRole | string => getStoredRole();

const getDashboardPath = (role: string): string => dashboardPathForRole(role);

const DashboardRoute = () => <Dashboard role={getDashboardRole()} />;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
};

type RouteAccess = 'granted' | 'denied' | 'no_program' | 'single_program';

const routeAccess = (user: CapabilityUser | null, capability: string | string[], requiresProgram: boolean, requiresMultiplePrograms: boolean): RouteAccess => {
  if (!hasRequestedCapability(user, capability)) return 'denied';
  // The department's program records decide program-bound modules (`scheduling_ready` on /me).
  if (requiresProgram && user?.scheduling_ready === false) return 'no_program';
  return requiresMultiplePrograms && (user?.department_program_count ?? 0) <= 1 ? 'single_program' : 'granted';
};

const CapabilityRoute = ({
  capability,
  moduleName,
  requiresProgram = false,
  requiresMultiplePrograms = false,
  children,
}: {
  capability: string | string[];
  moduleName?: string;
  /** Lock while the department has no program, even if the capability itself does not need one. */
  requiresProgram?: boolean;
  requiresMultiplePrograms?: boolean;
  children: React.ReactNode;
}) => {
  const [access, setAccess] = useState<RouteAccess | null>(() => {
    const storedUser = getStoredUser();
    return storedUser ? routeAccess(storedUser, capability, requiresProgram, requiresMultiplePrograms) : null;
  });
  // Adding or removing a program publishes `departments`; recheck so an open page relocks or unlocks.
  const departmentsRevision = useLiveRevision(['departments']);

  useEffect(() => {
    let active = true;

    fetchCurrentUser({ force: departmentsRevision > 0 })
      .then((data) => {
        if (active) setAccess(routeAccess(data, capability, requiresProgram, requiresMultiplePrograms));
      })
      .catch(() => {
        if (active) setAccess((current) => current ?? 'denied');
      });

    return () => {
      active = false;
    };
  }, [capability, requiresProgram, requiresMultiplePrograms, departmentsRevision]);

  if (access === null) {
    return <div className="flex min-h-[60vh] items-center justify-center" aria-label="Checking access" />;
  }

  if (access === 'no_program') {
    return <LockedModuleView moduleName={moduleName} message={NO_PROGRAM_LOCK_MESSAGE} />;
  }
  if (access === 'single_program') {
    return <LockedModuleView moduleName={moduleName} message={MULTIPLE_PROGRAMS_LOCK_MESSAGE} />;
  }
  if (access === 'denied') {
    return <LockedModuleView moduleName={moduleName} requiredCapability={capability} />;
  }
  return <>{children}</>;
};

const CrossDepartmentApprovalRoute = ({
  moduleName,
  children,
}: {
  moduleName: string;
  children: React.ReactNode;
}) => {
  const { crossDepartmentUnlocked, loading } = useDepartmentScheduleStatus(getStoredUser()?.department_id);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center" aria-label="Checking schedule approval" />;
  }

  if (!crossDepartmentUnlocked) {
    return <LockedModuleView moduleName={moduleName} message={CROSS_DEPARTMENT_LOCKED_MESSAGE} />;
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
      .catch(() => undefined);
  }, []);

  return <RouterProvider router={appRouter} useTransitions={false} />;
}

/**
 * The department office workspace. A Secretary uses it under /secretary/* and a Director under
 * /director/*: the same pages, guards and capabilities, with the account's own role identity.
 */
const departmentOfficeRoutes = (base: '/secretary' | '/director') => [
    <Route key={`${base}/dashboard`} path={`${base}/dashboard`} element={<DashboardRoute />} />,
    <Route key={`${base}/departments`} path={`${base}/departments`} element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />,
    <Route key={`${base}/schedule-management`} path={`${base}/schedule-management`} element={<CapabilityRoute requiresProgram capability="schedule.create" moduleName="Schedule Management"><SecretaryScheduleBuilder /></CapabilityRoute>} />,
    <Route key={`${base}/schedules`} path={`${base}/schedules`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedules"><SecretarySchedules /></CapabilityRoute>} />,
    <Route key={`${base}/section-timetables`} path={`${base}/section-timetables`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Section Timetables"><SecretarySectionTimetables /></CapabilityRoute>} />,
    <Route key={`${base}/facilities`} path={`${base}/facilities`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Facilities"><Rooms /></CapabilityRoute>} />,
    <Route key={`${base}/room-requests`} path={`${base}/room-requests`} element={<CapabilityRoute capability="room.request" moduleName="Room Requests"><RoomRequests /></CapabilityRoute>} />,
    <Route key={`${base}/program-rooms`} path={`${base}/program-rooms`} element={<CapabilityRoute requiresProgram requiresMultiplePrograms capability="room.assign_program" moduleName="Program Rooms"><SecretaryProgramRooms /></CapabilityRoute>} />,
    <Route key={`${base}/courses`} path={`${base}/courses`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />,
    <Route key={`${base}/curriculum`} path={`${base}/curriculum`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />,
    <Route key={`${base}/curriculum/import`} path={`${base}/curriculum/import`} element={<CapabilityRoute requiresProgram capability="curriculum.manage" moduleName="Curriculum Import"><CurriculumImportPage /></CapabilityRoute>} />,
    <Route key={`${base}/curriculum/:id`} path={`${base}/curriculum/:id`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />,
    <Route key={`${base}/sections`} path={`${base}/sections`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />,
    <Route key={`${base}/instructors`} path={`${base}/instructors`} element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />,
    <Route key={`${base}/instructor-assignment`} path={`${base}/instructor-assignment`} element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />,
    <Route key={`${base}/reports`} path={`${base}/reports`} element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />,
    <Route key={`${base}/schedule-history`} path={`${base}/schedule-history`} element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />,
    <Route key={`${base}/cross-department-assignments`} path={`${base}/cross-department-assignments`} element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Cross-Department"><CrossDepartmentAssignments /></CapabilityRoute>} />,
    <Route key={`${base}/course-assignments`} path={`${base}/course-assignments`} element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Assignment"><CrossDepartmentApprovalRoute moduleName="Course Assignment"><CourseTeachingAssignments /></CrossDepartmentApprovalRoute></CapabilityRoute>} />,
    <Route key={`${base}/settings`} path={`${base}/settings`} element={<Navigate to={`${base}/schedule-management`} replace />} />,
];

const appRouter = createBrowserRouter(createRoutesFromElements(
      <>
          <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/schedules" element={<Navigate to="/schedules/approval" replace />} />
            <Route path="/schedules/approval" element={<CapabilityRoute capability="schedule.approve_vpaa" moduleName="Schedule Approval"><ScheduleApprovalPage stage="vpaa" /></CapabilityRoute>} />
            {/* Schedules have no archive; deletes are permanent. Old links land on Schedule Approval. */}
            <Route path="/schedules/archived" element={<Navigate to="/schedules/approval" replace />} />
            <Route path="/calendar" element={<CapabilityRoute capability="schedule.view" moduleName="Calendar"><VpaaCalendarPage /></CapabilityRoute>} />
            <Route path="/instructors" element={<RoleRoute role="vpaa" moduleName="Instructor Management"><ModuleArchiveTabs module="instructors" activeLabel="Instructors"><Faculty /></ModuleArchiveTabs></RoleRoute>} />
            <Route path="/designations" element={<RoleRoute role="vpaa" moduleName="Instructor Designations"><ModuleArchiveTabs module="designations" activeLabel="Designations"><Designations /></ModuleArchiveTabs></RoleRoute>} />
            <Route path="/facilities" element={<RoleRoute role="vpaa" moduleName="Facilities"><ModuleArchiveTabs module="facilities" activeLabel="Buildings & rooms"><Rooms /></ModuleArchiveTabs></RoleRoute>} />

            <Route path="/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/curriculum/archived-courses" element={<RoleRoute role="vpaa" moduleName="Archived Courses"><ModuleArchiveTabs module="curriculum" activeLabel="Courses" archiveOnly>{null}</ModuleArchiveTabs></RoleRoute>} />
            <Route path="/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/users" element={<RoleRoute role="vpaa" moduleName="User Management"><ModuleArchiveTabs module="users" activeLabel="Accounts"><VpaaUsers /></ModuleArchiveTabs></RoleRoute>} />
            <Route path="/departments" element={<RoleRoute role="vpaa" moduleName="Department Management"><ModuleArchiveTabs module="departments" activeLabel="Departments & programs"><Departments /></ModuleArchiveTabs></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute role="vpaa" moduleName="Reports"><Reports /></RoleRoute>} />
            <Route path="/activity-log" element={<RoleRoute role="vpaa" moduleName="Activity Log"><VpaaActivityLog /></RoleRoute>} />
            <Route path="/activity-log/logins/:id" element={<RoleRoute role="vpaa" moduleName="Activity Log"><VpaaLoginDetails /></RoleRoute>} />
            <Route path="/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            {/* The centralized Archive moved into each module; old links open the owning module's archive. */}
            <Route path="/archive" element={<RoleRoute role="vpaa" moduleName="Archive"><ArchiveRedirect /></RoleRoute>} />
            <Route path="/settings" element={<RoleRoute role="vpaa" moduleName="Settings"><Settings /></RoleRoute>} />

            <Route path="/dean/dashboard" element={<DashboardRoute />} />
            <Route path="/dean/schedules" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedules"><DeanSchedules /></CapabilityRoute>} />
            <Route path="/dean/schedules/approval" element={<CapabilityRoute requiresProgram capability="schedule.approve_dean" moduleName="Schedule Approval"><ScheduleApprovalPage stage="dean" /></CapabilityRoute>} />
            <Route path="/dean/departments" element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />
            <Route path="/dean/courses" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/dean/sections" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/dean/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />
            <Route path="/dean/facilities" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Facilities"><Rooms /></CapabilityRoute>} />

            <Route path="/dean/curriculum" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/dean/curriculum/:id" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/dean/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/dean/schedule-history" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/dean/settings" element={<Navigate to="/dean/dashboard" replace />} />

            {departmentOfficeRoutes('/secretary')}
            {departmentOfficeRoutes('/director')}

            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/departments" element={<CapabilityRoute capability="schedule.view" moduleName="Department Management"><Departments /></CapabilityRoute>} />
            <Route path="/program_head/schedule-management" element={<CapabilityRoute requiresProgram capability="schedule.create" moduleName="Schedule Management"><ProgramHeadScheduleBuilder /></CapabilityRoute>} />
            <Route path="/program_head/schedules" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedules"><ProgramHeadSchedules /></CapabilityRoute>} />
            <Route path="/program_head/section-timetables" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Section Timetables"><ProgramHeadSectionTimetables /></CapabilityRoute>} />
            <Route path="/program_head/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><Faculty /></CapabilityRoute>} />
            <Route path="/program_head/facilities" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Facilities"><Rooms /></CapabilityRoute>} />

            <Route path="/program_head/courses" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/curriculum" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/program_head/curriculum/import" element={<CapabilityRoute requiresProgram capability="curriculum.manage" moduleName="Curriculum Import"><CurriculumImportPage /></CapabilityRoute>} />
            <Route path="/program_head/curriculum/:id" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/program_head/sections" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/program_head/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/program_head/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/program_head/schedule-history" element={<CapabilityRoute requiresProgram capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/program_head/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Cross-Department"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/program_head/course-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Assignment"><CrossDepartmentApprovalRoute moduleName="Course Assignment"><CourseTeachingAssignments /></CrossDepartmentApprovalRoute></CapabilityRoute>} />
            <Route path="/program_head/settings" element={<Navigate to="/program_head/schedule-management" replace />} />

            {LEGACY_REDIRECTS.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
      </>
));
