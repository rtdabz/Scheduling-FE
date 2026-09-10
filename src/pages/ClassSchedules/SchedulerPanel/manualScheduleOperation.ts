import type { ScheduleStatus } from "./types";

export const resolveManualOperationStatus = (
  existingStatus: ScheduleStatus | null | undefined,
): ScheduleStatus => existingStatus ?? "draft";
