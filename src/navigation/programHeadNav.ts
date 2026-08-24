import type { NavItem, NavSection } from './types';
import { secretaryNav } from './secretaryNav';

const toProgramHeadPath = (path: string): string => {
  const pathAliases: Record<string, string> = {
    '/secretary/instructors': '/program_head/faculty',
  };

  return pathAliases[path] ?? path.replace('/secretary/', '/program_head/');
};

const mapItem = (item: NavItem): NavItem => ({
  ...item,
  path: item.path ? toProgramHeadPath(item.path) : undefined,
  children: item.children?.map(mapItem),
});

export const programHeadNav: NavSection[] = secretaryNav.map((section) => ({
  ...section,
  items: section.items.map(mapItem),
}));
