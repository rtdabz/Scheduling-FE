import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DropModal from "./DropModal";
import api from "../../../../lib/api";
import { slotToTime24h } from "../../../../lib/timeGrid";
import type { DeliveryMode, DropContext, Room, ScheduleItem, Subject } from "../types";
import { consecutiveDayRuns, type ConsecutivePlacement } from "../GenerateSchedule/courseClassConfig";

vi.mock("../../../../lib/api", () => ({
  default: { post: vi.fn() },
}));

// Stable like the scheduler's own state: a fresh array or course object per
// render would rebuild the slot payload and re-ask the server on every
// render, which the real scheduler never does.
const NO_SCHEDULES: ScheduleItem[] = [];
const ROOMS: Room[] = [
  { id: "lecture-room", name: "Lecture Room", departmentId: 1, roomType: "lecture", status: "available" },
  { id: "lab-room", name: "Laboratory Room", departmentId: 1, roomType: "laboratory", status: "available" },
  { id: "online-room", name: "Online", departmentId: 1, roomType: "online", status: "available" },
];
const course = (lectureOnly: boolean): Subject => ({
  id: "1",
  code: "IT 101",
  name: "Computing Fundamentals",
  units: 3,
  lectureHours: lectureOnly ? 3 : 2,
  labHours: lectureOnly ? 0 : 1,
  category: "major",
  semester: "1st",
  departmentId: 1,
  yearLevel: 1,
  roomTypeRequired: lectureOnly ? "lecture" : "laboratory",
  status: "active",
});
const DROP_CONTEXT: DropContext = { courseId: "1", subjectId: "1", dayIndex: 3, startSlot: 2, isRescheduling: false };
const EDIT_CONTEXT: DropContext = { ...DROP_CONTEXT, isRescheduling: true, scheduleId: "21" };
const LAB_COURSE = course(false);
/** A 3-unit lecture course. */
const LECTURE_COURSE = course(true);

function HybridModalHarness({
  schedules = NO_SCHEDULES,
  modalConflict = null,
  canGenerateSchedule = true,
  modalValidationError: initialValidationError = "",
  modalWasConflicted = false,
  lectureOnly = false,
  setDropContext = () => undefined,
  splitEnabled = false,
  secondMeetingMode = "on-site",
  firstMeetingRoomId = "lecture-room",
  run = null,
  requiredDay,
  rescheduling = false,
  handleModalConfirm = (event) => event.preventDefault(),
}: {
  schedules?: ScheduleItem[];
  modalConflict?: string | null;
  canGenerateSchedule?: boolean;
  modalValidationError?: string;
  modalWasConflicted?: boolean;
  /** A 3-unit lecture course instead of the lecture + laboratory default. */
  lectureOnly?: boolean;
  setDropContext?: (context: DropContext | null) => void;
  /** Start with Split Session on: two 1.5h meetings sharing one start time. */
  splitEnabled?: boolean;
  secondMeetingMode?: DeliveryMode;
  firstMeetingRoomId?: string;
  /** The course's Consecutive Days rule for this section. */
  run?: ConsecutivePlacement | null;
  requiredDay?: string;
  rescheduling?: boolean;
  handleModalConfirm?: (event: FormEvent) => void;
}) {
  const [modalValidationError, setModalValidationError] = useState(initialValidationError);
  const [modalRoomId, setModalRoomId] = useState(firstMeetingRoomId);
  const [modalClassMode, setModalClassModeState] = useState<DeliveryMode>("on-site");
  const [modalDay2RoomId, setModalDay2RoomId] = useState(secondMeetingMode === "online" ? "online" : "lab-room");
  const [modalDay2ClassMode, setModalDay2ClassMode] = useState<DeliveryMode>(secondMeetingMode);
  const [modalIsHybrid, setModalIsHybrid] = useState(false);
  const [modalSplitEnabled, setModalSplitEnabled] = useState(splitEnabled);
  const [modalFieldEnabled, setModalFieldEnabled] = useState(false);
  const [modalForceDayEnabled, setModalForceDayEnabled] = useState(false);
  const [modalForcedDayIndex, setModalForcedDayIndex] = useState(0);
  const [modalPreferredPattern, setModalPreferredPattern] = useState<string | null>(null);
  const [modalDay1Index, setModalDay1Index] = useState(3);
  const [modalDay2Index, setModalDay2Index] = useState(4);
  const [modalDay1StartSlot, setModalDay1StartSlot] = useState(2);
  const [modalDay1Duration, setModalDay1Duration] = useState(splitEnabled ? 3 : 6);
  const [modalDay2StartSlot, setModalDay2StartSlot] = useState(2);
  const [modalDay2Duration, setModalDay2Duration] = useState(splitEnabled ? 3 : 0);
  const [modalConsecutiveDays, setModalConsecutiveDays] = useState<number | null>(run?.dayCount ?? null);
  // As useScheduler: the given rule while its length is kept, else plain runs.
  const modalRun = !modalConsecutiveDays
    ? null
    : run && run.dayCount === modalConsecutiveDays
      ? run
      : { dayCount: modalConsecutiveDays, preferredStartDay: null, runs: consecutiveDayRuns(modalConsecutiveDays, false) };

  const setModalClassMode = (mode: DeliveryMode) => {
    setModalClassModeState(mode);
    if (mode === "online") {
      setModalIsHybrid(false);
      setModalRoomId("online");
    }
  };

  return (
    <DropModal
      rooms={ROOMS}
      sections={[{ id: "1", name: "BSIT 1A", yearLevel: 1, semester: "1st", departmentId: 1, semesterId: 1, status: "active" }]}
      schedules={schedules}
      selectedSectionId="1"
      dropContext={rescheduling ? EDIT_CONTEXT : DROP_CONTEXT}
      dropSubject={lectureOnly ? LECTURE_COURSE : LAB_COURSE}
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
      manualSchedulingSettings={{ lecture_lab_schedule_override_enabled: true, forced_day_rules: requiredDay ? [{ course_id: 1, day: requiredDay }] : [] }}
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
      setModalValidationError={setModalValidationError}
      modalConflict={modalConflict}
      modalWasConflicted={modalWasConflicted}
      isModalLoading={false}
      setDropContext={setDropContext}
      handleModalConfirm={handleModalConfirm}
      modalRun={modalRun}
      modalConsecutiveDays={modalConsecutiveDays}
      setModalConsecutiveDays={setModalConsecutiveDays}
      checkConflict={() => null}
    />
  );
}

