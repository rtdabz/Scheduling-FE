/**
 * One wording for every scheduling conflict a user sees; mirrors the server's ConflictMessage.
 *
 * Shape: "<What> is unavailable on <Day> <requested time>. <Who holds it, with what, when>. <What to do>."
 * Example: "Room BA 201 is unavailable on Mon 07:00–10:00. It is booked by CIT for PATH FIT 2 (BSIT 1I)
 * from 07:00–09:00. Please choose another time or room."
 */

const DASH = "–";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The existing class that holds the room, instructor or section. */
export interface ConflictBooking {
  department?: string | null;
  course?: string | null;
  section?: string | null;
  start: string;
  end: string;
}

/** The time the user asked for. */
export interface RequestedSlot {
  day: string;
  start: string;
  end: string;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/** "Monday" -> "Mon"; anything else passes through. */
export const conflictDay = (day: string): string => (DAYS.includes(day.trim()) ? day.trim().slice(0, 3) : day.trim());

/** "7:00", "07:00:00" -> "07:00". */
export const conflictTime = (time: string): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : time.trim();
};

const window = (start: string, end: string): string => `${conflictTime(start)}${DASH}${conflictTime(end)}`;
const slot = ({ day, start, end }: RequestedSlot): string => `${conflictDay(day)} ${window(start, end)}`;
const subject = (noun: string, name: string | null | undefined, fallback: string): string => {
  const value = text(name);
  return value === null ? fallback : `${noun} ${value}`;
};
const classLabel = (booking: ConflictBooking): string => {
  const course = text(booking.course) ?? "another class";
  const section = text(booking.section);
  return section === null ? course : `${course} (${section})`;
};

export const roomConflictMessage = (room: string | null | undefined, requested: RequestedSlot, booking: ConflictBooking): string => {
  const department = text(booking.department);
  return `${subject("Room", room, "The selected room")} is unavailable on ${slot(requested)}. `
    + `It is booked${department === null ? "" : ` by ${department}`} for ${classLabel(booking)} from ${window(booking.start, booking.end)}. `
    + "Please choose another time or room.";
};

export const instructorConflictMessage = (name: string | null | undefined, requested: RequestedSlot, booking: ConflictBooking): string => {
  const department = text(booking.department);
  return `${subject("Instructor", name, "The instructor")} is unavailable on ${slot(requested)}. `
    + `They are already teaching ${classLabel(booking)}${department === null ? "" : ` for ${department}`} from ${window(booking.start, booking.end)}. `
    + "Please choose another time or instructor.";
};

export const sectionConflictMessage = (section: string | null | undefined, requested: RequestedSlot, booking: ConflictBooking): string =>
  `${subject("Section", section, "This section")} is unavailable on ${slot(requested)}. `
  + `It already has ${text(booking.course) ?? "another class"} from ${window(booking.start, booking.end)}. `
  + "Please choose another time.";
