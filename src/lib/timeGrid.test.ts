import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import {
  buildPreferredPattern,
  closingTimeLabel,
  configureTimeGrid,
  resetTimeGrid,
  slotCount,
  dayNameToIndex,
  parsePreferredPattern,
  slotToTime24h,
  slotToTimeLabel,
  timeToSlot,
  timeToSlotUnclamped,
  formatTime12h,
} from "./timeGrid";

/**
 * Guards the fix for audit finding #18: these conversions were copy-pasted with
 * three different rounding rules. One implementation now backs them all.
 */

describe("timeToSlot", () => {
  it.each([
    ["07:00", 0],
    ["07:30", 1],
    ["08:00", 2],
    ["12:00", 10],
    ["18:30", 23],
    ["19:00", 24],
  ])("maps %s to slot %i", (time, expected) => {
    expect(timeToSlot(time)).toBe(expected);
  });

  it("accepts seconds in the value, as the API returns them", () => {
    expect(timeToSlot("08:30:00")).toBe(3);
  });

  it("rounds off-grid times to the nearest slot", () => {
    expect(timeToSlot("08:20")).toBe(3);
    expect(timeToSlot("08:10")).toBe(2);
  });

  it("clamps times before the grid opens to slot 0", () => {
    expect(timeToSlot("06:00")).toBe(0);
    expect(timeToSlot("00:00")).toBe(0);
  });

  it("returns 0 for unparseable input rather than NaN", () => {
    expect(timeToSlot("")).toBe(0);
    expect(timeToSlot("not-a-time")).toBe(0);
    expect(timeToSlot("08")).toBe(0);
  });
});

describe("timeToSlotUnclamped", () => {
  it("keeps pre-opening times negative so availability windows stay intact", () => {
    expect(timeToSlotUnclamped("06:00")).toBe(-2);
    expect(timeToSlotUnclamped("07:00")).toBe(0);
  });

  it("agrees with timeToSlot from the opening time onward", () => {
    for (let slot = 0; slot <= 24; slot += 1) {
      const time = slotToTime24h(slot);
      expect(timeToSlotUnclamped(time)).toBe(timeToSlot(time));
    }
  });
});

describe("slotToTime24h", () => {
  it.each([
    [0, "07:00"],
    [1, "07:30"],
    [10, "12:00"],
    [24, "19:00"],
  ])("maps slot %i to %s", (slot, expected) => {
    expect(slotToTime24h(slot)).toBe(expected);
  });

  it("round-trips with timeToSlot for every grid slot", () => {
    for (let slot = 0; slot <= 24; slot += 1) {
      expect(timeToSlot(slotToTime24h(slot))).toBe(slot);
    }
  });
});

describe("slotToTimeLabel", () => {
  it.each([
    [0, "7 AM"],
    [1, "7:30 AM"],
    [10, "12 PM"],
    [11, "12:30 PM"],
    [12, "1 PM"],
    [24, "7 PM"],
  ])("maps slot %i to %s", (slot, expected) => {
    expect(slotToTimeLabel(slot)).toBe(expected);
  });
});

describe("formatTime12h", () => {
  it("renders stored 24-hour times as 12-hour labels", () => {
    expect(formatTime12h("07:00:00")).toBe("7:00 AM");
    expect(formatTime12h("13:00:00")).toBe("1:00 PM");
    expect(formatTime12h("15:30:00")).toBe("3:30 PM");
  });

  it("maps both midnight and noon onto 12", () => {
    expect(formatTime12h("00:00:00")).toBe("12:00 AM");
    expect(formatTime12h("12:00:00")).toBe("12:00 PM");
    expect(formatTime12h("12:45:00")).toBe("12:45 PM");
  });

  it("accepts values without seconds", () => {
    expect(formatTime12h("09:05")).toBe("9:05 AM");
    expect(formatTime12h("9")).toBe("9:00 AM");
  });

  it("returns an empty string for a missing time", () => {
    expect(formatTime12h(null)).toBe("");
    expect(formatTime12h(undefined)).toBe("");
    expect(formatTime12h("")).toBe("");
  });

  it("passes unrecognized input through rather than rendering NaN", () => {
    expect(formatTime12h("TBA")).toBe("TBA");
  });
});

