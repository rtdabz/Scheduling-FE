import { describe, expect, it } from 'vitest';
import { fitWithin } from './imageDataUrl';

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(1200, 600, 300)).toEqual({ width: 300, height: 150 });
    expect(fitWithin(400, 800, 300)).toEqual({ width: 150, height: 300 });
  });

  it('never enlarges a picture that already fits', () => {
    expect(fitWithin(120, 80, 300)).toEqual({ width: 120, height: 80 });
  });
});
