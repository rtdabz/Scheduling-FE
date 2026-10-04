import { clearCachedKeysByPrefix } from './dataCache';

export const CACHE_GROUPS = {
  rooms: ['page:rooms:'],
  faculty: ['page:faculty:'],
  sections: ['page:sections:'],
  courses: ['page:courses:'],
  curriculum: ['page:curriculum:', 'curriculum:detail:'],
  users: ['page:users'],
  departments: ['page:departments:'],
  assignments: ['page:instructor-assignments:', 'page:course-teaching-assignments:'],
  schedules: [
    'scheduler:',
    'page:dean-schedules:',
    'page:approval-queue:',
    'page:schedule-viewer:',
    'page:vpaa-calendar:',
    'page:schedule-overview',
    'global:schedules',
  ],
  approvals: ['department-schedule-status:'],
  dashboards: ['dashboard:'],
  settings: ['page:settings', 'scheduler:scheduling-settings:'],
} as const;

export type CacheGroupName = keyof typeof CACHE_GROUPS;

export const invalidateCacheGroups = (...groups: CacheGroupName[]): void => {
  clearCachedKeysByPrefix(groups.flatMap((group) => CACHE_GROUPS[group]));
};
