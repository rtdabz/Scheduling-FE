import { describe, expect, it } from 'vitest';
import { basicLoadOf, loadBandsOf, loadLevelOf, loadTierForUnits, loadTierLabel } from './facultyLoad';

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

  it('keeps a load past every allowance as pro bono', () => {
    expect(loadTierForUnits(dean, 22)).toBe('probono');
    expect(loadTierForUnits(dean, 60)).toBe('probono');
  });

  it('treats everything past Basic Load and Overload as pro bono, granted or not', () => {
    const noAllowances = { basicLoad: 15, overloadUnits: 0, probonoUnits: 0 };
    expect(loadTierForUnits(noAllowances, 15)).toBe('basic');
    expect(loadTierForUnits(noAllowances, 16)).toBe('probono');

    const noProbono = { basicLoad: 15, overloadUnits: 3, probonoUnits: 0 };
    expect(loadTierForUnits(noProbono, 18)).toBe('overload');
    expect(loadTierForUnits(noProbono, 19)).toBe('probono');
  });

  it('treats any load on an unconfigured instructor as pro bono', () => {
    const unconfigured = { basicLoad: 0, overloadUnits: 0, probonoUnits: 0 };
    expect(loadTierForUnits(unconfigured, 0)).toBe('basic');
    expect(loadTierForUnits(unconfigured, 1)).toBe('probono');
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

describe('loadBandsOf', () => {
  const allowances = { maxUnits: 21, deloadUnits: 3, overloadUnits: 6, probonoUnits: 3 };

  it('fills Basic Load first, then Overload, then Pro bono', () => {
    expect(loadBandsOf({ ...allowances, assignedUnits: 12 }).filled).toEqual({ basic: 12, overload: 0, probono: 0 });
    expect(loadBandsOf({ ...allowances, assignedUnits: 20 }).filled).toEqual({ basic: 18, overload: 2, probono: 0 });
    expect(loadBandsOf({ ...allowances, assignedUnits: 26 }).filled).toEqual({ basic: 18, overload: 6, probono: 2 });
  });

  it('grows the pro bono band to hold everything past the paid allowances', () => {
    const bands = loadBandsOf({ ...allowances, assignedUnits: 30 });
    expect(bands.filled).toEqual({ basic: 18, overload: 6, probono: 6 });
    expect(bands.probono).toBe(6);
    expect(bands.beyondCeiling).toBe(0);
  });
});

describe('loadLevelOf', () => {
  const full = { maxUnits: 21, deloadUnits: 0, overloadUnits: 6, probonoUnits: 3 };

  it('levels up Regular -> Overload -> Pro Bono as the bands fill', () => {
    expect(loadLevelOf({ ...full, assignedUnits: 0 })).toBe('regular');
    expect(loadLevelOf({ ...full, assignedUnits: 21 })).toBe('regular');
    expect(loadLevelOf({ ...full, assignedUnits: 22 })).toBe('overload');
    expect(loadLevelOf({ ...full, assignedUnits: 27 })).toBe('overload');
    expect(loadLevelOf({ ...full, assignedUnits: 28 })).toBe('probono');
  });

  it('starts an overload-only instructor at Overload', () => {
    const overloadOnly = { maxUnits: 0, deloadUnits: 0, overloadUnits: 15, probonoUnits: 0 };
    expect(loadLevelOf({ ...overloadOnly, assignedUnits: 0 })).toBe('overload');
    expect(loadLevelOf({ ...overloadOnly, assignedUnits: 15 })).toBe('overload');
  });

  it('is Pro Bono once Basic Load and Overload are used up, even with no pro bono granted', () => {
    expect(loadLevelOf({ maxUnits: 21, deloadUnits: 0, overloadUnits: 6, probonoUnits: 0, assignedUnits: 27 })).toBe('overload');
    expect(loadLevelOf({ maxUnits: 21, deloadUnits: 0, overloadUnits: 6, probonoUnits: 0, assignedUnits: 28 })).toBe('probono');
    expect(loadLevelOf({ maxUnits: 21, deloadUnits: 0, overloadUnits: 0, probonoUnits: 0, assignedUnits: 22 })).toBe('probono');
  });
});
