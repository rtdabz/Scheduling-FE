import { describe, it, expect } from 'vitest';
import { deanNav } from './deanNav';

describe('deanNav structure for monitoring', () => {
  it('contains main menu items for viewing departments, courses, sections, schedules, faculty, rooms, curriculum, and reports', () => {
    const allPaths: string[] = [];

    const collectPaths = (items: typeof deanNav[number]['items']) => {
      for (const item of items) {
        if (item.path) allPaths.push(item.path);
        if (item.children) collectPaths(item.children);
      }
    };

    deanNav.forEach((section) => collectPaths(section.items));

    expect(allPaths).toContain('/dean/dashboard');
    expect(allPaths).toContain('/dean/schedules/approval');
    expect(allPaths).toContain('/dean/schedules');
    expect(allPaths).toContain('/dean/departments');
    expect(allPaths).toContain('/dean/courses');
    expect(allPaths).toContain('/dean/sections');
    expect(allPaths).toContain('/dean/instructors');
    expect(allPaths).toContain('/dean/facilities');
    expect(allPaths).toContain('/dean/curriculum');
    expect(allPaths).toContain('/dean/reports');
    expect(allPaths).toContain('/dean/schedule-history');
  });
});
