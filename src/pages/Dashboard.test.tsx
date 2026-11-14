import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./secretary/SecretaryDashboardPage', () => ({
  default: ({ role = 'secretary' }: { role?: string }) => <div>office dashboard: {role}</div>,
}));

import Dashboard from './Dashboard';

describe('Dashboard', () => {
  afterEach(cleanup);

  it('renders the shared office dashboard for a Director, keeping its role', async () => {
    render(<Dashboard role="director" />);
    expect(await screen.findByText('office dashboard: director')).toBeTruthy();
    expect(screen.queryByText('Invalid Role')).toBeNull();
  });

  it('still rejects an unknown role', () => {
    render(<Dashboard role="registrar" />);
    expect(screen.getByText('Invalid Role')).toBeTruthy();
  });
});
