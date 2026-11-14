/** Same normalization as Sections::normalizeName on the backend. */
export const normalizeSectionName = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).join(' ').toUpperCase();

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … (spreadsheet-style, no gaps). */
export const indexToSuffix = (index: number): string => {
  let n = index + 1;
  let suffix = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    suffix = String.fromCharCode(65 + rem) + suffix;
    n = Math.floor((n - 1) / 26);
  }
  return suffix;
};

/** Inverse of indexToSuffix: A → 0, Z → 25, AA → 26. */
export const suffixToIndex = (suffix: string): number =>
  suffix.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds `count` names by appending letters directly to `base` (BSIT 3 → BSIT 3A, BSIT 3B …),
 * continuing after the highest letter suffix already used for that base in `taken`.
 */
export function generateSectionNames(baseInput: string, count: number, taken: Iterable<string>) {
  const base = normalizeSectionName(baseInput);
  if (!base || !Number.isInteger(count) || count < 1) {
    return { base, names: [] as string[], lastExistingSuffix: null as string | null, startIndex: 0 };
  }
  const pattern = new RegExp(`^${escapeRegExp(base)}([A-Z]{1,3})$`);
  let lastExistingSuffix: string | null = null;
  for (const name of taken) {
    const suffix = normalizeSectionName(name).match(pattern)?.[1];
    if (suffix && (lastExistingSuffix === null || suffixToIndex(suffix) > suffixToIndex(lastExistingSuffix))) {
      lastExistingSuffix = suffix;
    }
  }
  const startIndex = lastExistingSuffix ? suffixToIndex(lastExistingSuffix) + 1 : 0;
  const names = Array.from({ length: count }, (_, i) => `${base}${indexToSuffix(startIndex + i)}`);
  return { base, names, lastExistingSuffix, startIndex };
}
