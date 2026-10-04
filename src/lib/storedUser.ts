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
    return null;
  }
};

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

export const getStoredUserRole = (): string => getStoredUser()?.role?.toLowerCase() ?? "";

export const requiresDepartmentProgram = (
  capability: string,
  catalog?: StoredUser['capability_catalog'],
): boolean => {
  const definition = catalog?.find((entry) => entry.id === capability);
  if (definition?.requires_program !== undefined) return definition.requires_program;
  return capability.startsWith('schedule.') && capability !== 'schedule.view';
};

export const hasStoredCapability = (capability: string | string[]): boolean => {
  const user = getStoredUser();
  const permissions = user?.permissions ?? [];
  const requested = Array.isArray(capability) ? capability : [capability];
  const usable = user?.scheduling_ready === false
    ? requested.filter((name) => !requiresDepartmentProgram(name, user?.capability_catalog))
    : requested;
  return usable.some((name) => permissions.includes(name));
};

export const NO_PROGRAM_LOCK_MESSAGE =
  'Your department has no program yet, so this module is unavailable. Ask the VPAA to add a program to your department.';
export const NOT_GRANTED_LOCK_MESSAGE = 'Your role does not include access to this module.';

export const lockedModuleMessage = (capability?: string | string[]): string => {
  if (!capability) return NOT_GRANTED_LOCK_MESSAGE;
  const permissions = getStoredUser()?.permissions ?? [];
  const requested = Array.isArray(capability) ? capability : [capability];
  return requested.some((name) => permissions.includes(name))
    ? NO_PROGRAM_LOCK_MESSAGE
    : NOT_GRANTED_LOCK_MESSAGE;
};

export const getStoredUserDepartmentId = (): number | null => {
  const departmentId = getStoredUser()?.department_id;
  if (departmentId == null) return null;

  const parsed = Number(departmentId);
  return Number.isFinite(parsed) ? parsed : null;
};
