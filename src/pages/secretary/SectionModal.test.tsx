import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SectionModal from './SectionModal';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const semester = { id: 1, semester: '1st' as const, academic_year: '2026-2027', is_active: true };
type ProgramFixture = { id: number; department_id: number; code: string; name: string | null };
const BSIT: ProgramFixture = { id: 5, department_id: 1, code: 'BSIT', name: null };
const BSCS: ProgramFixture = { id: 6, department_id: 1, code: 'BSCS', name: null };
const programSelect = () => document.getElementById('section-program-select') as HTMLSelectElement;
const previewNames = () => Array.from(screen.getByRole('region', { name: 'Sections to be created' }).querySelectorAll('li')).map((li) => li.textContent);

const renderModal = (
  onSaveBatch = vi.fn().mockResolvedValue(undefined),
  existing = [{ id: 9, section_name: 'BSIT 3A', department_id: 1, semester_id: 1 }],
  programs: ProgramFixture[] = [BSIT],
) => {
  render(
    <SectionModal
      isOpen
      isEditMode={false}
      activeSemester={semester}
      departments={[{ id: 1, department_code: 'CIT', department_name: 'IT' }]}
      programs={programs}
      userDepartmentId={1}
      isVpaa={false}
      onClose={vi.fn()}
      onSaveSingle={vi.fn()}
      onSaveBatch={onSaveBatch}
      existingSections={existing}
    />,
  );
  return onSaveBatch;
};

describe('Add Sections (quantity based)', () => {
  it('previews continued names and saves them with the selected year level', async () => {
    const onSaveBatch = renderModal();
    fireEvent.change(document.getElementById('section-program-select')!, { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'bsit' } });
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Year level/), { target: { value: '3' } });

    const preview = screen.getByRole('region', { name: 'Sections to be created' });
    expect(Array.from(preview.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['BSIT 3B', 'BSIT 3C', 'BSIT 3D']);
    expect(preview.textContent).toContain('BSIT 3A already exists');

    fireEvent.click(screen.getByRole('button', { name: 'Save 3 sections' }));
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledWith(
      [
        { section_name: 'BSIT 3B', year_level: '3' },
        { section_name: 'BSIT 3C', year_level: '3' },
        { section_name: 'BSIT 3D', year_level: '3' },
      ],
      1,
      5,
    ));
  });

  it('rejects invalid quantities without saving', () => {
    const onSaveBatch = renderModal();
    fireEvent.change(document.getElementById('section-program-select')!, { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'BSIT' } });
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '0' } });
    expect(screen.getByText('Enter a whole number of 1 or more')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '51' } });
    expect(screen.getByText(/up to 50 sections/)).toBeTruthy();
    fireEvent.submit(screen.getByRole('button', { name: 'Save section' }).closest('form')!);
    expect(onSaveBatch).not.toHaveBeenCalled();
  });

  it('moves the preview past names the server reports as taken', async () => {
    const onSaveBatch = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'taken', errors: { 'sections.0.section_name': ['BSIT 2A already exists'] } } },
    });
    renderModal(onSaveBatch, []);
    fireEvent.change(document.getElementById('section-program-select')!, { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Year level/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 sections' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const preview = screen.getByRole('region', { name: 'Sections to be created' });
    expect(Array.from(preview.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['BSIT 2B', 'BSIT 2C']);
  });

  it('pre-fills the program code and derives the year number from Year Level', () => {
    renderModal(undefined, []);
    fireEvent.change(document.getElementById('section-program-select')!, { target: { value: '5' } });
    expect((screen.getByLabelText(/Program name/) as HTMLInputElement).value).toBe('BSIT');
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '3' } });
    const names = () => Array.from(screen.getByRole('region', { name: 'Sections to be created' }).querySelectorAll('li')).map((li) => li.textContent);
    expect(names()).toEqual(['BSIT 1A', 'BSIT 1B', 'BSIT 1C']);
    fireEvent.change(screen.getByLabelText(/Year level/), { target: { value: '4' } });
    expect(names()).toEqual(['BSIT 4A', 'BSIT 4B', 'BSIT 4C']);
  });

  it('warns when the year number is typed into the program name', () => {
    renderModal(undefined, []);
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'BSIT 3' } });
    expect(screen.getByText(/Enter the program name only/)).toBeTruthy();
  });

  it('auto-selects and locks the program when the department has only one', async () => {
    const onSaveBatch = renderModal(undefined, []);
    expect(programSelect().value).toBe('5');
    expect(programSelect().disabled).toBe(true);
    expect((screen.getByLabelText(/Program name/) as HTMLInputElement).value).toBe('BSIT');
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 sections' }));
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledWith(expect.any(Array), 1, 5));
  });

  it('requires an explicit choice when the department has several programs', async () => {
    const onSaveBatch = renderModal(undefined, [], [BSIT, BSCS]);
    expect(programSelect().value).toBe('');
    expect(programSelect().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'BSCS' } });
    fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 sections' }));
    expect(await screen.findByText('Select a program before adding sections')).toBeTruthy();
    expect(onSaveBatch).not.toHaveBeenCalled();

    fireEvent.change(programSelect(), { target: { value: '6' } });
    expect(previewNames()).toEqual(['BSCS 1A', 'BSCS 1B']);
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 sections' }));
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledWith(
      [{ section_name: 'BSCS 1A', year_level: '1' }, { section_name: 'BSCS 1B', year_level: '1' }],
      1,
      6,
    ));
  });

  it('follows the selected program code until the user types a name', () => {
    renderModal(undefined, [], [BSIT, BSCS]);
    fireEvent.change(programSelect(), { target: { value: '5' } });
    expect((screen.getByLabelText(/Program name/) as HTMLInputElement).value).toBe('BSIT');
    fireEvent.change(programSelect(), { target: { value: '6' } });
    expect((screen.getByLabelText(/Program name/) as HTMLInputElement).value).toBe('BSCS');
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'CS' } });
    fireEvent.change(programSelect(), { target: { value: '5' } });
    expect((screen.getByLabelText(/Program name/) as HTMLInputElement).value).toBe('CS');
  });
});
