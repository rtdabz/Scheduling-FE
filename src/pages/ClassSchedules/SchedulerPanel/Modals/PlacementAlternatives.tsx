import { useState } from "react";
import { AlertTriangle, ChevronDown, Lightbulb, MapPin, Monitor, Sparkles, TreePine } from "lucide-react";
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

export interface PlacementAlternativesProps {
  /** Every valid placement, for the room filter's counts. */
  availableSlots: AvailableSlot[];
  availableSlotRooms: AvailableSlotRoom[];
  /** The valid placements the room filter leaves. */
  visibleSlots: AvailableSlot[];
  isSlotsLoading: boolean;
  slotsError: string | null;
  areSlotsTruncated: boolean;
  roomFilter: string;
  onRoomFilterChange: (value: string) => void;
  onApplySlot: (slot: AvailableSlot) => void;
  /** The day the meeting asks for, by full name: Best Match looks only there. */
  requestedDay: string;
  /** The requested day's best placements, best first. */
  bestMatches: AvailableSlot[];
  /** True when a slot is exactly what the form already holds. */
  isSlotApplied: (slot: AvailableSlot) => boolean;
  /** Force Day: only this day may be used. */
  forcedDayName: string | null;

  /** A same-time split's shared free starts, best first, or null for any other shape. */
  splitPairStarts: { startSlot: number; endSlot: number }[] | null;
  onApplySplitPairStart: (startSlot: number) => void;
  firstDayIndex: number;
  secondDayIndex: number;
  firstMode: DeliveryMode;
  secondMode: DeliveryMode;
  /** The split's current start, which is not offered again. */
  splitStartSlot: number;

