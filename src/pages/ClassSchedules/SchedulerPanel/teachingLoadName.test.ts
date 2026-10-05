import { describe, expect, it } from "vitest";
import { facultyNameParts } from "./teachingLoadName";
import type { Faculty } from "./types";

const faculty = (overrides: Partial<Faculty>): Faculty => ({ id: "1", name: "", ...overrides });

describe("facultyNameParts", () => {
  it("prints the middle initial from the stored middle name, whether full or a single letter", () => {
    expect(facultyNameParts(faculty({ name: "Kay Rejoice Waga", firstName: "Kay Rejoice", middleName: "C", lastName: "Waga" })))
      .toEqual({ surname: "Waga", givenName: "Kay Rejoice", middleInitial: "C.", fullName: "Kay Rejoice C. Waga" });
    expect(facultyNameParts(faculty({ name: "Juan Cruz", firstName: "Juan", middleName: "dela Paz", lastName: "Cruz" })).middleInitial)
      .toBe("D.");
  });

  it("keeps the suffix with the given name and as stored", () => {
    expect(facultyNameParts(faculty({ name: "Jose Rizal", firstName: "Jose", middleName: "P", lastName: "Rizal", suffix: "III" })))
      .toEqual({ surname: "Rizal", givenName: "Jose III", middleInitial: "P.", fullName: "Jose P. Rizal III" });
    expect(facultyNameParts(faculty({ name: "Ana Reyes", firstName: "Ana", lastName: "Reyes", suffix: "Jr." })).fullName)
      .toBe("Ana Reyes Jr.");
  });

  it("leaves the MI blank when no middle name is stored", () => {
    expect(facultyNameParts(faculty({ name: "Ana Reyes", firstName: "ana", middleName: null, lastName: "REYES" })))
      .toEqual({ surname: "Reyes", givenName: "Ana", middleInitial: "", fullName: "Ana Reyes" });
  });

  it("falls back to splitting the display name when the parts are missing", () => {
    expect(facultyNameParts(faculty({ name: "Maria L. Santos" })))
      .toEqual({ surname: "Santos", givenName: "Maria", middleInitial: "L.", fullName: "Maria L. Santos" });
  });
});
