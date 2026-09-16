import { cleanup, render, screen } from "@testing-library/react";
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
  status: "draft",
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

  it("marks two bookings that share the room and hour as an overlap", () => {
    renderModal([
      schedule(),
      schedule({ id: "502", sectionId: "4", sectionName: "BSIT 1-B", facultyId: "23", facultyName: "Maria Santos" }),
    ]);

    const blocks = screen.getAllByRole("button", { name: /CC 101 lecture/ });
    expect(blocks).toHaveLength(2);
    blocks.forEach((block) => {
      expect(block.getAttribute("aria-label")).toMatch(/room/i);
    });
  });

  it("keeps unsaved rows off the ids of real schedules", () => {
    renderModal([schedule(), schedule({ id: "temp-abc", sectionId: "4", sectionName: "BSIT 1-B", dayIndex: 2 })]);

    const ids = [...document.querySelectorAll("[data-schedule-id]")].map((node) =>
      node.getAttribute("data-schedule-id"),
    );
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("501");
  });
});
