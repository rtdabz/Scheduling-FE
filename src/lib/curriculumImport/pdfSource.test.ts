// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractCurriculumLayout } from './pdfLayout';
import { colorItems, readPdfPages } from './pdfSource';

// The original document is not committed; this runs wherever it is available locally.
const SOURCE = 'C:/Users/toman/Downloads/Applications/TCC_BSIT_active_curriculum-1.pdf';

describe('PDF colour reading', () => {
  it('matches text items to the operator stream, with unknown colour rather than a guess when they do not match', () => {
    const chars = [...'Note: red'].map((ch, index) => ({ ch, color: index < 5 ? '#000000' : '#C00000' }));
    expect(colorItems([{ str: 'Note: red' }, { str: 'missing' }, { str: '  ' }], chars)).toEqual([
      [{ length: 6, color: '#000000' }, { length: 3, color: '#C00000' }],
      null,
      [],
    ]);
  });

  it.skipIf(!existsSync(SOURCE))('reads the real TCC PDF: 59 courses and the First Year note in #C00000', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(SOURCE)) }).promise;
    const extraction = extractCurriculumLayout(await readPdfPages(pdfjs, document as never));
    expect(extraction.rows).toHaveLength(59);
    expect(extraction.notes).toHaveLength(1);
    const text = 'Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only';
    expect(extraction.notes![0]).toMatchObject({
      text,
      runs: [{ length: [...text].length, color: '#C00000' }],
      scope: { level: 'year', year_level: 1 },
      flags: [],
    });
    // The letterhead images sit above the tables; nothing in the course area went unread.
    expect(extraction.unread).toEqual([]);
  }, 30_000);
});
