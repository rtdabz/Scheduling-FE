import { loadBandsOf, type LoadBands } from '../../lib/facultyLoad';

/**
 * An instructor's load split into the three bands the scheduler enforces
 * (see `loadTierForUnits` / `SchedulingPolicy::facultyLoadTier()`):
 *
 *   Basic Load (green) -> Overload (light red) -> Pro bono (grey)
 *
 * The track is scaled to the full ceiling, so every band keeps its own share of
 * the bar even while nothing is assigned yet, and the fill shows which band the
 * assigned units have reached. Units beyond the ceiling add a dark red segment and
 * are called out in the label.
 */
const BANDS = [
  { key: 'basic', label: 'Basic', track: 'bg-emerald-100', fill: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'overload', label: 'Overload', track: 'bg-red-100', fill: 'bg-red-400', dot: 'bg-red-400' },
  { key: 'probono', label: 'Pro bono', track: 'bg-slate-200', fill: 'bg-slate-400', dot: 'bg-slate-400' },
] as const;

export default function SegmentedLoadBar({
  size = 'md',
  showLegend = false,
  className = '',
  ...load
}: LoadBands & {
  size?: 'sm' | 'md';
  /** Band capacities under the bar, e.g. "Basic 21 · Overload 6". */
  showLegend?: boolean;
  className?: string;
}) {
  const bands = loadBandsOf(load);
  // Units past the ceiling still need room on the bar, or they would not show.
  const scale = Math.max(bands.ceiling + bands.beyondCeiling, 1);
  const pct = (units: number) => `${(units / scale) * 100}%`;
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';

  const title = [
    `${bands.assigned} of ${bands.ceiling} units assigned`,
    `Basic ${bands.basic}`,
    bands.overload > 0 ? `Overload ${bands.overload}` : '',
    bands.probono > 0 ? `Pro bono ${bands.probono}` : '',
    bands.beyondCeiling > 0 ? `${bands.beyondCeiling} over the ceiling` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={title}
        title={title}
        className={`flex w-full gap-px overflow-hidden rounded-full bg-gray-100 ${height}`}
      >
        {BANDS.map((band) => {
          const capacity = bands[band.key];
          if (capacity === 0) return null;
          return (
            <div key={band.key} className={`relative h-full ${band.track}`} style={{ width: pct(capacity) }}>
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 ${band.fill}`}
                style={{ width: `${(bands.filled[band.key] / capacity) * 100}%` }}
              />
            </div>
          );
        })}
        {bands.beyondCeiling > 0 && (
          <div className="h-full bg-red-700" style={{ width: pct(bands.beyondCeiling) }} />
        )}
      </div>

      {showLegend && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-gray-500">
          {BANDS.map((band) => bands[band.key] > 0 && (
            <span key={band.key} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${band.dot}`} />
              {band.label} {band.key === 'probono' && bands.probonoGranted === 0
                ? bands.filled.probono
                : `${bands.filled[band.key]}/${bands[band.key]}`}
            </span>
          ))}
          {bands.beyondCeiling > 0 && (
            <span className="font-bold text-red-700">+{bands.beyondCeiling} over ceiling</span>
          )}
        </div>
      )}
    </div>
  );
}
