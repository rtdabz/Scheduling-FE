import { describe, expect, it } from 'vitest';
import { annotateNav } from './navLocks';
import type { NavItem, NavSection } from './types';
import { secretaryNav } from './secretaryNav';
import { directorNav } from './directorNav';
import { programHeadNav } from './programHeadNav';
import { deanNav } from './deanNav';
import { MULTIPLE_PROGRAMS_LOCK_MESSAGE, NO_PROGRAM_LOCK_MESSAGE } from '../lib/storedUser';

// Capabilities marked `requires_program` in the backend config.
const PROGRAM_BOUND = new Set([
  'schedule.create', 'schedule.update', 'schedule.delete', 'schedule.generate', 'schedule.submit', 'schedule.withdraw',
  'schedule.assign_instructor_cross_department', 'room.request', 'room.assign_program', 'curriculum.manage',
]);
const OFFICE = [
  'schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete', 'schedule.generate', 'schedule.submit',
  'schedule.withdraw', 'schedule.assign_instructor', 'schedule.assign_instructor_cross_department',
  'room.request', 'room.review_requests', 'room.assign_program', 'curriculum.manage',
];

/** Mirrors hasStoredCapability: program-bound capabilities are unusable without a program. */
const lockState = (nav: NavSection[], permissions: string[], noProgram: boolean, departmentProgramCount = noProgram ? 0 : 2) => {
  const hasCapability = (capability: string | string[]) => (Array.isArray(capability) ? capability : [capability])
    .some((name) => permissions.includes(name) && !(noProgram && PROGRAM_BOUND.has(name)));
  const flat: Record<string, NavItem> = {};
  // Keyed by label, plus by id so the Cross-Department group and page (same label) stay distinct.
  const walk = (items: NavItem[]) => items.forEach((item) => {
    flat[item.label] = item;
    if (item.id) flat[item.id] = item;
    walk(item.children ?? []);
  });
  annotateNav(nav, { noProgram, departmentProgramCount, hasCapability }).forEach((section) => walk(section.items));
  return flat;
};

const DEPARTMENT_MODULES = ['Sections', 'Academic Scheduling', 'Facilities', 'Curriculum', 'Courses', 'Schedule History'];

describe.each([
  ['Secretary', secretaryNav],
  ['Director', directorNav],
])('%s Program Rooms access', (_role, nav) => {
  it('locks Program Rooms with one program while keeping Rooms available', () => {
    const items = lockState(nav, OFFICE, false, 1);
    expect(items['Program Rooms']?.isLocked).toBe(true);
    expect(items['Program Rooms']?.lockedMessage).toBe(MULTIPLE_PROGRAMS_LOCK_MESSAGE);
    expect(items.Facilities?.isLocked).toBe(false);
    expect(items.Rooms?.isLocked).toBe(false);
  });

  it('unlocks at two programs, relocks at one, and preserves capability restrictions', () => {
    expect(lockState(nav, OFFICE, false, 2)['Program Rooms']?.isLocked).toBe(false);
    expect(lockState(nav, OFFICE, false, 3)['Program Rooms']?.isLocked).toBe(false);
    expect(lockState(nav, OFFICE, false, 1)['Program Rooms']?.isLocked).toBe(true);
    expect(lockState(nav, ['schedule.view'], false, 2)['Program Rooms']?.isLocked).toBe(true);
  });

  it('keeps Program Rooms locked until the department count is known', () => {
    const sections = annotateNav(nav, { noProgram: false, hasCapability: () => true });
    const facilities = sections.flatMap((section) => section.items).find((item) => item.label === 'Facilities');
    expect(facilities?.children?.find((item) => item.label === 'Program Rooms')?.isLocked).toBe(true);
  });
});

describe.each([
  ['Secretary', secretaryNav],
  ['Director', directorNav],
  ['Program Head', programHeadNav],
])('%s navigation', (_role, nav) => {
  it('without a program locks the department modules and Course Assignment, not Cross-Department', () => {
    const items = lockState(nav, OFFICE, true);
    DEPARTMENT_MODULES.forEach((label) => {
      expect(items[label]?.isLocked, label).toBe(true);
      expect(items[label]?.lockedMessage, label).toBe(NO_PROGRAM_LOCK_MESSAGE);
    });
    expect(items['sidebar-cross-department']?.isLocked).toBe(false);
    expect(items['sidebar-cross-department-assignments']?.isLocked).toBe(false);
    expect(items['Course Assignment']?.isLocked).toBe(true);
    expect(items.Dashboard?.isLocked).toBe(false);
    expect(items.Instructors?.isLocked).toBe(false);
  });

  it('once a program exists unlocks the department modules (Course Assignment then waits on VPAA approval)', () => {
    const items = lockState(nav, OFFICE, false);
    DEPARTMENT_MODULES.forEach((label) => expect(items[label]?.isLocked, label).toBe(false));
    expect(items['sidebar-cross-department']?.isLocked).toBe(false);
    expect(items['Course Assignment']?.isLocked).toBe(false);
  });
});

describe('Dean navigation', () => {
  it('locks the department modules only while the department has no program', () => {
    const permissions = ['schedule.view', 'schedule.approve_dean'];
    const locked = lockState(deanNav, permissions, true);
    DEPARTMENT_MODULES.forEach((label) => expect(locked[label]?.isLocked, label).toBe(true));
    expect(locked.Department?.isLocked).toBe(false);
    const open = lockState(deanNav, permissions, false);
    DEPARTMENT_MODULES.forEach((label) => expect(open[label]?.isLocked, label).toBe(false));
  });
});
