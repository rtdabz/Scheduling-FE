import api from './api';

export interface Designation {
  id: number;
  parent_id: number | null;
  name: string;
  label?: string;
  parent?: { id: number; name: string } | null;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
  faculties_count?: number;
  children_count?: number;
}

export interface DesignationInput {
  parent_id: number | null;
  name: string;
  code: string | null;
  deload_units: number;
  description: string | null;
  status: 'active' | 'inactive';
  sort_order: number;
}

export const emptyDesignation = (): DesignationInput => ({
  parent_id: null,
  name: '',
  code: null,
  deload_units: 0,
  description: null,
  status: 'active',
  sort_order: 0,
});

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

export interface DesignationHolder {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  employment_type: 'full-time' | 'part-time';
  deload_units: number;
  status: string | null;
  department: { id: number; department_name: string; department_code: string | null } | null;
}

export const fetchDesignationHolders = async (id: number): Promise<DesignationHolder[]> => {
  const { data } = await api.get<DesignationHolder[]>(`/designations/${id}/holders`);
  return Array.isArray(data) ? data : [];
};

export const designationLabel = (designation: Pick<Designation, 'name' | 'label' | 'parent'>): string =>
  designation.label ?? (designation.parent ? `${designation.parent.name} · ${designation.name}` : designation.name);

export const heldDesignation = (
  designation: Pick<Designation, 'name' | 'label' | 'parent'> & { deload_units?: number | null },
): { label: string; deloadUnits: number } => ({
  label: designationLabel(designation),
  deloadUnits: Number(designation.deload_units) || 0,
});

export const isHeading = (designation: Designation, all: Designation[]): boolean =>
  (designation.children_count ?? 0) > 0 || all.some((other) => other.parent_id === designation.id);

export interface DesignationGroup {
  heading: Designation | null;
  options: Designation[];
}

export const groupDesignations = (list: Designation[]): DesignationGroup[] => {
  const groups: DesignationGroup[] = [];
  const standalone: Designation[] = [];

  list.filter((designation) => designation.parent_id === null).forEach((top) => {
    const children = list.filter((designation) => designation.parent_id === top.id);
    if (children.length > 0 || isHeading(top, list)) {
      groups.push({ heading: top, options: children });
    } else {
      standalone.push(top);
    }
  });

  const orphans = list.filter((designation) => (
    designation.parent_id !== null && !list.some((other) => other.id === designation.parent_id)
  ));

  return [
    ...(standalone.length > 0 ? [{ heading: null, options: standalone }] : []),
    ...groups,
    ...(orphans.length > 0 ? [{ heading: null, options: orphans }] : []),
  ];
};

export const totalDeload = (selectedIds: string[], list: Designation[]): number =>
  selectedIds.reduce((sum, id) => sum + (list.find((designation) => String(designation.id) === id)?.deload_units ?? 0), 0);

export const basicLoadAfterDeload = (maxUnits: number, deloadUnits: number): number =>
  Math.max(0, (maxUnits || 0) - (deloadUnits || 0));

export const describeDeload = (maxUnits: number, deloadUnits: number): string => {
  if (!deloadUnits) return `Basic Load: ${maxUnits || 0} units`;
  return `Basic Load: ${maxUnits || 0} − ${deloadUnits} = ${basicLoadAfterDeload(maxUnits, deloadUnits)} units`;
};
