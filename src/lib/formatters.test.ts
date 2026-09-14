import { describe, expect, it } from "vitest";
import { capitalizeNameInput, formatFacultyListName } from "./formatters";

describe("capitalizeNameInput", () => {
  it("capitalizes the first letter of every word", () => {
    expect(capitalizeNameInput("del rosario")).toBe("Del Rosario");
    expect(capitalizeNameInput("roberto a.")).toBe("Roberto A.");
    expect(capitalizeNameInput("mary-ann")).toBe("Mary-Ann");
  });

  it("leaves the rest of each word as typed", () => {
    expect(capitalizeNameInput("McDonald")).toBe("McDonald");
    expect(capitalizeNameInput("JOSE")).toBe("JOSE");
  });

  it("is stable on every keystroke, including a trailing space", () => {
    expect(capitalizeNameInput("d")).toBe("D");
    expect(capitalizeNameInput("Del ")).toBe("Del ");
    expect(capitalizeNameInput("Del r")).toBe("Del R");
    expect(capitalizeNameInput("peña")).toBe("Peña");
    expect(capitalizeNameInput("ñino")).toBe("Ñino");
  });
});

describe("formatFacultyListName", () => {
  it("puts the suffix after the middle initial", () => {
    expect(formatFacultyListName({ last_name: "Del Rosario", first_name: "Roberto", middle_name: "Alonzo", suffix: "Jr." }))
      .toBe("Del Rosario, Roberto A. Jr.");
  });

  it("omits the parts a record does not have", () => {
    expect(formatFacultyListName({ last_name: "Cruz", first_name: "Ana", middle_name: null, suffix: null })).toBe("Cruz, Ana");
  });
});
