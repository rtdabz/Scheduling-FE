import type { DeliveryMode, Room, ScheduleItem } from "./types";
import { DAYS, slotToTimeStr } from "./constants";
import { slotsToHours } from "./courseSlotPlan";
import { roomGrantFits } from "../../../lib/roomRequests";
import { slotCount, timeToSlotUnclamped } from "../../../lib/timeGrid";

/**
 * Advisory notes for a manual placement, mirroring the soft penalties the
 * Schedule Generator optimises in `ScheduleQualityEvaluator`.
 *
 * The generator never offers these placements when a better one exists, but a
 * placement made by hand only ever met the hard rules: the dialog said "Ready
 * to place" for a class that stranded the section with a three-hour gap or
 * pushed it onto Saturday while weekdays were free. None of these notes block
 * the placement; they explain what the generator would have preferred.
 */

export interface PlannedMeeting {
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  mode: DeliveryMode;
  /** Room id, "online", "field", "tba" or "". */
  roomId: string;
  meetingType?: "lecture" | "laboratory" | null;
}

export interface PlacementQualityNote {
  id:
    | "awkward_gap"
    | "idle_gap"
    | "weekend_day"
    | "late_weekday_start"
    | "extra_day"
    | "online_with_free_room"
    | "laboratory_room_unresolved"
    | "laboratory_room_mismatch";
  tone: "info" | "warning";
  message: string;
}

export interface PlacementQualityInput {
  meetings: PlannedMeeting[];
  /** The section's other classes, without the course being placed. */
  sectionSchedules: ScheduleItem[];
  /** Every loaded class, to tell whether a physical room is free. */
  allSchedules: ScheduleItem[];
  rooms: Room[];
  sectionName: string;
  /** A Hybrid lecture is online by definition, so it is never flagged as avoidable. */
  isHybrid: boolean;
  /** A Force Day placement is exempt from the weekend and late-start preferences. */
  isForcedDay: boolean;
}

/** `ScheduleQualityEvaluator::LATE_WEEKDAY_START_AFTER_MINUTES`. */
const LATE_WEEKDAY_START_TIME = "13:00";
/** `ScheduleQualityEvaluator::CLASSROOM_MIN_SCHEDULABLE_GAP_SLOTS`: a gap under 1.5 hours cannot hold a class. */
const MIN_SCHEDULABLE_GAP_SLOTS = 3;
/** Gaps of three hours or more are idle time the generator works hardest to avoid. */
const LONG_IDLE_GAP_SLOTS = 6;
const SATURDAY_INDEX = 5;
const SUNDAY_INDEX = 6;

const overlaps = (aStart: number, aDuration: number, bStart: number, bDuration: number): boolean =>
  aStart < bStart + bDuration && bStart < aStart + aDuration;

const hoursLabel = (slots: number): string => {
  const hours = slotsToHours(slots);
  return hours === 1 ? "1 hour" : `${hours} hours`;
};

