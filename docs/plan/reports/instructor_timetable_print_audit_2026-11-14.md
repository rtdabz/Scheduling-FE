# Instructor Timetable PDF / Print — Audit (2026-11-14)

## Workflow audited

| Step | File | Notes |
|---|---|---|
| Entry point | `src/components/InstructorTimetableButton.tsx` | Opens the modal. |
| Data load + print trigger | `src/components/InstructorTimetableModal.tsx` | Loads `/schedules?faculty_id=…&semester_id=active`, keeps VPAA-approved meetings for that instructor, maps them to `InstructorTimetableMeeting[]`. Print is disabled when the instructor has no classes. |
| Document rendering | `src/pages/ClassSchedules/SchedulerPanel/instructorTimetablePdf.ts` | Draws the whole page with jsPDF (A4 landscape, mm units). No HTML/print CSS is involved. |
| Lane packing | `src/pages/vpaa/calendar/ganttLayout.ts` (`packLanes`) | Shared with the on-screen Gantt chart. Overlapping meetings go into separate lanes. |
| Preview / print | `src/lib/pdfPreview.ts` | Uploads the blob, then opens it in the browser's PDF viewer. Browser print and the downloaded PDF are the **same file**, so they always match. Only the viewer's scaling can change the printed result. |

Because the output is a vector PDF and not printed HTML, "print CSS" problems do not apply. Every layout issue lives in the jsPDF drawing code.

## Findings (fix order)

### P0: readability and correctness of what is shown
1. **Short meetings render garbled.** A 30-minute meeting (~8 mm wide) still runs the full card layout. The section pill overflows the card, the code is cut to "IT", and the room and time text collide. There is no layout for narrow cards.
2. **The academic year never reaches the real document.** The modal does not pass `activeSemester`, so the header has no semester or AY. The footer has no AY either. *(Data plumbing only: it uses the existing `/semesters/active` hook.)*
3. **The watermark competes with the schedule.** It is a 105 mm full-colour seal at 18 % opacity, centred under the grid, and it shows through every empty cell.

### P1: composition and page usage
4. **Half the page goes unused for light loads.** Lane height is capped at 22 mm and empty days are fixed at 8 mm. For one class, the grid ends around 55 % of the page height while the legend stays pinned to the bottom, which leaves a ~70 mm empty band.
5. **"No classes" sits only in the first time slot.** It should be centred across the day row.
6. **The time axis is hard to read.** The axis uses 90-minute ranges ("7-8:30 AM", "11:30 AM-1 PM") over a 30-minute grid, and the two kinds of gridline look too alike. *Resolution:* the 90-minute columns were tried as hourly columns and then **kept at 90 minutes by request**, because they match the standard 1.5-hour class length. Column boundaries are now clearly heavier than the dotted 30-minute lines, and columns are anchored on the configured opening time.
7. **The visible window is hard-coded to 7:00–20:30.** It ignores the institution's configured grid (`lib/timeGrid`), which the on-screen Gantt chart does use.

### P2: visual hierarchy and finishing
8. **Card layout is inconsistent.** The section is a pill on wide cards but plain text on narrow ones. The code is left-aligned while room and time are centred. Course titles get one line even when the card has space for more ("Data…", "Fundamentals…").
9. **Header metrics are three separate heavy tiles.** The labels are tiny (5.6 pt), and the conflict state only shifts the colour a little.
10. **The footer reads "TCC Scheduling Academic Scheduling System".** It is redundant wording and has no department, semester or document identification. The PDF has no document title metadata, so the viewer tab shows the upload name.
11. **Day label weight is inconsistent.** Busy days show the full name ("MONDAY") and empty days show an abbreviation ("TUE").

### Notes / not changed
- Conflict flags, lane packing, hour totals and meeting counts are kept exactly as they are (`packLanes`, overlap test, `formatHours`).
- The page stays single-page by design: lane heights shrink to fit. Very dense timetables now fall back to compact card tiers instead of clipping text.
- An instructor with no classes cannot be printed from the modal (the button is disabled). The generator still renders an empty timetable cleanly in case that rule changes.

## Verification method
Rendered the real generator output with `pdfjs-dist` in headless Chromium for four schedules: one class; a typical load with a lab, online, field, a 30-minute meeting and an overlap; a fully occupied six-day week; and an empty timetable. Compared before and after screenshots.
