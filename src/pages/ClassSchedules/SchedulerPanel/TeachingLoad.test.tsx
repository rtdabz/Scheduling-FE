import { StrictMode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeachingLoad from './TeachingLoad';
import { openPdfPreview } from '../../../lib/pdfPreview';

const { toast, show, close } = vi.hoisted(() => ({
  toast: { warning: vi.fn(), error: vi.fn() }, show: vi.fn(), close: vi.fn(),
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../../lib/pdfPreview', () => ({ openPdfPreview: vi.fn(() => ({ show, close })) }));
vi.mock('../../../lib/institutionSettings', () => ({ fetchInstitutionSettings: async () => ({}) }));
vi.mock('jspdf', () => ({ default: class {} }));

const props = { faculties: [], allSchedules: [], isTeachingLoadOpen: true, setIsTeachingLoadOpen: vi.fn(),
  sections: [], activeSemester: null, users: [], departments: [], selectedSectionId: '' };

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(10000);
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('teaching-load print triggers', () => {
  it('does not discard a different valid request within 1.5 seconds', async () => {
    const first = render(<TeachingLoad {...props} />);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<TeachingLoad {...props} />);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(openPdfPreview).toHaveBeenCalledTimes(2);
  });

  it('still prevents duplicate generation during Strict Mode effect replay', async () => {
    render(<StrictMode><TeachingLoad {...props} /></StrictMode>);
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(openPdfPreview).toHaveBeenCalledTimes(1);
  });
});
