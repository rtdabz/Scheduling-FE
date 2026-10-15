import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Lightbulb, MapPin, Monitor, Sparkles, TreePine, X } from "lucide-react";
import { DAYS, slotToTimeStr } from "../constants";
import RecommendedOptionList from "../components/RecommendedOptionList";
import type { DeliveryMode } from "../types";
import {
  ALL_ROOMS,
  DELIVERY_SHORT_LABEL,
  groupSlotsByDay,
  slotRoomKey,
  WEEKDAY_NAMES,
  WEEKEND_NAMES,
  type AvailableSlot,
  type AvailableSlotRoom,
  type RecommendationView,
} from "./placementAlternativesModel";

export interface SplitPairStart {
  startSlot: number;
  endSlot: number;
  roomLabel: string;
}

export interface PlacementAlternativesProps {
  onClose: () => void;
  courseLabel?: string;
  meetingTypeLabel: string;
  availableSlots: AvailableSlot[];
  availableSlotRooms: AvailableSlotRoom[];
  visibleSlots: AvailableSlot[];
  isSlotsLoading: boolean;
  slotsError: string | null;
  areSlotsTruncated: boolean;
  roomFilter: string;
  onRoomFilterChange: (value: string) => void;
  onApplySlot: (slot: AvailableSlot) => void;
  requestedDay: string;
  bestMatches: AvailableSlot[];
  isSlotApplied: (slot: AvailableSlot) => boolean;
  forcedDayName: string | null;

  splitPairStarts: SplitPairStart[] | null;
  onApplySplitPairStart: (startSlot: number) => void;
  firstDayIndex: number;
  secondDayIndex: number;
  firstMode: DeliveryMode;
  secondMode: DeliveryMode;
  splitStartSlot: number;

  showsMeetingSwitch: boolean;
  slotMeeting: "first" | "second";
  onSlotMeetingChange: (meeting: "first" | "second") => void;
  firstMeetingTitle: string;
  secondMeetingTitle: string;
}

const VIEWS: { value: RecommendationView; label: string; hint: string }[] = [
  { value: "best", label: "Best Match", hint: "Same day" },
  { value: "weekdays", label: "Weekdays", hint: "Mon – Thu" },
  { value: "weekend", label: "Weekend", hint: "Fri – Sat" },
];

