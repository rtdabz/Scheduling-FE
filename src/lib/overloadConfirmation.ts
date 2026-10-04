export type LoadTier = 'basic' | 'overload' | 'probono' | 'beyond_ceiling';

export interface OverloadProjection {
  faculty_id: number;
  faculty_name: string;
  assignment_label?: string;
  tier: LoadTier;
  tier_label: string;
  basic_load: number;
  current_units: number;
  added_units: number;
  projected_units: number;
  overload_units: number;
  probono_units: number;
  unit_ceiling: number;
}

export interface OverloadConfirmation {
  message: string;
  instructors: OverloadProjection[];
}

const isProjection = (value: unknown): value is OverloadProjection =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as OverloadProjection).faculty_id === 'number' &&
  typeof (value as OverloadProjection).projected_units === 'number';

export const overloadConfirmationFrom = (err: unknown): OverloadConfirmation | null => {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;

  if (!response || response.status !== 409) return null;

  const data = response.data as
    | { message?: unknown; overload_confirmation?: { instructors?: unknown } }
    | undefined;

  const instructors = data?.overload_confirmation?.instructors;

  if (!Array.isArray(instructors)) return null;

  const projections = instructors.filter(isProjection);

  if (projections.length === 0) return null;

  return {
    message:
      typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : projections.length === 1
          ? 'This instructor will have a pro bono load. Do you want to proceed?'
          : 'These instructors will have a pro bono load. Do you want to proceed?',
    instructors: projections,
  };
};
