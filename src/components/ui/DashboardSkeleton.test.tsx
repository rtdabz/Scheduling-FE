import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardSkeleton from './DashboardSkeleton';

// The vitest config does not enable globals, so testing-library's automatic
// cleanup never registers.
afterEach(cleanup);

/**
 * Every dashboard shares this component, so a change made for one role has to be
 * checked against all of them. The variants are dispatched in order, and the
 * legacy `metricCount` / 'dashboard' / 'summary' props are still passed by older
 * callers — those paths are covered here too.
 */
describe('DashboardSkeleton', () => {
  const variants = ['secretary', 'dean', 'vpaa', 'program', 'institutional'] as const;

  it.each(variants)('renders the %s variant with a loading label', (variant) => {
    const { container } = render(<DashboardSkeleton variant={variant} />);
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
    // Every variant draws at least one pulsing placeholder.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('defaults to the institutional variant when no props are given', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });

  it('keeps the legacy summary and dashboard variants working', () => {
    const summary = render(<DashboardSkeleton variant="summary" />);
    expect(summary.container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
    cleanup();

    const dashboard = render(<DashboardSkeleton variant="dashboard" metricCount={7} />);
    expect(dashboard.container.querySelector('[aria-label="Loading dashboard"]')).toBeTruthy();
  });

  it('gives the dean metric row one double-width tile', () => {
    // MetricCard grew a className prop so the composite completion tile can span
    // two columns; the other five tiles must stay single-width.
    const { container } = render(<DashboardSkeleton variant="dean" />);
    expect(container.querySelectorAll('.min-h-\\[90px\\]').length).toBe(6);
    expect(container.querySelectorAll('.min-h-\\[90px\\].xl\\:col-span-2').length).toBe(1);
  });

  it('gives the vpaa two metric rows: decision KPIs then the inventory strip', () => {
    // The VPAA dashboard splits its tiles in two — four decision metrics plus the
    // double-width completion tile, then five static inventory counts — so the
    // skeleton has to reserve both rows or the page jumps when the data lands.
    const { container } = render(<DashboardSkeleton variant="vpaa" />);
    expect(container.querySelectorAll('.min-h-\\[90px\\]').length).toBe(10);
    expect(container.querySelectorAll('.min-h-\\[90px\\].xl\\:col-span-2').length).toBe(1);
  });

  it('leaves the secretary metric row at eight single-width tiles', () => {
    const { container } = render(<DashboardSkeleton variant="secretary" />);
    expect(container.querySelectorAll('.min-h-\\[90px\\]').length).toBe(8);
    expect(container.querySelectorAll('.min-h-\\[90px\\].xl\\:col-span-2').length).toBe(0);
  });
  describe('secretary layout', () => {
    const fullLayout = {
      tileCount: 8,
      tileGridClassName: 'sm:grid-cols-4',
      queueRowCount: 6,
      showDraftingProgress: true,
      showFacultyAssignment: true,
      showTimetable: true,
      readinessCheckCount: 6,
    };

    it('reserves exactly the tiles and column classes the page will render', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ ...fullLayout, tileCount: 5, tileGridClassName: 'sm:grid-cols-3 xl:grid-cols-5' }} />);
      const metrics = container.querySelector('[data-skeleton="metrics"]')!;
      expect(metrics.children).toHaveLength(5);
      expect(metrics.className).toContain('sm:grid-cols-3');
      expect(metrics.className).toContain('xl:grid-cols-5');
    });

    it('draws one queue line per queue row', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ ...fullLayout, queueRowCount: 2 }} />);
      const queue = container.querySelector('.xl\\:col-span-4 .divide-y')!;
      expect(queue.children).toHaveLength(2);
    });

    it('leaves out the panels a read-only account does not see', () => {
      const full = render(<DashboardSkeleton variant="secretary" secretaryLayout={fullLayout} />);
      expect(full.container.querySelectorAll('.xl\\:col-span-4')).toHaveLength(3);
      expect(full.container.querySelector('.timetable-grid-root')).toBeTruthy();
      cleanup();

      const limited = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ ...fullLayout, showDraftingProgress: false, showFacultyAssignment: false, showTimetable: false }} />);
      expect(limited.container.querySelectorAll('.xl\\:col-span-4')).toHaveLength(1);
      expect(limited.container.querySelector('.timetable-grid-root')).toBeNull();
    });
  });
});
