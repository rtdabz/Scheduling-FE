import type { ComponentType, FC } from 'react';
import VpaaDashboardPage from './vpaa/VpaaDashboardPage';
import DeanDashboardPage from './dean/DeanDashboardPage';
import ProgramHeadDashboardPage from './program_head/ProgramHeadDashboardPage';
import SecretaryDashboardPage from './secretary/SecretaryDashboardPage';

export type UserRole = 'vpaa' | 'dean' | 'program_head' | 'secretary';

const DashboardMap: Record<UserRole, ComponentType> = {
  vpaa: VpaaDashboardPage,
  dean: DeanDashboardPage,
  program_head: ProgramHeadDashboardPage,
  secretary: SecretaryDashboardPage,
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

  return <Component />;
};

export default Dashboard;
