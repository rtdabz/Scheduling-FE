import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DropModal from "./DropModal";
import api from "../../../../lib/api";
import type { DeliveryMode, DropContext, Room, ScheduleItem, Subject } from "../types";

vi.mock("../../../../lib/api", () => ({
  default: { post: vi.fn() },
}));

// Stable like the scheduler's own state: a fresh array or course object per
// render would rebuild the recommendation payload and re-run the preview on
// every render, which the real scheduler never does.
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
const LAB_COURSE = course(false);
/** A 3-unit lecture course. */
const LECTURE_COURSE = course(true);

function HybridModalHarness({
  schedules = NO_SCHEDULES,
  modalConflict = null,
  canGenerateSchedule = true,
  modalValidationError = "",
  lectureOnly = false,
  setDropContext = () => undefined,
  splitEnabled = false,
  secondMeetingMode = "on-site",
  firstMeetingRoomId = "lecture-room",
}: {
  schedules?: ScheduleItem[];
  modalConflict?: string | null;
  canGenerateSchedule?: boolean;
  modalValidationError?: string;
  /** A 3-unit lecture course instead of the lecture + laboratory default. */
  lectureOnly?: boolean;
  setDropContext?: (context: DropContext | null) => void;
  /** Start with Split Session on: two 1.5h meetings sharing one start time. */
  splitEnabled?: boolean;
  secondMeetingMode?: DeliveryMode;
  firstMeetingRoomId?: string;
}) {
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
      activeSemester={{ id: 1, academic_year: "2026-2027", semester: "1st", is_active: true }}
      dropContext={DROP_CONTEXT}
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
      setDropContext={setDropContext}
      handleModalConfirm={(event) => event.preventDefault()}
      checkConflict={() => null}
    />
  );
}

/**
 * The panel now calls two endpoints: the CSP preview for the ranked options and
 * /available-slots for the exhaustive list. Assertions about "the solver ran"
 * must name the preview, or they count the slot query too.
 */
const previewCalls = () => vi.mocked(api.post).mock.calls
  .filter(([url]) => url === "/schedule-recommendations/preview");

/** Answers each endpoint with its own shape. */
const mockRecommendationApi = (slots: unknown[] = [], rooms: unknown[] = []) => {
  vi.mocked(api.post).mockImplementation((url: string) => (
    url === "/schedule-recommendations/available-slots"
      ? Promise.resolve({ data: { slots, rooms, total: slots.length, truncated: false } })
      : Promise.resolve({ data: { recommendations: [] } })
  ) as never);
};

