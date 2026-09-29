import { Building2, ChevronDown, Clock, MapPin, Monitor, TreePine } from "lucide-react";
import { slotToTimeStr } from "../constants";
import { SLOTS_PER_HOUR, slotsToHours } from "../courseSlotPlan";
import { describeWindow } from "../../../../lib/roomRequests";
import type { Room } from "../types";
import { ROOM_TBA, type ClassMode } from "./placementAlternativesModel";

const CLASS_MODE_OPTIONS: { value: ClassMode; label: string; Icon: typeof Building2 }[] = [
  { value: "on-site", label: "On-Site", Icon: Building2 },
  { value: "online", label: "Online", Icon: Monitor },
  { value: "field", label: "Field", Icon: TreePine },
];

const fieldLabelClass = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500";
const selectClass = "h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

interface MeetingCardProps {
  title: string;
  mode: ClassMode;
  isModeDisabled: (mode: ClassMode) => boolean;
  modeTitle: (mode: ClassMode) => string | undefined;
  onModeSelect: (mode: ClassMode) => void;
  roomId: string;
  onRoomChange: (roomId: string) => void;
  hasRoomError: boolean;
  allowsRoomTba: boolean;
  roomOptions: Room[];
  dayAriaLabel: string;
  dayValue: number;
  dayDisabled: boolean;
  dayOptions: { value: number; label: string; disabled?: boolean }[];
  onDayChange: (dayIndex: number) => void;
  startSlot: number;
  startDisabled?: boolean;
  startOptionCount: number;
  onStartChange: (slot: number) => void;
  durationSlots: number;
  /**
   * Set only where the length is the user's to choose -- Integrated's lecture
   * and laboratory, as in Setup Courses. Every other shape takes its length
   * from the course, so the card shows it and does not offer it.
   */
  onDurationChange?: (slots: number) => void;
  /** The longest this meeting may run: the week's ceiling less its partner, and the day's end. */
  maxDurationSlots?: number;
  endLabelSuffix?: string;
}

/**
 * One meeting's delivery, room, day and time.
 *
 * The first and second meeting used to be two ~190-line copies of the same
 * markup that had already drifted (label spacing, cursor styles). They differ
 * only in the values and rules passed in here.
 */
export default function MeetingCard({
  title,
  mode,
  isModeDisabled,
  modeTitle,
  onModeSelect,
  roomId,
  onRoomChange,
  hasRoomError,
  allowsRoomTba,
  roomOptions,
  dayAriaLabel,
  dayValue,
  dayDisabled,
  dayOptions,
  onDayChange,
  startSlot,
  startDisabled = false,
  startOptionCount,
  onStartChange,
  durationSlots,
  onDurationChange,
  maxDurationSlots,
  endLabelSuffix,
}: MeetingCardProps) {
  return (
    <div className="relative space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="flex items-center gap-2 pr-20 text-sm font-black text-slate-900">
        {title}
      </h4>
      <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
        <Clock className="h-3 w-3" />
        {slotsToHours(durationSlots)} hrs
      </span>

      <div>
        <span className={fieldLabelClass}>Class mode</span>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {CLASS_MODE_OPTIONS.map(({ value, label, Icon }) => {
            const isSelected = mode === value;
            const disabled = isModeDisabled(value);
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                title={modeTitle(value)}
                onClick={() => { if (!disabled) onModeSelect(value); }}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-bold transition-colors ${
                  isSelected
                    ? "cursor-default bg-[#4e0a10] text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={fieldLabelClass}>Room</span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {mode === "on-site" ? (
              <>
                <select
                  aria-label={`${title} room`}
                  value={roomId}
                  onChange={(event) => onRoomChange(event.target.value)}
                  className={`${selectClass} pl-9 pr-8 ${hasRoomError ? "border-red-300 ring-2 ring-red-100" : ""}`}
                >
                  <option value="">Select a room...</option>
                  {allowsRoomTba && <option value={ROOM_TBA}>Room TBA (assign later)</option>}
                  {roomOptions.map((room) => {
                    const isUnavailable = room.status === "not available";
                    return (
                      <option key={room.id} value={room.id} disabled={isUnavailable}>
                        {room.name}
                        {room.grantWindows ? ` — Granted: ${room.grantWindows.map(describeWindow).join(", ")}` : ""}
                        {isUnavailable ? " — (Not Available)" : ""}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </>
            ) : (
              <input
                type="text"
                readOnly
                value={mode === "online" ? "Online" : "Field"}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-500 outline-none"
              />
            )}
          </div>
        </div>

        <div>
          <span className={fieldLabelClass}>Meeting day</span>
          <div className="relative">
            <select
              aria-label={dayAriaLabel}
              value={dayValue}
              disabled={dayDisabled}
              onChange={(event) => onDayChange(Number(event.target.value))}
              className={`${selectClass} pl-3 pr-8`}
            >
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        <div>
          <span className={fieldLabelClass}>Start time</span>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <select
              aria-label={`${title} start time`}
              value={startSlot}
              disabled={startDisabled}
              title={startDisabled ? "Both meetings share the first meeting's time." : undefined}
              onChange={(event) => onStartChange(Number(event.target.value))}
              className={`${selectClass} pl-9 pr-8`}
            >
              {Array.from({ length: Math.max(1, startOptionCount) }, (_, slot) => (
                <option key={slot} value={slot}>{slotToTimeStr(slot)}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {onDurationChange && (
          <div>
            <span className={fieldLabelClass}>Duration</span>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                aria-label={`${title} duration`}
                value={durationSlots}
                onChange={(event) => onDurationChange(Number(event.target.value))}
                className={`${selectClass} pl-9 pr-8`}
              >
                {Array.from(
                  { length: Math.max(1, maxDurationSlots ?? durationSlots, durationSlots) },
                  (_, index) => index + 1,
                ).map((slots) => (
                  <option key={slots} value={slots}>
                    {slotsToHours(slots)} hr{slots === SLOTS_PER_HOUR ? "" : "s"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        )}

        <div>
          <span className={fieldLabelClass}>End time{endLabelSuffix ? ` ${endLabelSuffix}` : ""}</span>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              readOnly
              aria-disabled="true"
              value={slotToTimeStr(startSlot + durationSlots)}
              className="h-10 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-500 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
