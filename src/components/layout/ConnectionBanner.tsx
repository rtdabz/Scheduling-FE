import { CloudOff, Gauge } from 'lucide-react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

/**
 * One persistent notice about the connection, instead of a toast per failed
 * request. Renders nothing while the connection is healthy.
 */
export default function ConnectionBanner() {
  const { quality, showingSavedData } = useConnectionStatus();

  if (quality === 'online' && !showingSavedData) return null;

  const offline = quality === 'offline';
  const message = offline
    ? 'You appear to be offline. Changes cannot be saved until the connection returns.'
    : quality === 'slow'
      ? 'The connection to the server is slow. Pages and saves may take longer than usual.'
      : 'Some information could not be refreshed.';
  const savedDataNote = showingSavedData ? ' Showing the last loaded data, which may be out of date.' : '';

  const Icon = offline ? CloudOff : Gauge;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 border-b px-4 py-2 text-xs font-semibold ${
        offline
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        {message}
        {savedDataNote}
      </span>
    </div>
  );
}
