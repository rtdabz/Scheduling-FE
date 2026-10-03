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
  .map((item) => {
    const mappedChildren = item.children ? mapItems(item.children) : undefined;
    if (mappedChildren && mappedChildren.length === 1 && mappedChildren[0].path) {
      const single = mappedChildren[0];
      return {
        ...single,
        label: item.label,
        icon: item.icon ?? single.icon,
        id: single.id ?? item.id,
      };
    }

    return {
      ...item,
      path: item.path ? toProgramHeadPath(item.path) : undefined,
      children: mappedChildren && mappedChildren.length > 0 ? mappedChildren : undefined,
    };
  });

export const programHeadNav: NavSection[] = secretaryNav.map((section) => ({
  ...section,
  items: mapItems(section.items),
}));
