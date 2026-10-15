import type { Curriculum } from '../types/curriculum';
import { getStoredUser, hasStoredCapability } from './storedUser';

export function canAuthorCurriculum(curriculum: Pick<Curriculum, 'department_id' | 'program_id'> | null): boolean {
  const user = getStoredUser();
  if (!user || !curriculum || !hasStoredCapability('curriculum.manage')) return false;
  if (user.role !== 'vpaa' && user.department_id != null && user.department_id !== curriculum.department_id) return false;
  return user.role !== 'program_head'
    || (user.program_id != null && user.program_id === curriculum.program_id);
}
