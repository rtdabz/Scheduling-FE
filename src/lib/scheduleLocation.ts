export type ScheduleLocationMode = "on-site" | "online" | "field" | string | null | undefined;

export function scheduleLocationLabel(
  mode: ScheduleLocationMode,
  roomCode?: string | null,
  roomType?: string | null,
): string {
  const normalizedMode = (mode ?? "").toLowerCase();
  const normalizedRoomType = (roomType ?? "").toLowerCase();
  const normalizedRoomCode = (roomCode ?? "").trim();

  if (normalizedMode === "online" || normalizedRoomType === "online" || normalizedRoomCode.toLowerCase() === "online") {
    return "Online";
  }

  if (normalizedMode === "field" || normalizedRoomType === "field" || normalizedRoomCode.toLowerCase() === "field") {
    return "Field";
  }

  return normalizedRoomCode || "Room TBA";
}
