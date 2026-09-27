import type { NavItem, NavSection } from './types';
import { secretaryNav } from './secretaryNav';

const toProgramHeadPath = (path: string): string => {
  const pathAliases: Record<string, string> = {
    '/secretary/instructors': '/program_head/faculty',
  };

  return pathAliases[path] ?? path.replace('/secretary/', '/program_head/');
};

// Secretary-only screens. Their capability cannot be granted to a program head
// (config/capabilities.php), so mapping them would only show a permanently
// locked item pointing at a route that does not exist.
const SECRETARY_ONLY_PATHS = new Set(['/secretary/program-rooms']);

const mapItems = (items: NavItem[]): NavItem[] => items
  .filter((item) => !item.path || !SECRETARY_ONLY_PATHS.has(item.path))
  .map((item) => ({
    ...item,
    path: item.path ? toProgramHeadPath(item.path) : undefined,
    children: item.children ? mapItems(item.children) : undefined,
  }));

export const programHeadNav: NavSection[] = secretaryNav.map((section) => ({
  ...section,
  items: mapItems(section.items),
}));
