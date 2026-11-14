import api from './api';

/**
 * Structured name fields as the API returns them for accounts and instructors.
 * Accounts store `middle_initial`; instructor profiles store `middle_name`.
 */
export interface PersonNameParts {
  honorific_prefix?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  credentials?: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

const cleanCredentials = (value: string | null | undefined): string => clean(clean(value).replace(/^[\s,]+|[\s,]+$/g, ''));

const middleInitial = (parts: PersonNameParts): string => {
  const initial = clean(parts.middle_initial || parts.middle_name).charAt(0).toUpperCase();
  return initial ? `${initial}.` : '';
};

const join = (...parts: string[]): string => parts.filter(Boolean).join(' ');

const withCredentials = (name: string, credentials: string): string =>
  credentials ? (name ? `${name}, ${credentials}` : credentials) : name;

/** "Dr. Juan P. Dela Cruz Jr., DM" */
export const formatPersonName = (parts: PersonNameParts): string =>
  withCredentials(
    join(clean(parts.honorific_prefix), clean(parts.first_name), middleInitial(parts), clean(parts.last_name), clean(parts.suffix)),
    cleanCredentials(parts.credentials),
  );

/** Surname first for rosters: "Dela Cruz, Dr. Juan P. Jr., DM" */
export const formatPersonListName = (parts: PersonNameParts): string => {
  const last = clean(parts.last_name);
  const given = join(clean(parts.honorific_prefix), clean(parts.first_name), middleInitial(parts), clean(parts.suffix));
  const name = last && given ? `${last}, ${given}` : last || given;
  return withCredentials(name, cleanCredentials(parts.credentials));
};

/** Title-free key so sorting stays on the person's name, never on "Dr." or credentials. */
export const personSortName = (parts: PersonNameParts): string => join(clean(parts.first_name), clean(parts.last_name));

export const CREDENTIALS_MAX_LENGTH = 100;

export interface NameOptions {
  honorific_prefixes: string[];
  suffixes: string[];
}

let cachedOptions: NameOptions | null = null;
let inFlight: Promise<NameOptions> | null = null;

/** Title and suffix choices from the backend, fetched once per session. */
export const fetchNameOptions = async (): Promise<NameOptions> => {
  if (cachedOptions) return cachedOptions;
  inFlight ??= api
    .get<NameOptions>('/name-options')
    .then(({ data }) => {
      cachedOptions = {
        honorific_prefixes: Array.isArray(data?.honorific_prefixes) ? data.honorific_prefixes : [],
        suffixes: Array.isArray(data?.suffixes) ? data.suffixes : [],
      };
      return cachedOptions;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
};

/** Options for a Title select; keeps a saved value visible even if it is no longer offered. */
export const titleOptions = (available: readonly string[], current: string | null | undefined): string[] => {
  const saved = clean(current);
  return saved && !available.includes(saved) ? [saved, ...available] : [...available];
};
