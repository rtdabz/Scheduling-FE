import { useMemo } from 'react';

export interface GlanceMeeting {
  day?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface GlanceGrid {
  opening_time?: string | null;
  closing_time?: string | null;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Maroon at rising strength; level 0 is an empty hour.
const LEVELS = ['bg-stage-idle/60', 'bg-primary/15', 'bg-primary/35', 'bg-primary/60', 'bg-primary'];

const minutesOf = (time?: string | null) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

/**
 * A compact timetable preview: class meetings per hour for each teaching day.
 * Detail stays in the schedule module; this only shows where the week is full.
 */
export function WeekGlance({ meetings, grid }: { meetings: GlanceMeeting[]; grid?: GlanceGrid | null }) {
  const model = useMemo(() => {
    const open = Math.floor((minutesOf(grid?.opening_time) ?? 7 * 60) / 60);
    const close = Math.ceil((minutesOf(grid?.closing_time) ?? 20 * 60 + 30) / 60);
    const hours = Array.from({ length: Math.max(1, close - open) }, (_, i) => open + i);
    const days = meetings.some(m => m.day === 'Sunday') ? [...WEEKDAYS, 'Sunday'] : WEEKDAYS;
    const counts = new Map(days.map(day => [day, hours.map(() => 0)]));
    let placed = 0;

    meetings.forEach(meeting => {
      const row = counts.get(meeting.day ?? '');
      const start = minutesOf(meeting.start_time);
      const end = minutesOf(meeting.end_time);
      if (!row || start == null || end == null || end <= start) return;
      placed++;
      hours.forEach((hour, i) => {
        if (start < (hour + 1) * 60 && end > hour * 60) row[i]++;
      });
    });

    let peak = { day: '', hour: 0, count: 0 };
    counts.forEach((row, day) => row.forEach((count, i) => {
      if (count > peak.count) peak = { day, hour: hours[i], count };
    }));
    return { hours, days, counts, placed, peak };
  }, [meetings, grid]);

  const level = (count: number) => (count === 0 || model.peak.count === 0 ? 0 : Math.max(1, Math.ceil((count / model.peak.count) * 4)));
  const columns = { gridTemplateColumns: `2.25rem repeat(${model.hours.length}, minmax(0, 1fr))` };

  if (!model.placed) {
    return <p className="py-6 text-center text-[13px] text-muted">No class meetings have a day and time yet.</p>;
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`${model.placed} class meetings across the week. Busiest: ${model.peak.day} ${hourLabel(model.peak.hour)}, ${model.peak.count} meetings.`}
        className="space-y-[3px]"
      >
        {model.days.map(day => (
          <div key={day} className="grid items-center gap-[3px]" style={columns}>
            <span className="text-[11px] font-medium text-muted">{day.slice(0, 3)}</span>
            {model.counts.get(day)!.map((count, i) => (
              <span
                key={model.hours[i]}
                title={`${day} ${hourLabel(model.hours[i])}: ${count} ${count === 1 ? 'meeting' : 'meetings'}`}
                className={`h-[18px] rounded-[3px] ${LEVELS[level(count)]}`}
              />
            ))}
          </div>
        ))}
        <div aria-hidden="true" className="grid gap-[3px] pt-1" style={columns}>
          <span />
          {model.hours.map((hour, i) => (
            <span key={hour} className="whitespace-nowrap text-[10px] tabular-nums text-muted">{i % 2 === 0 ? hourLabel(hour).replace(' ', '') : ''}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2.5 text-[12px] text-muted">
        <span>
          Busiest: <b className="font-semibold text-text">{model.peak.day} {hourLabel(model.peak.hour)}</b>, {model.peak.count} {model.peak.count === 1 ? 'meeting' : 'meetings'}
        </span>
        <span aria-hidden="true" className="ml-auto flex items-center gap-1">
          Fewer
          {LEVELS.slice(1).map(tone => <span key={tone} className={`h-2.5 w-2.5 rounded-[2px] ${tone}`} />)}
          More
        </span>
      </div>
    </div>
  );
}
