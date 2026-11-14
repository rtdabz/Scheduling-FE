import { describe, expect, it } from "vitest";
import {
  availableDays,
  excludedDays,
  includedDays,
  preferredDaysAfterSundayChange,
  toggleExcludedDay,
} from "./preferredDays";

const MON_SAT = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL = [...MON_SAT, "Sunday"];

describe("preferred days by exclusion", () => {
  it("offers Monday to Saturday, plus Sunday unless Sunday classes are off", () => {
    expect(availableDays(false)).toEqual(MON_SAT);
    expect(availableDays(true)).toEqual(ALL);
    expect(availableDays(null)).toEqual(ALL);
  });

  it("treats an empty list as every open day in, none excluded", () => {
    expect(includedDays([], MON_SAT)).toEqual(MON_SAT);
    expect(excludedDays([], MON_SAT)).toEqual([]);
  });

  it("reads an existing inclusion list as exclusions", () => {
    expect(excludedDays(["Monday", "Wednesday"], MON_SAT)).toEqual([
      "Tuesday", "Thursday", "Friday", "Saturday",
    ]);
  });

  it("excludes a clicked day and keeps the rest in calendar order", () => {
    expect(toggleExcludedDay([], "Saturday", MON_SAT)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    ]);
  });

  it("restores an excluded day, back to no limit when nothing is excluded", () => {
    const withoutSat = toggleExcludedDay([], "Saturday", MON_SAT);
    expect(toggleExcludedDay(withoutSat, "Saturday", MON_SAT)).toEqual([]);
  });

  it("refuses to exclude the last remaining day", () => {
    expect(toggleExcludedDay(["Monday"], "Monday", MON_SAT)).toEqual(["Monday"]);
  });

  it("ignores a day that is not open", () => {
    expect(toggleExcludedDay([], "Sunday", MON_SAT)).toEqual([]);
  });

  it("includes Sunday by default when Sunday classes are turned on", () => {
    expect(preferredDaysAfterSundayChange(["Monday", "Tuesday"], true)).toEqual([
      "Monday", "Tuesday", "Sunday",
    ]);
    expect(preferredDaysAfterSundayChange([], true)).toEqual([]);
  });

  it("drops Sunday when Sunday classes are turned off", () => {
    expect(preferredDaysAfterSundayChange(["Monday", "Sunday"], false)).toEqual(["Monday"]);
    // Only Sunday was excluded; with Sunday gone, nothing is.
    expect(preferredDaysAfterSundayChange(MON_SAT, false)).toEqual([]);
  });
});
