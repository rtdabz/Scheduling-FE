import { describe, expect, it } from "vitest";
import { formatPersonListName, formatPersonName, personSortName, titleOptions } from "./personName";
import { formatFacultyListName } from "./formatters";
import { facultyNameParts } from "../pages/ClassSchedules/SchedulerPanel/teachingLoadName";

const juan = { first_name: "Juan", last_name: "Dela Cruz" };

describe("formatPersonName", () => {
  it("places the title before and credentials after the structured name", () => {
    expect(formatPersonName(juan)).toBe("Juan Dela Cruz");
    expect(formatPersonName({ ...juan, honorific_prefix: "Dr." })).toBe("Dr. Juan Dela Cruz");
    expect(formatPersonName({ ...juan, credentials: "DM" })).toBe("Juan Dela Cruz, DM");
    expect(formatPersonName({ ...juan, honorific_prefix: "Dr.", middle_initial: "P", suffix: "Jr.", credentials: "DM" }))
      .toBe("Dr. Juan P. Dela Cruz Jr., DM");
  });

  it("uses the initial of a full middle name", () => {
    expect(formatPersonName({ ...juan, middle_name: "pascual" })).toBe("Juan P. Dela Cruz");
  });

  it("never leaves extra spaces or dangling commas", () => {
    expect(formatPersonName({ ...juan, honorific_prefix: " ", suffix: "", credentials: "  " })).toBe("Juan Dela Cruz");
    expect(formatPersonName({ ...juan, honorific_prefix: null, credentials: null })).toBe("Juan Dela Cruz");
    expect(formatPersonName({ ...juan, credentials: " , PhD,  EdD , " })).toBe("Juan Dela Cruz, PhD, EdD");
  });

  it("keeps credentials exactly as typed", () => {
    expect(formatPersonName({ ...juan, credentials: "PhD, M.A.Ed." })).toBe("Juan Dela Cruz, PhD, M.A.Ed.");
  });
});

describe("list and sort names", () => {
  it("formats rosters surname first and keeps sorting free of titles", () => {
    const record = { ...juan, honorific_prefix: "Dr.", middle_name: "P", suffix: "Jr.", credentials: "DM" };
    expect(formatPersonListName(record)).toBe("Dela Cruz, Dr. Juan P. Jr., DM");
    expect(formatFacultyListName(record)).toBe("Dela Cruz, Dr. Juan P. Jr., DM");
    expect(formatFacultyListName({ ...juan, middle_name: null, suffix: null })).toBe("Dela Cruz, Juan");
    expect(personSortName(record)).toBe("Juan Dela Cruz");
  });

  it("puts the title and credentials on the teaching-load full name only", () => {
    const parts = facultyNameParts({
      id: "1", name: "", honorificPrefix: "Dr.", firstName: "Juan", middleName: "P", lastName: "Dela Cruz", suffix: "Jr.", credentials: "DM",
    });
    expect(parts).toEqual({ surname: "Dela Cruz", givenName: "Juan Jr.", middleInitial: "P.", fullName: "Dr. Juan P. Dela Cruz Jr., DM" });
  });
});

describe("titleOptions", () => {
  it("keeps a saved title visible when it is not offered", () => {
    expect(titleOptions(["Dr.", "Prof."], "Dr.")).toEqual(["Dr.", "Prof."]);
    expect(titleOptions(["Dr."], "Rev.")).toEqual(["Rev.", "Dr."]);
    expect(titleOptions(["Dr."], "")).toEqual(["Dr."]);
  });
});
