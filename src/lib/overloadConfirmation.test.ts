import { describe, expect, it } from 'vitest';
import { overloadConfirmationFrom } from './overloadConfirmation';

const projection = (overrides: Record<string, unknown> = {}) => ({
  faculty_id: 7,
  faculty_name: 'Ana Cruz',
  assignment_label: 'IT 301 — BSIT 3A',
  tier: 'overload',
  tier_label: 'Overload',
  basic_load: 15,
  current_units: 15,
  added_units: 3,
  projected_units: 18,
  overload_units: 6,
  probono_units: 3,
  unit_ceiling: 24,
  ...overrides,
});

const rejection = (status: number, data: unknown) => ({ response: { status, data } });

describe('overloadConfirmationFrom', () => {
  it('decodes the instructors a 409 asks about', () => {
    const confirmation = overloadConfirmationFrom(
      rejection(409, {
        message: 'This instructor will have an overload. Do you want to proceed?',
        overload_confirmation: { instructors: [projection()] },
      })
    );

    expect(confirmation?.message).toBe(
      'This instructor will have an overload. Do you want to proceed?'
    );
    expect(confirmation?.instructors).toHaveLength(1);
    expect(confirmation?.instructors[0].projected_units).toBe(18);
    expect(confirmation?.instructors[0].assignment_label).toBe('IT 301 — BSIT 3A');
  });

  it('keeps every instructor a bulk assignment reports', () => {
    const confirmation = overloadConfirmationFrom(
      rejection(409, {
        message: 'These instructors will have an overload. Do you want to proceed?',
        overload_confirmation: {
          instructors: [projection(), projection({ faculty_id: 9, faculty_name: 'Ben Reyes' })],
        },
      })
    );

    expect(confirmation?.instructors.map(entry => entry.faculty_id)).toEqual([7, 9]);
  });

  it('supplies the headline when the body omitted it', () => {
    const confirmation = overloadConfirmationFrom(
      rejection(409, { overload_confirmation: { instructors: [projection()] } })
    );

    expect(confirmation?.message).toBe(
      'This instructor will have an overload. Do you want to proceed?'
    );
  });

  it('pluralises the supplied headline for several instructors', () => {
    const confirmation = overloadConfirmationFrom(
      rejection(409, {
        overload_confirmation: { instructors: [projection(), projection({ faculty_id: 9 })] },
      })
    );

    expect(confirmation?.message).toBe(
      'These instructors will have an overload. Do you want to proceed?'
    );
  });

  it('ignores a 409 raised by some other rule', () => {
    // Deletes answer 409 when a record is still referenced; that is an error to
    // report, not a question to ask.
    expect(overloadConfirmationFrom(rejection(409, { message: 'Still referenced.' }))).toBeNull();
  });

  it('ignores a refusal, however similar the body looks', () => {
    expect(
      overloadConfirmationFrom(
        rejection(422, { overload_confirmation: { instructors: [projection()] } })
      )
    ).toBeNull();
  });

  it('ignores an empty or malformed instructor list', () => {
    expect(
      overloadConfirmationFrom(rejection(409, { overload_confirmation: { instructors: [] } }))
    ).toBeNull();
    expect(
      overloadConfirmationFrom(
        rejection(409, { overload_confirmation: { instructors: [{ faculty_name: 'Ana Cruz' }] } })
      )
    ).toBeNull();
    expect(
      overloadConfirmationFrom(rejection(409, { overload_confirmation: { instructors: 'nope' } }))
    ).toBeNull();
  });

  it('ignores a network failure with no response at all', () => {
    expect(overloadConfirmationFrom(new Error('Network Error'))).toBeNull();
    expect(overloadConfirmationFrom(undefined)).toBeNull();
  });
});
