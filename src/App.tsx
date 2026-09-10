import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy } from 'react';
import LoginPage from './pages/LoginPage';
import type { UserRole } from './pages/Dashboard';
import AppLayout from './components/layout/AppLayout';
import api from './lib/api';
import { clearDataCache } from './lib/dataCache';
import { getStoredUser, getStoredUserRole } from './lib/storedUser';
import LockedModuleView from './components/ui/LockedModuleView';

// VPAA Pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const VpaaSchedules = lazy(() => import('./pages/vpaa/Schedules'));
const VpaaScheduleApprovalPage = lazy(() => import('./pages/vpaa/ScheduleApprovalPage'));
const VpaaCalendarPage = lazy(() => import('./pages/vpaa/CalendarPage'));
const VpaaFaculty = lazy(() => import('./pages/vpaa/Faculty'));
const VpaaRooms = lazy(() => import('./pages/vpaa/Rooms'));
const VpaaUsers = lazy(() => import('./pages/vpaa/Users'));
const Departments = lazy(() => import('./pages/vpaa/Departments'));
const VpaaReports = lazy(() => import('./pages/vpaa/Reports'));
const VpaaActivityLog = lazy(() => import('./pages/vpaa/ActivityLog'));
const VpaaScheduleHistory = lazy(() => import('./pages/vpaa/ScheduleHistory'));
const VpaaArchive = lazy(() => import('./pages/vpaa/Archive'));
const Settings = lazy(() => import('./pages/vpaa/Settings'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage'));

// Other Role Pages
const DeanSchedules = lazy(() => import('./pages/dean/Schedules'));
const DeanScheduleApprovalPage = lazy(() => import('./pages/dean/ScheduleApprovalPage'));
const DeanFaculty = lazy(() => import('./pages/dean/Faculty'));
const DeanRooms = lazy(() => import('./pages/dean/Rooms'));
const DeanReports = lazy(() => import('./pages/dean/Reports'));
const SecretaryScheduleBuilder = lazy(() => import('./pages/secretary/ScheduleBuilder'));
const SecretarySchedules = lazy(() => import('./pages/secretary/Schedules'));
const SecretaryRooms = lazy(() => import('./pages/secretary/Rooms'));
const SecretaryFaculty = lazy(() => import('./pages/secretary/Faculty'));
const SecretarySettings = lazy(() => import('./pages/secretary/Settings'));
const SecretarySectionTimetables = lazy(() => import('./pages/secretary/SectionTimetables'));
const ProgramHeadScheduleBuilder = lazy(() => import('./pages/program_head/ScheduleBuilder'));
const ProgramHeadSchedules = lazy(() => import('./pages/program_head/Schedules'));
const ProgramHeadSectionTimetables = lazy(() => import('./pages/program_head/SectionTimetables'));
const ProgramHeadFaculty = lazy(() => import('./pages/program_head/Faculty'));
const ProgramHeadRooms = lazy(() => import('./pages/program_head/Rooms'));
const InstructorAssignment = lazy(() => import('./pages/ClassSchedules/InstructorAssignment'));
const CrossDepartmentAssignments = lazy(() => import('./pages/ClassSchedules/CrossDepartmentAssignments'));
const CourseTeachingAssignments = lazy(() => import('./pages/ClassSchedules/CourseTeachingAssignments'));
const SecretaryCourses = lazy(() => import('./pages/secretary/Courses'));

const CurriculumListPage = lazy(() => import('./pages/curriculum/CurriculumListPage'));
const CurriculumDetailPage = lazy(() => import('./pages/curriculum/CurriculumDetailPage'));
const SecretarySections = lazy(() => import('./pages/secretary/Sections'));

interface ApiErrorLike {
  response?: {
    status?: number;
  };
}

type CapabilityUser = { permissions?: string[]; scheduling_ready?: boolean };

const hasRequestedCapability = (user: CapabilityUser | null, capability: string | string[]): boolean => {
  if (!user) return false;
  const requested = Array.isArray(capability) ? capability : [capability];
  if (user.scheduling_ready === false && requested.some((name) => name.startsWith('schedule.'))) {
    return false;
  }
  return requested.some((name) => (user.permissions ?? []).includes(name));
};

const getStoredRole = (): string => {
  return getStoredUserRole();
};

const getDashboardRole = (): UserRole | string => getStoredRole();

const getDashboardPath = (role: string): string => {
  if (role === 'dean') return '/dean/dashboard';
  if (role === 'secretary') return '/secretary/dashboard';
  if (role === 'program_head') return '/program_head/dashboard';
  if (role === 'director') return '/director/dashboard';
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
      .catch((error: ApiErrorLike) => {
        if (error.response?.status !== 401) return;

        clearDataCache();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');

        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      });
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
            <Route path="/rooms" element={<RoleRoute role="vpaa" moduleName="Rooms"><VpaaRooms /></RoleRoute>} />

            <Route path="/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/users" element={<RoleRoute role="vpaa" moduleName="User Management"><VpaaUsers /></RoleRoute>} />
            <Route path="/departments" element={<RoleRoute role="vpaa" moduleName="Department Management"><Departments /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute role="vpaa" moduleName="Reports"><VpaaReports /></RoleRoute>} />
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
            <Route path="/dean/reports" element={<CapabilityRoute capability="schedule.view" moduleName="Reports"><DeanReports /></CapabilityRoute>} />
            <Route path="/dean/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/dean/settings" element={<AccountSettingsPage />} />

            {/* Secretary Routes */}
            <Route path="/secretary/dashboard" element={<DashboardRoute />} />
            <Route path="/secretary/schedule-builder" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Builder"><SecretaryScheduleBuilder /></CapabilityRoute>} />
            <Route path="/secretary/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><SecretarySchedules /></CapabilityRoute>} />
            <Route path="/secretary/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><SecretarySectionTimetables /></CapabilityRoute>} />
            <Route path="/secretary/rooms" element={<CapabilityRoute capability="schedule.view" moduleName="Rooms"><SecretaryRooms /></CapabilityRoute>} />

            <Route path="/secretary/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/course-list" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/secretary/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/secretary/subjects" element={<CapabilityRoute capability="schedule.view" moduleName="Subjects"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/secretary/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/secretary/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><SecretaryFaculty /></CapabilityRoute>} />
            <Route path="/secretary/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/secretary/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            {/* Cross-Department is the receiving-department instructor workspace;
                keep the old URL as a compatibility alias after the menu rename. */}
            <Route path="/secretary/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross Department Assignments"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/secretary/course-teaching-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Teaching Assignments"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/secretary/settings" element={<SecretarySettings />} />
            
            {/* Program Head Routes */}
            <Route path="/program_head/dashboard" element={<DashboardRoute />} />
            <Route path="/program_head/schedule-builder" element={<CapabilityRoute capability="schedule.create" moduleName="Schedule Builder"><ProgramHeadScheduleBuilder /></CapabilityRoute>} />
            <Route path="/program_head/schedules" element={<CapabilityRoute capability="schedule.view" moduleName="Schedules"><ProgramHeadSchedules /></CapabilityRoute>} />
            <Route path="/program_head/section-timetables" element={<CapabilityRoute capability="schedule.view" moduleName="Section Timetables"><ProgramHeadSectionTimetables /></CapabilityRoute>} />
            <Route path="/program_head/faculty" element={<CapabilityRoute capability="schedule.view" moduleName="Faculty"><ProgramHeadFaculty /></CapabilityRoute>} />
            <Route path="/program_head/instructors" element={<CapabilityRoute capability="schedule.view" moduleName="Instructors"><ProgramHeadFaculty /></CapabilityRoute>} />
            <Route path="/program_head/rooms" element={<CapabilityRoute capability="schedule.view" moduleName="Rooms"><ProgramHeadRooms /></CapabilityRoute>} />

            <Route path="/program_head/courses" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/course-list" element={<CapabilityRoute capability="schedule.view" moduleName="Courses"><SecretaryCourses /></CapabilityRoute>} />
            <Route path="/program_head/curriculum" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumListPage /></CapabilityRoute>} />
            <Route path="/program_head/curriculum/:id" element={<CapabilityRoute capability="schedule.view" moduleName="Curriculum"><CurriculumDetailPage /></CapabilityRoute>} />
            <Route path="/program_head/sections" element={<CapabilityRoute capability="schedule.view" moduleName="Sections"><SecretarySections /></CapabilityRoute>} />
            <Route path="/program_head/instructor-assignment" element={<CapabilityRoute capability="schedule.assign_instructor" moduleName="Instructor Assignment"><InstructorAssignment /></CapabilityRoute>} />
            <Route path="/program_head/schedule-history" element={<CapabilityRoute capability="schedule.view" moduleName="Schedule History"><VpaaScheduleHistory /></CapabilityRoute>} />
            <Route path="/program_head/cross-department-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Cross Department Assignments"><CrossDepartmentAssignments /></CapabilityRoute>} />
            <Route path="/program_head/course-teaching-assignments" element={<CapabilityRoute capability="schedule.assign_instructor_cross_department" moduleName="Course Teaching Assignments"><CourseTeachingAssignments /></CapabilityRoute>} />
            <Route path="/program_head/settings" element={<SecretarySettings />} />
            <Route path="/director/dashboard" element={<DashboardRoute />} />
            <Route path="/director/settings" element={<AccountSettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
