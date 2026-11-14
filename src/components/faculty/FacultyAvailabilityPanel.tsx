import { useEffect, useState } from 'react';
import { CalendarClock, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { FULL_DAY_NAMES, formatTime12h } from '../../lib/timeGrid';
import { summarizeWeek } from '../../lib/availabilityWindows';
import { publishLiveTopics } from '../../lib/liveUpdates';
import FacultyAvailabilityEditor from './FacultyAvailabilityEditor';
import Skeleton from '../ui/Skeleton';
import type { AvailabilityResponse, AvailabilityWindow } from './facultyAvailability';

interface FacultyAvailabilityPanelProps {
  facultyId: number;
  facultyName: string;
  employmentType: 'full-time' | 'part-time';
  canEdit?: boolean;
  onNotify?: (kind: 'success' | 'error', title: string, message: string) => void;
}

export default function FacultyAvailabilityPanel({
  facultyId,
  facultyName,
  employmentType,
  canEdit = false,
  onNotify,
}: FacultyAvailabilityPanelProps) {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [standardWindows, setStandardWindows] = useState<AvailabilityWindow[]>([]);
  const [openingTime, setOpeningTime] = useState('07:00:00');
  const [closingTime, setClosingTime] = useState('21:00:00');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await api.get<AvailabilityResponse>(`/faculties/${facultyId}/availabilities`);
        if (!active) return;
        setWindows(res.data?.availabilities ?? []);
        setStandardWindows(res.data?.standard_availabilities ?? []);
        if (res.data?.opening_time) setOpeningTime(res.data.opening_time);
        if (res.data?.closing_time) setClosingTime(res.data.closing_time);
        setLoadError('');
      } catch (err) {
        if (active) setLoadError(apiErrorMessage(err, 'Failed to load availability windows.'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [facultyId]);

  const byDay = FULL_DAY_NAMES.map((label, dayIndex) => ({
    label,
    dayIndex,
    rows: windows
      .filter(window => window.day_index === dayIndex)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  const hasAddedWindows = windows.length > 0;
  const employmentLabel = employmentType === 'part-time' ? 'part-time' : 'full-time';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wider font-sans">
          <CalendarClock size={14} className="text-gray-400" />
          <span>Availability</span>
          {employmentType === 'part-time' && (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-amber-700">
              Part-time
            </span>
          )}
        </div>
        {canEdit && !isLoading && !loadError && (
          <button
            type="button"
            onClick={() => setIsEditorOpen(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-[#5A1220] hover:text-[#C9952A] transition-colors cursor-pointer"
          >
            <Pencil size={12} />
            {hasAddedWindows ? 'Edit added windows' : 'Add window'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-xl border border-gray-100 bg-white p-3" aria-busy="true" aria-label="Loading availability">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : loadError ? (
        <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] font-semibold text-red-600">
          {loadError}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white font-sans">
          <div className="space-y-0.5 px-3 py-2 text-xs">
            <p className="font-bold text-gray-700">Default {employmentLabel} hours</p>
            <p className="font-semibold text-slate-700">
              {standardWindows.length > 0 ? summarizeWeek(standardWindows) : 'No default hours within operating hours.'}
            </p>
          </div>
          {hasAddedWindows && (
            <p className="bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Added windows
            </p>
          )}
          {byDay
            .filter(day => day.rows.length > 0)
            .map(day => (
              <div key={day.dayIndex} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="font-bold text-gray-600">{day.label}</span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {day.rows.map((row, index) => (
                    <span
                      key={row.id ?? `${day.dayIndex}-${index}`}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700"
                    >
                      {formatTime12h(row.start_time)} &ndash; {formatTime12h(row.end_time)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          <p className="px-3 py-2 text-[11px] text-gray-500">
            Classes must fit inside the default hours or an added window.
          </p>
        </div>
      )}

      {isEditorOpen && (
        <FacultyAvailabilityEditor
          facultyId={facultyId}
          facultyName={facultyName}
          employmentType={employmentType}
          windows={windows}
          standardWindows={standardWindows}
          openingTime={openingTime}
          closingTime={closingTime}
          onClose={() => setIsEditorOpen(false)}
          onSaved={saved => {
            setWindows(saved);
            // Assignment and scheduler pages hold their own copy of each instructor's windows.
            publishLiveTopics(['faculty', 'assignments', 'schedules']);
            onNotify?.(
              'success',
              'Availability Saved',
              saved.length === 0
                ? `${facultyName} now follows the default ${employmentLabel} hours only.`
                : `${saved.length} added window${saved.length === 1 ? '' : 's'} saved for ${facultyName}, on top of the default hours.`
            );
          }}
          onError={message => onNotify?.('error', 'Availability', message)}
        />
      )}
    </div>
  );
}
