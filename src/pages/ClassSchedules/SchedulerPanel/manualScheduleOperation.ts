import { parsePreferredPattern } from "../../../lib/timeGrid";
import type { DeliveryMode, ScheduleStatus } from "./types";

export const resolveManualOperationStatus = (
  existingStatus: ScheduleStatus | null | undefined,
): ScheduleStatus => existingStatus ?? "draft";

interface ManualRoomMeeting {
  mode: DeliveryMode;
  roomId: string;
  duration: number;
  isLaboratory: boolean;
}

export const validateManualMeetingRooms = (
  first: ManualRoomMeeting,
  second: ManualRoomMeeting,
  preferredPattern: string | null,
  isRun: boolean,
): string | null => {
  // A single meeting or consecutive run can retain unused second-meeting state.
  const meetings = !isRun && parsePreferredPattern(preferredPattern) && second.duration > 0
    ? [first, second]
    : [first];
  const onSiteMeetings = meetings.filter(meeting => meeting.mode === "on-site");
  if (onSiteMeetings.some(meeting => meeting.roomId === "tba" && !meeting.isLaboratory)) {
    return "Room TBA is allowed only for a laboratory meeting.";
  }
  if (onSiteMeetings.some(meeting => !meeting.roomId)) {
    return "Please select a room for every on-site meeting.";
  }
  return null;
};
