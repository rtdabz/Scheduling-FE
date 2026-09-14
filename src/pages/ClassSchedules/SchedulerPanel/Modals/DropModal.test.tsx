import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DropModal from "./DropModal";
import api from "../../../../lib/api";
import type { DeliveryMode, ScheduleItem } from "../types";

vi.mock("../../../../lib/api", () => ({
  default: { post: vi.fn() },
}));

function HybridModalHarness({
  schedules = [],
  modalConflict = null,
  canGenerateSchedule = true,
  modalValidationError = "",
}: {
  schedules?: ScheduleItem[];
  modalConflict?: string | null;
  canGenerateSchedule?: boolean;
  modalValidationError?: string;
}) {
  const [modalRoomId, setModalRoomId] = useState("lecture-room");
  const [modalClassMode, setModalClassModeState] = useState<DeliveryMode>("on-site");
  const [modalDay2RoomId, setModalDay2RoomId] = useState("lab-room");
  const [modalDay2ClassMode, setModalDay2ClassMode] = useState<DeliveryMode>("on-site");
  const [modalIsHybrid, setModalIsHybrid] = useState(false);
  const [modalSplitEnabled, setModalSplitEnabled] = useState(false);
  const [modalFieldEnabled, setModalFieldEnabled] = useState(false);
  const [modalForceDayEnabled, setModalForceDayEnabled] = useState(false);
  const [modalForcedDayIndex, setModalForcedDayIndex] = useState(0);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<string | null>(null);
  const [modalDay1Index, setModalDay1Index] = useState(3);
  const [modalDay2Index, setModalDay2Index] = useState(4);
  const [modalDay1StartSlot, setModalDay1StartSlot] = useState(2);
  const [modalDay1Duration, setModalDay1Duration] = useState(6);
  const [modalDay2StartSlot, setModalDay2StartSlot] = useState(2);
  const [modalDay2Duration, setModalDay2Duration] = useState(0);

  const setModalClassMode = (mode: DeliveryMode) => {
    setModalClassModeState(mode);
    if (mode === "online") {
      setModalIsHybrid(false);
      setModalRoomId("online");
    }
  };

  return (
    <DropModal
      rooms={[
        { id: "lecture-room", name: "Lecture Room", departmentId: 1, roomType: "lecture", status: "available" },
        { id: "lab-room", name: "Laboratory Room", departmentId: 1, roomType: "laboratory", status: "available" },
        { id: "online-room", name: "Online", departmentId: 1, roomType: "online", status: "available" },
      ]}
      sections={[{ id: "1", name: "BSIT 1A", yearLevel: 1, semester: "1st", departmentId: 1, semesterId: 1, status: "active" }]}
      schedules={schedules}
      selectedSectionId="1"
      activeSemester={{ id: 1, academic_year: "2026-2027", semester: "1st", is_active: true }}
      dropContext={{ courseId: "1", subjectId: "1", dayIndex: 3, startSlot: 2, isRescheduling: false }}
      dropSubject={{
        id: "1",
        code: "IT 101",
        name: "Computing Fundamentals",
        units: 3,
        lectureHours: 2,
        labHours: 1,
        category: "major",
        semester: "1st",
        departmentId: 1,
        yearLevel: 1,
        roomTypeRequired: "laboratory",
        status: "active",
      }}
      dropSubjectIsField={false}
      modalRoomId={modalRoomId}
      setModalRoomId={setModalRoomId}
      modalClassMode={modalClassMode}
      setModalClassMode={setModalClassMode}
      modalDay2RoomId={modalDay2RoomId}
      setModalDay2RoomId={setModalDay2RoomId}
      modalDay2ClassMode={modalDay2ClassMode}
      setModalDay2ClassMode={setModalDay2ClassMode}
      modalIsHybrid={modalIsHybrid}
      setModalIsHybrid={setModalIsHybrid}
      modalSplitEnabled={modalSplitEnabled}
      setModalSplitEnabled={setModalSplitEnabled}
      modalFieldEnabled={modalFieldEnabled}
      setModalFieldEnabled={setModalFieldEnabled}
      modalForceDayEnabled={modalForceDayEnabled}
      setModalForceDayEnabled={setModalForceDayEnabled}
      modalForcedDayIndex={modalForcedDayIndex}
      setModalForcedDayIndex={setModalForcedDayIndex}
      canGenerateSchedule={canGenerateSchedule}
      manualSchedulingSettings={{ lecture_lab_schedule_override_enabled: true }}
      modalPreferredPattern={modalPreferredPattern}
      setModalPreferredPattern={setModalPreferredPattern}
      modalDay1Index={modalDay1Index}
      setModalDay1Index={setModalDay1Index}
      modalDay2Index={modalDay2Index}
      setModalDay2Index={setModalDay2Index}
      modalDay1StartSlot={modalDay1StartSlot}
      setModalDay1StartSlot={setModalDay1StartSlot}
      modalDay1Duration={modalDay1Duration}
      setModalDay1Duration={setModalDay1Duration}
      modalDay2StartSlot={modalDay2StartSlot}
      setModalDay2StartSlot={setModalDay2StartSlot}
      modalDay2Duration={modalDay2Duration}
      setModalDay2Duration={setModalDay2Duration}
      isDay2ModifiedByUser={false}
      setIsDay2ModifiedByUser={() => undefined}
      modalValidationError={modalValidationError}
      setModalValidationError={() => undefined}
      modalConflict={modalConflict}
      isModalLoading={false}
      selectedRecommendationId={null}
      setSelectedRecommendationId={() => undefined}
      setDropContext={() => undefined}
      handleModalConfirm={(event) => event.preventDefault()}
      checkConflict={() => null}
    />
  );
}

