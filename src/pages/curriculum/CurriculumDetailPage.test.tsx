import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const { state } = vi.hoisted(() => ({ state: { programId: null as number | null } }));
vi.mock('../../hooks/curriculum/useCurriculumDetail', () => ({ useCurriculumDetail: () => ({
  curriculum: { id: 1, department_id: 1, program_id: state.programId }, isLoading: false,
  currentYearSemesters: [{ semester: 1 }], programs: [], yearLevelStats: [],
}) }));
vi.mock('../../components/curriculum/CurriculumHeader', () => ({ default: ({ canActivate }: { canActivate: boolean }) =>
  <div>{canActivate ? 'Activation available' : 'Review only'}</div> }));
vi.mock('../../components/curriculum/SemesterCard', () => ({ default: ({ canEdit }: { canEdit: boolean }) =>
  <div>{canEdit ? 'Editing available' : 'Courses read only'}</div> }));
import CurriculumDetailPage from './CurriculumDetailPage';
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('user', JSON.stringify({ role: 'program_head', department_id: 1, program_id: 2, permissions: ['curriculum.manage'] }));
});
afterEach(cleanup);
describe('curriculum detail ownership controls', () => {
  it.each([null, 3])('keeps program %s read only even with mode=edit', program => {
    state.programId = program;
    render(<MemoryRouter initialEntries={['/?mode=edit']}><CurriculumDetailPage /></MemoryRouter>);
    expect(screen.getByText('Review only')).toBeDefined();
    expect(screen.getByText('Courses read only')).toBeDefined();
  });
  it('allows editing the assigned program', () => {
    state.programId = 2;
    render(<MemoryRouter initialEntries={['/?mode=edit']}><CurriculumDetailPage /></MemoryRouter>);
    expect(screen.getByText('Activation available')).toBeDefined();
    expect(screen.getByText('Editing available')).toBeDefined();
  });
});
