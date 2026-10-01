import { afterEach, describe, expect, it } from "vitest";
import { configureLabRoomType, isLabMeetingRoomType, labRoomTypes, roomTypeSatisfies } from "./labRoomPolicy";

describe("Default LAB Room Requirement", () => {
  afterEach(() => configureLabRoomType("laboratory"));

  it("defaults to laboratory rooms", () => {
    configureLabRoomType(undefined);
    expect(labRoomTypes()).toEqual(["laboratory"]);
    expect(roomTypeSatisfies("laboratory", "lecture")).toBe(false);
  });

  it("lets a laboratory meeting use a classroom when set to Classroom", () => {
    configureLabRoomType("lecture");
    expect(isLabMeetingRoomType("lecture")).toBe(true);
    expect(isLabMeetingRoomType("laboratory")).toBe(false);
  });

  it("accepts either room type when set to Either", () => {
    configureLabRoomType("either");
    expect(roomTypeSatisfies("laboratory", "lecture")).toBe(true);
    expect(roomTypeSatisfies("laboratory", "laboratory")).toBe(true);
    expect(roomTypeSatisfies("lecture", "field")).toBe(false);
  });
});
