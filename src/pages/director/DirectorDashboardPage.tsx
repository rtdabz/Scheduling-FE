import SecretaryDashboardPage from '../secretary/SecretaryDashboardPage';

/** The Director uses the Secretary dashboard with its own role, title, and `/director/*` links. */
export default function DirectorDashboardPage() {
  return <SecretaryDashboardPage role="director" />;
}
