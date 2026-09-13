import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { NavItem, NavSection } from '../../navigation/types';

interface PageHeaderProps {
  navItems: NavSection[];
  homePath: string;
}

type NavMatch = { labels: string[]; path?: string };

const findMatch = (items: NavItem[], pathname: string, parents: string[] = []): NavMatch | null => {
  let best: NavMatch | null = null;
  for (const item of items) {
    const labels = [...parents, item.label];
    if (item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`))) {
      best = { labels, path: item.path };
    }
    if (item.children) {
      const childMatch = findMatch(item.children, pathname, labels);
      if (childMatch && (!best || (childMatch.path?.length ?? 0) > (best.path?.length ?? 0))) best = childMatch;
    }
  }
  return best;
};

const humanizePath = (pathname: string): string[] => pathname
  .split('/')
  .filter(Boolean)
  .filter((segment) => !['vpaa', 'dean', 'secretary', 'program_head'].includes(segment.toLowerCase()))
  .filter((segment) => !/^\d+$/.test(segment))
  .map((segment) => segment.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));

export default function PageHeader({ navItems, homePath }: PageHeaderProps) {
  const { pathname } = useLocation();
  const match = navItems.map((section) => findMatch(section.items, pathname)).find(Boolean) ?? null;
  const labels = match?.labels ?? humanizePath(pathname);
  const isDetailRoute = Boolean(match?.path && pathname !== match.path && pathname.startsWith(`${match.path}/`));
  const detailLabel = pathname.endsWith('/schedules/generate') ? 'Schedule Generator' : 'Details';
  const trail = isDetailRoute ? [...labels, detailLabel] : labels;

  const rawTitle = trail[trail.length - 1] ?? 'Workspace';
  const role = pathname.split('/')[1];
  const title = rawTitle === 'Dashboard'
    ? role === 'secretary' ? 'Secretary Dashboard'
      : role === 'program_head' ? 'Program Head Dashboard'
        : role === 'dean' ? 'Dean Dashboard' : 'VPAA Dashboard'
    : rawTitle;

  return (
    <header className="mb-5 flex flex-col gap-1">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 overflow-x-auto text-sm font-semibold text-slate-400">
      <Link to={homePath} className="inline-flex shrink-0 items-center gap-1 hover:text-[#4e0a10]">
        <Home size={14} aria-hidden="true" />
        <span>Home</span>
      </Link>
      {trail.map((label, index) => {
        const current = index === trail.length - 1;
        return (
          <span key={`${label}-${index}`} className="inline-flex shrink-0 items-center gap-1.5">
            <ChevronRight size={14} aria-hidden="true" />
            <span className={current ? 'font-bold text-[#4e0a10]' : undefined}>{label}</span>
          </span>
        );
      })}
      </nav>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-[#4e0a10] sm:text-3xl">{title}</h1>
    </header>
  );
}
