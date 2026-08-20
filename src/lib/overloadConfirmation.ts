/**
 * Decodes the confirmation an assignment endpoint asks for when the instructor
 * would end up past their Basic Load.
 *
 * The server owns this decision. A client-side check would read the cached
 * `assigned_units` of the faculty payload and silently skip the prompt whenever
 * someone else had just assigned, so the endpoints answer 409 with the projected
 * numbers instead and the caller echoes `confirm_overload: true` to proceed.
 *
 * 409 is specifically not 422: these endpoints already answer 422 for assignments
 * they refuse, and the pages render those as errors. This one is a question.
 */

export type LoadTier = 'basic' | 'overload' | 'probono' | 'beyond_ceiling';

export interface OverloadProjection {
  faculty_id: number;
  faculty_name: string;
  /** What is being assigned, e.g. "IT 301 — BSIT 3A" or "4 classes". */
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

/**
 * The confirmation an error carries, or null for anything else — a real refusal,
 * a network failure, or a 409 raised by some other rule. Call it before falling
 * back to `apiErrorMessage`, so only genuine errors reach the toast.
 */
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
          ? 'This instructor will have an overload. Do you want to proceed?'
          : 'These instructors will have an overload. Do you want to proceed?',
    instructors: projections,
  };
};
