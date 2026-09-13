import { Panel } from './DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';
import { hourLabel, type VpaaInsights } from '../../lib/vpaaInsights';

/**
 * Campus load as a day x hour grid.
 *
 * A department timetable cannot show this: every department schedules into the
 * same hours independently, and the resulting mid-morning crush only appears
 * once all of them are laid over one another. It is the difference between
 * "we need more rooms" and "we need to schedule outside 9-11am".
 *
 * Colour is a five-step ramp of one hue rather than a red-amber-green scale:
 * load is a sequential quantity, and a diverging scale would imply a neutral
 * midpoint that does not exist here.
 */

const STEPS = [
  { at: 0, className: 'bg-slate-50 text-slate-300' },
  { at: 0.2, className: 'bg-primary/10 text-primary' },
  { at: 0.4, className: 'bg-primary/25 text-primary' },
  { at: 0.6, className: 'bg-primary/45 text-white' },
  { at: 0.8, className: 'bg-primary/70 text-white' },
];

const cellStyle = (count: number, peak: number) => {
  if (count === 0 || peak === 0) return STEPS[0].className;
  const ratio = count / peak;
  let chosen = STEPS[1].className;
  STEPS.forEach(step => {
    if (ratio >= step.at && step.at > 0) chosen = step.className;
  });
  return chosen;
};

export default function PeakLoadHeatmap({ insights, loading, className = '' }: { insights: VpaaInsights; loading: boolean; className?: string }) {
  const { peak_load: peak } = insights;
  const hasData = peak.days.length > 0 && peak.hours.length > 0;

  return (
    <Panel
      title="Campus Peak-Hour Load"
      subtitle="Classes running in each hour of the teaching week, across every department."
      className={`flex flex-col ${className}`}
    >
      {loading && <p className="py-8 text-center text-xs italic text-slate-400">Measuring campus load…</p>}

      {!loading && !hasData && (
        <p className="py-8 text-center text-xs italic text-slate-400">No scheduled meetings in the active term yet.</p>
      )}

      {!loading && hasData && (
        <>
          <div className="-mx-1 overflow-x-auto px-1 sm:overflow-x-visible">
            <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-0.5 sm:min-w-0">
              <caption className="sr-only">
                Number of classes running in each hour of each teaching day across the institution
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-16 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Day</th>
                  {peak.hours.map(hour => (
                    <th key={hour} scope="col" className="text-center text-[10px] font-bold tabular-nums text-slate-400">
                      {hour}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {peak.days.map(day => (
                  <tr key={day}>
                    <th scope="row" className="pr-2 text-left text-[11px] font-bold text-slate-600">{day.slice(0, 3)}</th>
                    {(peak.matrix[day] ?? []).map((count, index) => (
                      <td
                        key={`${day}-${peak.hours[index]}`}
                        title={`${day} ${hourLabel(peak.hours[index])} — ${count} class${count === 1 ? '' : 'es'}`}
                        className={`h-7 rounded text-center text-[10px] font-bold tabular-nums ${cellStyle(count, peak.peak)}`}
                      >
                        {count > 0 ? count : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              Lighter
              {STEPS.map(step => (
                <span key={step.at} className={`h-3 w-3 rounded-sm ${step.className}`} aria-hidden="true" />
              ))}
              Busier
            </span>
            {peak.peak_day && peak.peak_hour !== null && (
              <span className="ml-auto font-bold text-primary">
                Peak: {grouped(peak.peak)} classes · {peak.peak_day} {hourLabel(peak.peak_hour)}
              </span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