describe("DropModal Integrated configuration", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    mockRecommendationApi();
  });

  afterEach(cleanup);

  it("keeps Thursday as the laboratory day and adds the online lecture separately", () => {
    render(<HybridModalHarness />);

    expect(screen.queryByRole("heading", { name: "Laboratory Meeting" })).toBeNull();
    expect((screen.getByRole("button", { name: "Online" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Integrated/i }));

    const laboratoryCard = screen.getByRole("heading", { name: "Laboratory Meeting" }).parentElement;
    const lectureCard = screen.getByRole("heading", { name: "Lecture Meeting" }).parentElement;

    expect(laboratoryCard).toBeTruthy();
    expect(lectureCard).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Integrated/i }) as HTMLInputElement).checked).toBe(true);
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

    fireEvent.click(screen.getByRole("checkbox", { name: /Integrated/i }));
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

  it("lets the user set the Integrated lecture and laboratory lengths", async () => {
    render(<HybridModalHarness modalConflict="Room conflict" />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Integrated/i }));

    const duration = (meeting: string) =>
      screen.getByRole("combobox", { name: `${meeting} duration` }) as HTMLSelectElement;
    // The course's own lengths to begin with -- three hours of laboratory for
    // its one laboratory unit, two of lecture for its two lecture units --
    // rather than a fixed 3 + 2 the user cannot move.
    expect(duration("Laboratory Meeting").value).toBe("6");
    expect(duration("Lecture Meeting").value).toBe("4");
    // Each session is the user's own length: no unit-derived week caps the
    // pair, so the lecture grows past the 2 h its units give while the
    // laboratory keeps its 3 h. Only the end of the teaching day bounds it.
    expect(duration("Lecture Meeting").options.length).toBeGreaterThan(6);

    fireEvent.change(duration("Lecture Meeting"), { target: { value: "6" } });

    expect(duration("Lecture Meeting").value).toBe("6");
    expect(duration("Laboratory Meeting").value).toBe("6");

    fireEvent.change(duration("Laboratory Meeting"), { target: { value: "8" } });

    expect(duration("Laboratory Meeting").value).toBe("8");
    // The lengths chosen are what the alternatives are asked for; without them
    // every option comes back in the shape the user has just changed.
    await waitFor(() => expect(previewCalls().at(-1)?.[1]).toMatchObject({
      component_minutes_by_course_id: { 1: { lecture: 180, laboratory: 240 } },
    }));
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

    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    const firstPayload = previewCalls()[0][1] as Record<string, unknown>;

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

    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    const secondPayload = previewCalls()[1][1] as {
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
    mockRecommendationApi();
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

  it("keeps alternatives on the course's delivery when a meeting is switched to Online", async () => {
    render(<HybridModalHarness lectureOnly modalConflict="Room conflict: BA 201 is already occupied" />);

    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0][1]).toMatchObject({ mode: "on-site" });

    // Trying Online on the meeting is not a course-wide delivery rule: it must
    // neither narrow the alternatives to online-only nor re-run the solver.
    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    const previews = previewCalls();
    expect(previews).toHaveLength(1);
    expect(previews.every(([, payload]) => (payload as { mode: string }).mode === "on-site")).toBe(true);
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

    const roomFilter = await screen.findByLabelText<HTMLSelectElement>("Filter placements by room");
    await waitFor(() => expect(roomFilter.options).toHaveLength(3));

    // The count beside each room is the number of slots that room actually has.
    expect([...roomFilter.options].map((option) => option.textContent)).toEqual([
      "All rooms (3)",
      "IT 105 (2)",
      "NEE 204 (1)",
    ]);

    // Every day the server returned gets its own heading, rather than the three
    // ranked options the panel used to be limited to.
    const panel = within(screen.getByRole("region", { name: "All valid placements" }));
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
    const panel = within(screen.getByRole("region", { name: "All valid placements" }));
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
      ]);

      render(splitHarness());

      const panel = within(await screen.findByRole("region", { name: "All valid placements" }));
      expect(panel.getByText("Valid split times")).toBeTruthy();

      // Only start slot 0 is free on Thursday *and* Friday. Slot 4 is Thursday
      // only and slot 8 Friday only, so neither can hold a shared-time pair.
      await waitFor(() => expect(panel.getAllByText("F2F | Online")).toHaveLength(1));
      expect(panel.getByText("7 AM – 8:30 AM")).toBeTruthy();

      // The room filter means nothing for a pair whose rooms come from its
      // own two meetings, so it is not offered.
      expect(screen.queryByLabelText("Filter placements by room")).toBeNull();
    });

    it("tells the solver the split is a Hybrid Split so it keeps one meeting online", async () => {
      render(splitHarness());

      await waitFor(() => expect(previewCalls()).toHaveLength(1));
      // Without this the split came back as two face-to-face meetings and the
      // online half the user set by hand was dropped.
      expect(previewCalls()[0][1]).toMatchObject({
        hybrid_split_course_ids: [1],
        split_gec_enabled: true,
      });
    });

    it("says so when no time suits both days", async () => {
      mockRecommendationApi([
        slot("Thursday", 3, "on-site", 10, 0),
        slot("Friday", 4, "online", null, 8),
      ]);

      render(splitHarness());

      const panel = within(await screen.findByRole("region", { name: "All valid placements" }));
      await waitFor(() => expect(panel.getByText(/No time is free on both days/)).toBeTruthy());
    });
  });

  it("asks for slots per meeting so an Integrated lecture can find online times", async () => {
    mockRecommendationApi([{
      day: "Monday", day_index: 0, start_slot: 0, end_slot: 6,
      start_time: "07:00:00", end_time: "10:00:00", mode: "on-site",
      room_id: 10, room_code: "CompLab2", room_type: "laboratory",
    }]);
    render(<HybridModalHarness modalConflict="Online course conflict" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Integrated/i }));

    const slotCalls = () => vi.mocked(api.post).mock.calls
      .filter(([url]) => url === "/schedule-recommendations/available-slots");

    // The laboratory half: its own length, and named as a laboratory so the
    // server keeps it on-site.
    await waitFor(() => expect(slotCalls().length).toBeGreaterThan(0));
    expect(slotCalls().at(-1)?.[1]).toMatchObject({ meeting_type: "laboratory" });

    // Day 2 is Friday in the harness, and the laboratory may not share it.
    expect(slotCalls().at(-1)?.[1]).toMatchObject({ excluded_days: ["Friday"] });

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
    fireEvent.click(screen.getByRole("checkbox", { name: /Integrated/i }));

    fireEvent.click(await screen.findByRole("button", { name: "Lecture Meeting" }));
    const panel = within(screen.getByRole("region", { name: "All valid placements" }));
    fireEvent.click(await panel.findByText("7 AM – 9 AM"));

    // modalConflict judges each meeting on parsePreferredPattern(...), not on
    // the day indexes, so a day applied without its pattern left the dialog
    // showing Wednesday while the conflict was still checked against the old
    // day. The pattern must carry the new second day (index 2).
    await waitFor(() => {
      const pattern = (previewCalls().at(-1)?.[1] as { preferred_patterns: Record<string, string> })
        .preferred_patterns["1"];
      expect(pattern).toMatch(/-2$/);
    });

    expect((screen.getByLabelText("Second meeting day") as HTMLSelectElement).value).toBe("2");
  });

  it("re-solves for the field when the meeting is switched to Field", async () => {
    render(<HybridModalHarness lectureOnly modalConflict="Section conflict" />);

    await waitFor(() => expect(previewCalls()).toHaveLength(1));
    expect(previewCalls()[0][1]).toMatchObject({ mode: "on-site" });

    // A field class cannot be in a room at all, so unlike Online this *is* a
    // course-wide restriction: leaving it out recommended lecture rooms for a
    // meeting already set to Field.
    fireEvent.click(screen.getByRole("button", { name: "Field" }));

    await waitFor(() => expect(previewCalls()).toHaveLength(2));
    expect(previewCalls()[1][1]).toMatchObject({ mode: "field" });
  });

  it("applies a recommendation without re-opening the dialog for a new cell", async () => {
    const row = {
      semester_id: 1, section_id: 1, course_id: 1, faculty_id: null, room_id: null, department_id: 1,
      day: "Tuesday", start_time: "13:00", end_time: "16:00", mode: "online", is_hybrid: false,
      preferred_pattern: null, status: "draft",
    };
    vi.mocked(api.post).mockImplementation((url) => Promise.resolve(url === "/schedule-recommendations/select"
      ? { data: { recommendation: { id: 5, recommended_schedules: [row] } } }
      : { data: { recommendations: [{ rank: 1, score: 1, schedules: [row] }] } }));
    const setDropContext = vi.fn();

    render(<HybridModalHarness lectureOnly modalConflict="Room conflict" setDropContext={setDropContext} />);
    fireEvent.click(await screen.findByRole("button", { name: "Use this option" }));

    // The dialog's own fields take the option...
    await waitFor(() => expect((screen.getByLabelText("First meeting day") as HTMLSelectElement).value).toBe("1"));
    // ...and dropContext is untouched: moving its cell re-initialised the
    // dialog, replacing the recommended room and mode with its own defaults.
    expect(setDropContext).not.toHaveBeenCalled();
  });

  it("shows why a save was refused instead of hiding it under the room field", () => {
    render(<HybridModalHarness modalValidationError="Field courses must end by 5:00 PM." />);

    expect(screen.getByText("This placement could not be saved")).toBeTruthy();
    expect(screen.getByText("Field courses must end by 5:00 PM.")).toBeTruthy();
  });
});
