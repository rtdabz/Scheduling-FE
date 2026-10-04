import { AlertTriangle, RotateCcw } from 'lucide-react';

interface LoadErrorBannerProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export default function LoadErrorBanner({ message, onRetry, className = '' }: LoadErrorBannerProps) {
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800 ${className}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 font-bold text-red-800 transition hover:bg-red-100"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
      </button>
    </div>
  );
}
