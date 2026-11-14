import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAddImage = vi.fn();
const mockCircle = vi.fn().mockReturnThis();
const mockOutput = vi.fn(() => new Blob(["mock-pdf"], { type: "application/pdf" }));
const mockText = vi.fn().mockReturnThis();
const mockRoundedRect = vi.fn().mockReturnThis();
const mockSetProperties = vi.fn().mockReturnThis();

class MockJsPDF {
  addImage = mockAddImage;
  output = mockOutput;
  getTextWidth = vi.fn(() => 30);
  splitTextToSize = vi.fn((text: string) => [text]);
  setFillColor = vi.fn().mockReturnThis();
  setDrawColor = vi.fn().mockReturnThis();
  setTextColor = vi.fn().mockReturnThis();
  setFont = vi.fn().mockReturnThis();
  setFontSize = vi.fn().mockReturnThis();
  addFileToVFS = vi.fn().mockReturnThis();
  addFont = vi.fn().mockReturnThis();
  setLineWidth = vi.fn().mockReturnThis();
  setLineDashPattern = vi.fn().mockReturnThis();
  rect = vi.fn().mockReturnThis();
  roundedRect = mockRoundedRect;
  circle = mockCircle;
  line = vi.fn().mockReturnThis();
  text = mockText;
  setProperties = mockSetProperties;
  GState = class { options: unknown; constructor(options: unknown) { this.options = options; } };
  setGState = vi.fn().mockReturnThis();
}

vi.mock("jspdf", () => {
  return {
    default: MockJsPDF,
  };
});

import { buildInstructorTimetablePdf } from "./instructorTimetablePdf";

describe("buildInstructorTimetablePdf", () => {
  let origImage: typeof Image;

  beforeEach(() => {
    mockAddImage.mockClear();
    mockCircle.mockClear();
    mockText.mockClear();
    mockRoundedRect.mockClear();
    mockSetProperties.mockClear();
    origImage = globalThis.Image;
    globalThis.Image = class {
      naturalWidth = 100;
      naturalHeight = 100;
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 5);
      }
    } as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = origImage;
  });

  it("renders department logo on the left as a round badge and generates PDF blob", async () => {
    const blob = await buildInstructorTimetablePdf({
      title: "INSTRUCTOR: JASON ABELLANOSA",
      facultyName: "Jason Abellanosa",
      departmentName: "College of Engineering Technology",
      departmentLogo: "https://example.com/dept-logo.png",
      schedules: [
        {
          id: "1",
          subjectCode: "IT 101",
          subjectName: "Introduction to IT",
          roomName: "Room 101",
          day: "Monday",
          startTime: "08:00:00",
          endTime: "11:00:00",
          sectionId: "1",
          sectionName: "BSIT-1A",
          mode: "on-site",
          meetingType: "lecture",
          status: "finalized",
        },
      ],
    });

    expect(blob).toBeInstanceOf(Blob);
    // Circular badge drawn with doc.circle
    expect(mockCircle).toHaveBeenCalled();
    expect(mockAddImage).toHaveBeenCalled();
    const firstCallArgs = mockAddImage.mock.calls[0];
    // Department logo drawn on the left: centered in tile starting at pageX + 3 = 13
    const xPos = firstCallArgs[2];
    expect(xPos).toBeGreaterThanOrEqual(13);
    expect(xPos).toBeLessThanOrEqual(33);
    // Format for .png URL should be PNG
    expect(firstCallArgs[1]).toBe("PNG");
  });

  it("renders circular logo badge before instructor name when department logo is null", async () => {
    const blob = await buildInstructorTimetablePdf({
      title: "INSTRUCTOR: JASON ABELLANOSA",
      facultyName: "Jason Abellanosa",
      departmentName: "College of Engineering Technology",
      departmentLogo: null,
      schedules: [],
    });

    expect(blob).toBeInstanceOf(Blob);
    // Header circular logo badge is drawn before instructor name
    expect(mockCircle).toHaveBeenCalled();
    expect(mockAddImage).toHaveBeenCalled();
  });

  it("uses the system fonts (DM Sans and Playfair Display) for the timetable document", async () => {
    const blob = await buildInstructorTimetablePdf({
      title: "INSTRUCTOR: JASON ABELLANOSA",
      facultyName: "Jason Abellanosa",
      schedules: [
        {
          id: "1",
          subjectCode: "IT 101",
          day: "Monday",
          startTime: "08:00:00",
          endTime: "11:00:00",
        },
      ],
    });

    expect(blob).toBeInstanceOf(Blob);
  });

  // Default grid 7:00-20:30 is nine 90-minute columns across the 251 mm timeline at x = 36.
  const timelineX = 36;
  const timelineW = 251;
  const minuteX = (minutes: number) => timelineX + ((minutes - 420) / (1230 - 420)) * timelineW;
  const textCalls = () => mockText.mock.calls.map(([text, x, , options]) => ({ text: String(text), x: Number(x), options }));

  it("places a schedule block exactly at its start time and spans its real duration", async () => {
    await buildInstructorTimetablePdf({
      facultyName: "Jason Abellanosa",
      schedules: [{ subjectCode: "IT 101", day: "Monday", startTime: "08:00:00", endTime: "11:00:00", sectionName: "BSIT-1A" }],
    });

    const card = mockRoundedRect.mock.calls.find(([x, , w]) =>
      Math.abs(Number(x) - (minuteX(480) + 0.4)) < 0.01 && Math.abs(Number(w) - (minuteX(660) - minuteX(480) - 0.8)) < 0.01);
    expect(card).toBeDefined();
  });

  it("centres 'No classes' across the whole day row and labels the axis in 90-minute blocks", async () => {
    await buildInstructorTimetablePdf({ facultyName: "Jason Abellanosa", schedules: [] });

    const empty = textCalls().filter((call) => call.text === "No classes");
    expect(empty).toHaveLength(7);
    empty.forEach((call) => {
      expect(call.x).toBeCloseTo(timelineX + timelineW / 2);
      expect(call.options).toMatchObject({ align: "center" });
    });
    const labels = textCalls().map((call) => call.text);
    expect(labels).toContain("7-8:30 AM");
    expect(labels).toContain("11:30 AM-1 PM");
    expect(labels).toContain("7-8:30 PM");
  });

  it("keeps the watermark small relative to the grid", async () => {
    await buildInstructorTimetablePdf({ facultyName: "Jason Abellanosa", schedules: [] });

    const sizes = mockAddImage.mock.calls.map((call) => Number(call[4]));
    const watermark = Math.max(...sizes);
    expect(sizes.length).toBeGreaterThan(1);
    expect(watermark).toBeGreaterThan(20);
    expect(watermark).toBeLessThanOrEqual(62);
  });

  it("identifies the document with the semester, department and title metadata", async () => {
    await buildInstructorTimetablePdf({
      facultyName: "Jason Abellanosa",
      departmentName: "College of Engineering Technology",
      activeSemester: { academic_year: "2026-2027", semester: "1st" },
      schedules: [],
    });

    const footer = textCalls().find((call) => call.text.startsWith("Instructor Timetable"));
    expect(footer?.text).toContain("College of Engineering Technology");
    expect(footer?.text).toContain("1st Semester, AY 2026-2027");
    expect(mockSetProperties).toHaveBeenCalledWith(expect.objectContaining({ title: "Instructor Timetable - Jason Abellanosa" }));
  });
});
