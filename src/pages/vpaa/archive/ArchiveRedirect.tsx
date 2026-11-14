import { Navigate, useLocation } from 'react-router-dom';
import { archiveRedirectTarget } from './archiveTypes';

/** The centralized Archive page was replaced by module archives; old links land in the right module. */
export default function ArchiveRedirect() {
  return <Navigate to={archiveRedirectTarget(useLocation().search)} replace />;
}
