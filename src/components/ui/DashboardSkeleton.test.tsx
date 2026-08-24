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

  it('gives the dean and vpaa metric rows one double-width tile', () => {
    // MetricCard grew a className prop so the composite completion tile can span
    // two columns; the other five tiles must stay single-width.
    (['dean', 'vpaa'] as const).forEach(variant => {
      const { container } = render(<DashboardSkeleton variant={variant} />);
      const tiles = container.querySelectorAll('.min-h-\\[90px\\]');
      expect(tiles.length).toBe(6);
      expect(container.querySelectorAll('.min-h-\\[90px\\].xl\\:col-span-2').length).toBe(1);
      cleanup();
    });
  });

  it('leaves the secretary metric row at eight single-width tiles', () => {
    const { container } = render(<DashboardSkeleton variant="secretary" />);
    expect(container.querySelectorAll('.min-h-\\[90px\\]').length).toBe(8);
    expect(container.querySelectorAll('.min-h-\\[90px\\].xl\\:col-span-2').length).toBe(0);
  });
});
