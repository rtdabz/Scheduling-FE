import api from '../../lib/api';
import type { ImportPayload } from '../../lib/curriculumImport/draft';
import type { ClassificationRule, ImportResult, ImportSettings, ValidationResult } from '../../lib/curriculumImport/types';

export interface SettingsUpdate {
  expected_revision: number;
  lecture_minutes_per_unit: number;
  laboratory_minutes_per_unit: number;
  rules: Array<Pick<ClassificationRule, 'match_kind' | 'match_value' | 'category' | 'enabled'>>;
  acknowledge_overlaps?: boolean;
}

export const curriculumImportService = {
  async getSettings(): Promise<ImportSettings> {
    const res = await api.get<ImportSettings>('/curriculum-import-settings');
    return res.data;
  },

  async updateSettings(update: SettingsUpdate): Promise<ImportSettings> {
    const res = await api.put<ImportSettings>('/curriculum-import-settings', update);
    return res.data;
  },

  async validate(payload: ImportPayload): Promise<ValidationResult> {
    const res = await api.post<ValidationResult>('/curriculum-imports/validate', payload);
    return res.data;
  },

  async commit(payload: ImportPayload): Promise<ImportResult> {
    const res = await api.post<ImportResult>('/curriculum-imports', payload);
    return res.data;
  },
};
