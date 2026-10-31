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

  it.each(['dean', 'vpaa', 'secretary'] as const)('gives the %s the semester context, four KPI cards, the queue and one breakdown', (variant) => {
    const { container } = render(<DashboardSkeleton variant={variant} />);
    expect(container.querySelector('[data-skeleton="context"]')).toBeTruthy();
    expect(container.querySelector('[data-skeleton="metrics"]')!.children).toHaveLength(4);
    expect(container.querySelector('[data-skeleton="queue-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-skeleton="breakdown"]')).toBeTruthy();
    // The full master timetable lives in its own module.
    expect(container.querySelector('[data-skeleton="timetable"]')).toBeNull();
  });

  it.each(['dean', 'vpaa'] as const)('draws the %s status distribution beside its breakdown', (variant) => {
    const { container } = render(<DashboardSkeleton variant={variant} />);
    expect(container.querySelector('[data-skeleton="breakdown"] [data-skeleton="status"]')).toBeTruthy();
  });

  describe('secretary layout', () => {
    it('draws one queue line per queue row', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ queueRowCount: 2, showDraftingProgress: true }} />);
      expect(container.querySelector('[data-skeleton="queue"]')!.children).toHaveLength(2);
    });

    it('leaves out the breakdown a read-only account does not see', () => {
      const { container } = render(<DashboardSkeleton variant="secretary" secretaryLayout={{ queueRowCount: 3, showDraftingProgress: false }} />);
      expect(container.querySelector('[data-skeleton="breakdown"]')).toBeNull();
      expect(container.querySelector('[data-skeleton="queue-panel"]')).toBeTruthy();
    });
  });
});
