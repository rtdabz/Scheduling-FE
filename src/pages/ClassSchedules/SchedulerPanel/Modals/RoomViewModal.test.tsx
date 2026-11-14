import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RoomViewModal from "./RoomViewModal";
import type { Department, Room, ScheduleItem } from "../types";
import { resetTimeGrid } from "../../../../lib/timeGrid";

const department: Department = {
  id: 1,
  department_name: "College of Computer Studies",
  department_code: "CCS",
};

const room: Room = {
  id: "10",
  name: "NEE 201",
  roomType: "lecture",
  capacity: 40,
  status: "available",
  departmentId: 1,
} as Room;

/**
 * A meeting as the scheduler carries it: slot offsets plus 12-hour *display*
 * labels. The timeline parses "HH:MM", so the adapter must not hand it these.
 */
const schedule = (overrides: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: "501",
  semesterId: 1,
  departmentId: 1,
  courseId: "7",
  courseCode: "CC 101",
  courseName: "Introduction to Computing",
  courseType: "major",
  lectureUnits: 3,
  laboratoryUnits: 0,
  totalUnits: 3,
  sectionName: "BSIT 1-A",
  roomName: "NEE 201",
  day: "Monday",
  startTime: "8 AM",
  endTime: "10 AM",
  mode: "on-site",
  facultyName: "Juan Dela Cruz",
  facultyId: "22",
  status: "approved",
  dayIndex: 0,
  startSlot: 2,
  durationSlots: 4,
  sectionId: "3",
  roomId: "10",
  ...overrides,
});

const renderModal = (schedules: ScheduleItem[]) =>
  render(
    <RoomViewModal
      rooms={[room]}
      isRoomViewOpen
      setIsRoomViewOpen={() => undefined}
      roomViewRoomId="10"
      setRoomViewRoomId={() => undefined}
      schedules={schedules}
      departments={[department]}
    />,
  );

describe("RoomViewModal Gantt view", () => {
  afterEach(() => {
    cleanup();
    resetTimeGrid();
  });

  it("draws a block for each booking in the room", () => {
    renderModal([schedule()]);

    expect(document.querySelectorAll("[data-schedule-id]")).toHaveLength(1);
  });

  it("converts the scheduler's display labels into times the timeline can parse", () => {
    renderModal([schedule()]);

    // Slots 2-6 on a 7:00 grid with 30-minute slots: 8:00 AM - 10:00 AM.
    const block = screen.getByRole("button", { name: /CC 101 lecture/ });
    expect(block.getAttribute("aria-label")).toContain("8:00 AM – 10:00 AM");
    expect(block.getAttribute("aria-label")).not.toMatch(/NaN/);
  });

  it("carries the section, room and instructor through to the block", () => {
    renderModal([schedule()]);

    const block = screen.getByRole("button", { name: /CC 101 lecture/ });
    expect(block.getAttribute("aria-label")).toContain("BSIT 1-A");
    expect(block.getAttribute("aria-label")).toContain("NEE 201");
    expect(block.getAttribute("aria-label")).toContain("Juan Dela Cruz");
  });

  it("marks draft bookings that share the room and hour as an overlap", () => {
    renderModal([
      schedule({ status: "draft" }),
      schedule({ id: "502", status: "submitted", sectionId: "4", sectionName: "BSIT 1-B", facultyId: "23", facultyName: "Maria Santos" }),
    ]);

    const blocks = screen.getAllByRole("button", { name: /CC 101 lecture/ });
    expect(blocks).toHaveLength(2);
    blocks.forEach((block) => {
      expect(block.getAttribute("aria-label")).toContain("Overlaps 1 class on room");
    });
    expect(screen.getByRole("status").textContent).toContain("2 classes have overlaps in this room.");
    fireEvent.click(blocks[0]);
    expect(screen.getByText("Overlapping classes (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /CC 101.*BSIT 1-B.*Same room/ })).toBeTruthy();
  });

  it("shows approved, unapproved and unsaved schedules only for the selected room", () => {
    renderModal([
      schedule(),
      schedule({ id: "temp-abc", status: "draft", sectionId: "4", sectionName: "BSIT 1-B", dayIndex: 2 }),
      schedule({ id: "502", status: "approved_by_dean" }),
      schedule({ id: "503", status: "submitted" }),
      schedule({ id: "504", status: "rejected" }),
      schedule({ id: "505", roomId: "11" }),
    ]);

    const ids = [...document.querySelectorAll("[data-schedule-id]")].map((node) =>
      node.getAttribute("data-schedule-id"),
    );
    expect(ids).toHaveLength(5);
    expect(ids).toEqual(expect.arrayContaining(["501", "502", "503", "504"]));
    expect(ids).not.toContain("505");
    expect(screen.getByText("5 classes booked")).toBeTruthy();
  });

  it("shows draft meetings without claiming they have VPAA approval", () => {
    renderModal([schedule({ status: "draft" })]);
    expect(document.querySelectorAll("[data-schedule-id]")).toHaveLength(1);
    expect(screen.getByText("1 class booked")).toBeTruthy();
    expect(screen.getByText("No overlapping classes in this room.")).toBeTruthy();
    expect(screen.queryByText(/No VPAA-approved classes/)).toBeNull();
  });

  it("opens draft class details and lists its other draft meetings", () => {
    renderModal([
      schedule({ status: "draft" }),
      schedule({ id: "502", status: "draft", dayIndex: 2 }),
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: /CC 101 lecture/ })[0]);
    expect(screen.getByRole("dialog", { name: "Class Schedule Details" })).toBeTruthy();
    expect(screen.getByText("Weekly meetings of this lecture")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Wed 8:00 AM/ }));
    expect(screen.getByText(/Wednesday, 8:00 AM/)).toBeTruthy();
  });

  it("shows an empty state when the selected room has no schedules", () => {
    renderModal([schedule({ roomId: "11" })]);
    expect(document.querySelectorAll("[data-schedule-id]")).toHaveLength(0);
    expect(screen.getByText("No classes are scheduled in this room this week.")).toBeTruthy();
  });
});
