import { describe, expect, it } from 'vitest';
import { basicLoadOf, loadTierForUnits, loadTierLabel } from './facultyLoad';

/**
 * The same boundaries as `tests/Unit/FacultyLoadTierTest.php`. The badge is only
 * advisory, but a badge that disagreed with the server's gate would be worse than
 * no badge at all — it would tell the user an assignment is fine right before the
 * confirmation says otherwise.
 */
const dean = { basicLoad: 15, overloadUnits: 3, probonoUnits: 3 };

describe('loadTierForUnits', () => {
  it('calls everything up to the basic load basic', () => {
    expect(loadTierForUnits(dean, 0)).toBe('basic');
    expect(loadTierForUnits(dean, 14)).toBe('basic');
    expect(loadTierForUnits(dean, 15)).toBe('basic');
  });

  it('calls the first unit past the basic load an overload', () => {
    expect(loadTierForUnits(dean, 16)).toBe('overload');
    expect(loadTierForUnits(dean, 18)).toBe('overload');
  });

  it('moves into pro bono once the overload allowance is spent', () => {
    expect(loadTierForUnits(dean, 19)).toBe('probono');
    expect(loadTierForUnits(dean, 21)).toBe('probono');
  });

  it('names a load past the ceiling', () => {
    expect(loadTierForUnits(dean, 22)).toBe('beyond_ceiling');
    expect(loadTierForUnits(dean, 60)).toBe('beyond_ceiling');
  });

  it('skips a band that was never granted rather than widening the next', () => {
    const noAllowances = { basicLoad: 15, overloadUnits: 0, probonoUnits: 0 };
    expect(loadTierForUnits(noAllowances, 15)).toBe('basic');
    expect(loadTierForUnits(noAllowances, 16)).toBe('beyond_ceiling');

    const noProbono = { basicLoad: 15, overloadUnits: 3, probonoUnits: 0 };
    expect(loadTierForUnits(noProbono, 18)).toBe('overload');
    expect(loadTierForUnits(noProbono, 19)).toBe('beyond_ceiling');
  });

  it('treats an unconfigured instructor as having no band at all', () => {
    const unconfigured = { basicLoad: 0, overloadUnits: 0, probonoUnits: 0 };
    expect(loadTierForUnits(unconfigured, 0)).toBe('basic');
    expect(loadTierForUnits(unconfigured, 1)).toBe('beyond_ceiling');
  });
});

describe('basicLoadOf', () => {
  it('subtracts the deload from the maximum', () => {
    expect(basicLoadOf(21, 6)).toBe(15);
  });

  it('never goes negative, however large the deload', () => {
    expect(basicLoadOf(6, 9)).toBe(0);
  });

  it('treats missing figures as nothing configured', () => {
    expect(basicLoadOf(undefined, undefined)).toBe(0);
    expect(basicLoadOf(null, null)).toBe(0);
    expect(basicLoadOf(21, null)).toBe(21);
  });
});

describe('loadTierLabel', () => {
  it('uses the words the scheduling staff use', () => {
    expect(loadTierLabel('basic')).toBe('Basic Load');
    expect(loadTierLabel('overload')).toBe('Overload');
    expect(loadTierLabel('probono')).toBe('Pro-bono');
    expect(loadTierLabel('beyond_ceiling')).toBe('Beyond ceiling');
  });
});