  /** An Integrated pair answers for one meeting at a time. */
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

/**
 * The placement dialog's suggestions, in three views of the placements the
 * Rule Engine accepts:
 *
 * - Best Match: the most suitable room and time on the requested day.
 * - Weekdays: every valid placement Monday to Thursday.
 * - Weekend: every valid placement Friday and Saturday.
 */
export default function PlacementAlternatives({
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
  const isSplitPair = splitPairStarts !== null;

  return (
    <aside
      aria-label="Suggested alternatives"
      className="flex max-h-80 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl xl:max-h-[94vh] xl:w-[440px]"
    >
      <div className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-[#fff8e8] to-white px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c9952a]/15 text-[#7a4c08]">
            <Lightbulb className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-tight text-slate-900">Suggested alternatives</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              Conflict-free rooms and times. Every option already passes the scheduling rules.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Recommendation criteria">
          {VIEWS.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`flex-1 rounded-md px-2 py-1.5 text-center transition-colors ${
                view === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="block text-[11px] font-black">{label}</span>
              <span className="block text-[10px] font-semibold text-slate-400">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" role="tabpanel" aria-label={VIEWS.find((item) => item.value === view)?.label}>
        {/*
          An Integrated pair's halves have different lengths and different
          legal deliveries, so the suggestions answer for one of them at a time
          and say which.
        */}
        {showsMeetingSwitch && !isSplitPair && (
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {([["first", firstMeetingTitle], ["second", secondMeetingTitle]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onSlotMeetingChange(value)}
                className={`h-7 flex-1 rounded-md text-[11px] font-bold transition-colors ${
                  slotMeeting === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {isSlotsLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`suggestion-skeleton-${index}`} className="animate-pulse rounded-xl border border-slate-200 p-3">
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
        ) : availableSlots.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
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
              onApplySlot={onApplySlot}
            />
          </>
        )}
      </div>
    </aside>
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
      {slot.room_code}
    </span>
  );
}

/** The requested day's most suitable room and time, as ranked options. */
function BestMatches({
  requestedDay,
  bestMatches,
  isSlotApplied,
  forcedDayName,
  onApplySlot,
}: {
  requestedDay: string;
  bestMatches: AvailableSlot[];
  isSlotApplied: (slot: AvailableSlot) => boolean;
  forcedDayName: string | null;
  onApplySlot: (slot: AvailableSlot) => void;
}) {
  if (bestMatches.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-snug text-slate-500">
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
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
              <span className="w-8 shrink-0 text-center text-[10px] font-black uppercase text-[#4e0a10]">
                {slot.day.slice(0, 3)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
                {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
              </span>
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

/** Every valid placement on the given days, one group per day. */
function SlotsByDay({
  days,
  slots,
  emptyLabel,
  forcedDayName,
  onApplySlot,
}: {
  days: string[];
  slots: AvailableSlot[];
  emptyLabel: string;
  forcedDayName: string | null;
  onApplySlot: (slot: AvailableSlot) => void;
}) {
  const groups = groupSlotsByDay(slots, days);
  if (groups.length === 0) {
    return <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">{emptyLabel}</p>;
  }

  return (
    <section aria-label="Valid placements">
      {groups.map(([day, daySlots]) => (
        <div key={day} className="mt-2 first:mt-0">
          <p className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-1 text-[11px] font-black uppercase tracking-wider text-[#4e0a10] backdrop-blur">
            {day} <span className="text-slate-400">({daySlots.length})</span>
          </p>
          <ul className="mt-1 space-y-1">
            {daySlots.map((slot) => (
              <li key={`${slot.day}-${slot.start_slot}-${slotRoomKey(slot)}`}>
                <button
                  type="button"
                  onClick={() => onApplySlot(slot)}
                  disabled={forcedDayName !== null && slot.day !== forcedDayName}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                    {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
                  </span>
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

/**
 * Start times a same-time split could move to as a whole. Its two days are
 * fixed by the Split pattern, so Best Match ranks the shared free starts and
 * the Weekdays and Weekend tabs list them when the pattern's days fall there.
 */
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
  starts: { startSlot: number; endSlot: number }[];
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
      <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
        Both meetings share one start time, so these are the times free on
        {" "}<b>{days[0]}</b> and <b>{days[1]}</b> for the rooms and deliveries you picked. The split is kept.
      </p>
      {shown === null ? (
        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
          This split meets on {days[0]} and {days[1]}. Change the Split pattern to see {view === "weekdays" ? "weekday" : "weekend"} times.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
          No time is free on both days for this pair. Change a room or a delivery.
        </p>
      ) : (
        <ul className="space-y-1">
          {shown.map(({ startSlot, endSlot }, index) => (
            <li key={`pair-${startSlot}`}>
              <button
                type="button"
                onClick={() => onApply(startSlot)}
                disabled={startSlot === currentStartSlot}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50/50"
              >
                <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                  {slotToTimeStr(startSlot)} – {slotToTimeStr(endSlot)}
                </span>
                {view === "best" && index === 0 && (
                  <span className="rounded-full bg-[#c9952a]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a4c08]">Best match</span>
                )}
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

/**
 * Narrows the Weekdays and Weekend lists by room. A select for the long list
 * of rooms, and chips for picking one at a glance when there are a few.
 */
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
  const chipClass = (isActive: boolean) => `inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
    isActive ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
  }`;
  const countClass = (isActive: boolean) => `rounded-full px-1 ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-700"}`;

  return (
    <div className="mb-3">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <select
          aria-label="Filter placements by room"
          value={roomFilter}
          onChange={(event) => onRoomFilterChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-xs font-bold text-slate-800 shadow-sm focus:border-[#4e0a10] focus:outline-none focus:ring-2 focus:ring-[#4e0a10]/10"
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

      {availableSlotRooms.length > 1 && (
        <ul className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <li>
            <button type="button" onClick={() => onRoomFilterChange(ALL_ROOMS)} className={chipClass(roomFilter === ALL_ROOMS)}>
              All
              <span className={countClass(roomFilter === ALL_ROOMS)}>{availableSlots.length}</span>
            </button>
          </li>
          {availableSlotRooms.map((room) => {
            const value = slotRoomKey(room);
            const isActive = roomFilter === value;

            return (
              <li key={`badge-${value}`}>
                <button type="button" onClick={() => onRoomFilterChange(value)} className={chipClass(isActive)}>
                  {room.room_code}
                  <span className={countClass(isActive)}>{room.slot_count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
