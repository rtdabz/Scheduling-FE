import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LockedModuleView from './LockedModuleView';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../lib/storedUser', () => ({
  getStoredUser: () => ({ role: 'dean' }),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LockedModuleView', () => {
  it('renders locked module screen with required capability and module name', () => {
    render(
      <MemoryRouter>
        <LockedModuleView
          moduleName="Schedule Approvals"
          requiredCapability="schedule.approve_dean"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Schedule Approvals is Locked')).toBeTruthy();
    expect(screen.getByText('Access Restricted')).toBeTruthy();
    expect(screen.getByText(/Access restricted\. Ask an administrator to grant access to this module\./i)).toBeTruthy();
    expect(screen.getByText(/Required: schedule\.approve_dean/)).toBeTruthy();
  });

  it('navigates back to user dashboard when Return button is clicked', () => {
    render(
      <MemoryRouter>
        <LockedModuleView moduleName="Schedule Approvals" />
      </MemoryRouter>
    );

    const returnBtn = screen.getByRole('button', { name: /Return to Dashboard/i });
    fireEvent.click(returnBtn);

    expect(navigateMock).toHaveBeenCalledWith('/dean/dashboard');
  });
});
