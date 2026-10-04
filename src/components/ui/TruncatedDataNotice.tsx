import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function TruncatedDataNotice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
