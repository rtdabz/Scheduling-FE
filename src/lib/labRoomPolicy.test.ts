import { afterEach, describe, expect, it } from "vitest";
import { configureLabRoomType, isLabMeetingRoomType, labRoomTypes, roomTypeSatisfies } from "./labRoomPolicy";

describe("Default LAB Room Requirement", () => {
  afterEach(() => configureLabRoomType("laboratory"));

  it("defaults to laboratory rooms", () => {
    configureLabRoomType(undefined);
    expect(labRoomTypes()).toEqual(["laboratory"]);
    expect(roomTypeSatisfies("laboratory", "lecture")).toBe(false);
  });

  it("keeps a laboratory meeting out of classrooms under a legacy Classroom setting", () => {
    configureLabRoomType("lecture");
    expect(labRoomTypes()).toEqual(["laboratory"]);
    expect(isLabMeetingRoomType("lecture")).toBe(false);
    expect(isLabMeetingRoomType("laboratory")).toBe(true);
  });

  it("keeps a laboratory meeting out of classrooms under a legacy Either setting", () => {
    configureLabRoomType("either");
    expect(roomTypeSatisfies("laboratory", "lecture")).toBe(false);
    expect(roomTypeSatisfies("laboratory", "laboratory")).toBe(true);
    expect(roomTypeSatisfies("lecture", "field")).toBe(false);
  });
});
