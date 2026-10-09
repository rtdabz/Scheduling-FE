import { describe, expect, it } from 'vitest';
import { basicLoadOf, loadBandsOf, loadLevelOf, loadTierForUnits, loadTierLabel } from './facultyLoad';

/**
 * The same boundaries as `tests/Unit/FacultyLoadTierTest.php`, so the badge
 * agrees with the server's ceiling.
 */
const dean = { basicLoad: 15, overloadUnits: 3 };

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

  it('calls anything past the overload allowance beyond the ceiling', () => {
    expect(loadTierForUnits(dean, 19)).toBe('beyond_ceiling');
    expect(loadTierForUnits(dean, 60)).toBe('beyond_ceiling');

    const noAllowance = { basicLoad: 15, overloadUnits: 0 };
    expect(loadTierForUnits(noAllowance, 15)).toBe('basic');
    expect(loadTierForUnits(noAllowance, 16)).toBe('beyond_ceiling');
  });

  it('treats any load on an unconfigured instructor as beyond the ceiling', () => {
    const unconfigured = { basicLoad: 0, overloadUnits: 0 };
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
    expect(loadTierLabel('beyond_ceiling')).toBe('Over limit');
  });
});

describe('loadBandsOf', () => {
  const allowances = { maxUnits: 21, deloadUnits: 3, overloadUnits: 6 };

  it('fills Basic Load first, then Overload', () => {
    expect(loadBandsOf({ ...allowances, assignedUnits: 12 }).filled).toEqual({ basic: 12, overload: 0 });
    expect(loadBandsOf({ ...allowances, assignedUnits: 20 }).filled).toEqual({ basic: 18, overload: 2 });
    expect(loadBandsOf({ ...allowances, assignedUnits: 24 }).filled).toEqual({ basic: 18, overload: 6 });
  });

  it('reports units past the ceiling, which only older data can still hold', () => {
    const bands = loadBandsOf({ ...allowances, assignedUnits: 30 });
    expect(bands.ceiling).toBe(24);
    expect(bands.filled).toEqual({ basic: 18, overload: 6 });
    expect(bands.beyondCeiling).toBe(6);
    expect(loadBandsOf({ ...allowances, assignedUnits: 20 }).beyondCeiling).toBe(0);
  });
});

describe('loadLevelOf', () => {
  const full = { maxUnits: 21, deloadUnits: 0, overloadUnits: 6 };

  it('levels up Regular -> Overload -> Over Limit as the bands fill', () => {
    expect(loadLevelOf({ ...full, assignedUnits: 0 })).toBe('regular');
    expect(loadLevelOf({ ...full, assignedUnits: 21 })).toBe('regular');
    expect(loadLevelOf({ ...full, assignedUnits: 22 })).toBe('overload');
    expect(loadLevelOf({ ...full, assignedUnits: 27 })).toBe('overload');
    expect(loadLevelOf({ ...full, assignedUnits: 28 })).toBe('over_limit');
  });

  it('starts an overload-only instructor at Overload', () => {
    const overloadOnly = { maxUnits: 0, deloadUnits: 0, overloadUnits: 15 };
    expect(loadLevelOf({ ...overloadOnly, assignedUnits: 0 })).toBe('overload');
    expect(loadLevelOf({ ...overloadOnly, assignedUnits: 15 })).toBe('overload');
  });

  it('is Over Limit once Basic Load and Overload are used up', () => {
    expect(loadLevelOf({ maxUnits: 21, deloadUnits: 0, overloadUnits: 0, assignedUnits: 22 })).toBe('over_limit');
  });
});
