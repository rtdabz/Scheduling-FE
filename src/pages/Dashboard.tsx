import { lazy, Suspense, type FC } from 'react';

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

  // Deliberately no fallback of its own. Every dashboard page already renders
  // DashboardSkeleton while its first fetch is in flight, and a fallback here
  // renders the *same* skeleton for the chunk download — so the user saw it
  // appear, unmount and appear again. The chunk resolves far faster than the
  // fetch that follows it, so the page's own skeleton is the one worth showing.
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
};

export default Dashboard;
