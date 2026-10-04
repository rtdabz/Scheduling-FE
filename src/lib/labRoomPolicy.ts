export type LabRoomType = "laboratory" | "lecture" | "either";

export const LAB_ROOM_TYPE_OPTIONS: ReadonlyArray<{ value: LabRoomType; label: string }> = [
  { value: "laboratory", label: "Laboratory" },
  { value: "lecture", label: "Classroom" },
  { value: "either", label: "Either" },
];

let labRoomType: LabRoomType = "laboratory";

export const normalizeLabRoomType = (value: string | null | undefined): LabRoomType =>
  value === "lecture" || value === "either" ? value : "laboratory";

export const configureLabRoomType = (value: string | null | undefined): void => {
  labRoomType = normalizeLabRoomType(value);
};

export const currentLabRoomType = (): LabRoomType => labRoomType;

export const labRoomTypes = (): string[] => {
  if (labRoomType === "lecture") return ["lecture"];
  if (labRoomType === "either") return ["laboratory", "lecture"];
  return ["laboratory"];
};

export const isLabMeetingRoomType = (roomType: string | null | undefined): boolean =>
  labRoomTypes().includes(String(roomType ?? ""));

export const roomTypeSatisfies = (
  requiredRoomType: string | null | undefined,
  roomType: string | null | undefined,
): boolean => (requiredRoomType === "laboratory"
  ? isLabMeetingRoomType(roomType)
  : roomType === requiredRoomType);
