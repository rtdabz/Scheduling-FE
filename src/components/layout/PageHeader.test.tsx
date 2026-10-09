import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import PageHeader from './PageHeader';
import { deanNav } from '../../navigation/deanNav';

const renderAt = (path: string, nav = deanNav) => render(
  <MemoryRouter initialEntries={[path]}>
    <PageHeader navItems={nav} homePath="/dean/dashboard" />
  </MemoryRouter>,
);

describe('PageHeader', () => {
  afterEach(() => cleanup());

  it('titles a page by its own menu item, not by a sibling whose path prefixes it', () => {
    renderAt('/dean/schedules/approval');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Schedule Approval');
    expect(screen.queryByText('Details')).toBeNull();
  });

  it('still titles the sibling page itself', () => {
    renderAt('/dean/schedules');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All Schedules');
  });
});
