import { describe, expect, it } from 'vitest';
import { generateSectionNames, indexToSuffix, suffixToIndex } from './sectionNaming';

describe('section naming', () => {
  it('maps indexes to spreadsheet-style suffixes and back', () => {
    const cases: Array<[number, string]> = [[0, 'A'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'], [701, 'ZZ'], [702, 'AAA']];
    cases.forEach(([index, suffix]) => {
      expect(indexToSuffix(index)).toBe(suffix);
      expect(suffixToIndex(suffix)).toBe(index);
    });
  });

  it('appends letters directly to the normalized base name', () => {
    expect(generateSectionNames('  bsit   3 ', 4, []).names).toEqual(['BSIT 3A', 'BSIT 3B', 'BSIT 3C', 'BSIT 3D']);
  });

  it('continues after the highest existing suffix for the same base only', () => {
    const result = generateSectionNames('BSIT 3', 2, ['BSIT 3A', 'bsit 3c', 'BSIT 31A', 'BSIT 4A', 'BSIT 3 X']);
    expect(result.lastExistingSuffix).toBe('C');
    expect(result.names).toEqual(['BSIT 3D', 'BSIT 3E']);
  });

  it('rolls past Z', () => {
    expect(generateSectionNames('BSIT 1', 3, ['BSIT 1Y']).names).toEqual(['BSIT 1Z', 'BSIT 1AA', 'BSIT 1AB']);
  });

  it('returns nothing for an empty base or invalid count', () => {
    expect(generateSectionNames('  ', 3, []).names).toEqual([]);
    expect(generateSectionNames('BSIT 1', 0, []).names).toEqual([]);
  });
});