describe("dayNameToIndex", () => {
  it.each([
    ["Monday", 0],
    ["Mon", 0],
    ["Sunday", 6],
    ["Sun", 6],
    ["Saturday", 5],
  ])("maps %s to %i", (day, expected) => {
    expect(dayNameToIndex(day)).toBe(expected);
  });

  it("returns -1 for an unrecognized day instead of silently meaning Monday", () => {
    expect(dayNameToIndex("Funday")).toBe(-1);
    expect(dayNameToIndex("")).toBe(-1);
  });
});

describe("parsePreferredPattern", () => {
  it.each([
    ["MW", [0, 2]],
    ["TTh", [1, 3]],
    ["days:0-2", [0, 2]],
    ["days:5-6", [5, 6]],
  ])("parses %s", (pattern, expected) => {
    expect(parsePreferredPattern(pattern)).toEqual(expected);
  });

  it.each([null, undefined, "", "MWF", "days:7-8", "days:1", "days:a-b"])(
    "returns null for %s",
    (pattern) => {
      expect(parsePreferredPattern(pattern as string | null | undefined)).toBeNull();
    },
  );

  it("round-trips with buildPreferredPattern", () => {
    expect(parsePreferredPattern(buildPreferredPattern(1, 4))).toEqual([1, 4]);
  });
});

afterEach(() => {
  resetTimeGrid();
});

/**
 * Guards the fix for finding #33: the window is a stored setting, so the client
 * must read it rather than assume 07:00-19:00.
 */
describe("configureTimeGrid", () => {
  it("defaults to the server defaults", () => {
    expect(slotCount()).toBe(24);
    expect(timeToSlot("07:00")).toBe(0);
    expect(closingTimeLabel()).toBe("19:00");
  });

  it("widens the grid when the server opens earlier and closes later", () => {
    configureTimeGrid({ opening_time: "06:00", closing_time: "21:00", slot_minutes: 30 });

    expect(slotCount()).toBe(30);
    expect(timeToSlot("06:00")).toBe(0);
    expect(timeToSlot("07:00")).toBe(2);
    expect(slotToTime24h(0)).toBe("06:00");
    expect(closingTimeLabel()).toBe("21:00");
  });

  it("no longer clamps a 06:00 class onto the 07:00 row once the window includes it", () => {
    expect(timeToSlot("06:00")).toBe(0);        // clamped against the default window
    configureTimeGrid({ opening_time: "06:00", closing_time: "19:00", slot_minutes: 30 });
    expect(timeToSlot("06:00")).toBe(0);        // genuinely the first row now
    expect(timeToSlot("07:00")).toBe(2);
  });

  it("keeps a class after the old ceiling inside the grid", () => {
    configureTimeGrid({ opening_time: "07:00", closing_time: "21:00", slot_minutes: 30 });

    expect(timeToSlot("19:30")).toBe(25);
    expect(25).toBeLessThan(slotCount());
  });

  it("honours a different slot interval", () => {
    configureTimeGrid({ opening_time: "07:00", closing_time: "19:00", slot_minutes: 60 });

    expect(slotCount()).toBe(12);
    expect(timeToSlot("08:00")).toBe(1);
    expect(slotToTime24h(1)).toBe("08:00");
  });

  it("ignores a malformed or empty payload", () => {
    configureTimeGrid({ opening_time: "nonsense", closing_time: null, slot_minutes: 0 });
    expect(slotCount()).toBe(24);

    configureTimeGrid(null);
    expect(slotCount()).toBe(24);
  });
});
