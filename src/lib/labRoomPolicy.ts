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

/**
 * Room types a laboratory meeting may use. Mirrors SchedulingPolicy::labRoomTypes(): a laboratory
 * session always needs a laboratory room and stays Room TBA when none is free. The department's
 * legacy Classroom/Either value is still read but no longer widens this list.
 */
export const labRoomTypes = (): string[] => ["laboratory"];

export const isLabMeetingRoomType = (roomType: string | null | undefined): boolean =>
  labRoomTypes().includes(String(roomType ?? ""));

export const roomTypeSatisfies = (
  requiredRoomType: string | null | undefined,
  roomType: string | null | undefined,
): boolean => (requiredRoomType === "laboratory"
  ? isLabMeetingRoomType(roomType)
  : roomType === requiredRoomType);

export const NO_LABORATORY_UNITS_MESSAGE = "This course has no laboratory units. Please select a lecture room.";

/**
 * A Major course whose units are all lecture (LEC > 0, LAB = 0). Mirrors the backend's
 * SchedulingPolicy::isMajorWithoutLaboratoryUnits(): such a course meets in lecture rooms only,
 * whatever its stored room type, so laboratory rooms stay free for courses with laboratory units.
 */
export const isMajorWithoutLaboratoryUnits = (
  course: {
    category?: string | null;
    lectureHours?: number | string | null;
    labHours?: number | string | null;
    roomTypeRequired?: string | null;
  } | null | undefined,
): boolean =>
  course?.category === "major"
  && Number(course.lectureHours ?? 0) > 0
  && Number(course.labHours ?? 0) === 0
  && course.roomTypeRequired !== "field"
  && course.roomTypeRequired !== "online";
