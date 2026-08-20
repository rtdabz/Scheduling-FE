import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTITUTION_SETTINGS, normalizeInstitutionSettings } from './institutionSettings';

describe('normalizeInstitutionSettings', () => {
  it('keeps configured values, trimmed', () => {
    expect(normalizeInstitutionSettings({ president_name: '  DR. JUAN CRUZ ', president_title: ' College President ' }))
      .toEqual({ president_name: 'DR. JUAN CRUZ', president_title: 'College President' });
  });

  it('falls back per field rather than dropping the whole record', () => {
    expect(normalizeInstitutionSettings({ president_name: 'DR. JUAN CRUZ', president_title: '   ' }))
      .toEqual({ president_name: 'DR. JUAN CRUZ', president_title: DEFAULT_INSTITUTION_SETTINGS.president_title });
  });

  it('never leaves a signature line blank on a printed document', () => {
    expect(normalizeInstitutionSettings(null)).toEqual(DEFAULT_INSTITUTION_SETTINGS);
    expect(normalizeInstitutionSettings({ president_name: 42 as unknown as string })).toEqual(DEFAULT_INSTITUTION_SETTINGS);
  });
});
