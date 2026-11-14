/**
 * Account roles and the Secretary/Director department office.
 *
 * A department is run by EITHER one active Secretary OR one active Director (they share one
 * account slot, enforced by the API and database). Both use the same workspace, workflow and
 * capabilities; the Director keeps its own role identity, title and `/director/*` routes.
 */
export type AccountRole = 'vpaa' | 'dean' | 'secretary' | 'director' | 'program_head';

export type DepartmentOfficeRole = 'secretary' | 'director';

export const DEPARTMENT_OFFICE_ROLES: readonly DepartmentOfficeRole[] = ['secretary', 'director'];

export const ACCOUNT_ROLES: readonly AccountRole[] = ['vpaa', 'dean', 'secretary', 'director', 'program_head'];

export const ROLE_LABELS: Record<AccountRole, string> = {
  vpaa: 'VPAA',
  dean: 'Dean',
  secretary: 'Secretary',
  director: 'Director',
  program_head: 'Program Head',
};

export const normalizeRole = (role?: string | null): string => (role ?? '').trim().toLowerCase();

export const isAccountRole = (role?: string | null): role is AccountRole =>
  (ACCOUNT_ROLES as readonly string[]).includes(normalizeRole(role));

/** Secretary or Director: the department office that builds and submits the timetable. */
export const isDepartmentOfficeRole = (role?: string | null): role is DepartmentOfficeRole =>
  (DEPARTMENT_OFFICE_ROLES as readonly string[]).includes(normalizeRole(role));

/** Department office and Program Head reassign room schedules from Facilities, not the scheduler. */
export const reassignsRoomSchedulesFromFacilities = (role?: string | null): boolean =>
  isDepartmentOfficeRole(role) || normalizeRole(role) === 'program_head';

export const roleLabel =(role?: string | null, fallback = 'User'): string => {
  const key = normalizeRole(role);
  return isAccountRole(key) ? ROLE_LABELS[key] : (role || fallback);
};

/** The route segment of a role's workspace (`/director` for a Director, `/secretary` for a Secretary). */
export const roleWorkspaceBase = (role?: string | null): string => {
  const key = normalizeRole(role);
  return key === 'dean' || key === 'secretary' || key === 'director' || key === 'program_head' ? `/${key}` : '';
};

export const dashboardPathForRole = (role?: string | null): string => {
  const base = roleWorkspaceBase(role);
  return base ? `${base}/dashboard` : '/dashboard';
};

/**
 * Re-roots a Secretary workspace path for the given office role, e.g.
 * `/secretary/facilities` -> `/director/facilities` for a Director. Other paths are returned as is.
 */
export const officePath = (role: string | null | undefined, secretaryPath: string): string =>
  normalizeRole(role) === 'director' ? secretaryPath.replace(/^\/secretary(?=\/|$)/, '/director') : secretaryPath;
