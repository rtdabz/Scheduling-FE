/**
 * The Generation Guide: a plain-language handbook of every option in the
 * Generate Schedule wizard. The guided tour shows *where* things are; this
 * says *what they mean* and how they affect the generated timetable.
 *
 * Keep an entry in step with the option it explains: its `term` is the
 * label the user sees in the wizard.
 */

export type GuideEntry = {
  /** The option's label, as the wizard shows it. */
  term: string;
  /** What it means, in one or two sentences. */
  meaning: string;
  /** When to use it. */
  whenToUse?: string;
  /** A concrete example. */
  example?: string;
  /** Limits and interactions with other options. */
  notes?: string[];
};

export type GuideChapter = {
  id: string;
  title: string;
  /** Which wizard step it belongs to, shown as "Step 2". */
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
          "The curriculum whose courses are scheduled this semester. Applying it gives every section of the year level the same course list.",
      },
      {
        term: "Generate for",
        meaning:
          "Whole year level replaces the timetable of every section. Selected sections generates only the ticked sections.",
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
          "The days this year level may meet. With no day picked, every open day may be used. Once you pick days, no class is placed on a day you left out, including Split Session and Hybrid meetings.",
        example:
          "Pick Monday to Thursday to keep Friday and Saturday free for this year level.",
        notes: [
          "With only one day picked, Hybrid classes cannot be placed, because they need two different days. A Split Session falls back to a single meeting.",
          "Every course's Required Day must be one of the Preferred Days, or the run is refused.",
        ],
      },
      {
        term: "Sunday classes",
        meaning:
          "A department setting. While it is off, neither generation nor manual scheduling places a class on Sunday.",
        notes: [
          "Only the department secretary can turn it on, after the dean approves Sunday classes.",
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
          "Monday/Wednesday and Tuesday/Thursday pairs are tried first. Friday/Saturday is tried only when Default Settings allows it.",
          "Only lecture courses can be split. Laboratory and field courses cannot.",
        ],
      },
      {
        term: "Online Split",
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
      "The Configure panel of a course holds rules for that course only. A course saved from Configure no longer follows the Default Settings.",
    entries: [
      {
        term: "Class Component",
        meaning:
          "For a course with laboratory units: whether it is scheduled as a lecture or as a laboratory, which decides the type of room it needs.",
      },
      {
        term: "Custom Time Duration",
        meaning:
          "How long the course meets each week. For a Split Session, this is the two meetings together.",
        notes: [
          "It cannot be longer than the course is allowed to meet in a week.",
          "Each meeting must fill whole time slots.",
          "Hybrid Split has a fixed length and cannot be changed.",
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
          "A course with a Required Day is always scheduled as one Regular meeting. A Split or Integrated setting is dropped for it.",
          "The day must be one of the Preferred Days in Step 1.",
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
    id: "defaults",
    title: "Default Settings",
    step: 2,
    intro:
      "The gear icon in the header during Setup Courses. Default Settings apply to every course that has no Configure settings of its own.",
    entries: [
      {
        term: "Lecture Duration",
        meaning:
          "The weekly length of every lecture course, and of the lecture session of an Integrated course.",
        notes: [
          "A course whose own limits the default would break keeps its own length, and the course is listed as skipped.",
        ],
      },
      {
        term: "Laboratory Duration",
        meaning:
          "The weekly length of every laboratory course, and of the laboratory session of an Integrated course.",
      },
      {
        term: "Allow Friday and Saturday as Paired Days",
        meaning:
          "Split Session and Hybrid Split courses may also meet on Friday and Saturday. Monday/Wednesday and Tuesday/Thursday are still tried first.",
        whenToUse:
          "Turn it on when a year level has too many split courses to fit Monday to Thursday.",
      },
      {
        term: "Customized courses",
        meaning:
          "A course saved from its own Configure panel is marked as customized. The Default Settings skip it, so your per-course changes are kept.",
      },
    ],
  },
  {
    id: "generate",
    title: "Generate & results",
    step: 3,
    intro:
      "Review what will be sent to the generator, run it, then look at the result. Nothing is saved until you apply it.",
    entries: [
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
          "When the generator cannot fit every class, it suggests changes, grouped by what they would change. Examples are switching a stuck Split Session to Hybrid, Online or one Regular meeting, or adding a Preferred Day.",
        notes: [
          "Pick one option per group. Apply all takes one option from every group, so two fixes never contradict each other.",
          "Tried alone means the generator already retried with that change by itself and still could not make a timetable.",
        ],
      },
      {
        term: "Schedule Summary and drafts",
        meaning:
          "Step 4 shows the generated timetable. Saving it creates draft schedules, which you can still adjust by hand before they are finalized.",
      },
    ],
  },
];

/** The chapter the guide opens on for each wizard step. */
export const GUIDE_CHAPTER_FOR_STEP: Record<number, string> = {
  1: "configuration",
  2: "class-types",
  3: "generate",
  4: "generate",
};

/** Entries whose text contains every word of `query`, grouped by chapter. */
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
