export type GuideEntry = {
  term: string;
  meaning: string;
  whenToUse?: string;
  example?: string;
  notes?: string[];
};

export type GuideChapter = {
  id: string;
  title: string;
  step?: number;
  intro: string;
  entries: GuideEntry[];
};

export const GENERATION_GUIDE: GuideChapter[] = [
  {
    id: "configuration",
    title: "Configuration",
    step: 1,
    intro:
      "Choose what to schedule and on which days. These choices apply to the whole year level.",
    entries: [
      {
        term: "Year level",
        meaning:
          "The year level to schedule. Every later step works on the sections of this year level.",
        notes: [
          "A locked or already scheduled year level shows a badge next to the picker.",
        ],
      },
      {
        term: "Curriculum",
        meaning:
          "The curriculum whose courses are scheduled this semester. Apply curriculum saves that assignment to the sections immediately, separately from saving a timetable.",
      },
      {
        term: "Generate for",
        meaning:
          "Whole year level previews a timetable for all its sections. Selected sections generates only the ticked sections. Existing working classes are replaced when you save the result.",
        whenToUse:
          "Choose Selected sections when a new section was added after the year level was already scheduled.",
        notes: [
          "Sections that are not ticked keep their classes. The new timetable is fitted around them.",
          "Sections marked New have no classes yet this semester.",
        ],
      },
      {
        term: "Preferred Days",
        meaning:
          "The days this year level may meet. Every open day is in by default; click a day to exclude it, and click it again to restore it. No class is placed on an excluded day, including Split Session and Hybrid meetings.",
        example:
          "Click Friday and Saturday to keep them free for this year level.",
        notes: [
          "At least one day must stay open. With only one day left, Hybrid classes cannot be placed, because they need two different days. A Split Session falls back to a single meeting.",
          "Every course's Required Day must be one of the Preferred Days, or the run is refused.",
        ],
      },
      {
        term: "Allow Friday and Saturday as Paired Days",
        meaning:
          "The Split Days switch under the Preferred Days. Split Session and Hybrid Split courses may also meet on Friday and Saturday. Monday/Wednesday and Tuesday/Thursday are still tried first.",
        whenToUse:
          "Turn it on when a year level has too many split courses to fit Monday to Thursday.",
        notes: [
          "It is unavailable while Friday or Saturday is excluded from the Preferred Days.",
          "The choice is kept in this browser for the department, so the next year level opens with it.",
        ],
      },
      {
        term: "Sunday classes",
        meaning:
          "A department setting. While it is off, neither generation nor manual scheduling places a class on Sunday.",
        notes: [
          "Only the department Secretary, Director, or Program Head can turn it on.",
          "Changing this switch saves the department setting immediately.",
          "Turning it off keeps the classes already on Sunday. It only stops new ones.",
        ],
      },
    ],
  },
  {
    id: "class-types",
    title: "Class types",
    step: 2,
    intro:
      "Each course in Setup Courses has a configuration (Regular, Split or Integrated) and a Delivery Mode. Together they decide how many meetings the course has and where they happen.",
    entries: [
      {
        term: "Regular",
        meaning: "The course meets once a week, as one block of time.",
        example: "A 3-unit lecture meets 3 hours on one day.",
      },
      {
        term: "Split Session",
        meaning:
          "The weekly hours are divided into two equal meetings on two different days.",
        example:
          "A 3-hour lecture becomes 1.5 hours on Monday and 1.5 hours on Wednesday.",
        notes: [
          "Monday/Wednesday and Tuesday/Thursday pairs are tried first. Friday/Saturday is tried only when it is allowed under the Preferred Days in Configuration.",
          "Only lecture courses can be split. Laboratory and field courses cannot.",
        ],
      },
      {
        term: "Online (All)",
        meaning:
          "A Split Session whose two meetings are both online, so neither one needs a room.",
        whenToUse: "Use it when rooms are scarce and the course can be taught online.",
        notes: ["Only lecture courses can meet online."],
      },
      {
        term: "Hybrid Split",
        meaning:
          "Two fixed 1.5-hour meetings on different days: one online and one face-to-face in a room.",
        notes: [
          "Only a 3-unit lecture course with no laboratory hours can use it, because the two meetings must add up to exactly 3 hours.",
          "Its length cannot be changed.",
        ],
      },
      {
        term: "Integrated On-site",
        meaning:
          "A course with lecture and laboratory hours meets as two separate sessions, a lecture in a lecture room and a laboratory in a lab. Both are face-to-face.",
        notes: [
          "Each session can be given its own length in Configure. A blank length uses the course's own hours.",
        ],
      },
      {
        term: "Integrated Hybrid",
        meaning:
          "Like Integrated On-site, except the lecture is online and only the laboratory is face-to-face.",
      },
      {
        term: "Delivery Mode",
        meaning:
          "Onsite classes meet in a room. Online classes need no room. Hybrid mixes the two, as in Hybrid Split and Integrated Hybrid.",
      },
      {
        term: "Field course",
        meaning:
          "A course that meets outside the campus rooms, such as a practicum. It is placed without a room, and its length is not changed by the defaults.",
      },
    ],
  },
  {
    id: "course-options",
    title: "Configure a course",
    step: 2,
    intro:
      "Configure holds per-course choices and department rules. Required Day, Consecutive Days and field-course eligibility can save department settings immediately.",
    entries: [
      {
        term: "Class Component",
        meaning:
          "Set automatically from the course's units. Lecture and laboratory units become a lecture session in a lecture room and a laboratory session in a laboratory room (Room TBA when none is free); laboratory-only courses meet in a laboratory room.",
      },
      {
        term: "Class Duration",
        meaning:
          "How long the course meets each week: its Total Hours. For an imported curriculum these are the lecture and laboratory hours the curriculum recorded on import; otherwise they are the course's own lecture and laboratory hours. It cannot be changed here.",
        notes: [
          "Every shape's meetings add up to exactly the Total Hours, except Consecutive Days, which repeats them on each selected day.",
          "For a Split Session, the two meetings share it equally.",
          "For Integrated, the lecture and the laboratory each keep their own hours.",
          "For Consecutive Days, every selected day repeats the full Total Hours: PRAC 101 at 6 hours on 3 days meets 6 hours/day × 3 days = 18 hours. Academic units are unchanged.",
          "Hybrid Split has a fixed length of two 1.5-hour meetings.",
        ],
      },
      {
        term: "Consecutive Days",
        meaning:
          "A Regular course meets on several days, for its full length each day. Tick the exact days, back-to-back or not.",
        example:
          "Tick Monday, Wednesday and Friday, and the course meets its full hours on each of the three days.",
        notes: [
          "It is available for Regular courses only.",
          "A course with Consecutive Days cannot also have a Required Day.",
          "The ticked days must be among the Preferred Days.",
        ],
      },
      {
        term: "Required Day",
        meaning:
          "Every section of the course must meet on this day. It is a hard rule. The generator does not place the course on any other day.",
        whenToUse:
          "Use it for a fixed commitment, such as a course that must meet on Saturday.",
        notes: [
          "A course with a Required Day is always scheduled as one Regular meeting. A Split setting is dropped for it.",
          "An Integrated course uses a Lecture Required Day and a Laboratory Required Day instead.",
          "The day must be one of the Preferred Days in Step 1.",
        ],
      },
      {
        term: "Lecture and Laboratory Required Days",
        meaning:
          "For an Integrated course, On-site or Hybrid, the day its lecture meets and the day its laboratory meets. Each is optional; a blank one lets the generator choose. The course keeps both meetings.",
        whenToUse:
          "Use them when, for example, the lecture must be on Monday and the laboratory on Thursday.",
        notes: [
          "The lecture and laboratory always meet on different days.",
          "Both days must be Preferred Days, and Sunday needs Sunday classes.",
          "They apply to the sections chosen in Apply To, for this generation only. Fixes and the final save keep them.",
          "Changing the course away from Integrated clears them.",
        ],
      },
      {
        term: "Preferred Room",
        meaning:
          "The room the generator tries first for this course. It is a preference, not a rule. If the room is taken, another suitable room is used.",
        notes: ["Online classes do not use a room."],
      },
      {
        term: "Apply To",
        meaning:
          "Whether the settings apply to every section of the course or only to the sections you select.",
      },
    ],
  },
  {
    id: "generate",
    title: "Generate & results",
    step: 3,
    intro:
      "Review the scope and rules, queue a generation job, then inspect its preview. Save writes the working timetable drafts. Curriculum assignments and department settings save separately.",
    entries: [
      {
        term: "Queued and running jobs",
        meaning:
          "Queued means the server is waiting to start the job; running means it is generating. Closing the generator keeps the job available through its status panel. Neither state saves a working timetable.",
      },
      {
        term: "Cancel, blocked, and failed runs",
        meaning:
          "Cancel clears the active run from this view and requests the worker to stop at its next checkpoint. A blocked run offers constraints and recommendations to review. A failed or server-cancelled run reports an error and has no saveable timetable.",
        notes: ["Applying recommendations or retrying may change settings or launch another job. Review those actions before using them."],
      },
      {
        term: "Course plan and Rules applied",
        meaning:
          "A summary of every selection made in Steps 1 and 2. Check it before generating.",
      },
      {
        term: "Hard rules and preferences",
        meaning:
          "Hard rules are never broken: no double-booked instructor, room or section, Preferred Days, Required Days, Consecutive Days and Sunday classes. Preferences, such as Preferred Room, are followed when possible.",
      },
      {
        term: "Recommendations",
        meaning:
          "When the generator cannot fit every class, it suggests changes, grouped by what they would change. Examples include shorter Split meetings when a Regular class cannot fit, an online lecture for Integrated Hybrid, switching a stuck Split Session, or adding a Preferred Day.",
        notes: [
          "Pick one option per group. Apply all checks the selected changes for conflicts. New session alternatives must be applied individually, followed by generation to check the whole timetable.",
          "Tried alone means the generator already retried with that change by itself and still could not make a timetable.",
        ],
      },
      {
        term: "Schedule Summary and drafts",
        meaning:
          "Step 4 shows the generated preview. Saving creates draft schedules and replaces affected working classes in the selected scope; instructor assignments on replaced classes may be removed. Review the normal confirmations before saving.",
        notes: [
          "A partial result can leave courses unplaced. Resolve conflicts before saving; saving without unplaced courses requires confirmation and can remove their old classes in the replacement scope.",
          "Starting or finishing Help never queues a job, changes a setting, or saves the timetable.",
        ],
      },
    ],
  },
];

export const GUIDE_CHAPTER_FOR_STEP: Record<number, string> = {
  1: "configuration",
  2: "class-types",
  3: "generate",
  4: "generate",
};

export function searchGuide(
  query: string,
  chapters: GuideChapter[] = GENERATION_GUIDE,
): Array<{ chapter: GuideChapter; entries: GuideEntry[] }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return chapters
    .map((chapter) => ({
      chapter,
      entries: chapter.entries.filter((entry) => {
        const text = [entry.term, entry.meaning, entry.whenToUse, entry.example, ...(entry.notes ?? [])]
          .join(" ")
          .toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((result) => result.entries.length > 0);
}
