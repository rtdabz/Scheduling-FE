import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScheduleCard from "./ScheduleCard";
import type { ScheduleItem, Subject } from "../types";

const subject: Subject = {
  id: "1",
  code: "IT 101",
  name: "Introduction to Computing",
  units: 3,
  lectureHours: 2,
  labHours: 1,
  category: "major",
  semester: "1st",
  departmentId: 1,
  yearLevel: 1,
  roomTypeRequired: "laboratory",
  status: "active",
};

const schedule = (meetingType: ScheduleItem["meetingType"], mode: ScheduleItem["mode"]): ScheduleItem => ({
  id: meetingType ?? "meeting",
  termId: 1,
  departmentId: 1,
  courseId: "1",
  courseCode: subject.code,
  courseName: subject.name,
  courseType: "major",
  lectureUnits: 2,
  laboratoryUnits: 1,
  totalUnits: 3,
  sectionName: "BSIT 1A",
  roomName: mode === "online" ? "Online" : "CompLab1",
  day: meetingType === "lecture" ? "Monday" : "Thursday",
  startTime: "3 PM",
  endTime: "5 PM",
  mode,
  facultyName: null,
  facultyId: null,
  status: "draft",
  dayIndex: meetingType === "lecture" ? 0 : 3,
  startSlot: 16,
  durationSlots: 4,
  sectionId: "1",
  roomId: mode === "online" ? "online" : "10",
  isHybrid: true,
  meetingType,
});

const commonProps = {
  rooms: [],
  subject,
  conflict: null,
  isEditable: false,
  isPhase2Active: false,
  currentStatus: "draft" as const,
  draggedScheduleId: null,
  isMoving: false,
  deleteConfirmScheduleId: null,
  setDeleteConfirmScheduleId: () => undefined,
  onDragStart: () => undefined,
  onDragEnd: () => undefined,
  onDelete: () => undefined,
  onCardClick: () => undefined,
};

describe("ScheduleCard Hybrid component labels", () => {
  it("labels the Hybrid lecture as Online and laboratory as On-Site LAB", () => {
    const { rerender } = render(
      <ScheduleCard {...commonProps} schedule={schedule("lecture", "online")} />
    );
    const onlineLabels = screen.getAllByText("Online");
    expect(onlineLabels.length).toBeGreaterThan(0);
    expect(onlineLabels.some((label) => label.className.includes("bg-emerald-50"))).toBe(true);
    expect(screen.queryByText("Online LEC")).toBeNull();
    expect(screen.queryByText("Hybrid LEC")).toBeNull();

    rerender(<ScheduleCard {...commonProps} schedule={schedule("laboratory", "on-site")} />);
    const laboratoryLabels = screen.getAllByText("On-Site LAB");
    expect(laboratoryLabels.length).toBeGreaterThan(0);
    expect(laboratoryLabels.some((label) => label.className.includes("bg-blue-50"))).toBe(true);
    expect(screen.queryByText("Hybrid LAB")).toBeNull();
  });
});