const openAlternatives = () => fireEvent.click(screen.getByRole("button", { name: /View Alternatives/ }));
const alternativesDialog = () => screen.queryByRole("dialog", { name: /Suggested Alternatives/ });

/** Every placement the Rule Engine accepts: the panel's only source. */
const slotCalls = () => vi.mocked(api.post).mock.calls
  .filter(([url]) => url === "/schedule-recommendations/available-slots");

const mockRecommendationApi = (slots: unknown[] = [], rooms: unknown[] = [], serverPairStarts: unknown[] | null = null, serverBestMatches?: unknown[]) => {
  vi.mocked(api.post).mockImplementation(((_url: string, request: { placement?: { rows: Record<string, unknown>[]; selected_meeting: number } }) => {
    const templates = request.placement?.rows ?? [];
    const selected = request.placement?.selected_meeting ?? 0;
    const reviewed = (raw: unknown) => {
      const slot = raw as { day: string; start_slot: number; end_slot: number; mode: string; room_id: number | null; group_rows?: unknown[] };
      return { ...slot, group_rows: slot.group_rows ?? templates.map((row, index) => index === selected
        ? { ...row, day: slot.day, start_time: slotToTime24h(slot.start_slot), end_time: slotToTime24h(slot.end_slot), mode: slot.mode, room_id: slot.room_id }
        : row) };
    };
    const placements = (serverPairStarts ?? slots).map(reviewed);
    return Promise.resolve({ data: { slots, rooms, total: slots.length, truncated: false,
      placements, placement_rooms: rooms, placement_truncated: false,
      same_time_starts: serverPairStarts?.map(reviewed) ?? null,
      best_matches: (serverBestMatches ?? []).map(reviewed),
    } });
  }) as never);
};

