import { clearCachedKeysByPrefix } from './dataCache';

/**
 * Named groups of `dataCache` keys, mirroring the backend's ApiCache groups.
 *
 * A mutation should invalidate the groups it actually affects rather than
 * calling clearDataCache(). The global wipe is still correct for genuinely
 * cross-cutting events — sign-in/sign-out, a 401, an institution-wide settings
 * change, an archive restore — and those call sites keep using it.
 *
 * Keys are namespaced by prefix (see the `cacheKey` definitions in each page),
 * so a group is just the set of prefixes it owns.
 */
export const CACHE_GROUPS = {
  /** Room records and the pages that list them. */
  rooms: ['page:rooms:'],
  /** Faculty roster and load figures. */
  faculty: ['page:faculty:'],
  /** Sections and the section pickers built from them. */
  sections: ['page:sections:'],
  /** Course records. */
  courses: ['page:courses:'],
  /** Curriculum lists and per-curriculum detail. */
  curriculum: ['page:curriculum:', 'curriculum:detail:'],
  /** User accounts and departments. */
  users: ['page:users'],
  departments: ['page:departments:'],
  /** Instructor and course-teaching assignment workspaces. */
  assignments: ['page:instructor-assignments:', 'page:course-teaching-assignments:'],
  /**
   * Anything rendering timetable meetings: the builder, the read-only viewers,
   * the calendar and the dean's schedule list.
   */
  schedules: [
    'scheduler:',
    'page:dean-schedules:',
    'page:schedule-viewer:',
    'page:vpaa-calendar:',
    'page:schedule-overview',
    'global:schedules',
  ],
  /** Approval state shown per department. */
  approvals: ['department-schedule-status:'],
  /** Role dashboards, which summarise most of the above. */
  dashboards: ['dashboard:'],
  /** Institution settings, semesters, timeslots and per-section scheduling settings. */
  settings: ['page:settings', 'scheduler:scheduling-settings:'],
} as const;

export type CacheGroupName = keyof typeof CACHE_GROUPS;

/** Invalidate every key belonging to the named groups. */
export const invalidateCacheGroups = (...groups: CacheGroupName[]): void => {
  clearCachedKeysByPrefix(groups.flatMap((group) => CACHE_GROUPS[group]));
};
