import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlacementAlternatives, { type PlacementAlternativesProps } from "./PlacementAlternatives";
import { ALL_ROOMS, type AvailableSlot } from "./placementAlternativesModel";

const slot = (day: string, startSlot: number): AvailableSlot => ({
  day,
  day_index: 0,
  start_slot: startSlot,
  end_slot: startSlot + 3,
  start_time: "07:00:00",
  end_time: "08:30:00",
  mode: "on-site",
  room_id: 10,
  room_code: "IT 105",
  room_type: "lecture",
});

const slots = [slot("Monday", 0), slot("Wednesday", 4), slot("Saturday", 2)];

const props = (overrides: Partial<PlacementAlternativesProps> = {}): PlacementAlternativesProps => ({
  onClose: () => undefined,
  courseLabel: "IT 101",
  meetingTypeLabel: "Lecture",
  availableSlots: slots,
  availableSlotRooms: [{ room_id: 10, room_code: "IT 105", room_type: "lecture", mode: "on-site", slot_count: 3 }],
  visibleSlots: slots,
  isSlotsLoading: false,
  slotsError: null,
  areSlotsTruncated: false,
  roomFilter: ALL_ROOMS,
  onRoomFilterChange: () => undefined,
  onApplySlot: () => undefined,
  requestedDay: "Monday",
  bestMatches: [slots[0]],
  isSlotApplied: () => false,
  forcedDayName: null,
  splitPairStarts: null,
  onApplySplitPairStart: () => undefined,
  firstDayIndex: 0,
  secondDayIndex: 2,
  firstMode: "on-site",
  secondMode: "on-site",
  splitStartSlot: 0,
  showsMeetingSwitch: false,
  slotMeeting: "first",
  onSlotMeetingChange: () => undefined,
  firstMeetingTitle: "Meeting",
  secondMeetingTitle: "Second Meeting",
  ...overrides,
});

describe("PlacementAlternatives", () => {
  afterEach(cleanup);

  it("opens on Best Match and applies the chosen option", () => {
    const onApplySlot = vi.fn();
    render(<PlacementAlternatives {...props({ onApplySlot })} />);

    expect(screen.getByRole("tab", { name: /Best Match/ }).getAttribute("aria-selected")).toBe("true");
    const best = within(screen.getByRole("list", { name: "Best matches" }));
    expect(best.getByText("Best match")).toBeTruthy();

    fireEvent.click(best.getByRole("button", { name: "Use this option" }));
    expect(onApplySlot).toHaveBeenCalledWith(slots[0]);
  });

  it("says so when the requested day has no free room and time", () => {
    render(<PlacementAlternatives {...props({ bestMatches: [], requestedDay: "Tuesday" })} />);

    expect(screen.getByText(/No room and time is free on/)).toBeTruthy();
  });

  it("splits the full list into Weekdays (Mon-Thu) and Weekend (Fri-Sat)", () => {
    render(<PlacementAlternatives {...props()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    let list = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(list.getByText(/^Monday$/)).toBeTruthy();
    expect(list.getByText(/^Wednesday$/)).toBeTruthy();
    expect(list.queryByText(/^Saturday$/)).toBeNull();
    expect(screen.getByLabelText("Filter placements by room")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Weekend/ }));
    list = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(list.getByText(/^Saturday$/)).toBeTruthy();
    expect(list.queryByText(/^Monday$/)).toBeNull();
  });

  it("keeps a slot off the Force Day from being applied", () => {
    render(<PlacementAlternatives {...props({ forcedDayName: "Wednesday" })} />);

    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    const buttons = within(screen.getByRole("region", { name: "Valid placements" })).getAllByRole("button");
    expect(buttons.map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, false]);
  });

  it("says so when there is nothing to offer", () => {
    render(<PlacementAlternatives {...props({ availableSlots: [], visibleSlots: [], bestMatches: [] })} />);

    expect(screen.getByText("No alternatives found")).toBeTruthy();
  });

  it("shows why suggestions could not be loaded", () => {
    render(<PlacementAlternatives {...props({ slotsError: "Suggestions are unavailable right now." })} />);

    expect(screen.getByText("Suggestions are unavailable right now.")).toBeTruthy();
  });

  it("opens as a dialog and closes from its close button or backdrop", () => {
    const onClose = vi.fn();
    render(<PlacementAlternatives {...props({ onClose })} />);

    const dialog = screen.getByRole("dialog", { name: "Suggested Alternatives" });
    expect(within(dialog).getByText(/for IT 101/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close suggested alternatives" }));

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close suggested alternatives" }));
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows each option's day, time, room and meeting type", () => {
    render(<PlacementAlternatives {...props({ meetingTypeLabel: "Laboratory Meeting" })} />);

    const best = within(screen.getByRole("list", { name: "Best matches" }));
    expect(best.getByText("Mon")).toBeTruthy();
    expect(best.getByText(/^7 AM – /)).toBeTruthy();
    expect(best.getByText("IT 105")).toBeTruthy();
    expect(best.getByText("Laboratory Meeting")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Weekdays/ }));
    const list = within(screen.getByRole("region", { name: "Valid placements" }));
    expect(list.getAllByText("Laboratory Meeting")).toHaveLength(2);
    expect(list.getAllByText("IT 105")).toHaveLength(2);
  });

  it("offers the meeting filter for two-meeting classes", () => {
    const onSlotMeetingChange = vi.fn();
    render(<PlacementAlternatives {...props({
      showsMeetingSwitch: true,
      firstMeetingTitle: "Laboratory Meeting",
      secondMeetingTitle: "Lecture Meeting",
      onSlotMeetingChange,
    })} />);

    expect(screen.getByRole("button", { name: "Laboratory Meeting" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Lecture Meeting" }));
    expect(onSlotMeetingChange).toHaveBeenCalledWith("second");
  });

  it("shows both days and the rooms of a shared-time split", () => {
    render(<PlacementAlternatives {...props({
      splitPairStarts: [{ startSlot: 4, endSlot: 7, roomLabel: "IT 105 | Online" }],
      secondMode: "online",
    })} />);

    const pairs = within(screen.getByRole("region", { name: "Valid split times" }));
    expect(pairs.getByText("Mon + Wed")).toBeTruthy();
    expect(pairs.getByText("IT 105 | Online")).toBeTruthy();
    expect(pairs.getByText("Split · both meetings")).toBeTruthy();
    expect(pairs.getByText("F2F | Online")).toBeTruthy();
  });
});
