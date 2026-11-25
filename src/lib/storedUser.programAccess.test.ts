import { afterEach, describe, expect, it } from 'vitest';
import { officeCanManageProgram, officeManagesNoProgram } from './storedUser';

/** The department office manages only programs without a Program Head (`can_edit_program_ids` on /api/me). */
const signIn = (user: Record<string, unknown>) => sessionStorage.setItem('user', JSON.stringify(user));

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('program-level access for the department office', () => {
  it('limits the Secretary and Director to programs without a Program Head', () => {
    for (const role of ['secretary', 'director']) {
      signIn({ role, department_id: 1, department_program_count: 2, can_edit_program_ids: [10] });
      expect(officeCanManageProgram(10)).toBe(true);
      expect(officeCanManageProgram('10')).toBe(true);
      expect(officeCanManageProgram(11)).toBe(false);
      // Department-level records have no program and stay with the office.
      expect(officeCanManageProgram(null)).toBe(true);
      expect(officeManagesNoProgram()).toBe(false);
    }
  });

  it('reports a department whose every program has a Program Head', () => {
    signIn({ role: 'secretary', department_id: 1, department_program_count: 2, can_edit_program_ids: [] });
    expect(officeManagesNoProgram()).toBe(true);
    expect(officeCanManageProgram(10)).toBe(false);

    // A department without programs is the separate "no program yet" lock, not this one.
    signIn({ role: 'secretary', department_id: 1, department_program_count: 0, can_edit_program_ids: [] });
    expect(officeManagesNoProgram()).toBe(false);
  });

  it('leaves other roles and stored users without the field to their own rules', () => {
    signIn({ role: 'program_head', department_id: 1, program_id: 10, can_edit_program_ids: [10] });
    expect(officeCanManageProgram(11)).toBe(true);
    expect(officeManagesNoProgram()).toBe(false);

    signIn({ role: 'secretary', department_id: 1 });
    expect(officeCanManageProgram(11)).toBe(true);
    expect(officeManagesNoProgram()).toBe(false);
  });
});
