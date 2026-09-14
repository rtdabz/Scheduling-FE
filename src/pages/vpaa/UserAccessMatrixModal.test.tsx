import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, patch } }));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: toastMock }),
}));

import UserAccessMatrixModal from './UserAccessMatrixModal';

afterEach(cleanup);

const mockUser = {
  id: 42,
  name: 'Maria Santos',
  email: 'msantos@school.edu.ph',
  username: 'msantos',
  role: 'Program Head',
  status: 'Active' as const,
  department: 'College of Arts and Sciences',
  created_at: '2026-01-15T00:00:00.000000Z',
};

const mockApiResponse = {
  user_id: 42,
  user_name: 'Maria Santos',
  user_role: 'Program Head',
  inherited: ['schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete'],
  direct: ['schedule.assign_instructor'],
  effective: ['schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete', 'schedule.assign_instructor'],
  catalog: [
    'schedule.view',
    'schedule.create',
    'schedule.update',
    'schedule.delete',
    'schedule.generate',
    'schedule.assign_instructor',
    'schedule.submit',
    'schedule.withdraw',
    'schedule.approve_dean',
    'schedule.approve_vpaa',
  ],
  catalog_metadata: [
    { id: 'schedule.view', module: 'schedule_workspace', title: 'View Schedules', description: 'Browse schedules.', assignable: true },
    { id: 'schedule.create', module: 'schedule_workspace', title: 'Create Schedules', description: 'Create schedules.', assignable: true },
    { id: 'schedule.update', module: 'schedule_workspace', title: 'Update Schedules', description: 'Update schedules.', assignable: true },
    { id: 'schedule.delete', module: 'schedule_workspace', title: 'Delete Schedules', description: 'Delete schedules.', assignable: true },
    { id: 'schedule.generate', module: 'recommendations', title: 'Generate Recommendations', description: 'Generate recommendations.', assignable: true },
    { id: 'schedule.assign_instructor', module: 'instructor_assignment', title: 'Assign Instructors', description: 'Assign instructors.', assignable: true },
    { id: 'schedule.submit', module: 'submission_workflow', title: 'Submit Schedules', description: 'Submit schedules.', assignable: true },
    { id: 'schedule.withdraw', module: 'submission_workflow', title: 'Withdraw Submission', description: 'Withdraw submissions.', assignable: true },
    { id: 'schedule.approve_dean', module: 'approval_workflow', title: 'Dean Approval', description: 'Approve as dean.', assignable: false },
    { id: 'schedule.approve_vpaa', module: 'approval_workflow', title: 'VPAA Approval', description: 'Approve as VPAA.', assignable: false },
  ],
  modules: [
    { id: 'schedule_workspace', title: 'Schedule Workspace', description: 'Scheduling.', capabilities: [], granted: true },
    { id: 'recommendations', title: 'Recommendations Engine', description: 'Recommendations.', capabilities: [], granted: false },
    { id: 'instructor_assignment', title: 'Instructor Assignment', description: 'Assignments.', capabilities: [], granted: true },
    { id: 'submission_workflow', title: 'Submission Workflow', description: 'Submission.', capabilities: [], granted: false },
    { id: 'approval_workflow', title: 'Approval Workflow', description: 'Approval.', capabilities: [], granted: false },
  ],
  presets: {
    view_only: { label: 'View Only', permissions: ['schedule.view'] },
    assign_only: { label: 'Assign Only', permissions: ['schedule.view', 'schedule.assign_instructor'] },
    full_workspace: { label: 'Full Scheduling Workspace', permissions: ['schedule.view', 'schedule.create', 'schedule.update', 'schedule.delete', 'schedule.generate', 'schedule.submit', 'schedule.withdraw', 'schedule.assign_instructor'] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: mockApiResponse });
  patch.mockResolvedValue({
    data: {
      message: 'Access permissions updated successfully.',
      data: {
        inherited: mockApiResponse.inherited,
        direct: ['schedule.assign_instructor', 'schedule.submit'],
        effective: [...mockApiResponse.inherited, 'schedule.assign_instructor', 'schedule.submit'],
      },
    },
  });
});

