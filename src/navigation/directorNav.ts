import type { NavItem, NavSection } from './types';
import { secretaryNav } from './secretaryNav';
import { officePath } from '../lib/roles';

/**
 * The Director runs the department office with every Secretary feature (including Program Rooms
 * and Room Requests), under its own /director/* routes. Unlike programHeadNav nothing is removed.
 */
const mapItems = (items: NavItem[]): NavItem[] => items.map((item) => ({
  ...item,
  path: item.path ? officePath('director', item.path) : undefined,
  children: item.children ? mapItems(item.children) : undefined,
}));

export const directorNav: NavSection[] = secretaryNav.map((section) => ({
  ...section,
  items: mapItems(section.items),
}));
