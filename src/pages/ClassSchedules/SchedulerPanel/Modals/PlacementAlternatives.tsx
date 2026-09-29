import { useState } from "react";
import { AlertTriangle, ChevronDown, Lightbulb, List, MapPin, Monitor, Sparkles, TreePine } from "lucide-react";
import { DAYS, slotToTimeStr } from "../constants";
import { timeToSlot } from "../../../../lib/timeGrid";
import RecommendedOptionList from "../components/RecommendedOptionList";
import type { DeliveryMode, Room } from "../types";
import {
  ALL_ROOMS,
  DELIVERY_SHORT_LABEL,
  getRecommendationRoomLabel,
  isSameTimePairRecommendation,
  slotRoomKey,
  type AvailableSlot,
  type AvailableSlotRoom,
  type ConfigurationConfirmation,
  type ConfigurationConfirmationPrompt,
  type DropRecommendation,
} from "./placementAlternativesModel";

export interface PlacementAlternativesProps {
  rooms: Room[];
  /** Generator picks, best first. */
  recommendations: DropRecommendation[];
  /** True while the picks on screen do not belong to the current form yet. */
  arePicksLoading: boolean;
  recommendationError: string | null;
  confirmationPrompt: ConfigurationConfirmationPrompt | null;
  onConfirmConfiguration: (confirmation: ConfigurationConfirmation) => void;
  appliedRecommendationRank: number | null;
  isApplyingRecommendation: boolean;
  missesForcedDay: (recommendation: DropRecommendation) => boolean;
  forcedDayName: string | null;
  onApplyRecommendation: (recommendation: DropRecommendation) => void;

  availableSlots: AvailableSlot[];
  availableSlotRooms: AvailableSlotRoom[];
  visibleSlots: AvailableSlot[];
  slotsByDay: [string, AvailableSlot[]][];
  isSlotsLoading: boolean;
  areSlotsTruncated: boolean;
  roomFilter: string;
  onRoomFilterChange: (value: string) => void;
  onApplySlot: (slot: AvailableSlot) => void;

  /** A same-time split's shared free starts, or null for any other shape. */
  splitPairStarts: { startSlot: number; endSlot: number }[] | null;
  onApplySplitPairStart: (startSlot: number) => void;
  firstDayIndex: number;
  secondDayIndex: number;
  firstMode: DeliveryMode;
  secondMode: DeliveryMode;

  /** An Integrated pair answers for one meeting at a time. */
  showsMeetingSwitch: boolean;
  slotMeeting: "first" | "second";
  onSlotMeetingChange: (meeting: "first" | "second") => void;
  firstMeetingTitle: string;
  secondMeetingTitle: string;
}

/**
 * The placement dialog's alternatives: the generator's ranked picks first,
 * then -- one click away -- every placement the Rule Engine accepts.
 *
 * The full list runs to dozens of slots, so it opens on its own only when
 * there are no picks to lead with. With picks, the best few are what the
 * user reads first and the week is behind "Show all".
 */