export default function PlacementAlternatives({
  onClose,
  courseLabel,
  meetingTypeLabel,
  availableSlots,
  availableSlotRooms,
  visibleSlots,
  isSlotsLoading,
  slotsError,
  areSlotsTruncated,
  roomFilter,
  onRoomFilterChange,
  onApplySlot,
  requestedDay,
  bestMatches,
  isSlotApplied,
  forcedDayName,
  splitPairStarts,
  onApplySplitPairStart,
  firstDayIndex,
  secondDayIndex,
  firstMode,
  secondMode,
  splitStartSlot,
  showsMeetingSwitch,
  slotMeeting,
  onSlotMeetingChange,
  firstMeetingTitle,
  secondMeetingTitle,
}: PlacementAlternativesProps) {
  const [view, setView] = useState<RecommendationView>("best");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isSplitPair = splitPairStarts !== null;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-2 sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="placement-alternatives-title"
        aria-describedby="placement-alternatives-desc"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#F7F4F0] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 bg-[#5A1220] px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F5C842]">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 id="placement-alternatives-title" className="text-base font-black leading-tight">Suggested Alternatives</h3>
              <p id="placement-alternatives-desc" className="mt-0.5 text-xs leading-snug text-white/75">
                Conflict-free rooms and times{courseLabel ? ` for ${courseLabel}` : ""}. Choosing one fills in the form for review. Nothing is saved yet.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close suggested alternatives"
            className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-[#E2D9D0] bg-white px-5 py-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#F7F4F0] p-1" role="tablist" aria-label="Recommendation criteria">
            {VIEWS.map(({ value, label, hint }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={`rounded-md px-2 py-1.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/40 ${
                  view === value ? "bg-[#5A1220] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <span className="block text-xs font-black">{label}</span>
                <span className={`block text-[10px] font-semibold ${view === value ? "text-white/70" : "text-slate-400"}`}>{hint}</span>
              </button>
            ))}
          </div>

          {showsMeetingSwitch && !isSplitPair && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span id="placement-alternatives-meeting" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Meeting</span>
              <div role="group" aria-labelledby="placement-alternatives-meeting" className="flex min-w-[14rem] flex-1 gap-1 rounded-lg bg-[#F7F4F0] p-1">
                {([["first", firstMeetingTitle], ["second", secondMeetingTitle]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={slotMeeting === value}
                    onClick={() => onSlotMeetingChange(value)}
                    className={`h-8 flex-1 rounded-md text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/40 ${
                      slotMeeting === value ? "bg-white text-[#5A1220] shadow-sm ring-1 ring-[#5A1220]/20" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" role="tabpanel" aria-label={VIEWS.find((item) => item.value === view)?.label}>
          {isSlotsLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`suggestion-skeleton-${index}`} className="animate-pulse rounded-xl border border-[#E2D9D0] bg-white p-3">
                  <div className="h-3 w-20 rounded bg-slate-200" />
                  <div className="mt-3 h-10 w-full rounded-lg bg-slate-100" />
                </div>
              ))}
            </div>
          ) : slotsError ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm leading-5 text-amber-900">{slotsError}</p>
            </div>
          ) : availableSlots.length === 0 && !isSplitPair ? (
            <div className="flex flex-col items-center rounded-xl border border-[#E2D9D0] bg-white px-4 py-8 text-center">
              <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#F7F4F0]">
                <Sparkles className="h-5 w-5 text-slate-400" />
              </span>
              <p className="text-sm font-bold text-slate-700">No alternatives found</p>
              <p className="mt-0.5 text-xs text-slate-500">Try another class mode or scheduling option.</p>
            </div>
          ) : isSplitPair ? (
            <SplitPairStarts
              view={view}
              starts={splitPairStarts}
              currentStartSlot={splitStartSlot}
              firstDayIndex={firstDayIndex}
              secondDayIndex={secondDayIndex}
              firstMode={firstMode}
              secondMode={secondMode}
              onApply={onApplySplitPairStart}
            />
          ) : view === "best" ? (
            <BestMatches
              requestedDay={requestedDay}
              bestMatches={bestMatches}
              isSlotApplied={isSlotApplied}
              forcedDayName={forcedDayName}
              meetingTypeLabel={meetingTypeLabel}
              onApplySlot={onApplySlot}
            />
          ) : (
            <>
              <RoomFilter
                availableSlots={availableSlots}
                availableSlotRooms={availableSlotRooms}
                roomFilter={roomFilter}
                onRoomFilterChange={onRoomFilterChange}
              />
              {areSlotsTruncated && (
                <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                  Showing the first {availableSlots.length}. Pick a room above to narrow the list.
                </p>
              )}
              <SlotsByDay
                days={view === "weekdays" ? WEEKDAY_NAMES : WEEKEND_NAMES}
                slots={visibleSlots}
                emptyLabel={view === "weekdays"
                  ? "No valid placement from Monday to Thursday. Check the Weekend tab."
                  : "No valid placement on Friday or Saturday. Check the Weekdays tab."}
                forcedDayName={forcedDayName}
                meetingTypeLabel={meetingTypeLabel}
                onApplySlot={onApplySlot}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingTypeChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-[#5A1220]/[0.07] px-2 py-0.5 text-[10px] font-bold text-[#5A1220]">
      {label}
    </span>
  );
}

function SlotLabel({ slot }: { slot: AvailableSlot }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 text-[11px] ${
      slot.mode === "on-site" ? "text-slate-500" : "font-bold text-[#7a4c08]"
    }`}>
      {slot.mode === "online"
        ? <Monitor className="h-3 w-3" />
        : slot.mode === "field"
          ? <TreePine className="h-3 w-3" />
          : <MapPin className="h-3 w-3" />}
      <span>{slot.room_code}</span>
      {slot.mode === "on-site" && (
        <span className="text-slate-400">· {slot.room_type === "laboratory" ? "Lab" : "Classroom"}</span>
      )}
    </span>
  );
}

function BestMatches({
  requestedDay,
  bestMatches,
  isSlotApplied,
  forcedDayName,
  meetingTypeLabel,
  onApplySlot,
}: {
  requestedDay: string;
  bestMatches: AvailableSlot[];
  isSlotApplied: (slot: AvailableSlot) => boolean;
  forcedDayName: string | null;
  meetingTypeLabel: string;
  onApplySlot: (slot: AvailableSlot) => void;
}) {
  if (bestMatches.length === 0) {
    return (
      <p className="rounded-lg border border-[#E2D9D0] bg-white px-3 py-2.5 text-xs leading-snug text-slate-500">
        No room and time is free on <b>{requestedDay}</b> for this meeting. Check the Weekdays or Weekend tab.
      </p>
    );
  }

  const keyOf = (slot: AvailableSlot) => `${slot.day}-${slot.start_slot}-${slotRoomKey(slot)}`;

  return (
    <section>
      <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
        Best on {requestedDay}
      </p>
      <RecommendedOptionList
        label="Best matches"
        applyLabel="Use this option"
        items={bestMatches.map((slot, index) => ({
          key: keyOf(slot),
          isApplied: isSlotApplied(slot),
          disabledLabel: forcedDayName !== null && slot.day !== forcedDayName ? `Not on ${forcedDayName} (Force Day)` : null,
          tag: index === 0
            ? <span className="rounded-full bg-[#c9952a]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a4c08]">Best match</span>
            : null,
          body: (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-[#F7F4F0] px-2.5 py-2">
              <span className="w-8 shrink-0 text-center text-[10px] font-black uppercase text-[#5A1220]">
                {slot.day.slice(0, 3)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
                {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
              </span>
              <MeetingTypeChip label={meetingTypeLabel} />
              <SlotLabel slot={slot} />
            </div>
          ),
        }))}
        onApply={(key) => {
          const chosen = bestMatches.find((slot) => keyOf(slot) === key);
          if (chosen) onApplySlot(chosen);
        }}
      />
    </section>
  );
}

function SlotsByDay({
  days,
  slots,
  emptyLabel,
  forcedDayName,
  meetingTypeLabel,
  onApplySlot,
}: {
  days: string[];
  slots: AvailableSlot[];
  emptyLabel: string;
  forcedDayName: string | null;
  meetingTypeLabel: string;
  onApplySlot: (slot: AvailableSlot) => void;
}) {
  const groups = groupSlotsByDay(slots, days);
  if (groups.length === 0) {
    return <p className="rounded-lg border border-[#E2D9D0] bg-white px-3 py-2.5 text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <section aria-label="Valid placements">
      {groups.map(([day, daySlots]) => (
        <div key={day} className="mt-3 first:mt-0">
          <p className="sticky top-0 z-10 -mx-1 bg-[#F7F4F0]/95 px-1 py-1 text-[11px] font-black uppercase tracking-wider text-[#5A1220] backdrop-blur">
            {day} <span className="text-slate-400">({daySlots.length})</span>
          </p>
          <ul className="mt-1 space-y-1.5">
            {daySlots.map((slot) => (
              <li key={`${slot.day}-${slot.start_slot}-${slotRoomKey(slot)}`}>
                <button
                  type="button"
                  onClick={() => onApplySlot(slot)}
                  disabled={forcedDayName !== null && slot.day !== forcedDayName}
                  className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-[#E2D9D0] bg-white px-3 py-2 text-left transition-colors hover:border-[#5A1220] hover:bg-[#5A1220]/[0.04] disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                    {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
                  </span>
                  <MeetingTypeChip label={meetingTypeLabel} />
                  <SlotLabel slot={slot} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function SplitPairStarts({
  view,
  starts,
  currentStartSlot,
  firstDayIndex,
  secondDayIndex,
  firstMode,
  secondMode,
  onApply,
}: {
  view: RecommendationView;
  starts: SplitPairStart[];
  currentStartSlot: number;
  firstDayIndex: number;
  secondDayIndex: number;
  firstMode: DeliveryMode;
  secondMode: DeliveryMode;
  onApply: (startSlot: number) => void;
}) {
  const days = [DAYS[firstDayIndex], DAYS[secondDayIndex]];
  const viewDays = view === "weekdays" ? WEEKDAY_NAMES : WEEKEND_NAMES;
  const shown = view === "best"
    ? starts.slice(0, 5)
    : days.every((day) => viewDays.includes(day))
      ? [...starts].sort((left, right) => left.startSlot - right.startSlot)
      : null;

  return (
    <section aria-label="Valid split times">
      <p className="mb-3 rounded-lg border border-[#E2D9D0] bg-white px-3 py-2 text-xs leading-snug text-slate-600">
        Both meetings share one start time, so these are the times free on
        {" "}<b>{days[0]}</b> and <b>{days[1]}</b> for the rooms and deliveries you picked. The split is kept.
      </p>
      {shown === null ? (
        <p className="rounded-lg border border-[#E2D9D0] bg-white px-3 py-2.5 text-xs text-slate-500">
          This split meets on {days[0]} and {days[1]}. Change the Split pattern to see {view === "weekdays" ? "weekday" : "weekend"} times.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-[#E2D9D0] bg-white px-3 py-2.5 text-xs text-slate-500">
          No time is free on both days for this pair. Change a room or a delivery.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map(({ startSlot, endSlot, roomLabel }, index) => (
            <li key={`pair-${startSlot}`}>
              <button
                type="button"
                onClick={() => onApply(startSlot)}
                disabled={startSlot === currentStartSlot}
                className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-[#E2D9D0] bg-white px-3 py-2 text-left transition-colors hover:border-[#5A1220] hover:bg-[#5A1220]/[0.04] disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50/50"
              >
                <span className="shrink-0 text-[10px] font-black uppercase text-[#5A1220]">
                  {days[0].slice(0, 3)} + {days[1].slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                  {slotToTimeStr(startSlot)} – {slotToTimeStr(endSlot)}
                </span>
                {view === "best" && index === 0 && (
                  <span className="rounded-full bg-[#c9952a]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a4c08]">Best match</span>
                )}
                <MeetingTypeChip label="Split · both meetings" />
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {roomLabel}
                </span>
                <span className="shrink-0 text-[11px] font-bold text-[#7a4c08]">
                  {DELIVERY_SHORT_LABEL[firstMode]} | {DELIVERY_SHORT_LABEL[secondMode]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomFilter({
  availableSlots,
  availableSlotRooms,
  roomFilter,
  onRoomFilterChange,
}: {
  availableSlots: AvailableSlot[];
  availableSlotRooms: AvailableSlotRoom[];
  roomFilter: string;
  onRoomFilterChange: (value: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <select
          aria-label="Filter placements by room"
          value={roomFilter}
          onChange={(event) => onRoomFilterChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-[#E2D9D0] bg-white pl-8 pr-8 text-xs font-bold text-slate-800 shadow-sm focus:border-[#5A1220] focus:outline-none focus:ring-2 focus:ring-[#5A1220]/15"
        >
          <option value={ALL_ROOMS}>All rooms ({availableSlots.length})</option>
          {availableSlotRooms.map((room) => (
            <option key={slotRoomKey(room)} value={slotRoomKey(room)}>
              {room.room_code} ({room.slot_count})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}
