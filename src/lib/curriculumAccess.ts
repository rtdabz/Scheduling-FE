import type { Curriculum } from '../types/curriculum';
import { getStoredUser, hasStoredCapability, officeCanManageProgram } from './storedUser';

export function canAuthorCurriculum(curriculum: Pick<Curriculum, 'department_id' | 'program_id'> | null): boolean {
  const user = getStoredUser();
  if (!user || !curriculum || !hasStoredCapability('curriculum.manage')) return false;
  if (user.role !== 'vpaa' && user.department_id != null && user.department_id !== curriculum.department_id) return false;
  // A Program Head's program is view-only to the department office.
  if (!officeCanManageProgram(curriculum.program_id, user)) return false;
  return user.role !== 'program_head'
    || (user.program_id != null && user.program_id === curriculum.program_id);
}
