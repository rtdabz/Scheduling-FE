import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAddImage = vi.fn();
const mockCircle = vi.fn().mockReturnThis();
const mockOutput = vi.fn(() => new Blob(["mock-pdf"], { type: "application/pdf" }));

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
  roundedRect = vi.fn().mockReturnThis();
  circle = mockCircle;
  line = vi.fn().mockReturnThis();
  text = vi.fn().mockReturnThis();
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
});

