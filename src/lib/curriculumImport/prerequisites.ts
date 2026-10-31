import { compactCode } from './normalize';

export interface KnownCode {
  row_id: string;
  code: string;
}

/**
 * Splits prerequisite text into code-like tokens so look-alike course codes can be suggested.
 * Expands shared prefixes (`IT108/109/110` → IT108, IT109, IT110) and `&` lists (`IT Elective 2 & 3`).
 * A slash inside a known code (ROTC/CWTS 101) is kept as part of that code.
 */
export const prerequisiteTokens = (text: string, known: KnownCode[]): string[] => {
  const knownCompact = new Set(known.map((entry) => compactCode(entry.code)));
  if (knownCompact.has(compactCode(text))) return [text.trim()];

  const parts = text.split(/\s*(?:\/|&|,|;|\band\b|\bor\b)\s*/i).map((part) => part.trim()).filter(Boolean);
  const tokens: string[] = [];
  let prefix = '';
  for (const part of parts) {
    if (/^\d+$/.test(part) && prefix) {
      tokens.push(`${prefix}${part}`);
      continue;
    }
    const match = part.match(/^(.*?)(\d+)$/);
    prefix = match ? match[1] : '';
    tokens.push(part);
  }
  return tokens;
};
