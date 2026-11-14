import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sections from './Sections';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';
import { clearDataCache } from '../../lib/dataCache';

const { get, post, toast } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: vi.fn() }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));

const guide = () => vi.mocked(useWorkflowGuide).mock.calls.at(-1)![0];
const steps = () => {
  const current = guide();
  return typeof current.steps === 'function' ? current.steps() : current.steps;
};

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 1 }));
  get.mockImplementation(async (url: string) => {
    const responses: Record<string, unknown[]> = {
      '/sections': [],
      '/departments': [{ id: 1, department_code: 'CIT', department_name: 'Information Technology' }],
      '/programs': [{ id: 1, department_id: 1, code: 'BSIT', name: 'Information Technology' }],
      '/semesters': [{ id: 1, semester: '1st', academic_year: '2026-2027', is_active: true }],
    };
    return { data: responses[url] ?? [] };
  });
});
afterEach(cleanup);

describe('section help context', () => {
  it('reviews required fields and save without entering or creating a section', async () => {
    render(<Sections />);
    await waitFor(() => expect(guide().isReady).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    const formSteps = steps();
    expect(formSteps.some((step) => step.element === '#section-program-select')).toBe(true);
    expect(formSteps.some((step) => step.element === '#section-save')).toBe(true);
    expect(formSteps.every((step) => step.action === undefined || step.action === 'complete')).toBe(true);
    formSteps.forEach((step) => expect(document.querySelector(step.element)).toBeTruthy());
    // The department's only program is selected automatically and pre-fills the name; nothing is saved.
    expect((screen.getByRole('textbox', { name: /Program name/ }) as HTMLInputElement).value).toBe('BSIT');
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps a reviewer in browse help with no hidden creation target', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 2, role: 'dean', permissions: ['schedule.view'] }));
    render(<Sections />);
    await waitFor(() => expect(guide().isReady).toBe(true));
    expect(screen.queryByRole('button', { name: 'Add Section' })).toBeNull();
    expect(steps().some((step) => step.action === 'click' || step.element === '#sections-add-button')).toBe(false);
    steps().forEach((step) => expect(document.querySelector(step.element)).toBeTruthy());
  });
});
