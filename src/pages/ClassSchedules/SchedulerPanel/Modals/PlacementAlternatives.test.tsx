import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlacementAlternatives, { type PlacementAlternativesProps } from "./PlacementAlternatives";
import { ALL_ROOMS, type AvailableSlot, type DropRecommendation } from "./placementAlternativesModel";

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

const pick: DropRecommendation = {
  rank: 1,
  score: 90,
  schedules: [{
    semester_id: 1,
    section_id: 1,
    course_id: 1,
    faculty_id: null,
    room_id: 10,
    department_id: 1,
    day: "Tuesday",
    start_time: "09:00:00",
    end_time: "10:30:00",
    mode: "on-site",
    is_hybrid: false,
    preferred_pattern: null,
    status: "draft",
  }],
};

const slots = [slot("Monday", 0), slot("Wednesday", 4)];

const props = (overrides: Partial<PlacementAlternativesProps> = {}): PlacementAlternativesProps => ({
  rooms: [],
  recommendations: [pick],
  arePicksLoading: false,
  recommendationError: null,
  confirmationPrompt: null,
  onConfirmConfiguration: () => undefined,
  appliedRecommendationRank: null,
  isApplyingRecommendation: false,
  missesForcedDay: () => false,
  forcedDayName: null,
  onApplyRecommendation: () => undefined,
  availableSlots: slots,
  availableSlotRooms: [{ room_id: 10, room_code: "IT 105", room_type: "lecture", mode: "on-site", slot_count: 2 }],
  visibleSlots: slots,
  slotsByDay: [["Monday", [slots[0]]], ["Wednesday", [slots[1]]]],
  isSlotsLoading: false,
  areSlotsTruncated: false,
  roomFilter: ALL_ROOMS,
  onRoomFilterChange: () => undefined,
  onApplySlot: () => undefined,
  splitPairStarts: null,
  onApplySplitPairStart: () => undefined,
  firstDayIndex: 0,
  secondDayIndex: 2,
  firstMode: "on-site",
  secondMode: "on-site",
  showsMeetingSwitch: false,
  slotMeeting: "first",
  onSlotMeetingChange: () => undefined,
  firstMeetingTitle: "Meeting",
  secondMeetingTitle: "Second Meeting",
  ...overrides,
});

describe("PlacementAlternatives", () => {
  afterEach(cleanup);

  it("leads with the ranked picks and keeps the full list behind Show all", () => {
    const onApplyRecommendation = vi.fn();
    render(<PlacementAlternatives {...props({ onApplyRecommendation })} />);

    expect(screen.getByRole("list", { name: "Generator picks" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "All valid placements" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use this option" }));
    expect(onApplyRecommendation).toHaveBeenCalledWith(pick);

    fireEvent.click(screen.getByRole("button", { name: "Show all 2 valid placements" }));
    expect(screen.getByRole("region", { name: "All valid placements" })).toBeTruthy();
    expect(screen.getByLabelText("Filter placements by room")).toBeTruthy();
  });

  it("opens the full list straight away when there are no picks", () => {
    render(<PlacementAlternatives {...props({ recommendations: [] })} />);

    expect(screen.getByRole("region", { name: "All valid placements" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("says so when there is nothing to offer", () => {
    render(<PlacementAlternatives {...props({ recommendations: [], availableSlots: [], visibleSlots: [], slotsByDay: [] })} />);

    expect(screen.getByText("No alternatives found")).toBeTruthy();
  });
});
