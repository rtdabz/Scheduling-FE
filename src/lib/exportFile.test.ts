import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportFilename, downloadFile, printWithTitle } from './exportFile';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('export filenames', () => {
  it('preserves readable Unicode names and removes unsafe path characters', () => {
    expect(buildExportFilename('pdf', 'curriculum', 'BS/IT: "2026"', 'Peña\n..\\')).toBe('curriculum-BS-IT-2026-Peña.pdf');
    expect(buildExportFilename('csv', null, undefined, '...')).toBe('wicars-export.csv');
    expect(buildExportFilename('pdf', 'CON')).toBe('wicars-CON.pdf');
    expect(buildExportFilename('pdf', 'a'.repeat(300))).toHaveLength(184);
  });

  it('downloads with the requested name and releases the URL after consumption', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: revoke });
    let clicked: { filename: string; href: string; attached: boolean } | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { filename: this.download, href: this.href, attached: this.isConnected };
    });
    downloadFile(new Blob(['report']), 'class-schedule-CIT-2026-2027-1st.pdf');
    expect(clicked?.filename).toBe('class-schedule-CIT-2026-2027-1st.pdf');
    expect(clicked?.href).toBe('blob:export');
    expect(clicked?.attached).toBe(true);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:export');
  });

  it('suggests a print filename and restores the app title after printing', () => {
    document.title = 'WICARS';
    vi.spyOn(window, 'print').mockImplementation(() => { expect(document.title).toBe('room-timetable-LAB-101'); });
    printWithTitle('room-timetable-LAB-101.pdf');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('WICARS');
  });

  it('restores the title if printing fails', () => {
    document.title = 'WICARS';
    vi.spyOn(window, 'print').mockImplementation(() => { throw new Error('print failed'); });
    expect(() => printWithTitle('calendar.pdf')).toThrow('print failed');
    expect(document.title).toBe('WICARS');
  });
});
