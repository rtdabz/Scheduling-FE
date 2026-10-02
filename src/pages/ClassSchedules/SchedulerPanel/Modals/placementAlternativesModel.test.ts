import { describe, expect, it } from "vitest";
import { groupSlotsByDay, rankBestMatches, type AvailableSlot, type BestMatchCriteria } from "./placementAlternativesModel";
import type { DeliveryMode } from "../types";

const slot = (day: string, startSlot: number, roomId: number | null = 10, mode: DeliveryMode = "on-site"): AvailableSlot => ({
  day,
  day_index: 0,
  start_slot: startSlot,
  end_slot: startSlot + 3,
  start_time: "07:00:00",
  end_time: "08:30:00",
  mode,
  room_id: roomId,
  room_code: roomId == null ? "Online" : `R${roomId}`,
  room_type: roomId == null ? "online" : "lecture",
});

const criteria = (overrides: Partial<BestMatchCriteria> = {}): BestMatchCriteria => ({
  day: "Monday",
  startSlot: 4,
  roomKey: "10",
  penaltyOf: () => 0,
  ...overrides,
});

const describeSlot = (item: AvailableSlot) => `${item.day} ${item.start_slot} ${item.room_code}`;

describe("rankBestMatches", () => {
  it("only offers the requested day", () => {
    const ranked = rankBestMatches([slot("Tuesday", 4), slot("Monday", 8)], criteria());

    expect(ranked.map(describeSlot)).toEqual(["Monday 8 R10"]);
  });

  it("puts the fewest soft-preference notes first, then the nearest start", () => {
    const ranked = rankBestMatches(
      [slot("Monday", 3), slot("Monday", 10), slot("Monday", 6)],
      criteria({ penaltyOf: (item) => (item.start_slot === 3 ? 2 : 0) }),
    );

    expect(ranked.map((item) => item.start_slot)).toEqual([6, 10, 3]);
  });

  it("keeps the chosen room, then a room over online, at the same start", () => {
    const ranked = rankBestMatches(
      [slot("Monday", 4, null, "online"), slot("Monday", 4, 11), slot("Monday", 4, 10)],
      criteria(),
      5,
    );

    // One option per start time: the best room for it.
    expect(ranked.map(describeSlot)).toEqual(["Monday 4 R10"]);

    const withoutChosenRoom = rankBestMatches(
      [slot("Monday", 4, null, "online"), slot("Monday", 4, 11)],
      criteria(),
    );
    expect(withoutChosenRoom.map(describeSlot)).toEqual(["Monday 4 R11"]);
  });

  it("stops at the limit", () => {
    const ranked = rankBestMatches(
      Array.from({ length: 10 }, (_, index) => slot("Monday", index)),
      criteria(),
      3,
    );

    expect(ranked).toHaveLength(3);
  });
});

describe("groupSlotsByDay", () => {
  it("lists the given days in calendar order and leaves out empty ones", () => {
    const groups = groupSlotsByDay(
      [slot("Thursday", 0), slot("Monday", 2), slot("Saturday", 0), slot("Monday", 0)],
      ["Monday", "Tuesday", "Wednesday", "Thursday"],
    );

    expect(groups.map(([day, items]) => [day, items.length])).toEqual([["Monday", 2], ["Thursday", 1]]);
  });
});
