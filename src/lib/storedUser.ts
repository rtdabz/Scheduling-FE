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

/** Returns true when the signed-in user has at least one requested capability. */
export const hasStoredCapability = (capability: string | string[]): boolean => {
  const user = getStoredUser();
  const permissions = user?.permissions ?? [];
  const requested = Array.isArray(capability) ? capability : [capability];
  if (user?.scheduling_ready === false && requested.some((name) => name.startsWith('schedule.'))) return false;
  return requested.some((name) => permissions.includes(name));
};

/** Numeric department id of the stored user, or null when unknown. */
export const getStoredUserDepartmentId = (): number | null => {
  const departmentId = getStoredUser()?.department_id;
  if (departmentId == null) return null;

  const parsed = Number(departmentId);
  return Number.isFinite(parsed) ? parsed : null;
};
