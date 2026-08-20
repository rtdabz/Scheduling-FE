import api from './api';

/**
 * College-wide document signatories, edited in the VPAA's Settings page and
 * stamped onto printed schedules and teaching loads.
 */
export interface InstitutionSettings {
  president_name: string;
  president_title: string;
}

/** What the print builders used before this was configurable. */
export const DEFAULT_INSTITUTION_SETTINGS: InstitutionSettings = {
  president_name: 'ATTY. NADYA B. EMANO-ELIPE',
  president_title: 'OIC-College President',
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

/**
 * Cached for the session: printing happens in bursts, and a signatory change is
 * rare. Never rejects -- a printed document falls back to the standing names
 * rather than failing to print.
 */
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

/** Called after a successful save so the next print uses the new name. */
export const setCachedInstitutionSettings = (settings: InstitutionSettings): void => {
  cached = normalizeInstitutionSettings(settings);
};

export const clearCachedInstitutionSettings = (): void => {
  cached = null;
};
