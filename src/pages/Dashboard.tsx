import { lazy, Suspense, type FC } from 'react';
import RouteLoadingBar from '../components/ui/RouteLoadingBar';

export type UserRole = 'vpaa' | 'dean' | 'program_head' | 'secretary';

const DashboardMap = {
  vpaa: lazy(() => import('./vpaa/VpaaDashboardPage')),
  dean: lazy(() => import('./dean/DeanDashboardPage')),
  program_head: lazy(() => import('./program_head/ProgramHeadDashboardPage')),
  secretary: lazy(() => import('./secretary/SecretaryDashboardPage')),
};

interface DashboardProps {
  role: UserRole | string;
}

const isUserRole = (role: string): role is UserRole => {
  return role === 'vpaa' || role === 'dean' || role === 'program_head' || role === 'secretary';
};

const Dashboard: FC<DashboardProps> = ({ role }) => {
  const Component = isUserRole(role) ? DashboardMap[role] : undefined;

  if (!Component) return <h2>Invalid Role</h2>;

  return (
    <Suspense fallback={<RouteLoadingBar />}>
      <Component />
    </Suspense>
  );
};

export default Dashboard;
