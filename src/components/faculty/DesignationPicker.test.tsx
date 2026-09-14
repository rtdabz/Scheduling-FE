import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DesignationPicker from './DesignationPicker';
import { designationLabel, groupDesignations, totalDeload, type Designation } from '../../lib/designations';

afterEach(cleanup);

const designation = (overrides: Partial<Designation>): Designation => ({
  id: 1,
  parent_id: null,
  name: 'Post',
  code: null,
  deload_units: 0,
  description: null,
  status: 'active',
  sort_order: 0,
  ...overrides,
});

const director = designation({ id: 1, name: 'Director', children_count: 2 });
const networking = designation({ id: 2, parent_id: 1, name: "Networking Dev't", deload_units: 9, parent: { id: 1, name: 'Director' } });
const research = designation({ id: 3, parent_id: 1, name: 'Research & Extension', deload_units: 6, parent: { id: 1, name: 'Director' } });
const chair = designation({ id: 4, name: 'Program Chairperson', deload_units: 3 });
const coach = designation({ id: 5, name: 'Coach', deload_units: 2 });
const all = [director, networking, research, chair, coach];

describe('designation helpers', () => {
  it('labels a sub-designation with its heading', () => {
    expect(designationLabel(networking)).toBe("Director · Networking Dev't");
    expect(designationLabel(chair)).toBe('Program Chairperson');
  });

  it('groups sub-designations under their heading and offers the heading only as a title', () => {
    const groups = groupDesignations(all);
    expect(groups[0]).toEqual({ heading: null, options: [chair, coach] });
    expect(groups[1].heading?.id).toBe(director.id);
    expect(groups[1].options.map((d) => d.id)).toEqual([networking.id, research.id]);
  });

  it('adds up the selected deloads', () => {
    expect(totalDeload(['2', '4'], all)).toBe(12);
  });
});

const openPicker = () => fireEvent.click(screen.getByRole('button', { name: /Select|Change/ }));

describe('DesignationPicker', () => {
  it('shows the checklist only after the field is clicked', () => {
    render(<DesignationPicker designations={all} value={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    openPicker();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('never offers a heading as a choice', () => {
    render(<DesignationPicker designations={all} value={[]} onChange={vi.fn()} />);
    openPicker();
    expect(screen.queryByRole('checkbox', { name: 'Director' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Networking Dev't/ })).toBeTruthy();
  });

  it('stops at three designations', () => {
    const onChange = vi.fn();
    render(<DesignationPicker designations={all} value={['2', '3', '4']} onChange={onChange} />);
    openPicker();

    const fourth = screen.getByRole('checkbox', { name: /Coach/ }) as HTMLInputElement;
    expect(fourth.disabled).toBe(true);
    fireEvent.click(fourth);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText(/limit reached/).length).toBeGreaterThan(0);
  });

  it('leaves the selection untouched when the checklist is cancelled', () => {
    const onChange = vi.fn();
    render(<DesignationPicker designations={all} value={['4']} onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Coach/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the chosen order when adding and removing', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DesignationPicker designations={all} value={['4']} onChange={onChange} />);

    openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Networking Dev't/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith(['4', '2']);

    rerender(<DesignationPicker designations={all} value={['4', '2']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Program Chairperson' }));
    expect(onChange).toHaveBeenLastCalledWith(['2']);
  });

  it('shows the Basic Load the combined deload leaves', () => {
    render(<DesignationPicker designations={all} value={['2', '4']} onChange={vi.fn()} maxUnits={21} />);
    expect(screen.getByText(/Basic Load: 21 − 12 = 9 units/)).toBeTruthy();
  });
});
