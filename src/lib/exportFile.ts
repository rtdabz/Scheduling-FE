export const buildExportFilename = (
  extension: 'pdf' | 'csv',
  ...parts: (string | number | null | undefined)[]
): string => {
  const stem = parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .map((part) => String(part).normalize('NFC')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\p{Cc}/gu, '-')
      .replace(/[\s.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-')
    .slice(0, 180)
    .replace(/-+$/g, '') || 'wicars-export';
  // Windows reserves these basenames even when a file extension is present.
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) ? `wicars-${stem}` : stem}.${extension}`;
};

export const downloadFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser consume the URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};

export const printWithTitle = (filename: string): void => {
  const previousTitle = document.title;
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', restoreTitle);
  };
  document.title = filename.replace(/\.pdf$/i, '');
  window.addEventListener('afterprint', restoreTitle);
  try {
    window.print();
  } catch (error) {
    restoreTitle();
    throw error;
  }
};
