import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { clearDataCache } from '../../lib/dataCache';
import SecretaryDashboardPage from './SecretaryDashboardPage';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));

afterEach(cleanup);
beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.clear();
});

const roles = ['secretary', 'director', 'program_head'] as const;
const cases = roles.flatMap(role => (['overview', 'progress'] as const).map(tab => ({ role, tab })));

it.each(cases)('loads the $role skeleton for the requested $tab tab', ({ role, tab }) => {
  localStorage.setItem('user', JSON.stringify({
    id: 8, role, department_id: 6, permissions: ['schedule.view', 'schedule.assign_instructor'],
  }));
  const { container } = render(
    <MemoryRouter initialEntries={[`/?tab=${tab}`]}><ToastProvider><SecretaryDashboardPage role={role} /></ToastProvider></MemoryRouter>,
  );
  expect(container.querySelector(`[data-skeleton="panel-${tab}"]`)).toBeTruthy();
  expect(!!container.querySelector('[data-skeleton="timetable"]')).toBe(tab === 'overview');
});

it('keeps the restricted office overview free of a timetable', () => {
  localStorage.setItem('user', JSON.stringify({ id: 8, role: 'secretary', department_id: 6, permissions: [] }));
  const { container } = render(<MemoryRouter><ToastProvider><SecretaryDashboardPage /></ToastProvider></MemoryRouter>);
  expect(container.querySelector('[data-skeleton="panel-overview"]')).toBeTruthy();
  expect(container.querySelector('[data-skeleton="timetable"]')).toBeNull();
});
