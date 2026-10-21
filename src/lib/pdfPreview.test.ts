import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { createPdfPreview, openPdfPreview } from './pdfPreview';

vi.mock('./api', () => ({ default: { post: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api' } } }));

beforeEach(() => {
  vi.mocked(api.post).mockResolvedValue({ data: { id: 'preview-id', url: '/api/pdf-previews/preview-id/report.pdf?signature=test' } });
  vi.mocked(api.delete).mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const mockPreview = () => {
  const preview = {
    document: document.implementation.createHTMLDocument(),
    location: { replace: vi.fn() },
    closed: false,
    opener: window,
    close: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
  return preview;
};

describe('native PDF previews', () => {
  it('opens before generation and navigates to the named HTTP response without a second toolbar', async () => {
    vi.useFakeTimers();
    const preview = mockPreview();
    const handle = openPdfPreview();
    expect(preview.document.body.textContent).toContain('Preparing PDF');
    expect(preview.opener).toBeNull();
    const blob = new Blob(['%PDF-1.3']);
    await handle.show(blob, 'report.pdf');
    expect(api.post).toHaveBeenCalledWith('/pdf-previews', blob, {
      params: { filename: 'report.pdf' }, headers: { 'Content-Type': 'application/pdf' },
    });
    expect(preview.location.replace).toHaveBeenCalledWith(expect.stringContaining('/api/pdf-previews/preview-id/report.pdf?signature=test'));
    expect(preview.document.querySelector('a')).toBeNull();
    expect(preview.document.querySelector('iframe')).toBeNull();
    preview.closed = true;
    vi.advanceTimersByTime(1000);
    expect(api.delete).toHaveBeenCalledWith('/pdf-previews/preview-id');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to a named download without uploading when popups are blocked', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn() });
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    await openPdfPreview().show(new Blob(['pdf']), 'teaching-load-CIT.pdf');
    expect(name).toBe('teaching-load-CIT.pdf');
    expect(api.post).not.toHaveBeenCalled();
    vi.runAllTimers();
  });

  it('does not upload after a pending preview has closed', async () => {
    const preview = mockPreview();
    const handle = openPdfPreview();
    preview.closed = true;
    await handle.show(new Blob(['pdf']), 'report.pdf');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not download a cancelled job when its popup was blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const handle = openPdfPreview();
    handle.close();
    await handle.show(new Blob(['pdf']), 'cancelled.pdf');
    expect(click).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('disposes an upload completed after explicit cancellation', async () => {
    const preview = mockPreview();
    const handle = openPdfPreview();
    vi.mocked(api.post).mockImplementationOnce(async () => {
      handle.close();
      return { data: { id: 'preview-id', url: '/api/pdf-previews/preview-id/report.pdf' } };
    });
    await handle.show(new Blob(['pdf']), 'report.pdf');
    expect(api.delete).toHaveBeenCalledWith('/pdf-previews/preview-id');
    expect(preview.location.replace).not.toHaveBeenCalled();
  });

  it('releases a file if the window closes during upload', async () => {
    const preview = mockPreview();
    const handle = openPdfPreview();
    vi.mocked(api.post).mockImplementationOnce(async () => {
      preview.closed = true;
      return { data: { id: 'preview-id', url: '/api/pdf-previews/preview-id/report.pdf' } };
    });
    await handle.show(new Blob(['pdf']), 'report.pdf');
    expect(api.delete).toHaveBeenCalledWith('/pdf-previews/preview-id');
    expect(preview.location.replace).not.toHaveBeenCalled();
  });

  it('propagates upload failure so the existing print error handler can close the window', async () => {
    const preview = mockPreview();
    const handle = openPdfPreview();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('upload failed'));
    await expect(handle.show(new Blob(['pdf']), 'report.pdf')).rejects.toThrow('upload failed');
    handle.close();
    expect(preview.close).toHaveBeenCalled();
  });

  it('resolves remote API URLs and disposes embedded previews only once', async () => {
    const previousBase = api.defaults.baseURL;
    api.defaults.baseURL = 'https://api.example.test/api';
    try {
      const preview = await createPdfPreview(new Blob(['pdf']), 'report.pdf');
      expect(preview.url).toBe('https://api.example.test/api/pdf-previews/preview-id/report.pdf?signature=test');
      preview.dispose();
      preview.dispose();
      expect(api.delete).toHaveBeenCalledTimes(1);
    } finally {
      api.defaults.baseURL = previousBase;
    }
  });
});