describe("DropModal Integrated configuration", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    mockRecommendationApi();
  });

  it("passes the course Required Day to the session-alternative empty state", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { slots: [], rooms: [], total: 0, placements: [], recommendations: [] } });
    render(<HybridModalHarness lectureOnly requiredDay="Thursday" />);
    const button = await screen.findByRole("button", { name: "Check session alternatives" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByText(/Required Day restricts this class to Thursday/)).toBeTruthy();
    expect(slotCalls().some(([, body]) => (body as { placement?: { session_alternatives?: boolean } }).placement?.session_alternatives)).toBe(true);
  });

  afterEach(cleanup);

  it("keeps Thursday as the laboratory day and adds the online lecture separately", () => {
    render(<HybridModalHarness />);

    expect(screen.queryByRole("heading", { name: "Laboratory Meeting" })).toBeNull();
    expect((screen.getByRole("button", { name: "Online" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Integrated/i }));

    const laboratoryCard = screen.getByRole("heading", { name: "Laboratory Meeting" }).parentElement;
    const lectureCard = screen.getByRole("heading", { name: "Lecture Meeting" }).parentElement;

    expect(laboratoryCard).toBeTruthy();
    expect(lectureCard).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Integrated/i }).getAttribute("aria-checked")).toBe("true");
    expect((laboratoryCard?.querySelector('[aria-label="First meeting day"]') as HTMLSelectElement).value).toBe("3");
    expect((lectureCard?.querySelector('input[readonly]') as HTMLInputElement).value).toBe("Online");
    const laboratoryOnlineButton = Array.from(laboratoryCard?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent?.includes("Online"));
    const lectureOnlineButton = Array.from(lectureCard?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent?.includes("Online"));
    expect(laboratoryOnlineButton?.disabled).toBe(true);
    expect(lectureOnlineButton?.disabled).toBe(false);
  });

  it("keeps both Integrated meetings on site when the delivery is On-Site", () => {
    render(<HybridModalHarness />);

    fireEvent.click(screen.getByRole("radio", { name: /Integrated/i }));
    const delivery = screen.getByRole("combobox", { name: /Delivery mode/i }) as HTMLSelectElement;
    expect(delivery.value).toBe("hybrid");

    fireEvent.change(delivery, { target: { value: "onsite" } });

    const lectureCard = screen.getByRole("heading", { name: "Lecture Meeting" }).parentElement;
    const roomSelect = lectureCard?.querySelector('[aria-label="Lecture Meeting room"]') as HTMLSelectElement;
    // A room select, not the read-only "Online" box, and a lecture room in it.
    expect(roomSelect).toBeTruthy();
    expect(Array.from(roomSelect.options).some((option) => option.textContent === "Lecture Room")).toBe(true);
    expect(roomSelect.value).toBe("lecture-room");
  });

  it("fixes the Integrated lecture and laboratory at the course's own hours", async () => {
    render(<HybridModalHarness modalConflict="Room conflict" />);

    fireEvent.click(screen.getByRole("radio", { name: /Integrated/i }));

    // Two lecture hours and one laboratory hour, read as recorded and not editable.
    expect(screen.queryByRole("spinbutton", { name: /duration/ })).toBeNull();
    expect((screen.getByLabelText("Laboratory Meeting end time") as HTMLInputElement).value).not.toBe("");
    expect(screen.getByText("1 hrs")).toBeTruthy();
    expect(screen.getByText("2 hrs")).toBeTruthy();
    await waitFor(() => expect(slotCalls().at(-1)?.[1]).toMatchObject({ duration_slots: 2 }));
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

    const affected = schedule({ id: "21", courseId: "1" });
    const { rerender } = render(
      <HybridModalHarness schedules={[affected, schedule({})]} modalConflict="Section conflict" />
    );

    await waitFor(() => expect(slotCalls()).toHaveLength(1));
    expect(slotCalls()[0][1]).toMatchObject({ ignore_schedule_ids: [21], placement: { rows: [{ faculty_id: 10 }] } });

    rerender(
      <HybridModalHarness
        schedules={[affected, schedule({
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

    await waitFor(() => expect(slotCalls()).toHaveLength(2));
    const secondPayload = slotCalls()[1][1] as { tentative_schedules: Array<Record<string, unknown>> };

    expect(secondPayload.tentative_schedules[0]).toMatchObject({
      id: 22,
      day: "Thursday",
      start_time: "10:00",
      end_time: "12:00",
      faculty_id: 12,
      room_id: 13,
    });
  });

});

describe("DropModal manual placement support", () => {
  afterEach(cleanup);

  beforeEach(() => {
    cleanup();
    vi.mocked(api.post).mockReset();
    mockRecommendationApi();
  });

  it("does not request alternatives without the schedule.generate capability", async () => {
    render(<HybridModalHarness modalConflict="Section conflict" canGenerateSchedule={false} />);

    expect(screen.queryByRole("button", { name: /View Alternatives/ })).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers no alternatives and asks for none while the placement is valid", async () => {
    render(<HybridModalHarness />);

    expect(screen.getByText("Placement review")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View Alternatives/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Find better options/i })).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lists a conflicting placement's alternatives in their own dialog, and withdraws them once it is valid", async () => {
    const { rerender } = render(<HybridModalHarness modalConflict="Room conflict" />);

    expect(alternativesDialog()).toBeNull();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/schedule-recommendations/available-slots",
      expect.objectContaining({ section_id: 1, course_id: 1 }),
      expect.anything(),
    ));

    fireEvent.click(await screen.findByRole("button", { name: "View Alternatives, 0 valid options" }));

    expect(alternativesDialog()).toBeTruthy();
    expect(await screen.findByText("No alternatives found")).toBeTruthy();
    expect(slotCalls()).toHaveLength(1);

    rerender(<HybridModalHarness modalConflict={null} />);
    expect(alternativesDialog()).toBeNull();
    expect(screen.queryByRole("button", { name: /View Alternatives/ })).toBeNull();
  });

  it("badges the number of valid alternatives the server returned", async () => {
    mockRecommendationApi(["Monday", "Tuesday", "Saturday"].map((day, dayIndex) => ({
      day, day_index: dayIndex, start_slot: 0, end_slot: 6, start_time: "07:00:00", end_time: "10:00:00",
      mode: "on-site", room_id: 10, room_code: "IT 105", room_type: "lecture",
    })));
    render(<HybridModalHarness lectureOnly modalConflict="Room conflict" />);

    expect(await screen.findByRole("button", { name: "View Alternatives, 3 valid options" })).toBeTruthy();
  });

  it("names the dialog and its final action for a new placement and for an edit", () => {
    const { unmount } = render(<HybridModalHarness lectureOnly />);
    expect(screen.getByRole("dialog", { name: "Manual Class Placement" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Place on Timetable/ })).toBeTruthy();
    unmount();

    render(<HybridModalHarness lectureOnly rescheduling />);
    expect(screen.getByRole("dialog", { name: "Edit Class Schedule" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Changes/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Place on Timetable/ })).toBeNull();
  });

  it("keeps Save Changes blocked while the edited placement has a conflict", () => {
    render(<HybridModalHarness lectureOnly rescheduling modalConflict="Room conflict" />);

    expect((screen.getByRole("button", { name: "Fix Conflict to Continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Save Changes/ })).toBeNull();
  });

  it("closes the alternatives with Escape before the placement dialog", () => {
    const setDropContext = vi.fn();
    render(<HybridModalHarness lectureOnly modalConflict="Room conflict" setDropContext={setDropContext} />);

    openAlternatives();
    expect(alternativesDialog()).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(alternativesDialog()).toBeNull();
    expect(setDropContext).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(setDropContext).toHaveBeenCalledWith(null);
  });

  it("rechecks the complete group when a meeting is switched to Online", async () => {
    render(<HybridModalHarness lectureOnly modalConflict="Room conflict: BA 201 is already occupied" />);

    await waitFor(() => expect(slotCalls()).toHaveLength(1));

    // Complete-group verification must track the changed delivery.
    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    await waitFor(() => expect(slotCalls()).toHaveLength(2));
  });

  it("keeps the request when equivalent meeting objects are rendered again", async () => {
    const { rerender } = render(<HybridModalHarness lectureOnly modalConflict="Room conflict" />);
    await waitFor(() => expect(slotCalls()).toHaveLength(1));
    const request = slotCalls()[0][2] as { signal: AbortSignal };
    rerender(<HybridModalHarness lectureOnly modalConflict="Room conflict" />);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    expect(slotCalls()).toHaveLength(1);
    expect(request.signal.aborted).toBe(false);
  });

  it("aborts stale requests without clearing the replacement request's loading state", async () => {
    let rejectOld!: (reason: Error) => void;
    let finishCurrent!: (response: { data: { placements: never[] } }) => void;
    vi.mocked(api.post)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishCurrent = resolve; }));
    render(<HybridModalHarness lectureOnly modalConflict="Room conflict" />);
    await waitFor(() => expect(slotCalls()).toHaveLength(1));
    const oldSignal = slotCalls()[0][2]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() => expect(slotCalls()).toHaveLength(2));
    await act(async () => rejectOld(new Error("stale request")));
    expect(screen.queryByText(/Suggestions are unavailable/)).toBeNull();
    expect((screen.getByRole("button", { name: "Check session alternatives" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finishCurrent({ data: { placements: [] } }));
    expect((screen.getByRole("button", { name: "Check session alternatives" }) as HTMLButtonElement).disabled).toBe(false);
    openAlternatives();
    expect(screen.getByText("No alternatives found")).toBeTruthy();
  });

  it("lists every valid slot grouped by day, with a per-room count in the filter", async () => {
    const slot = (day: string, dayIndex: number, startSlot: number, roomId: number, roomCode: string) => ({
      day,
      day_index: dayIndex,
      start_slot: startSlot,
      end_slot: startSlot + 4,
      start_time: "07:00:00",
      end_time: "09:00:00",
      mode: "on-site",
      room_id: roomId,
      room_code: roomCode,
      room_type: "lecture",
    });
    mockRecommendationApi(
      [
        slot("Monday", 0, 0, 10, "IT 105"),
        slot("Monday", 0, 2, 11, "NEE 204"),
        slot("Tuesday", 1, 0, 10, "IT 105"),
      ],
      [
        { room_id: 10, room_code: "IT 105", room_type: "lecture", slot_count: 2 },
        { room_id: 11, room_code: "NEE 204", room_type: "lecture", slot_count: 1 },
      ],
    );

    render(<HybridModalHarness lectureOnly modalConflict="Section conflict" />);

    openAlternatives();
    fireEvent.click(await screen.findByRole("tab", { name: /Weekdays/ }));
    const roomFilter = await screen.findByLabelText<HTMLSelectElement>("Filter placements by room");
    await waitFor(() => expect(roomFilter.options).toHaveLength(3));

    // The count beside each room is the number of slots that room actually has.
    expect([...roomFilter.options].map((option) => option.textContent)).toEqual([
      "All rooms (3)",
      "IT 105 (2)",
      "NEE 204 (1)",
    ]);

    // Every weekday the server returned gets its own heading.
    const panel = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(panel.getByText(/^Monday$/)).toBeTruthy();
    expect(panel.getByText(/^Tuesday$/)).toBeTruthy();

    // Filtering by room narrows the list without another request.
    const before = vi.mocked(api.post).mock.calls.length;
    fireEvent.change(roomFilter, { target: { value: "11" } });
    expect(panel.queryByText(/^Tuesday$/)).toBeNull();
    expect(panel.getByText(/^Monday$/)).toBeTruthy();
    expect(vi.mocked(api.post).mock.calls.length).toBe(before);
  });

  it("offers Field as a per-meeting mode without marking the course a field course", async () => {
    render(<HybridModalHarness lectureOnly />);

    // PATH FIT and NSTP used to reach the field only through the Field Course
    // checkbox, which rewrites the department's field list for every section.
    const fieldMode = screen.getByRole("button", { name: "Field" });
    expect(fieldMode.hasAttribute("disabled")).toBe(false);

    fireEvent.click(fieldMode);

    expect(screen.queryByRole("checkbox", { name: /Field Course/i })).toBeNull();
    expect(screen.queryByText(/field courses\./i)).toBeNull();
  });

  it("keeps the room filter through a placement refresh and resets it when the room disappears", async () => {
    const rooms = [10, 11].map((id) => ({
      room_id: id, room_code: `Room ${id}`, room_type: "lecture", mode: "on-site", slot_count: 1,
    }));
    const slots = rooms.map((room) => ({
      ...room, day: "Monday", day_index: 0, start_slot: 0, end_slot: 6,
      start_time: "07:00:00", end_time: "10:00:00",
    }));
    mockRecommendationApi(slots, rooms);
    render(<HybridModalHarness lectureOnly modalConflict="Section conflict" />);
    openAlternatives();
    fireEvent.click(await screen.findByRole("tab", { name: /Weekdays/ }));
    const filter = () => screen.getByLabelText<HTMLSelectElement>("Filter placements by room");
    await waitFor(() => expect(filter().options).toHaveLength(3));
    fireEvent.change(filter(), { target: { value: "11" } });
    const placements = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(placements.getByText("Room 11")).toBeTruthy();
    expect(placements.queryByText("Room 10")).toBeNull();

    fireEvent.click(placements.getByRole("button"));
    expect(alternativesDialog()).toBeNull();
    await waitFor(() => expect(slotCalls()).toHaveLength(2));
    openAlternatives();
    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    await screen.findByRole("region", { name: "Valid placements" });
    expect(filter().value).toBe("11");
    expect(within(screen.getByRole("region", { name: "Valid placements" })).queryByText("Room 10")).toBeNull();

    // A later response, rather than the loading transition, invalidates the filter.
    mockRecommendationApi([slots[0]], [rooms[0]]);
    fireEvent.change(screen.getByRole("combobox", { name: "Meeting start time" }), { target: { value: "2" } });
    await waitFor(() => expect(slotCalls()).toHaveLength(3));
    await screen.findByRole("region", { name: "Valid placements" });
    expect(filter().options).toHaveLength(2);
    expect(filter().value).toBe("__all__");
    expect(within(screen.getByRole("region", { name: "Valid placements" })).getByText("Room 10")).toBeTruthy();
  });

  it("offers Online slots beside room slots and filters them apart", async () => {
    mockRecommendationApi(
      [
        { day: "Monday", day_index: 0, start_slot: 0, end_slot: 4, start_time: "07:00:00", end_time: "09:00:00", mode: "on-site", room_id: 10, room_code: "IT 105", room_type: "lecture" },
        { day: "Monday", day_index: 0, start_slot: 0, end_slot: 4, start_time: "07:00:00", end_time: "09:00:00", mode: "online", room_id: null, room_code: "Online", room_type: "online" },
        { day: "Tuesday", day_index: 1, start_slot: 0, end_slot: 4, start_time: "07:00:00", end_time: "09:00:00", mode: "online", room_id: null, room_code: "Online", room_type: "online" },
      ],
      [
        { room_id: 10, room_code: "IT 105", room_type: "lecture", mode: "on-site", slot_count: 1 },
        { room_id: null, room_code: "Online", room_type: "online", mode: "online", slot_count: 2 },
      ],
    );

    render(<HybridModalHarness lectureOnly modalConflict="Section conflict" />);

    openAlternatives();
    fireEvent.click(await screen.findByRole("tab", { name: /Weekdays/ }));
    const roomFilter = await screen.findByLabelText<HTMLSelectElement>("Filter placements by room");
    await waitFor(() => expect(roomFilter.options).toHaveLength(3));

    // A split whose second meeting is online had no online slot to pick,
    // because the query was pinned to the first meeting's mode.
    expect([...roomFilter.options].map((option) => option.textContent)).toEqual([
      "All rooms (3)",
      "IT 105 (1)",
      "Online (2)",
    ]);

    // Online carries no room id, so it needs a key of its own: filtering on
    // room_id alone folded it into "All rooms".
    const panel = within(screen.getByRole("region", { name: "Valid placements" }));
    fireEvent.change(roomFilter, { target: { value: "online" } });
    expect(panel.getByText(/^Tuesday$/)).toBeTruthy();
    expect(panel.getAllByText("Online")).toHaveLength(2);
    expect(panel.queryByText("IT 105")).toBeNull();
  });

  describe("Split Session with an online meeting", () => {
    const slot = (day: string, dayIndex: number, mode: DeliveryMode, roomId: number | null, startSlot: number) => ({
      day,
      day_index: dayIndex,
      start_slot: startSlot,
      end_slot: startSlot + 3,
      start_time: "07:00:00",
      end_time: "08:30:00",
      mode,
      room_id: roomId,
      room_code: roomId == null ? "Online" : "IT 105",
      room_type: roomId == null ? "online" : "lecture",
    });

    /** Thursday F2F in room 10, Friday online — the harness's two split days. */
    const splitHarness = (props: Record<string, unknown> = {}) => (
      <HybridModalHarness
        lectureOnly
        splitEnabled
        secondMeetingMode="online"
        firstMeetingRoomId="10"
        modalConflict="Section conflict"
        {...props}
      />
    );

    it("offers only times free on both days, and keeps the split", async () => {
      mockRecommendationApi([
        slot("Thursday", 3, "on-site", 10, 0),
        slot("Thursday", 3, "on-site", 10, 4),
        slot("Friday", 4, "online", null, 0),
        slot("Friday", 4, "online", null, 8),
      ], [], [slot("Thursday", 3, "on-site", 10, 0)]);

      render(splitHarness());
      openAlternatives();

      const panel = within(await screen.findByRole("region", { name: "Valid split times" }));

      // Only start slot 0 is free on Thursday *and* Friday. Slot 4 is Thursday
      // only and slot 8 Friday only, so neither can hold a shared-time pair.
      await waitFor(() => expect(panel.getAllByText("F2F | Online")).toHaveLength(1));
      expect(panel.getByText("7 AM – 8:30 AM")).toBeTruthy();

      // The room filter means nothing for a pair whose rooms come from its
      // own two meetings, so it is not offered.
      expect(screen.queryByLabelText("Filter placements by room")).toBeNull();
    });

    it("offers Online as the split's delivery", async () => {
      render(splitHarness());

      const delivery = screen.getByRole("combobox", { name: /Delivery mode/i }) as HTMLSelectElement;
      // One meeting online is a Hybrid Split.
      expect(delivery.value).toBe("hybrid");

      fireEvent.change(delivery, { target: { value: "online" } });

      // Both meetings move online, and neither keeps a room.
      await waitFor(() => expect(delivery.value).toBe("online"));
      expect(screen.getAllByRole("button", { name: "Online", pressed: true })).toHaveLength(2);
      expect(screen.queryByRole("combobox", { name: "First Meeting room" })).toBeNull();
      expect(screen.queryByRole("combobox", { name: "Second Meeting room" })).toBeNull();
    });

    it("puts an Online Split back on site in a lecture room", async () => {
      render(splitHarness());
      const delivery = screen.getByRole("combobox", { name: /Delivery mode/i }) as HTMLSelectElement;
      fireEvent.change(delivery, { target: { value: "online" } });
      await waitFor(() => expect(delivery.value).toBe("online"));

      fireEvent.change(delivery, { target: { value: "onsite" } });

      await waitFor(() => expect(delivery.value).toBe("onsite"));
      expect((screen.getByRole("combobox", { name: "First Meeting room" }) as HTMLSelectElement).value).toBe("lecture-room");
      expect((screen.getByRole("combobox", { name: "Second Meeting room" }) as HTMLSelectElement).value).toBe("lecture-room");
    });

    it("says so when no time suits both days", async () => {
      mockRecommendationApi([
        slot("Thursday", 3, "on-site", 10, 0),
        slot("Friday", 4, "online", null, 8),
      ], [], []);

      render(splitHarness());
      openAlternatives();

      const panel = within(await screen.findByRole("region", { name: "Valid split times" }));
      await waitFor(() => expect(panel.getByText(/No time is free on both days/)).toBeTruthy());
    });

    it("stages both meetings exactly as reviewed by the server", async () => {
      const reviewed = { ...slot("Thursday", 3, "on-site", 10, 4), group_rows: [
        { day: "Thursday", start_time: "09:00", end_time: "10:30", mode: "on-site", room_id: 10, preferred_pattern: "days:3-4", meeting_type: "lecture", is_hybrid: true },
        { day: "Friday", start_time: "09:00", end_time: "10:30", mode: "online", room_id: null, preferred_pattern: "days:3-4", meeting_type: "lecture", is_hybrid: true },
      ] };
      mockRecommendationApi([], [], [reviewed]);
      render(splitHarness());
      openAlternatives();
      const panel = within(await screen.findByRole("region", { name: "Valid split times" }));
      fireEvent.click(await panel.findByRole("button", { name: /9 AM/ }));
      expect(alternativesDialog()).toBeNull();
      await waitFor(() => expect((screen.getByLabelText("First Meeting start time") as HTMLSelectElement).value).toBe("4"));
      expect((screen.getByLabelText("Second Meeting start time") as HTMLSelectElement).value).toBe("4");
      expect((screen.getByLabelText("First meeting day") as HTMLSelectElement).value).toBe("3");
      expect((screen.getByLabelText("Second meeting day") as HTMLSelectElement).value).toBe("4");
    });
  });

  it("asks for slots per meeting so an Integrated lecture can find online times", async () => {
    mockRecommendationApi([{
      day: "Monday", day_index: 0, start_slot: 0, end_slot: 6,
      start_time: "07:00:00", end_time: "10:00:00", mode: "on-site",
      room_id: 10, room_code: "CompLab2", room_type: "laboratory",
    }]);
    render(<HybridModalHarness modalConflict="Online course conflict" />);
    fireEvent.click(screen.getByRole("radio", { name: /Integrated/i }));

    // The laboratory half: its own length, and named as a laboratory so the
    // server keeps it on-site.
    await waitFor(() => expect(slotCalls().length).toBeGreaterThan(0));
    expect(slotCalls().at(-1)?.[1]).toMatchObject({ meeting_type: "laboratory" });

    // Day 2 is Friday in the harness, and the laboratory may not share it.
    expect(slotCalls().at(-1)?.[1]).toMatchObject({ excluded_days: ["Friday"] });

    openAlternatives();
    fireEvent.click(screen.getByRole("button", { name: "Lecture Meeting" }));

    // The lecture half is a different question: a different length, and named
    // as a lecture, which is what lets a laboratory course's lecture go online.
    // Its own partner's day (Thursday) drops out in turn, so a pick here can
    // never put both meetings on one day (split_group_day_separation).
    await waitFor(() => expect(slotCalls().at(-1)?.[1]).toMatchObject({
      meeting_type: "lecture",
      excluded_days: ["Thursday"],
    }));
  });

  it("moves the meeting pattern with the day when a slot is applied", async () => {
    mockRecommendationApi([{
      day: "Wednesday", day_index: 2, start_slot: 0, end_slot: 4,
      start_time: "07:00:00", end_time: "09:00:00", mode: "online",
      room_id: null, room_code: "Online", room_type: "online",
    }]);
    render(<HybridModalHarness modalConflict="Online course conflict" />);
    fireEvent.click(screen.getByRole("radio", { name: /Integrated/i }));

    openAlternatives();
    fireEvent.click(await screen.findByRole("button", { name: "Lecture Meeting" }));
    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    const panel = within(await screen.findByRole("region", { name: "Valid placements" }));
    fireEvent.click(await panel.findByText("7 AM – 9 AM"));

    expect((screen.getByLabelText("Second meeting day") as HTMLSelectElement).value).toBe("2");
  });

  it("keeps the server Best Match order and applies the reviewed group in place", async () => {
    const slot = (day: string, dayIndex: number, startSlot: number, mode: DeliveryMode, roomId: number | null) => ({
      day, day_index: dayIndex, start_slot: startSlot, end_slot: startSlot + 6,
      start_time: "07:00:00", end_time: "10:00:00", mode,
      room_id: roomId, room_code: roomId == null ? "Online" : "IT 105", room_type: roomId == null ? "online" : "lecture",
    });
    mockRecommendationApi([
      slot("Monday", 0, 2, "on-site", 10),
      // Thursday is the requested day: the harness opens there at slot 2.
      slot("Thursday", 3, 12, "on-site", 10),
      slot("Thursday", 3, 4, "on-site", 10),
      slot("Friday", 4, 2, "on-site", 10),
    ], [], null, [slot("Thursday", 3, 12, "on-site", 10), slot("Thursday", 3, 4, "on-site", 10)]);
    const setDropContext = vi.fn();
    const handleModalConfirm = vi.fn();

    render(<HybridModalHarness lectureOnly modalConflict="Room conflict" setDropContext={setDropContext} handleModalConfirm={handleModalConfirm} />);
    openAlternatives();

    // The server order wins even when the second entry is closer.
    const best = within(await screen.findByRole("list", { name: "Best matches" }));
    const options = best.getAllByRole("listitem");
    expect(options).toHaveLength(2);
    expect(within(options[0]).getByText("Best match")).toBeTruthy();
    expect(within(options[0]).getByText(/^1 PM – /)).toBeTruthy();

    fireEvent.click(within(options[0]).getByRole("button", { name: "Use this option" }));

    // The dialog's own fields take the option, and dropContext is untouched:
    // moving its cell re-initialised the dialog with its own defaults.
    expect(alternativesDialog()).toBeNull();
    expect((screen.getByLabelText("First meeting day") as HTMLSelectElement).value).toBe("3");
    expect((screen.getByLabelText("Meeting start time") as HTMLSelectElement).value).toBe("12");
    expect(setDropContext).not.toHaveBeenCalled();
    expect(handleModalConfirm).not.toHaveBeenCalled();

    openAlternatives();
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Best matches" })).getByRole("button", { name: "Selected" })).toBeTruthy());

    // Weekdays lists Monday to Thursday; Weekend lists Friday and Saturday.
    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    const weekdays = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(weekdays.getByText(/^Monday$/)).toBeTruthy();
    expect(weekdays.queryByText(/^Friday$/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Weekend/ }));
    const weekend = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(weekend.getByText(/^Friday$/)).toBeTruthy();
    expect(weekend.queryByText(/^Monday$/)).toBeNull();
  });

  it("shows why a save was refused instead of hiding it under the room field", () => {
    render(<HybridModalHarness modalValidationError="Field courses must end by 5:00 PM." />);

    expect(screen.getByText("This placement could not be saved")).toBeTruthy();
    expect(screen.getByText("Field courses must end by 5:00 PM.")).toBeTruthy();
  });

  it("does not report resolved or ready while a save error remains, and permits retry", () => {
    const confirm = vi.fn();
    render(<HybridModalHarness rescheduling modalWasConflicted modalValidationError="Room TBA is allowed only for a laboratory meeting." handleModalConfirm={confirm} />);

    expect(screen.getByText("Review the save error and try again")).toBeTruthy();
    expect(screen.queryByText("Resolved")).toBeNull();
    expect(screen.queryByText(/Ready to save changes/)).toBeNull();
    expect(screen.queryByText(/You can still save/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(confirm).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole("combobox", { name: "Meeting room" }), { target: { value: "lab-room" } });
    expect(screen.queryByText("This placement could not be saved")).toBeNull();
    expect(screen.getByText(/Conflict cleared. Ready to save changes/)).toBeTruthy();
  });
});

describe("DropModal Consecutive Days", () => {
  const RUN: ConsecutivePlacement = {
    dayCount: 3,
    preferredStartDay: "Thursday",
    runs: consecutiveDayRuns(3, false),
  };

  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    mockRecommendationApi();
  });

  afterEach(cleanup);

  it("places the course as one run from a starting day, with no split options", () => {
    // The harness opens on Thursday.
    render(<HybridModalHarness run={RUN} lectureOnly />);

    expect(screen.getByRole("heading", { name: "Each day of the run (3 days)" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Consecutive Days" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Meets on its ticked days, Thursday–Saturday/)).toBeDefined();
    expect(screen.getAllByText("Thursday–Saturday").length).toBeGreaterThan(0);
    // Ticked days fix the length.
    expect((screen.getByLabelText("Number of days") as HTMLSelectElement).disabled).toBe(true);

    const startDay = screen.getByLabelText("Starting day") as HTMLSelectElement;
    expect((within(startDay).getByRole("option", { name: "Friday (runs past the week)" }) as HTMLOptionElement).disabled).toBe(true);
    // Its ticked days are Thursday-Saturday, so no other start is offered.
    expect((within(startDay).getByRole("option", { name: "Monday (not the ticked days)" }) as HTMLOptionElement).disabled).toBe(true);
    expect((within(startDay).getByRole("option", { name: "Thursday (Thursday–Saturday)" }) as HTMLOptionElement).disabled).toBe(false);
  });

  it("holds a single meeting at the course's Total Hours", () => {
    render(<HybridModalHarness lectureOnly />);

    // A 3-hour lecture meets its full 3 hours from the 8 AM start, with no duration to edit.
    expect(screen.queryByRole("spinbutton", { name: "Meeting duration" })).toBeNull();
    expect((screen.getByLabelText("Meeting end time") as HTMLInputElement).value).toMatch(/^11(:00)? AM$/);
    expect(screen.getByText("3 hrs")).toBeTruthy();
  });

  it("turns a single meeting into a run of the chosen length, and back", () => {
    render(<HybridModalHarness lectureOnly />);

    expect(screen.getByRole("radio", { name: "Single" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByLabelText("Starting day")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Consecutive Days" }));

    // Two days by default, starting on the day it was dropped on (Thursday).
    const days = screen.getByLabelText("Number of days") as HTMLSelectElement;
    expect(days.value).toBe("2");
    expect(screen.getByRole("heading", { name: "Each day of the run (2 days)" })).toBeDefined();
    expect((screen.getByLabelText("Starting day") as HTMLSelectElement).value).toBe("3");
    expect(screen.getAllByText("Thursday–Friday").length).toBeGreaterThan(0);

    // Three days from Thursday ends Saturday; Monday-Saturday has six at most.
    fireEvent.change(days, { target: { value: "3" } });
    expect(screen.getAllByText("Thursday–Saturday").length).toBeGreaterThan(0);
    expect(within(days).getAllByRole("option").map((option) => option.textContent)).toEqual(
      ["2 days", "3 days", "4 days", "5 days", "6 days"],
    );

    fireEvent.click(screen.getByRole("radio", { name: "Single" }));
    expect(screen.queryByLabelText("Number of days")).toBeNull();
    expect(screen.getByRole("heading", { name: "Meeting" })).toBeDefined();
  });

  it("asks the slot list for whole runs", async () => {
    render(<HybridModalHarness run={RUN} lectureOnly modalConflict="Friday: the room is taken" />);

    const slotCalls = () => vi.mocked(api.post).mock.calls
      .filter(([url]) => url === "/schedule-recommendations/available-slots");

    await waitFor(() => expect(slotCalls().length).toBeGreaterThan(0));
    // Only runs on the ticked days, Thursday-Saturday.
    expect(slotCalls().at(-1)?.[1]).toMatchObject({
      consecutive_days: 3,
      meeting_type: null,
      excluded_days: ["Monday", "Tuesday", "Wednesday", "Sunday"],
    });
  });
});


describe("explicit session enhancements", () => {
  afterEach(cleanup);
  it("stages an Integrated Hybrid with independent lecture and lab times", async () => {
    const rows = [
      { day: "Monday", start_time: "10:00", end_time: "12:00", mode: "online", room_id: null, meeting_type: "lecture" },
      { day: "Wednesday", start_time: "07:00", end_time: "08:00", mode: "on-site", room_id: 2, meeting_type: "laboratory" },
    ];
    vi.mocked(api.post).mockResolvedValue({ data: { recommendations: [{ id: "integrated", label: "Integrated Hybrid", summary: "Lecture online, laboratory on-site", reasons: [], rows }], placements: [], best_matches: [], placement_rooms: [] } });
    render(<HybridModalHarness />);
    const check = screen.getByRole("button", { name: "Check session alternatives" });
    await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole("button", { name: "Stage Integrated Hybrid" }));
    expect(screen.getByRole("radio", { name: /Integrated/i }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("First meeting day") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByLabelText("Second meeting day") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Laboratory Meeting end time") as HTMLInputElement).value).toMatch(/^8(:00)? AM$/);
    expect((screen.getByLabelText("Lecture Meeting end time") as HTMLInputElement).value).toMatch(/^12(:00)? PM$/);
    expect((screen.getByRole("combobox", { name: /Delivery mode/i }) as HTMLSelectElement).value).toBe("hybrid");
    expect((screen.getByLabelText("Laboratory Meeting start time") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Lecture Meeting start time") as HTMLSelectElement).value).toBe("6");
  });
  it.each(["on-site", "online"] as const)("stages both %s Split meetings without saving", async (mode) => {
    const rows = ["Monday", "Wednesday"].map((day) => ({ day, start_time: "07:00", end_time: "08:30", mode, room_id: mode === "online" ? null : 1, meeting_type: "lecture" }));
    vi.mocked(api.post).mockResolvedValue({ data: { recommendations: [{ id: "new", label: "Split", summary: "Two shorter meetings", reasons: [], rows }], placements: [], best_matches: [], placement_rooms: [] } });
    render(<HybridModalHarness lectureOnly />);
    const check = screen.getByRole("button", { name: "Check session alternatives" });
    await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(check);
    fireEvent.click(await screen.findByRole("button", { name: "Stage Split" }));
    expect(screen.getByRole("radio", { name: /Split Session/ }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("First meeting day") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Second meeting day") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByRole("combobox", { name: /Delivery mode/i }) as HTMLSelectElement).value).toBe(mode === "online" ? "online" : "onsite");
    expect((screen.getByLabelText("First Meeting start time") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Second Meeting start time") as HTMLSelectElement).value).toBe("0");
    expect(vi.mocked(api.post).mock.calls.every(([url]) => url === "/schedule-recommendations/available-slots")).toBe(true);
  });
});
