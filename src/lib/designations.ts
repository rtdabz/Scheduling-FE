import api from './api';

/**
 * An administrative designation an instructor may hold.
 *
 * Deliberately has no enum of names anywhere in the client: the list is
 * institution data maintained through the Designations screen, so a school can
 * add "Research Coordinator" without a code change.
 */
export interface Designation {
  id: number;
  name: string;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  /** How many instructors currently hold it; present on list/detail reads. */
  faculties_count?: number;
}

export interface DesignationInput {
  name: string;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
}

export const emptyDesignation = (): DesignationInput => ({
  name: '',
  code: null,
  deload_units: 0,
  description: null,
  status: 'active',
  sort_order: 0,
});

/**
 * @param activeOnly pickers pass true so a retired designation cannot be newly
 *   assigned; the management screen passes false so it can still be edited.
 */
export const fetchDesignations = async (activeOnly = false): Promise<Designation[]> => {
  const { data } = await api.get<Designation[]>('/designations', {
    params: activeOnly ? { active_only: 1 } : undefined,
  });
  return Array.isArray(data) ? data : [];
};

export const createDesignation = async (input: DesignationInput): Promise<Designation> => {
  const { data } = await api.post<{ data: Designation }>('/designations', input);
  return data.data;
};

export const updateDesignation = async (
  id: number,
  input: Partial<DesignationInput>,
): Promise<{ designation: Designation; holdersUpdated: number }> => {
  const { data } = await api.patch<{ data: Designation; holders_updated: number }>(
    `/designations/${id}`,
    input,
  );
  return { designation: data.data, holdersUpdated: data.holders_updated ?? 0 };
};

export const deleteDesignation = async (id: number): Promise<void> => {
  await api.delete(`/designations/${id}`);
};

/**
 * The Basic Load an instructor is left with once the designation's deload is
 * taken off — the same arithmetic SchedulingPolicy::facultyBasicLoad() applies
 * on the server, floored at zero so a deload larger than the ceiling reads as 0
 * rather than a negative.
 */
export const basicLoadAfterDeload = (maxUnits: number, deloadUnits: number): number =>
  Math.max(0, (maxUnits || 0) - (deloadUnits || 0));

/** "21 − 6 = 15 units", for the helper line under a designation picker. */
export const describeDeload = (maxUnits: number, deloadUnits: number): string => {
  if (!deloadUnits) return `Basic Load: ${maxUnits || 0} units`;
  return `Basic Load: ${maxUnits || 0} − ${deloadUnits} = ${basicLoadAfterDeload(maxUnits, deloadUnits)} units`;
};