describe("DropModal Hybrid configuration", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { recommendations: [] } });
  });

  it("keeps Thursday as the laboratory day and adds the online lecture separately", () => {
    render(<HybridModalHarness />);

    expect(screen.queryByRole("heading", { name: "Laboratory Meeting" })).toBeNull();
    expect((screen.getByRole("button", { name: "Online" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Hybrid/i }));

    const laboratoryCard = screen.getByRole("heading", { name: "Laboratory Meeting" }).parentElement;
    const lectureCard = screen.getByRole("heading", { name: "Lecture Meeting" }).parentElement;

    expect(laboratoryCard).toBeTruthy();
    expect(lectureCard).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Hybrid/i }) as HTMLInputElement).checked).toBe(true);
    expect((laboratoryCard?.querySelector('[aria-label="First meeting day"]') as HTMLSelectElement).value).toBe("3");
    expect((lectureCard?.querySelector('input[readonly]') as HTMLInputElement).value).toBe("Online");
    const laboratoryOnlineButton = Array.from(laboratoryCard?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent?.includes("Online"));
    const lectureOnlineButton = Array.from(lectureCard?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent?.includes("Online"));
    expect(laboratoryOnlineButton?.disabled).toBe(true);
    expect(lectureOnlineButton?.disabled).toBe(false);
  });

  it("recalculates recommendations from the latest displayed schedule state", async () => {
    const schedule = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
      id: "22",
      semesterId: 1,
      departmentId: 1,
      courseId: "2",
      courseCode: "IT 102",
      courseName: "Programming",
      courseType: "major",
      lectureUnits: 3,
      laboratoryUnits: 0,
      totalUnits: 3,
      sectionName: "BSIT 1A",
      roomName: "Lecture Room",
      day: "Monday",
      startTime: "08:00",
      endTime: "10:00",
      mode: "on-site",
      facultyName: "Instructor One",
      facultyId: "10",
      status: "draft",
      dayIndex: 0,
      startSlot: 2,
      durationSlots: 4,
      sectionId: "1",
      roomId: "11",
      ...overrides,
    });

    const { rerender } = render(
      <HybridModalHarness schedules={[schedule({})]} modalConflict="Section conflict" />
    );

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const firstPayload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;

    rerender(
      <HybridModalHarness
        schedules={[schedule({
          day: "Thursday",
          dayIndex: 3,
          startTime: "10:00",
          endTime: "12:00",
          startSlot: 6,
          facultyId: "12",
          roomId: "13",
        })]}
        modalConflict="Section conflict"
      />
    );

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const secondPayload = vi.mocked(api.post).mock.calls[1][1] as {
      seed: number;
      tentative_schedules: Array<Record<string, unknown>>;
    };

    expect(secondPayload.tentative_schedules[0]).toMatchObject({
      id: 22,
      day: "Thursday",
      start_time: "10:00",
      end_time: "12:00",
      faculty_id: 12,
      room_id: 13,
    });
    expect(secondPayload.seed).not.toBe(firstPayload.seed);
  });

  it("requires explicit confirmation before retrying a warned configuration", async () => {
    vi.mocked(api.post).mockImplementation((_url, payload) => {
      const request = payload as { configuration_confirmation?: unknown };
      if (request.configuration_confirmation) {
        return Promise.resolve({ data: { recommendations: [] } });
      }

      return new Promise((_, reject) => {
        window.setTimeout(() => reject({
          response: {
            data: {
              error_code: "configuration_confirmation_required",
              message: "The schedule may be too concentrated and should be reviewed.",
              configuration_confirmation: {
                schema_version: 1,
                configuration_fingerprint: "a".repeat(64),
                required_warning_rule_ids: ["same_day_concentration"],
              },
            },
          },
        }), 20);
      });
    });

    render(<HybridModalHarness modalConflict="Section conflict" />);

    expect(await screen.findByText("The schedule may be too concentrated and should be reviewed.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));

    await waitFor(() => expect(vi.mocked(api.post).mock.calls.some(([, payload]) => (
      Boolean((payload as { configuration_confirmation?: unknown }).configuration_confirmation)
    ))).toBe(true));
    const confirmedCall = vi.mocked(api.post).mock.calls.find(([, payload]) => (
      Boolean((payload as { configuration_confirmation?: unknown }).configuration_confirmation)
    ));
    expect(confirmedCall?.[1]).toMatchObject({
      configuration_confirmation: {
        schema_version: 1,
        configuration_fingerprint: "a".repeat(64),
        confirmed_warning_rule_ids: ["same_day_concentration"],
      },
    });
  });
});

describe("DropModal manual placement support", () => {
  afterEach(cleanup);

  beforeEach(() => {
    cleanup();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ data: { recommendations: [] } });
  });

  it("does not request alternatives without the schedule.generate capability", async () => {
    render(<HybridModalHarness modalConflict="Section conflict" canGenerateSchedule={false} />);

    expect(screen.queryByRole("complementary", { name: "Suggested alternatives" })).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("reviews a valid placement and fetches alternatives only on request", async () => {
    render(<HybridModalHarness />);

    expect(screen.getByText("Placement review")).toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Find better options/i }));

    expect(screen.getByRole("complementary", { name: "Suggested alternatives" })).toBeTruthy();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/schedule-recommendations/preview",
      expect.objectContaining({ section_id: 1, course_ids: [1] }),
      expect.anything(),
    ));
    expect(await screen.findByText("No alternatives found")).toBeTruthy();
  });

  it("shows why a save was refused instead of hiding it under the room field", () => {
    render(<HybridModalHarness modalValidationError="Field courses must end by 5:00 PM." />);

    expect(screen.getByText("This placement could not be saved")).toBeTruthy();
    expect(screen.getByText("Field courses must end by 5:00 PM.")).toBeTruthy();
  });
});
