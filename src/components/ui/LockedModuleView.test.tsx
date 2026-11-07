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
  lockedModuleMessage: (capability?: string) =>
    capability ? 'Your department has no program yet' : 'Your role does not include access to this module.',
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
    expect(screen.getByText(/Your department has no program yet/i)).toBeTruthy();
    expect(screen.getByText(/Required: schedule\.approve_dean/)).toBeTruthy();
  });

  it('shows a workflow lock message in place of the permission explanation', () => {
    render(
      <MemoryRouter>
        <LockedModuleView
          moduleName="Cross-Department"
          message="Cross-Department assignments will be available once all schedules are approved by the VPAA."
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Cross-Department is Locked')).toBeTruthy();
    expect(screen.getByText(/available once all schedules are approved by the VPAA/i)).toBeTruthy();
    expect(screen.queryByText(/Your role does not include access/i)).toBeNull();
    expect(screen.queryByText(/Required:/)).toBeNull();
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
