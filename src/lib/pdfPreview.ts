import api from './api';
import { downloadFile } from './exportFile';

export const createPdfPreview = async (blob: Blob, filename: string) => {
  const { data } = await api.post<{ id: string; url: string }>('/pdf-previews', blob, {
    params: { filename },
    headers: { 'Content-Type': 'application/pdf' },
  });
  let disposed = false;
  return {
    url: new URL(data.url, new URL(api.defaults.baseURL || '/api', window.location.origin)).href,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      void api.delete(`/pdf-previews/${data.id}`).catch(() => {});
    },
  };
};

/** Open before async generation so user-initiated previews can avoid popup blocking. */
export const openPdfPreview = () => {
  const preview = window.open('', '_blank');
  let release: (() => void) | undefined;
  let closed = false;
  if (preview) {
    preview.opener = null;
    preview.document.title = 'Preparing PDF';
    preview.document.body.textContent = 'Preparing PDF…';
  }

  return {
    close: () => {
      closed = true;
      release?.();
      preview?.close();
    },
    show: async (blob: Blob, filename: string) => {
      if (closed) return;
      if (!preview) {
        downloadFile(blob, filename);
        return;
      }
      if (preview.closed) return;

      const file = await createPdfPreview(blob, filename);
      if (closed || preview.closed) {
        file.dispose();
        return;
      }
      const closedCheck = window.setInterval(() => {
        if (preview.closed) release?.();
      }, 1000);
      release = () => {
        window.clearInterval(closedCheck);
        file.dispose();
      };
      preview.location.replace(file.url);
    },
  };
};