export const evaluatePlacementQuality = ({
  meetings,
  sectionSchedules,
  allSchedules,
  rooms,
  sectionName,
  isHybrid,
  isForcedDay,
}: PlacementQualityInput): PlacementQualityNote[] => {
  const notes: PlacementQualityNote[] = [];
  const seen = new Set<string>();
  const add = (note: PlacementQualityNote) => {
    if (seen.has(note.id)) return;
    seen.add(note.id);
    notes.push(note);
  };

  const existingDays = new Set(sectionSchedules.map((item) => item.dayIndex));
  // `sectionDaySpreadPenalty`: only days beyond what the section's total hours
  // need count, so a full load spread over five days is not flagged.
  const plannedDays = new Set([...existingDays, ...meetings.map((meeting) => meeting.dayIndex)]);
  const totalSlots = sectionSchedules.reduce((sum, item) => sum + item.durationSlots, 0)
    + meetings.reduce((sum, meeting) => sum + meeting.durationSlots, 0);
  const minimumDays = Math.max(1, Math.ceil(totalSlots / Math.max(1, slotCount())));
  const addsExtraDay = plannedDays.size > existingDays.size && plannedDays.size > minimumDays;
  // Resolved per call: the grid's opening time is configured after import.
  const lateWeekdayStartSlot = timeToSlotUnclamped(LATE_WEEKDAY_START_TIME);

  meetings.forEach((meeting) => {
    const dayName = DAYS[meeting.dayIndex] ?? "that day";

    // Gaps the meeting opens next to the section's other classes that day.
    const dayBlocks = [
      ...sectionSchedules
        .filter((item) => item.dayIndex === meeting.dayIndex)
        .map((item) => ({ start: item.startSlot, end: item.startSlot + item.durationSlots, candidate: false })),
      { start: meeting.startSlot, end: meeting.startSlot + meeting.durationSlots, candidate: true },
    ].sort((left, right) => left.start - right.start);

    for (let index = 1; index < dayBlocks.length; index += 1) {
      const previous = dayBlocks[index - 1];
      const current = dayBlocks[index];
      if (!previous.candidate && !current.candidate) continue;
      const gap = current.start - previous.end;
      if (gap <= 0) continue;
      if (gap < MIN_SCHEDULABLE_GAP_SLOTS) {
        add({
          id: "awkward_gap",
          tone: "info",
          message: `Leaves a ${hoursLabel(gap)} break on ${dayName} that is too short to hold another class.`,
        });
      } else if (gap >= LONG_IDLE_GAP_SLOTS) {
        add({
          id: "idle_gap",
          tone: "warning",
          message: `Leaves ${sectionName} idle for ${hoursLabel(gap)} on ${dayName}. The generator keeps a section's classes close together.`,
        });
      }
    }

    if (!isForcedDay && (meeting.dayIndex === SATURDAY_INDEX || meeting.dayIndex === SUNDAY_INDEX)) {
      add({
        id: "weekend_day",
        tone: meeting.dayIndex === SUNDAY_INDEX ? "warning" : "info",
        message: `${dayName} is a fallback day for the generator; it places classes Monday to Friday first.`,
      });
    }

    if (!isForcedDay && meeting.dayIndex < SATURDAY_INDEX && meeting.startSlot > lateWeekdayStartSlot) {
      add({
        id: "late_weekday_start",
        tone: "info",
        message: `Starts at ${slotToTimeStr(meeting.startSlot)}. The generator prefers weekday classes that start by 1:00 PM.`,
      });
    }

    if (addsExtraDay && existingDays.size > 0 && !existingDays.has(meeting.dayIndex)) {
      add({
        id: "extra_day",
        tone: "info",
        message: `Adds ${dayName} as another class day for ${sectionName} (now ${plannedDays.size} days). The generator fits a section into as few days as it can.`,
      });
    }

    if (meeting.mode === "online" && !(isHybrid && meeting.meetingType === "lecture")) {
      const freeRoom = rooms.find((room) =>
        (room.roomType === "lecture" || room.roomType === "laboratory")
        && (room.status === "available" || !room.status)
        && roomGrantFits(room, meeting.dayIndex, meeting.startSlot, meeting.durationSlots)
        && !allSchedules.some((item) =>
          String(item.roomId) === String(room.id)
          && item.dayIndex === meeting.dayIndex
          && overlaps(item.startSlot, item.durationSlots, meeting.startSlot, meeting.durationSlots))
      );
      if (freeRoom) {
        add({
          id: "online_with_free_room",
          tone: "info",
          message: `${freeRoom.name} is free at this time. The generator prefers on-site delivery when a room is available.`,
        });
      }
    }

    if (meeting.meetingType === "laboratory" && meeting.mode === "on-site") {
      if (meeting.roomId === "tba" || meeting.roomId === "") {
        add({
          id: "laboratory_room_unresolved",
          tone: "warning",
          message: "The laboratory meeting has no room yet (Room TBA). Assign a laboratory room before submitting.",
        });
      } else {
        const room = rooms.find((item) => String(item.id) === String(meeting.roomId));
        if (room && room.roomType !== "laboratory") {
          add({
            id: "laboratory_room_mismatch",
            tone: "warning",
            message: `${room.name} is not a laboratory. The generator only uses a lecture room for a laboratory when no lab is free.`,
          });
        }
      }
    }
  });

  return notes;
};
