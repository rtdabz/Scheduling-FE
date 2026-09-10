import { describe, it, expect, beforeEach } from 'vitest';
import { hasStoredCapability, requiresDepartmentProgram, type StoredUser } from './storedUser';

const store = (user: StoredUser) => localStorage.setItem('user', JSON.stringify(user));

const catalog: StoredUser['capability_catalog'] = [
  { id: 'schedule.view', module: 'schedule_workspace', title: 'View', description: '', requires_program: false },
  { id: 'schedule.assign_instructor', module: 'instructor_assignment', title: 'Assign', description: '', requires_program: false },
  { id: 'schedule.create', module: 'schedule_workspace', title: 'Create', description: '', requires_program: true },
];

describe('hasStoredCapability', () => {
  beforeEach(() => localStorage.clear());

  it('honours a granted capability', () => {
    store({ role: 'secretary', permissions: ['schedule.view'], scheduling_ready: true });
    expect(hasStoredCapability('schedule.view')).toBe(true);
  });

  it('keeps the program-independent capabilities in a program-less department', () => {
    store({
      role: 'secretary',
      permissions: ['schedule.view', 'schedule.assign_instructor', 'schedule.create'],
      scheduling_ready: false,
      capability_catalog: catalog,
    });

    // These need no program, and the API serves them, so the UI must not lock them.
    expect(hasStoredCapability('schedule.view')).toBe(true);
    expect(hasStoredCapability('schedule.assign_instructor')).toBe(true);
    // Building a timetable genuinely needs a program.
    expect(hasStoredCapability('schedule.create')).toBe(false);
  });

  it('falls back to the name rule when the stored catalog predates the flag', () => {
    store({ role: 'secretary', permissions: ['schedule.view', 'schedule.create'], scheduling_ready: false });
    expect(hasStoredCapability('schedule.view')).toBe(true);
    expect(hasStoredCapability('schedule.create')).toBe(false);
  });

  it('still refuses a capability that was never granted', () => {
    store({ role: 'program_head', permissions: ['schedule.view'], scheduling_ready: true });
    expect(hasStoredCapability('schedule.assign_instructor')).toBe(false);
  });

  it('accepts any one of several requested capabilities', () => {
    store({ role: 'dean', permissions: ['schedule.approve_dean'], scheduling_ready: true });
    expect(hasStoredCapability(['schedule.create', 'schedule.approve_dean'])).toBe(true);
  });
});

describe('requiresDepartmentProgram', () => {
  it('reads the server-declared flag when the catalog carries it', () => {
    expect(requiresDepartmentProgram('schedule.assign_instructor', catalog)).toBe(false);
    expect(requiresDepartmentProgram('schedule.create', catalog)).toBe(true);
  });

  it('exempts schedule.view without a catalog', () => {
    expect(requiresDepartmentProgram('schedule.view')).toBe(false);
    expect(requiresDepartmentProgram('schedule.submit')).toBe(true);
  });
});
