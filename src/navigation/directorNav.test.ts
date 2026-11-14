import { describe, expect, it } from 'vitest';
import type { NavItem, NavSection } from './types';
import { directorNav } from './directorNav';
import { secretaryNav } from './secretaryNav';

const flatten = (sections: NavSection[]): NavItem[] => sections.flatMap((section) => {
  const walk = (items: NavItem[]): NavItem[] => items.flatMap((item) => [item, ...walk(item.children ?? [])]);
  return walk(section.items);
});

describe('directorNav', () => {
  it('keeps every Secretary feature under /director', () => {
    const secretary = flatten(secretaryNav);
    const director = flatten(directorNav);

    expect(director.map((item) => item.id)).toEqual(secretary.map((item) => item.id));
    expect(director.map((item) => item.requiredCapability)).toEqual(secretary.map((item) => item.requiredCapability));
    director.filter((item) => item.path).forEach((item) => expect(item.path).toMatch(/^\/director\//));
    expect(director.map((item) => item.path)).toEqual(expect.arrayContaining([
      '/director/dashboard', '/director/program-rooms', '/director/room-requests', '/director/schedule-management',
    ]));
  });
});
