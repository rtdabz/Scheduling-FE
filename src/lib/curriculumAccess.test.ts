import { beforeEach, describe, expect, it } from 'vitest';
import { canAuthorCurriculum } from './curriculumAccess';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('curriculum authoring scope', () => {
  it('limits a program head to their own department and program', () => {
    sessionStorage.setItem('user', JSON.stringify({ role: 'program_head', department_id: 1, program_id: 2, permissions: ['curriculum.manage'] }));
    expect(canAuthorCurriculum({ department_id: 1, program_id: 2 })).toBe(true);
    expect(canAuthorCurriculum({ department_id: 1, program_id: null })).toBe(false);
    expect(canAuthorCurriculum({ department_id: 1, program_id: 3 })).toBe(false);
    expect(canAuthorCurriculum({ department_id: 9, program_id: 2 })).toBe(false);
  });
  it('allows department-wide and program curricula for the owning secretary', () => {
    sessionStorage.setItem('user', JSON.stringify({ role: 'secretary', department_id: 1, permissions: ['curriculum.manage'] }));
    expect(canAuthorCurriculum({ department_id: 1, program_id: null })).toBe(true);
    expect(canAuthorCurriculum({ department_id: 1, program_id: 2 })).toBe(true);
    expect(canAuthorCurriculum({ department_id: 9, program_id: 2 })).toBe(false);
    expect(canAuthorCurriculum(null)).toBe(false);
  });
  it('requires capability and an assigned program for a program head', () => {
    sessionStorage.setItem('user', JSON.stringify({ role: 'program_head', department_id: 1, permissions: ['curriculum.manage'] }));
    expect(canAuthorCurriculum({ department_id: 1, program_id: null })).toBe(false);
    sessionStorage.setItem('user', JSON.stringify({ role: 'secretary', department_id: 1, permissions: [] }));
    expect(canAuthorCurriculum({ department_id: 1, program_id: null })).toBe(false);
  });
});
