export interface StoredUser {
  id?: number;
  name?: string;
  email?: string;
  department_id?: number;
  program_id?: number;  role?: string;
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
  department_program_count?: number;
  /** Programs whose records this account may change (`writableProgramIdsFor` on the backend). */
  can_edit_program_ids?: number[];
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
  // Fallback for a stored user without a catalog; matches `requires_program` in the backend config,
  // where viewing and assigning instructors (the Cross-Department page) need no program.
  return capability.startsWith('schedule.') && capability !== 'schedule.view' && capability !== 'schedule.assign_instructor';
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
export const MULTIPLE_PROGRAMS_LOCK_MESSAGE =
  'Program Rooms is available when your department has more than one program. Room allocation is unnecessary for a single program.';
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

const DEPARTMENT_OFFICE_ROLES = ['secretary', 'director'];

export const PROGRAM_HEAD_MANAGED_MESSAGE =
  'This program is managed by its Program Head. You can view its records, but only the Program Head can change them.';
export const PROGRAM_HEAD_MANAGED_COURSE_MESSAGE =
  "This course is used by a program managed by its Program Head. You can view it, but changing it would also change that program's curriculum.";
export const OFFICE_COURSE_ASSIGNMENT_LOCK_MESSAGE =
  'Every program in your department is managed by its Program Head, so Course Assignment is handled by the Program Heads.';

export const isDepartmentOfficeUser = (user: StoredUser | null = getStoredUser()): boolean =>
  DEPARTMENT_OFFICE_ROLES.includes(user?.role?.toLowerCase() ?? '');

/**
 * The department office (Secretary or Director) manages a program's records only while the program
 * has no active Program Head; records without a program are department-level and stay with it.
 * Every other role keeps its own rules, so this is true for them. The backend enforces the same rule.
 */
export const officeCanManageProgram = (
  programId: number | string | null | undefined,
  user: StoredUser | null = getStoredUser(),
): boolean => {
  if (!isDepartmentOfficeUser(user) || programId == null || programId === '') return true;
  const writable = user?.can_edit_program_ids;
  // A stored user from before this field existed: leave the decision to the backend.
  if (!Array.isArray(writable)) return true;
  return writable.map(Number).includes(Number(programId));
};

/** The office's department has programs, and every one of them has a Program Head. */
export const officeManagesNoProgram = (user: StoredUser | null = getStoredUser()): boolean =>
  isDepartmentOfficeUser(user)
  && Array.isArray(user?.can_edit_program_ids)
  && user!.can_edit_program_ids!.length === 0
  && (user?.department_program_count ?? 0) > 0;
