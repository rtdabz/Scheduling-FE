import { describe, expect, it } from "vitest";
import { buildRoomUsage, isVirtualRoom, physicalRooms, roomsInUse, type UsageRoom } from "./roomUsage";

const room = (over: Partial<UsageRoom> & { id: number }): UsageRoom => ({
  room_code: `R${over.id}`,
  room_type: "lecture",
  building: "Main",
  status: "available",
  ...over,
});

describe("isVirtualRoom", () => {
  it("treats the online and field placeholders as virtual", () => {
    expect(isVirtualRoom({ room_type: "online" })).toBe(true);
    expect(isVirtualRoom({ room_type: "Field" })).toBe(true);
    expect(isVirtualRoom({ room_type: " ONLINE " })).toBe(true);
  });

  it("treats rooms someone can walk into as physical", () => {
    expect(isVirtualRoom({ room_type: "lecture" })).toBe(false);
    expect(isVirtualRoom({ room_type: "laboratory" })).toBe(false);
    expect(isVirtualRoom({ room_type: "" })).toBe(false);
  });
});

describe("physicalRooms", () => {
  it("drops the placeholders from the inventory", () => {
    const rooms = [room({ id: 1 }), room({ id: 37, room_type: "online" }), room({ id: 38, room_type: "field" })];
    expect(physicalRooms(rooms).map(r => r.id)).toEqual([1]);
  });
});

describe("buildRoomUsage", () => {
  it("orders rooms busiest first", () => {
    const rooms = [room({ id: 1, room_code: "IT 105" }), room({ id: 2, room_code: "NEE 204" }), room({ id: 3, room_code: "CompLab1" })];
    const usage = buildRoomUsage(rooms, new Map([[1, 4], [2, 11], [3, 7]]));
    expect(usage.map(r => r.code)).toEqual(["NEE 204", "CompLab1", "IT 105"]);
    expect(usage.map(r => r.classes)).toEqual([11, 7, 4]);
  });

  it("scales the bar against the busiest room, not an absolute ceiling", () => {
    const usage = buildRoomUsage([room({ id: 1 }), room({ id: 2 })], new Map([[1, 10], [2, 5]]));
    expect(usage.map(r => r.share)).toEqual([100, 50]);
  });

  it("keeps rooms with no classes at zero rather than dividing by zero", () => {
    const usage = buildRoomUsage([room({ id: 1 }), room({ id: 2 })], new Map());
    expect(usage.map(r => r.classes)).toEqual([0, 0]);
    expect(usage.map(r => r.share)).toEqual([0, 0]);
  });

  it("never lists the virtual placeholders as rooms", () => {
    const rooms = [room({ id: 1 }), room({ id: 37, room_code: "ONLINE", room_type: "online", building: null })];
    expect(buildRoomUsage(rooms, new Map([[37, 85]])).map(r => r.code)).toEqual(["R1"]);
  });

  it("labels the type in sentence case and falls back when the building is blank", () => {
    const usage = buildRoomUsage([room({ id: 1, room_type: "laboratory", building: null })], new Map());
    expect(usage[0].typeLabel).toBe("Laboratory");
    expect(usage[0].location).toBe("—");
  });

  it("flags rooms whose status is anything but available", () => {
    const usage = buildRoomUsage(
      [room({ id: 1, room_code: "A", status: "under_maintenance" }), room({ id: 2, room_code: "B", status: "Available" })],
      new Map([[1, 1], [2, 1]]),
    );
    expect(usage.find(r => r.code === "A")?.isUnavailable).toBe(true);
    expect(usage.find(r => r.code === "B")?.isUnavailable).toBe(false);
  });

  it("breaks ties on code so the order does not wobble between renders", () => {
    const rooms = [room({ id: 1, room_code: "Zeta" }), room({ id: 2, room_code: "Alpha" })];
    expect(buildRoomUsage(rooms, new Map([[1, 3], [2, 3]])).map(r => r.code)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("roomsInUse", () => {
  it("counts only rooms carrying classes", () => {
    const usage = buildRoomUsage([room({ id: 1 }), room({ id: 2 }), room({ id: 3 })], new Map([[1, 2], [3, 1]]));
    expect(roomsInUse(usage)).toBe(2);
  });
});
