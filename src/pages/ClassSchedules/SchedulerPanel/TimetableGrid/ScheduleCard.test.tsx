import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  semesterId: 1,
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

  it("labels the face-to-face half of a Hybrid Split by its own mode, not Online", () => {
    const { rerender } = render(
      <ScheduleCard {...commonProps} schedule={schedule("lecture", "on-site")} />
    );
    expect(screen.getAllByText("On-Site LEC").length).toBeGreaterThan(0);
    expect(screen.queryByText("Online")).toBeNull();

    rerender(<ScheduleCard {...commonProps} schedule={schedule("lecture", "online")} />);
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
    expect(screen.queryByText("On-Site LEC")).toBeNull();
  });
});

describe("ScheduleCard selected-card tooltip", () => {
  it("shows Edit and Remove only on the selected card, with no remove icon on the card", () => {
    const onEdit = vi.fn();
    const setDeleteConfirmScheduleId = vi.fn();
    const onCardClick = vi.fn();
    const { rerender } = render(
      <ScheduleCard {...commonProps} isEditable schedule={schedule("lecture", "on-site")} onEdit={onEdit} />
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();

    rerender(
      <ScheduleCard
        {...commonProps}
        isEditable
        isMoving
        schedule={schedule("lecture", "on-site")}
        onEdit={onEdit}
        onCardClick={onCardClick}
        setDeleteConfirmScheduleId={setDeleteConfirmScheduleId}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove IT 101" }));
    expect(setDeleteConfirmScheduleId).toHaveBeenCalledWith("lecture");
    // Clicks inside the tooltip must not toggle the card's selection.
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("confirms the removal inside the tooltip", () => {
    const onDelete = vi.fn();
    render(
      <ScheduleCard
        {...commonProps}
        isEditable
        isMoving
        deleteConfirmScheduleId="lecture"
        schedule={schedule("lecture", "on-site")}
        onDelete={onDelete}
      />
    );
    expect(screen.getByText("Remove IT 101 from the timetable?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).toHaveBeenCalledWith("lecture");
  });
});
