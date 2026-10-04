import api from './api';

export interface InstitutionSettings {
  president_name: string;
  president_title: string;
}

export const DEFAULT_INSTITUTION_SETTINGS: InstitutionSettings = {
  president_name: 'College President',
  president_title: 'President',
};

const clean = (value: unknown, fallback: string): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

export const normalizeInstitutionSettings = (raw: unknown): InstitutionSettings => {
  const source = (raw ?? {}) as Partial<InstitutionSettings>;
  return {
    president_name: clean(source.president_name, DEFAULT_INSTITUTION_SETTINGS.president_name),
    president_title: clean(source.president_title, DEFAULT_INSTITUTION_SETTINGS.president_title),
  };
};

let cached: InstitutionSettings | null = null;
let inFlight: Promise<InstitutionSettings> | null = null;

export const fetchInstitutionSettings = async (): Promise<InstitutionSettings> => {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = api.get('/institution-settings')
    .then(({ data }) => {
      cached = normalizeInstitutionSettings(data);
      return cached;
    })
    .catch(() => DEFAULT_INSTITUTION_SETTINGS)
    .finally(() => { inFlight = null; });

  return inFlight;
};

export const setCachedInstitutionSettings = (settings: InstitutionSettings): void => {
  cached = normalizeInstitutionSettings(settings);
};

export const clearCachedInstitutionSettings = (): void => {
  cached = null;
};