export default function PlacementAlternatives({
  rooms,
  recommendations,
  arePicksLoading,
  recommendationError,
  confirmationPrompt,
  onConfirmConfiguration,
  appliedRecommendationRank,
  isApplyingRecommendation,
  missesForcedDay,
  forcedDayName,
  onApplyRecommendation,
  availableSlots,
  availableSlotRooms,
  visibleSlots,
  slotsByDay,
  isSlotsLoading,
  areSlotsTruncated,
  roomFilter,
  onRoomFilterChange,
  onApplySlot,
  splitPairStarts,
  onApplySplitPairStart,
  firstDayIndex,
  secondDayIndex,
  firstMode,
  secondMode,
  showsMeetingSwitch,
  slotMeeting,
  onSlotMeetingChange,
  firstMeetingTitle,
  secondMeetingTitle,
}: PlacementAlternativesProps) {
  const [isFullListOpen, setIsFullListOpen] = useState(false);
  const hasPicks = !arePicksLoading && !recommendationError && recommendations.length > 0;
  const hasFullList = !recommendationError && (isSlotsLoading || availableSlots.length > 0);
  const fullListCount = (splitPairStarts ?? visibleSlots).length;
  const showFullList = hasFullList && (isFullListOpen || !hasPicks);

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
              Conflict-free options, best first. Every placement the Rule Engine accepts is under Show all.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {arePicksLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`recommendation-skeleton-${index}`} className="animate-pulse rounded-xl border border-slate-200 p-3">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="mt-3 h-10 w-full rounded-lg bg-slate-100" />
                <div className="mt-3 h-9 w-full rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>
        ) : recommendationError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm leading-5 text-amber-900">{recommendationError}</p>
            </div>
            {confirmationPrompt?.configuration_fingerprint && (
              <button
                type="button"
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#7a4c08] px-3 text-xs font-bold text-white transition-colors hover:bg-[#633d06] disabled:opacity-60"
                onClick={() => onConfirmConfiguration({
                  schema_version: 1,
                  configuration_fingerprint: confirmationPrompt.configuration_fingerprint as string,
                  confirmed_warning_rule_ids: confirmationPrompt.required_warning_rule_ids ?? [],
                })}
              >
                Confirm and continue
              </button>
            )}
          </div>
        ) : recommendations.length === 0 && visibleSlots.length === 0 && !isSlotsLoading ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <Sparkles className="h-5 w-5 text-slate-400" />
            </span>
            <p className="text-sm font-bold text-slate-700">No alternatives found</p>
            <p className="mt-0.5 text-xs text-slate-500">Try another class mode or scheduling option.</p>
          </div>
        ) : hasPicks ? (
          <section>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Recommended</p>
            <RecommendedOptionList
              label="Generator picks"
              applyLabel="Use this option"
              isBusy={isApplyingRecommendation}
              items={recommendations.map((recommendation, index) => {
                const isApplied = appliedRecommendationRank === recommendation.rank;

                return {
                  key: String(recommendation.rank),
                  isApplied,
                  disabledLabel: !isApplied && missesForcedDay(recommendation)
                    ? `Not on ${forcedDayName} (Force Day)`
                    : null,
                  tag: index === 0
                    ? <span className="rounded-full bg-[#c9952a]/15 px-2 py-0.5 text-[10px] font-bold text-[#7a4c08]">Best match</span>
                    : null,
                  body: <RecommendationRows recommendation={recommendation} rooms={rooms} />,
                };
              })}
              onApply={(key) => {
                const chosen = recommendations.find((recommendation) => String(recommendation.rank) === key);
                if (chosen) onApplyRecommendation(chosen);
              }}
            />
          </section>
        ) : null}

        {hasFullList && !showFullList && (
          <button
            type="button"
            onClick={() => setIsFullListOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:border-[#4e0a10] hover:text-[#4e0a10]"
          >
            <List className="h-3.5 w-3.5" />
            {isSlotsLoading
              ? "Show all valid placements"
              : `Show all ${fullListCount} valid ${splitPairStarts === null ? "placement" : "split time"}${fullListCount === 1 ? "" : "s"}`}
          </button>
        )}

        {/*
          Every placement the Rule Engine accepts, not just the handful the
          solver ranked. The counts come from the same pass that built the
          list, so a room's badge and its slots can never disagree.
        */}
        {showFullList && (
          <div className={hasPicks ? "border-t border-slate-200 pt-3" : ""}>
          {/*
            A split pair's rooms come from its two meetings, so filtering the
            list by room would not mean anything for it. The filter sits above
            the list rather than in it: it names rooms, not placements.
          */}
          {splitPairStarts === null && (
            <RoomFilter
              availableSlots={availableSlots}
              availableSlotRooms={availableSlotRooms}
              roomFilter={roomFilter}
              onRoomFilterChange={onRoomFilterChange}
            />
          )}
          <section aria-label="All valid placements">

            {/*
              An Integrated pair's halves have different lengths and different
              legal deliveries, so the list answers for one of them at a time
              and says which.
            */}
            {showsMeetingSwitch && splitPairStarts === null && (
              <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-0.5">
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

            <div className="sticky top-0 z-20 -mt-1 mb-2 flex items-baseline justify-between gap-2 bg-white/95 pb-1.5 pt-1 backdrop-blur">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                {splitPairStarts === null ? "All valid placements" : "Valid split times"}
              </p>
              <span className="text-[11px] font-bold text-slate-400">
                {isSlotsLoading ? "Checking…" : `${fullListCount} slot${fullListCount === 1 ? "" : "s"}`}
              </span>
            </div>

            {areSlotsTruncated && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                Showing the first {availableSlots.length}. Pick a room above to narrow the list.
              </p>
            )}

            {splitPairStarts !== null ? (
              <>
                <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
                  Both meetings share one start time, so these are the times free on
                  {" "}<b>{DAYS[firstDayIndex]}</b> and <b>{DAYS[secondDayIndex]}</b> for the
                  rooms and deliveries you picked. The split is kept.
                </p>
                {splitPairStarts.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                    No time is free on both days for this pair. Change a room or a delivery above.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {splitPairStarts.map(({ startSlot, endSlot }) => (
                      <li key={`pair-${startSlot}`}>
                        <button
                          type="button"
                          onClick={() => onApplySplitPairStart(startSlot)}
                          disabled={isApplyingRecommendation}
                          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:bg-slate-50"
                        >
                          <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                            {slotToTimeStr(startSlot)} – {slotToTimeStr(endSlot)}
                          </span>
                          <span className="shrink-0 text-[11px] font-bold text-[#7a4c08]">
                            {DELIVERY_SHORT_LABEL[firstMode]} | {DELIVERY_SHORT_LABEL[secondMode]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : slotsByDay.map(([day, daySlots]) => (
              <div key={day} className="mt-3">
                {/* top-7 clears the section header, which sticks above it. */}
                <p className="sticky top-7 z-10 -mx-1 bg-white/95 px-1 py-1 text-[11px] font-black uppercase tracking-wider text-[#4e0a10] backdrop-blur">
                  {day} <span className="text-slate-400">({daySlots.length})</span>
                </p>
                <ul className="mt-1 space-y-1">
                  {daySlots.map((slot) => (
                    <li key={`${slot.day}-${slot.start_slot}-${slotRoomKey(slot)}`}>
                      <button
                        type="button"
                        onClick={() => onApplySlot(slot)}
                        disabled={isApplyingRecommendation || (forcedDayName !== null && slot.day !== forcedDayName)}
                        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#4e0a10] hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">
                          {slotToTimeStr(slot.start_slot)} – {slotToTimeStr(slot.end_slot)}
                        </span>
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
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {!isSlotsLoading && visibleSlots.length === 0 && availableSlots.length > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                That room has no free slot for this meeting. Choose another room above.
              </p>
            )}
          </section>
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * One pick's meetings. A split that keeps one start time reads as one line --
 * the time, the two days and the two deliveries -- because listed as separate
 * rows it was not obvious the pair was still a split, or which half was online.
 */
function RecommendationRows({ recommendation, rooms }: { recommendation: DropRecommendation; rooms: Room[] }) {
  if (isSameTimePairRecommendation(recommendation)) {
    return (
      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-center text-[10px] font-black uppercase text-[#4e0a10]">
            {recommendation.schedules.map((row) => row.day.slice(0, 1)).join("")}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
            {slotToTimeStr(timeToSlot(recommendation.schedules[0].start_time))} – {slotToTimeStr(timeToSlot(recommendation.schedules[0].end_time))}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-[#7a4c08]">
            {recommendation.schedules.map((row) => DELIVERY_SHORT_LABEL[row.mode]).join(" | ")}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 truncate pl-16 text-[11px] text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" />
          {recommendation.schedules.map((row) => getRecommendationRoomLabel(row, rooms)).join(" · ")}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {recommendation.schedules.map((row, rowIndex) => (
        <li
          key={`${row.day}-${row.start_time}-${rowIndex}`}
          className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
        >
          <span className="w-8 shrink-0 text-center text-[10px] font-black uppercase text-[#4e0a10]">
            {row.day.slice(0, 3)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
            {slotToTimeStr(timeToSlot(row.start_time))} – {slotToTimeStr(timeToSlot(row.end_time))}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {getRecommendationRoomLabel(row, rooms)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Narrows the full list by room. A select for the long list of rooms, and
 * chips for picking one at a glance when there are a few.
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
