import { describe, expect, it } from 'vitest';
import { conflictOverrideFrom, conflictOverridePrompt } from './conflictOverride';

const refusal = (data: unknown, status = 422) => ({ response: { status, data } });

describe('conflictOverrideFrom', () => {
  it('reads an overridable refusal with its clash messages', () => {
    const question = conflictOverrideFrom(refusal({
      message: 'Instructor assignment conflicts with existing entries.',
      can_override_conflicts: true,
      violations: [
        { rule: 'faculty_conflict', message: 'Faculty is already teaching on Monday.', overridable: true },
        { rule: 'faculty_conflict', message: 'Faculty is already teaching on Monday.', overridable: true },
      ],
    }));

    expect(question?.details).toEqual(['Faculty is already teaching on Monday.']);
    expect(conflictOverridePrompt(question!)).toContain('Assign this instructor anyway?');
    expect(conflictOverridePrompt(question!)).not.toMatch(/override/i);
  });

  it('ignores refusals that cannot be overridden and other errors', () => {
    expect(conflictOverrideFrom(refusal({ can_override_conflicts: false, violations: [] }))).toBeNull();
    expect(conflictOverrideFrom(refusal({ can_override_conflicts: true }, 409))).toBeNull();
    expect(conflictOverrideFrom(new Error('network'))).toBeNull();
  });
});
