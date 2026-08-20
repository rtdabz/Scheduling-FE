import { afterEach, describe, expect, it, vi } from "vitest";
import { getStoredUser, getStoredUserDepartmentId, getStoredUserRole } from "./storedUser";

/**
 * Guards the fix for audit finding #5: a malformed session blob must not throw.
 * useScheduler parsed it unguarded in its render path, so a corrupt entry
 * blanked the whole Schedule Builder with no in-app recovery.
 */

const setStorage = (store: "local" | "session", value: string | null) => {
  const target = store === "local" ? window.localStorage : window.sessionStorage;
  if (value === null) {
    target.removeItem("user");
  } else {
    target.setItem("user", value);
  }
};

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("getStoredUser", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("parses a valid user from localStorage", () => {
    setStorage("local", JSON.stringify({ id: 4, role: "secretary", department_id: 2 }));
    expect(getStoredUser()).toEqual({ id: 4, role: "secretary", department_id: 2 });
  });

  it("falls back to sessionStorage when localStorage is empty", () => {
    setStorage("session", JSON.stringify({ id: 9, role: "program_head" }));
    expect(getStoredUser()).toMatchObject({ id: 9, role: "program_head" });
  });

  it.each([
    ["truncated json", '{"id":4,"role":"secre'],
    ["empty braces fragment", "{"],
    ["plain text", "not-json-at-all"],
    ["json null", "null"],
    ["json array", "[1,2,3]"],
    ["json scalar", '"secretary"'],
  ])("returns null instead of throwing for %s", (_label, raw) => {
    setStorage("local", raw);
    expect(() => getStoredUser()).not.toThrow();
    expect(getStoredUser()).toBeNull();
  });

  it("returns null instead of throwing when storage access is blocked", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled");
    });

    expect(() => getStoredUser()).not.toThrow();
    expect(getStoredUser()).toBeNull();
  });
});

describe("getStoredUserRole", () => {
  it("lowercases the stored role", () => {
    setStorage("local", JSON.stringify({ role: "VPAA" }));
    expect(getStoredUserRole()).toBe("vpaa");
  });

  it("returns an empty string for a corrupt entry", () => {
    setStorage("local", "{oops");
    expect(getStoredUserRole()).toBe("");
  });

  it("returns an empty string when the role is missing", () => {
    setStorage("local", JSON.stringify({ id: 1 }));
    expect(getStoredUserRole()).toBe("");
  });
});

describe("getStoredUserDepartmentId", () => {
  it("coerces a string department id to a number", () => {
    setStorage("local", JSON.stringify({ department_id: "2" }));
    expect(getStoredUserDepartmentId()).toBe(2);
  });

  it("returns null for a VPAA with no department", () => {
    setStorage("local", JSON.stringify({ role: "vpaa", department_id: null }));
    expect(getStoredUserDepartmentId()).toBeNull();
  });

  it("returns null for a non-numeric department id", () => {
    setStorage("local", JSON.stringify({ department_id: "abc" }));
    expect(getStoredUserDepartmentId()).toBeNull();
  });

  it("returns null for a corrupt entry", () => {
    setStorage("local", "]");
    expect(getStoredUserDepartmentId()).toBeNull();
  });
});
