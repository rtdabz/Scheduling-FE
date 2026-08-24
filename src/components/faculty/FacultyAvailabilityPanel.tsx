import { useEffect, useState } from 'react';
import { CalendarClock, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { FULL_DAY_NAMES, formatTime12h } from '../../lib/timeGrid';
import FacultyAvailabilityEditor from './FacultyAvailabilityEditor';
import type { AvailabilityResponse, AvailabilityWindow } from './facultyAvailability';

interface FacultyAvailabilityPanelProps {
  facultyId: number;
  facultyName: string;
  employmentType: 'full-time' | 'part-time';
  /** Only the VPAA and the secretary may write; everyone else reads. */
  canEdit?: boolean;
  onNotify?: (kind: 'success' | 'error', title: string, message: string) => void;
}

/**
 * Reads and, for the roles allowed to, edits the weekly availability windows the
 * scheduler honours for this instructor (`faculty_availabilities`).
 */
export default function FacultyAvailabilityPanel({
  facultyId,
  facultyName,
  employmentType,
  canEdit = false,
  onNotify,
}: FacultyAvailabilityPanelProps) {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [openingTime, setOpeningTime] = useState('07:00:00');
  const [closingTime, setClosingTime] = useState('21:00:00');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    // The panel lives inside a modal the user can close mid-flight, so a late
    // response must not write to unmounted state.
    let active = true;

    const load = async () => {
      try {
        const res = await api.get<AvailabilityResponse>(`/faculties/${facultyId}/availabilities`);
        if (!active) return;
        setWindows(res.data?.availabilities ?? []);
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

  const isUnrestricted = windows.length === 0;

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
            {isUnrestricted ? 'Set windows' : 'Edit windows'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-400">
          <LoadingSpinner size={13} className="animate-spin" />
          <span>Loading availability&hellip;</span>
        </div>
      ) : loadError ? (
        <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] font-semibold text-red-600">
          {loadError}
        </p>
      ) : isUnrestricted && employmentType === 'part-time' ? (
        <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700 font-sans">
          No windows recorded. A part-time instructor is only scheduled inside their windows,
          so this instructor cannot be assigned to any class until windows are set
          {canEdit ? '.' : ' by the secretary or the VPAA.'}
        </p>
      ) : isUnrestricted ? (
        <p className="rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-500 font-sans">
          No windows set &mdash; schedulable during any operating hour
          <span className="text-gray-400">
            {' '}({formatTime12h(openingTime)} &ndash; {formatTime12h(closingTime)})
          </span>
          .
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white font-sans">
          {employmentType === 'part-time' && (
            <p className="bg-amber-50/60 px-3 py-2 text-[11px] font-semibold text-amber-800">
              Days not listed below are treated as unavailable.
            </p>
          )}
          {byDay
            .filter(day => day.rows.length > 0)
            .map(day => (
              <div key={day.dayIndex} className="flex items-start justify-between gap-3 p-3 text-xs">
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
        </div>
      )}

      {isEditorOpen && (
        <FacultyAvailabilityEditor
          facultyId={facultyId}
          facultyName={facultyName}
          employmentType={employmentType}
          windows={windows}
          openingTime={openingTime}
          closingTime={closingTime}
          onClose={() => setIsEditorOpen(false)}
          onSaved={saved => {
            setWindows(saved);
            onNotify?.(
              'success',
              'Availability Saved',
              saved.length === 0
                ? `${facultyName} is now available during any operating hour.`
                : `${saved.length} weekly window${saved.length === 1 ? '' : 's'} saved for ${facultyName}.`
            );
          }}
          onError={message => onNotify?.('error', 'Availability', message)}
        />
      )}
    </div>
  );
}
import LoadingSpinner from "../ui/LoadingSpinner";
