/**
 * Single accessor for the signed-in user persisted by the login flow.
 *
 * The session blob lives in localStorage (remember me) or sessionStorage, and
 * every consumer used to re-read and re-parse it by hand. Most wrapped the
 * parse in a try/catch; useScheduler did not, so a truncated or malformed entry
 * threw during render and blanked the whole Schedule Builder with no in-app
 * recovery path.
 *
 * Parsing is always guarded here: a corrupt entry reads as "signed out" for the
 * purpose of UI gating, which the API still enforces server-side.
 */
export interface StoredUser {
  id?: number;
  name?: string;
  email?: string;
  department_id?: number;
  program_id?: number;
  role?: string;
  permissions?: string[];
  capability_catalog?: Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    assignable?: boolean;
    requires_program?: boolean;
  }>;
  modules?: Array<{
    id: string;
    title: string;
    description: string;
    granted: boolean;
    capabilities: Array<{ id: string; title: string; description: string; granted: boolean }>;
  }>;
  scheduling_ready?: boolean;
}

const readRawStoredUser = (): string | null => {
  try {
    return localStorage.getItem("user") || sessionStorage.getItem("user");
  } catch {
    // Storage can throw in privacy modes or when disabled entirely.
    return null;
  }
};

/** Returns the stored user, or null when absent or unparseable. */
export const getStoredUser = (): StoredUser | null => {
  const raw = readRawStoredUser();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as StoredUser;
  } catch {
    return null;
  }
};

/** Lowercased role of the stored user, or "" when unknown. */
export const getStoredUserRole = (): string => getStoredUser()?.role?.toLowerCase() ?? "";

/**
 * Whether a department with no program of its own can exercise the capability.
 *
 * The server declares this per capability (config/capabilities.php) and ships
 * it on `capability_catalog`, so the two sides cannot drift. The client used to
 * withhold every `schedule.*` capability whenever `scheduling_ready` was false,
 * which locked modules the API would happily have served -- read-only ones, and
 * instructor assignment -- however much the VPAA had granted. The name-prefix
 * fallback only covers a session blob stored before the catalog carried the
 * flag.
 */
export const requiresDepartmentProgram = (
  capability: string,
  catalog?: StoredUser['capability_catalog'],
): boolean => {
  const definition = catalog?.find((entry) => entry.id === capability);
  if (definition?.requires_program !== undefined) return definition.requires_program;
  return capability.startsWith('schedule.') && capability !== 'schedule.view';
};

/** Returns true when the signed-in user has at least one requested capability. */
export const hasStoredCapability = (capability: string | string[]): boolean => {
  const user = getStoredUser();
  const permissions = user?.permissions ?? [];
  const requested = Array.isArray(capability) ? capability : [capability];
  const usable = user?.scheduling_ready === false
    ? requested.filter((name) => !requiresDepartmentProgram(name, user?.capability_catalog))
    : requested;
  return usable.some((name) => permissions.includes(name));
};

/** Numeric department id of the stored user, or null when unknown. */
export const getStoredUserDepartmentId = (): number | null => {
  const departmentId = getStoredUser()?.department_id;
  if (departmentId == null) return null;

  const parsed = Number(departmentId);
  return Number.isFinite(parsed) ? parsed : null;
};
