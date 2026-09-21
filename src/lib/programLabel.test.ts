import { describe, expect, it } from 'vitest';
import { programLabel, programMajorLabel, programName } from './programLabel';

describe('programLabel', () => {
  it('spells out the major when there is one', () => {
    const program = { code: 'BSED', name: 'Bachelor of Secondary Education', major: 'English' };

    expect(programMajorLabel(program)).toBe('Major in English');
    expect(programName(program)).toBe('Bachelor of Secondary Education, Major in English');
    expect(programLabel(program)).toBe('BSED — Bachelor of Secondary Education, Major in English');
  });

  it('treats a blank major as no major at all', () => {
    const program = { code: 'BSIT', name: 'Information Technology', major: '   ' };

    expect(programMajorLabel(program)).toBeNull();
    expect(programLabel(program)).toBe('BSIT — Information Technology');
  });

  it('falls back to the major, then the fallback text, when the name is missing', () => {
    expect(programName({ code: 'BSED', major: 'Filipino' })).toBe('Major in Filipino');
    expect(programLabel({ code: 'BSED' })).toBe('BSED — Unnamed program');
    expect(programLabel({}, 'All programs')).toBe('All programs');
  });
});
