/**
 * Default LAB Room Requirement (institution_settings.lab_room_type): the rooms
 * every course's laboratory meetings may use. Mirrors
 * SchedulingPolicy::labRoomTypes on the server, which applies it to
 * generation and to every save check. Applied from `/initial-data`.
 */
export type LabRoomType = "laboratory" | "lecture" | "either";

export const LAB_ROOM_TYPE_OPTIONS: ReadonlyArray<{ value: LabRoomType; label: string }> = [
  { value: "laboratory", label: "Laboratory" },
  { value: "lecture", label: "Classroom" },
  { value: "either", label: "Either" },
];

let labRoomType: LabRoomType = "laboratory";

export const configureLabRoomType = (value: string | null | undefined): void => {
  labRoomType = value === "lecture" || value === "either" ? value : "laboratory";
};

export const currentLabRoomType = (): LabRoomType => labRoomType;

/** Physical room types a laboratory meeting may use, preferred first. */
export const labRoomTypes = (): string[] => {
  if (labRoomType === "lecture") return ["lecture"];
  if (labRoomType === "either") return ["laboratory", "lecture"];
  return ["laboratory"];
};

export const isLabMeetingRoomType = (roomType: string | null | undefined): boolean =>
  labRoomTypes().includes(String(roomType ?? ""));

/** Whether a room type satisfies a meeting's required room type. */
export const roomTypeSatisfies = (
  requiredRoomType: string | null | undefined,
  roomType: string | null | undefined,
): boolean => (requiredRoomType === "laboratory"
  ? isLabMeetingRoomType(roomType)
  : roomType === requiredRoomType);
