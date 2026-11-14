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

  it('gives the dean one metric strip: decision KPI, completion, then inventory', () => {
    const { container } = render(<DashboardSkeleton variant="dean" />);
    expect(container.querySelector('[data-skeleton="metrics"]')!.children).toHaveLength(6);
  });

  it('gives the vpaa one metric strip: decision KPI, completion, then inventory', () => {
    const { container } = render(<DashboardSkeleton variant="vpaa" />);
    expect(container.querySelector('[data-skeleton="metrics"]')!.children).toHaveLength(7);
  });

  it('gives the secretary one metric strip of DashboardMetricCard-sized tiles', () => {
    const { container } = render(<DashboardSkeleton variant="secretary" />);
    // Every tile in the strip, completion included, shares DashboardMetricCard's box.
    expect(container.querySelectorAll('.min-h-\\[90px\\]').length).toBe(6);
  });

  it.each(['secretary', 'dean', 'vpaa', 'program'] as const)('only reserves overview components for %s by default', (variant) => {
    const { container } = render(<DashboardSkeleton variant={variant} />);
    expect(container.querySelector('[data-skeleton="tabs"]')).toBeTruthy();
    expect(container.querySelector('[data-skeleton="panel-overview"]')).toBeTruthy();
    expect(container.querySelector('[data-skeleton="timetable"]')).toBeTruthy();
    expect(container.querySelector('[data-skeleton="queue-rows"]')).toBeNull();
  });

  it.each([
    ['secretary', 'progress'], ['dean', 'progress'], ['dean', 'attentions'],
    ['vpaa', 'progress'], ['vpaa', 'attentions'], ['vpaa', 'activity'],
  ] as const)('reserves only the selected %s %s tab', (variant, tab) => {
    const { container } = render(<DashboardSkeleton variant={variant} tab={tab} />);
    expect(container.querySelector(`[data-skeleton="panel-${tab}"]`)).toBeTruthy();
    expect(container.querySelector('[data-skeleton="metrics"]')).toBeNull();
    expect(container.querySelector('[data-skeleton="timetable"]')).toBeNull();
    expect(container.querySelectorAll('[data-skeleton^="panel-"]')).toHaveLength(1);
  });

  describe('secretary layout', () => {
    const fullLayout = {
      queueRowCount: 6,
      showDraftingProgress: true,
      showFacultyAssignment: true,
      showTimetable: true,
      readinessCheckCount: 6,
    };

    it('reserves the unified metric strip', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={fullLayout} />);
      expect(container.querySelector('[data-skeleton="metrics"]')!.children).toHaveLength(6);
    });

    it('draws one queue line per queue row', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" tab="progress" secretaryLayout={{ ...fullLayout, queueRowCount: 2 }} />);
      const queue = container.querySelector('[data-skeleton="queue-rows"]')!;
      expect(queue.children).toHaveLength(2);
    });

    it('leaves out the panels a read-only account does not see', () => {
      const full = render(<DashboardSkeleton variant="secretary" tab="progress" secretaryLayout={fullLayout} />);
      expect(full.container.querySelectorAll('.xl\\:col-span-4')).toHaveLength(3);
      expect(full.container.querySelector('[data-skeleton="timetable"]')).toBeNull();
      cleanup();

      const limited = render(<DashboardSkeleton variant="secretary" tab="progress" secretaryLayout={{ ...fullLayout, showDraftingProgress: false, showFacultyAssignment: false, showTimetable: false }} />);
      expect(limited.container.querySelectorAll('.xl\\:col-span-4')).toHaveLength(1);
      expect(limited.container.querySelector('[data-skeleton="timetable"]')).toBeNull();
    });

    it('omits the overview timetable when schedule access is unavailable', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ ...fullLayout, showTimetable: false }} />);
      expect(container.querySelector('[data-skeleton="metrics"]')).toBeTruthy();
      expect(container.querySelector('[data-skeleton="timetable"]')).toBeNull();
    });
  });
});