describe('UserAccessMatrixModal', () => {
  it('renders modal header, user details, and metrics', async () => {
    render(
      <UserAccessMatrixModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
        onSuccess={vi.fn()}
      />
    );

    expect(await screen.findByText('User Access Matrix')).toBeTruthy();
    expect(screen.getByText('Maria Santos')).toBeTruthy();
    expect(screen.getByText(/msantos@school\.edu\.ph/)).toBeTruthy();
    expect(screen.getByText('Program Head')).toBeTruthy();

    // Metric chips
    expect(screen.getAllByText('Role Defaults').length).toBeGreaterThan(0);
    expect(screen.getByText('Direct Grants')).toBeTruthy();
  });

  it('renders module categories and permissions catalog', async () => {
    render(
      <UserAccessMatrixModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
        onSuccess={vi.fn()}
      />
    );

    expect(await screen.findByText('Schedule Workspace')).toBeTruthy();
    expect(screen.getByText('Recommendations Engine')).toBeTruthy();
    expect(screen.getByText('Instructor Assignment')).toBeTruthy();
    expect(screen.getByText('Submission Workflow')).toBeTruthy();
    expect(screen.getByText('Approval Workflow')).toBeTruthy();
  });

  it('indicates role-inherited permissions with locked badge and disabled switch', async () => {
    render(
      <UserAccessMatrixModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
        onSuccess={vi.fn()}
      />
    );

    await screen.findByText('User Access Matrix');
    const roleDefaultBadges = screen.getAllByText('Role Default');
    expect(roleDefaultBadges.length).toBeGreaterThan(0);

    const switches = screen.getAllByRole('switch');
    // The first 4 are inherited so they should be disabled
    expect(switches[0]).toHaveProperty('disabled', true);
  });

  it('allows toggling a direct permission and saves changes', async () => {
    const onSuccessMock = vi.fn();
    render(
      <UserAccessMatrixModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
        onSuccess={onSuccessMock}
      />
    );

    await screen.findByText('User Access Matrix');

    // Find switches
    const switches = screen.getAllByRole('switch');
    // Switch for schedule.submit is not inherited, so disabled is false
    const toggleableSwitch = switches.find((s) => !s.hasAttribute('disabled'));
    expect(toggleableSwitch).toBeTruthy();
    fireEvent.click(toggleableSwitch!);

    // Save button should now be enabled
    const saveBtn = screen.getByRole('button', { name: /Save Access Changes/i });
    expect(saveBtn).not.toHaveProperty('disabled', true);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        '/user/42/permissions',
        expect.objectContaining({
          permissions: expect.any(Array),
        })
      );
    });

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith(
        'Access Updated',
        expect.stringContaining('Maria Santos')
      );
    });
  });

  it('applies quick presets and resets to saved', async () => {
    render(
      <UserAccessMatrixModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
        onSuccess={vi.fn()}
      />
    );

    await screen.findByText('User Access Matrix');

    // Click "Assign Only" preset
    const assignOnlyChip = screen.getByRole('button', { name: /Assign Only/i });
    fireEvent.click(assignOnlyChip);

    // Click "Role Defaults" preset
    const roleDefaultsChip = screen.getByRole('button', { name: /Role Defaults/i });
    fireEvent.click(roleDefaultsChip);
  });
});

describe('UserAccessMatrixModal against role defaults and prerequisites', () => {
  // Shaped like the real config: every capability but View requires View.
  const capability = (id: string, module: string, extra: Record<string, unknown> = {}) => ({
    id,
    module,
    title: id,
    description: `${id} description`,
    assignable: true,
    requires: id === 'schedule.view' ? [] : ['schedule.view'],
    ...extra,
  });
  const catalog = [
    capability('schedule.view', 'schedule_workspace'),
    capability('schedule.create', 'schedule_workspace', { requires_program: true }),
    capability('room.review_requests', 'room_requests', { assignable: false }),
  ];
  const response = (overrides: Record<string, unknown>) => ({
    data: {
      inherited: [],
      direct: [],
      effective: [],
      catalog: catalog.map((c) => c.id),
      catalog_metadata: catalog,
      modules: [
        { id: 'schedule_workspace', title: 'Schedule Workspace', description: 'Scheduling.', capabilities: [] },
        { id: 'room_requests', title: 'Room Requests', description: 'Rooms.', capabilities: [] },
      ],
      presets: { view_only: { label: 'Reviewer', permissions: ['schedule.view'] } },
      scheduling_ready: true,
      ...overrides,
    },
  });
  const dean = { id: 7, name: 'Dean', username: 'dean', email: 'dean@school.edu.ph', role: 'dean', status: 'Active' as const };
  const switchFor = (id: string) =>
    screen.getByText(id, { selector: 'code' }).closest('div.px-5')!.querySelector('[role="switch"]') as HTMLButtonElement;
  const renderModal = async (user = dean) => {
    render(<UserAccessMatrixModal isOpen onClose={vi.fn()} user={user} onSuccess={vi.fn()} />);
    await screen.findByText('schedule.create', { selector: 'code' });
  };

  it('highlights Role Defaults, not a preset the role already covers, when nothing is granted', async () => {
    get.mockResolvedValue(response({ inherited: ['schedule.view'] }));
    await renderModal();

    expect(screen.getByRole('button', { name: 'Role Defaults' }).className).toContain('bg-gray-800');
    expect(screen.getByRole('button', { name: 'Reviewer' }).className).not.toContain('bg-[#5A1220]');
  });

  it('does not add an inherited prerequisite as a direct grant', async () => {
    get.mockResolvedValue(response({ inherited: ['schedule.view'] }));
    await renderModal();

    fireEvent.click(switchFor('schedule.create'));
    expect(screen.getByText('Direct Grants').parentElement?.textContent).toContain('1 Direct Grants');

    fireEvent.click(switchFor('schedule.create'));
    expect(screen.queryByText(/unsaved access changes/i)).toBeNull();
    expect(screen.getByText('Direct Grants').parentElement?.textContent).toContain('0 Direct Grants');
  });

  it('lets a grant the role may no longer hold be revoked and saved', async () => {
    get.mockResolvedValue(response({ direct: ['room.review_requests'] }));
    await renderModal({ ...dean, role: 'secretary' });

    expect(screen.getByText('Not allowed for role')).not.toBeNull();
    const stale = switchFor('room.review_requests');
    expect(stale.disabled).toBe(false);

    fireEvent.click(stale);
    expect(stale.getAttribute('aria-checked')).toBe('false');
    // Once revoked it cannot be switched back on.
    expect(stale.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Save Access Changes/i }));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith('/user/7/permissions', { permissions: [] });
    });
  });

  it('warns when a granted capability needs a program the department does not have', async () => {
    get.mockResolvedValue(response({ direct: ['schedule.create', 'schedule.view'], scheduling_ready: false }));
    await renderModal();

    expect(screen.getByRole('alert')?.textContent).toContain('schedule.create');
    expect(screen.getByText('Needs a program')).not.toBeNull();
  });

  it('shows no program warning once the department is ready', async () => {
    get.mockResolvedValue(response({ direct: ['schedule.create', 'schedule.view'] }));
    await renderModal();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Needs a program')).toBeNull();
  });
});
