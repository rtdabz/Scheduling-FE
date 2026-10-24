import { useEffect } from 'react';

let openModalCount = 0;
let originalBodyOverflow = '';

export function useModalScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    if (openModalCount++ === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (--openModalCount === 0) document.body.style.overflow = originalBodyOverflow;
    };
  }, [open]);
}
