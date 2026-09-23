import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import api from './lib/api';
import { getStoredUser, getStoredUserRole, requiresDepartmentProgram, type StoredUser } from './lib/storedUser';
import LockedModuleView from './components/ui/LockedModuleView';
import { lazyPage, registerPagePrefetch } from './lib/pagePrefetch';

// VPAA Pages
const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const VpaaSchedules = lazyPage(() => import('./pages/vpaa/Schedules'));
const VpaaScheduleApprovalPage = lazyPage(() => import('./pages/vpaa/ScheduleApprovalPage'));
const VpaaCalendarPage = lazyPage(() => import('./pages/vpaa/CalendarPage'));
const VpaaFaculty = lazyPage(() => import('./pages/vpaa/Faculty'));
const VpaaRooms = lazyPage(() => import('./pages/vpaa/Rooms'));
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
const DeanScheduleApprovalPage = lazyPage(() => import('./pages/dean/ScheduleApprovalPage'));
const DeanFaculty = lazyPage(() => import('./pages/dean/Faculty'));
const DeanRooms = lazyPage(() => import('./pages/dean/Rooms'));
const SecretaryScheduleBuilder = lazyPage(() => import('./pages/secretary/ScheduleBuilder'));
const SecretarySchedules = lazyPage(() => import('./pages/secretary/Schedules'));
const SecretaryRooms = lazyPage(() => import('./pages/secretary/Rooms'));
const SecretaryFaculty = lazyPage(() => import('./pages/secretary/Faculty'));
const SecretarySectionTimetables = lazyPage(() => import('./pages/secretary/SectionTimetables'));
const ProgramHeadScheduleBuilder = lazyPage(() => import('./pages/program_head/ScheduleBuilder'));
const ProgramHeadSchedules = lazyPage(() => import('./pages/program_head/Schedules'));
const ProgramHeadSectionTimetables = lazyPage(() => import('./pages/program_head/SectionTimetables'));
const ProgramHeadFaculty = lazyPage(() => import('./pages/program_head/Faculty'));
// VPAA-only: a designation rewrites an instructor's Basic Load, so the list is
// maintained by the office that owns faculty loading. Other roles read the
// designation badge on their roster screens but have no route to this page.
const Designations = lazyPage(() => import('./pages/shared/Designations'));
const ProgramHeadRooms = lazyPage(() => import('./pages/program_head/Rooms'));
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
  [VpaaScheduleApprovalPage, ['/schedules/approval']],
  [VpaaCalendarPage, ['/calendar', '/vpaa/calendar']],
  [VpaaFaculty, ['/faculty']],
  [Designations, ['/designations']],
  [VpaaRooms, ['/rooms']],
  [CurriculumListPage, ['/curriculum', '/dean/curriculum', '/secretary/curriculum', '/program_head/curriculum']],
  [VpaaUsers, ['/users']],
  [Departments, ['/departments']],
  [Reports, ['/reports', '/dean/reports', '/secretary/reports', '/program_head/reports']],
  [RoomRequests, ['/room-requests', '/secretary/room-requests', '/program_head/room-requests']],
  [VpaaActivityLog, ['/activity-log']],
  [VpaaScheduleHistory, ['/schedule-history', '/dean/schedule-history', '/secretary/schedule-history', '/program_head/schedule-history']],
  [VpaaArchive, ['/archive']],
  [Settings, ['/settings']],
  [DeanSchedules, ['/dean/schedules']],
  [DeanScheduleApprovalPage, ['/dean/schedules/approval']],
  [DeanFaculty, ['/dean/faculty']],
  [DeanRooms, ['/dean/rooms']],
  [SecretaryScheduleBuilder, ['/secretary/schedule-builder']],
  [SecretarySchedules, ['/secretary/schedules']],
  [SecretarySectionTimetables, ['/secretary/section-timetables']],
  [SecretaryRooms, ['/secretary/rooms']],
  [SecretaryCourses, ['/secretary/courses', '/secretary/course-list', '/secretary/subjects', '/program_head/courses', '/program_head/course-list']],
  [SecretarySections, ['/secretary/sections', '/program_head/sections']],
  [SecretaryFaculty, ['/secretary/instructors']],
  [InstructorAssignment, ['/secretary/instructor-assignment', '/program_head/instructor-assignment']],
  [CrossDepartmentAssignments, ['/secretary/cross-department-assignments', '/program_head/cross-department-assignments']],
  [CourseTeachingAssignments, ['/secretary/course-teaching-assignments', '/program_head/course-teaching-assignments']],
  [ProgramHeadScheduleBuilder, ['/program_head/schedule-builder']],
  [ProgramHeadSchedules, ['/program_head/schedules']],
  [ProgramHeadSectionTimetables, ['/program_head/section-timetables']],
  [ProgramHeadFaculty, ['/program_head/faculty', '/program_head/instructors']],
  [ProgramHeadRooms, ['/program_head/rooms']],
]);

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

    api.get<CapabilityUser>('/me')
      .then(({ data }) => {
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(data));
        if (active) setHasAccess(hasRequestedCapability(data, capability));
      })
      .catch(() => {
        // Fail closed when the current server-side permission state cannot be verified.
        if (active) setHasAccess(false);
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

    api.get('/me')
      .then((res) => {
        const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(res.data));
      })
      // A rejected token is handled once, by the API layer: it clears the
      // session and hands the shell an expiry notice to show. Nothing is left
      // for this call to do but stay quiet.
      .catch(() => undefined);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
          <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
        
          {/* Main Layout wrapper for all authenticated routes */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {/* VPAA Routes */}
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><VpaaSchedules /></CapabilityRoute>} />
            <Route path="/schedules/approval" element={<CapabilityRoute capability="schedule.approve_vpaa" moduleName="Schedule Approval"><VpaaScheduleApprovalPage /></CapabilityRoute>} />
            <Route path="/calendar" element={<CapabilityRoute capability="schedule.view" moduleName="Calendar"><VpaaCalendarPage /></CapabilityRoute>} />
            <Route path="/vpaa/calendar" element={<CapabilityRoute capability="schedule.view" moduleName="Calendar"><VpaaCalendarPage /></CapabilityRoute>} />
            <Route path="/faculty" element={<RoleRoute role="vpaa" moduleName="Faculty"><VpaaFaculty /></RoleRoute>} />
            <Route path="/designations" element={<RoleRoute role="vpaa" moduleName="Designations"><Designations /></RoleRoute>} />
            <Route path="/rooms" element={<RoleRoute role="vpaa" moduleName="Rooms"><VpaaRooms /></RoleRoute>} />

            <Route path="/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/users" element={<RoleRoute role="vpaa" moduleName="User Management"><VpaaUsers /></RoleRoute>} />
            <Route path="/departments" element={<RoleRoute role="vpaa" moduleName="Department Management"><Departments /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute role="vpaa" moduleName="Reports"><Reports /></RoleRoute>} />
            <Route path="/room-requests" element={<CapabilityRoute capability="room.view_all_requests" moduleName="Room Requests"><RoomRequests /></CapabilityRoute>} />
            <Route path="/activity-log" element={<RoleRoute role="vpaa" moduleName="Activity Log"><VpaaActivityLog /></RoleRoute>} />
            <Route path="/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/archive" element={<RoleRoute role="vpaa" moduleName="Archive"><VpaaArchive /></RoleRoute>} />
            <Route path="/settings" element={<RoleRoute role="vpaa" moduleName="Settings"><Settings /></RoleRoute>} />

            {/* Dean Routes */}
            <Route path="/dean/dashboard" element={<DashboardRoute />} />
            <Route path="/dean/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="All Schedules"><DeanSchedules /></CapabilityRoute>} />
            <Route path="/dean/schedules/approval" element={<CapabilityRoute capability="schedule.approve_dean" moduleName="Schedule Approval"><DeanScheduleApprovalPage /></CapabilityRoute>} />
            <Route path="/dean/faculty" element={<CapabilityRoute capability="schedule.view" moduleName="Faculty"><DeanFaculty /></CapabilityRoute>} />
            <Route path="/dean/rooms" element={<CapabilityRoute capability="schedule.view" moduleName="Rooms"><DeanRooms /></CapabilityRoute>} />

            <Route path="/dean/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/dean/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/dean/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/dean/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            {/* Dean account settings were retired; keep old bookmarks inside the Dean shell. */}
            <Route path="/dean/settings" element={<Navigate to="/dean/dashboard" replace />} />

            {/* Secretary Routes */}
            <Route path="/secretary/dashboard" element={<DashboardRoute />} />
            <Route path="/secretary/schedule-builder" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Builder"><SecretaryScheduleBuilder /></CapabilityRoute>} />
            <Route path="/secretary/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><SecretarySchedules /></CapabilityRoute>} />
            <Route path="/secretary/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><SecretarySectionTimetables /></CapabilityRoute>} />
            <Route path="/secretary/rooms" element={<CapabilityRoute capability="schedule.view" moduleName="Rooms"><SecretaryRooms /></CapabilityRoute>} />
            <Route path="/secretary/room-requests" element={<CapabilityRoute capability="room.request" moduleName="Room Requests"><RoomRequests /></CapabilityRoute>} />

            <Route path="/secretary/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/course-list" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/secretary/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/secretary/subjects" element={<CapabilityRoute capability="schedule.view" moduleName="Subjects"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/secretary/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><SecretaryFaculty /></CapabilityRoute>} />
            <Route path="/secretary/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/secretary/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/secretary/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            {/* Cross-Department is the receiving-department instructor workspace;
                keep the old URL as a compatibility alias after the menu rename. */}
            <Route path="/secretary/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross Department Assignments"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/secretary/course-teaching-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Teaching Assignments"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/secretary/settings" element={<Navigate to="/secretary/schedule-builder" replace />} />
            
            {/* Program Head Routes */}
            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/schedule-builder" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Builder"><ProgramHeadScheduleBuilder /></CapabilityRoute>} />
            <Route path="/program_head/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><ProgramHeadSchedules /></CapabilityRoute>} />
            <Route path="/program_head/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><ProgramHeadSectionTimetables /></CapabilityRoute>} />
            <Route path="/program_head/faculty" element={<CapabilityRoute capability="schedule.view" moduleName="Faculty"><ProgramHeadFaculty /></CapabilityRoute>} />
            <Route path="/program_head/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><ProgramHeadFaculty /></CapabilityRoute>} />
            <Route path="/program_head/rooms" element={<CapabilityRoute capability="schedule.view" moduleName="Rooms"><ProgramHeadRooms /></CapabilityRoute>} />
            <Route path="/program_head/room-requests" element={<CapabilityRoute capability="room.request" moduleName="Room Requests"><RoomRequests /></CapabilityRoute>} />

            <Route path="/program_head/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/course-list" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/program_head/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/program_head/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/program_head/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/program_head/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><Reports /></CapabilityRoute>} />
            <Route path="/program_head/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/program_head/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross Department Assignments"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/program_head/course-teaching-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Teaching Assignments"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/program_head/settings" element={<Navigate to="/program_head/schedule-builder" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
