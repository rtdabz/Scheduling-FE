import { describe, expect, it } from "vitest";
import { groupSlotsByDay, type AvailableSlot } from "./placementAlternativesModel";
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

describe("groupSlotsByDay", () => {
  it("lists the given days in calendar order and leaves out empty ones", () => {
    const groups = groupSlotsByDay(
      [slot("Thursday", 0), slot("Monday", 2), slot("Saturday", 0), slot("Monday", 0)],
      ["Monday", "Tuesday", "Wednesday", "Thursday"],
    );

    expect(groups.map(([day, items]) => [day, items.length])).toEqual([["Monday", 2], ["Thursday", 1]]);
  });
});
