# Business Rules

## Parent archiving, room changes, and timetable restoration

Authoring must select non-archived parent records where the parent supports soft
deletion. Curriculum ownership may remain null for existing shared workflows.
Departments and programs cannot be archived while live operational dependencies
remain; archive responses name the blocking relations. Archived records alone
do not block parent archiving.

Room structural updates, including the separate department-assignment route,
validate the proposed room against affected timetable entries within the
scheduling lock and transaction. Incompatible room type, lecture-use policy, or
access changes require relocating classes first. Resolve program allocations
and current pending/approved room requests before changing room ownership.
Classes from past semesters do not prevent marking a room unavailable.

Schedule restoration validates current scheduling rules and overlap conflicts
under the semester lock. Required linked meeting groups restore as a unit;
failure rolls back restored rows and audit records. Restoring split metadata
alone also requires an editable parent schedule and valid resulting meetings.

## Structural scheduling integrity

Section structural edits validate the complete resulting identity, including
retained fields. Existing classes must remain compatible with the department,
program, semester, curriculum, and curriculum course placement. Incompatible
changes require clearing the affected classes first; name changes and valid
unscheduled structural edits remain supported.

Replacing a curriculum course or moving its year/semester placement uses the
same scheduled-cohort dependency guard as direct removal. Batch attachment
checks every changed placement before writing; unchanged placements are allowed.

Split metadata is part of the timetable. Split writes require writable, live
parents in a plotting-editable stage, including the original parent when moving
a split. They use the scheduling scope lock, transactional rule/group validation,
history and revision recording, audit entries, and payload cache invalidation.
Required linked-meeting metadata cannot be removed independently.

## Bulk section curriculum assignment

Bulk curriculum assignment follows the ordinary section structural-edit lock:
a section with locked schedules cannot change curriculum. The operation checks
fresh section records and existing schedule rows inside a transaction before
writing any assignment; one blocked change rejects the entire batch. Assigning
the section's current curriculum is a no-op and remains allowed. Department,
program, semester, year-level, and explicit section selection still determine
which sections are targeted.

## Course teaching assignment

**Which college teaches a course.** A course is *owned* by the college whose
curriculum offers it (`courses.department_id`) and may be *taught* by another
(`courses.teaching_department_id`). Only the second is a decision anyone records;
the first follows from the curriculum. With no override recorded, the owner
teaches its own course — `SchedulingPolicy::assignedTeachingDepartmentId()`
resolves that fallback, and the rule engine holds instructor assignment to active
instructors of whichever college the answer names.

**A major is never delegated.** It belongs to the department and program that
offers it, so `PATCH /api/course-teaching-assignments/{course}` refuses one with
422. Only a minor — a GEC or GEE service subject — may be handed to another
college.

**Anyone may record the decision; the list is not shared.** The colleges settle
between themselves who teaches what, so any secretary or program head may record
the override for any delegable course, whichever college owns it. The *listing*
is the opposite: strictly the acting department's own.

**The course list is the department's curriculum, never a global list.** A
department sees a course on this page if and only if its own active curriculum
places that course. Ownership does not put a course on the list, and neither does
teaching it for someone else. Three consequences:

- **Year level comes from `curriculum_course.year_level`, not `courses.year_level`.**
  The stored column is a default; the pivot is the authority. A shared minor sits
  in a different year for every college that offers it, so the stored level is the
  wrong answer for all but one of them. The page's 1st–4th Year tabs are built
  from the pivot.
- **No active curriculum means an empty list.** There is nothing to offer and
  nothing to place. Falling back to ownership was worse than saying so: a college
  that owns no minors of its own would be handed every shared GEC and GEE subject
  in the institution, because a shared minor has `department_id IS NULL`.
- **A course delegated *in* is reported separately.** It belongs to the owner's
  curriculum, so it cannot be placed on this department's year grid. It appears
  under `incoming_cross_department_courses` instead, which is where the college
  answerable for teaching it goes looking.

The same scope drives the Auto-Assign Instructor wizard — see
`InitialDataController` — and the two must agree. A course the wizard will not
offer a department is not a course that department should be delegating.

## Course-driven room requirements

Departments have no Scheduling Profile or specialized-room enable switch.
`SchedulingPolicy::isLaboratoryCourse` derives laboratory requirements from
`lab_hours > 0` or `room_type_required = laboratory`. The course's selected
meeting configuration determines which lecture/laboratory components are built.
Lab defaults in Setup Courses appear when an included, non-field course needs
laboratory scheduling; excluding that course hides the controls without erasing
saved defaults.

Room access still follows ownership, shared-room policy, program allocation,
and approved borrowing for the semester and time window. A lecture-only major
may use a laboratory only when the existing course eligibility checks pass and
the room permits lecture use (`allow_lecture_usage`). This fallback now applies
regardless of the department's former Standard/Specialized classification.
Ordinary minor lectures do not gain laboratory access from this removal.

Missing rooms are handled by resource feasibility and the existing fallback
policies. Year-level generation with no physical rooms can require a room or an
explicit Online selection. Laboratory Room TBA remains conditional on existing
policy; a missing lab never changes a lab requirement into an ordinary lecture.

## Course-driven Split Session and Hybrid delivery

Split Session is always available from **Step 2 - Setup Courses**. The user
selects the course and the affected sections there; the retired Minor, Major,
and Hybrid department switches do not gate the selection. Eligibility is
calculated from the selected course's units, lecture/laboratory hours, delivery
mode, and section configuration. Course codes and department identity are not
used as a hard-coded eligibility shortcut.

The two Hybrid shapes are distinct:

- **Hybrid Split** is a lecture-only course scheduled as two lecture meetings
  on different days at the same time, one Online and one Face-to-Face, each
  `SchedulingPolicy::HYBRID_SPLIT_MEETING_MINUTES` (1.5 hours) long. A course
  qualifies when those two meetings equal its weekly contact time
  (`units × 60`), which today means three units. The Face-to-Face meeting
  uses a lecture room, or a laboratory flagged for lecture use only when the
  course is a lecture-only major; it never falls back to Room TBA.
  Either meeting may be the face-to-face one. When rooms and times leave
  both orders equally good, the order alternates by section and course, so
  sections do not all meet face-to-face on their first day.
- **Integrated Hybrid** (Hybrid Laboratory) is a major with lecture and
  laboratory components, scheduled as two separate sessions on different
  days: an Online lecture and a Face-to-Face laboratory. Each length is the
  user's to set in the course's Configure panel. It starts at the course's
  own: one hour per lecture unit, and three hours per laboratory unit or the
  department's Custom Lab Duration when one is set. Each component must fit
  the operating-day ceiling on the half-hour grid. `ClassDurationRule` and
  the constraint kernel count each Integrated component separately; the
  lecture and laboratory are not capped by a combined unit-derived total.
  Their delivery is fixed. The two are never merged into one block, even when
  a meeting pattern is supplied.

Integrated is always lecture + laboratory as two sessions; the course's
delivery decides the lecture:

- **Integrated On-site** — both face-to-face: the lecture in a lecture room,
  the laboratory in a laboratory. Sent as an Integrated course
  (`selected_split_session_course_ids`) whose delivery mode is `on-site`
  (`SchedulingPolicy::isIntegratedOnSite`).
- **Integrated Hybrid** — the lecture online, the laboratory face-to-face, as
  above.
- **Regular** is one meeting of the course's units. A lecture + laboratory
  course nobody configured is Regular, because that is what the Generator
  places for it.

### Setup Courses: Default Settings and course selection

Step 2 has **Default Settings** that apply to every course without Configure
settings of its own; a course saved from its Configure panel keeps its own
choices ("Use defaults for all" hands it back to the defaults).

- **Lecture Duration** sets the weekly length of lecture courses and of each
  Integrated lecture; **Laboratory Duration** that of laboratory courses and of
  each Integrated laboratory. Blank keeps each course's own length. A default
  longer than a course may meet a week (`class_duration`), or not whole
  slots per meeting, is skipped for that course, which keeps its own length.
  Field courses and Hybrid Split's fixed meetings are never changed.
- **Allow Friday and Saturday as Paired Days** (`allow_friday_saturday_split`)
  lets a Split Session or Hybrid Split also meet Friday + Saturday as a
  third regular pair. It ranks with MW and TTh, not in the Saturday fallback
  tier. Two-day classes, with or without this setting, take the pair whose
  days the section has used least so far (ties rotate by section and course),
  so they spread across MW, TTh and Friday + Saturday instead of packing onto
  one pair. A pair that cannot place still falls through to the others.

Every course starts checked. An unchecked course is left out of the run's
`course_ids`, field courses included. The API reads an empty list as "all
courses", so the wizard will not continue or generate with every course
unchecked.

### Field courses

A course is a field course only when the department makes it one: its
record requires the field (`room_type_required = field`), or its code is on
the department's field list (`department_course_rules.is_field`). Its name never does:
NSTP, ROTC and CWTS used to be field by keyword, with no way to turn it off.

In Setup Courses the list follows the Preferred Room. Picking a field room
adds the course to the list; No preference or a classroom removes it, and the
course is then scheduled like any other minor. The list is department-wide,
so the change applies to every section and is saved at once, like Required
Day. A lecture-only minor, or a course already on the list, is offered field
rooms beside its classrooms.

Both shapes are selected per course in Step 2. The generator and rule engine
must receive the same per-course configuration and must preserve all existing
room, time, section, capacity, forced-day, persisted-schedule, and delivery-mode
constraints.

When a selected Split Session has no complete valid two-meeting placement after
room, time, persisted-schedule, delivery-mode, and capacity constraints are
applied, generation must not silently convert it into a single full-duration
meeting. The run returns a recommendation instead. The recommendation may
offer Hybrid Split when vacant 1.5-hour slots can be used, or Regular Meeting
with an explicit On-site or Online choice. Both remain suggestions and require
user action before the configuration changes.
Both meetings of a Split Session or Hybrid Split use the same start and end
time (`split_group_same_time`, a hard rule in the generator, the rule engine and
the kernel). Integrated On-site and Integrated Hybrid lecture/laboratory
groups retain their own component times and durations when represented as
linked or Hybrid component groups. An explicit balanced meeting-pattern marker
still invokes its existing same-time group rule; interpretation must preserve
that marker rather than override save validation. Relocating one meeting of a
Split Session or Hybrid Split pair moves its partner to the new time on
the partner's own day; if the partner cannot take that time, the move is refused.
The Minor/GEC split search must retain every valid same-time slot in the
configured split-day patterns. Candidate truncation must not make Online or a
single meeting appear necessary while a later physical slot remains valid.

Split-course search order is lexicographic:

1. An unconfigured Minor course searches every valid physical single-meeting
   placement before any Online candidate is opened.
2. A configured Minor course searches every valid physical Split Session
   placement. If none can complete the run, generation stops with a
   recommendation; it does not add a single-meeting candidate to the domain.
3. Online is opened only according to the selected delivery mode or an
   explicitly chosen Hybrid Split/Regular Meeting recommendation.

Room compatibility, section conflicts, persisted and tentative schedules,
capacity, forced-day settings, and delivery-mode constraints remain hard rules
inside every tier.

## Step 1 Preferred Days

**Step 1 - Configuration** may limit a year level's run to chosen days
(`allowed_days`, one choice sent on every section). None chosen, or all seven,
means any day. It is a hard limit, not a ranking preference: the generator
places no meeting on a day left out, for a regular class, a Split Session, a
Hybrid Split or an Integrated Hybrid, and no retry strategy widens it.

- A two-meeting class keeps the MW or TTh pair whenever the chosen days allow
  one. When they allow neither, its pairs come from the chosen days instead,
  spaced pairs before back-to-back ones, so any two Preferred Days can hold it.
- Both Hybrid shapes need two different days, so one Preferred Day blocks a
  Hybrid course in the pre-check (`preferred_days_too_few_for_hybrid`). The
  response recommends adding another Preferred Day; a Split Session does not
  fall back to a single meeting.
- A course whose Required Day is not one of the Preferred Days is refused
  before generation, and Step 1 flags it as soon as the days are picked.
- A course whose own day limits (field weekdays, Sunday online-only) leave it
  nothing among the chosen days fails with an error naming the course and the
  Preferred Days.

## Course Configure panel: duration, Required Day, Preferred Room

Each course's **Configure** panel in Step 2 - Setup Courses carries every
course-level generation choice. Step 1 keeps the section-level Preferred
Meetings board and the year level's Preferred Days.

- **Custom Time Duration** changes the weekly length of a single-meeting class
  or of an on-site Split Session (entered per meeting; both meetings stay
  equal). It is sent per section as `duration_minutes_by_course_id`, reaches
  the solver on the course's requirement, and is judged by the year-level
  pre-check at the same length. The server refuses a length the save would
  reject: a single meeting may not exceed the course's weekly ceiling
  (`class_duration`), and a Split Session may not exceed the course's units
  (`minor_split_duration`, which accepts a shorter split and never a longer
  one). Integrated Hybrid's lecture and laboratory are set separately and sent
  as `component_minutes_by_course_id`; each must fit the teaching day and
  together they may not exceed the weekly ceiling. Hybrid Split keeps its
  fixed 1.5 h + 1.5 h.
- **Required Day** (optional) is the department's forced-day rule for the
  course, saved to the scheduling settings and enforced for every section and
  for manual edits. A course with a Required Day meets once, on that day; its
  Split or Hybrid markers are not sent.
- **Preferred Room** (optional) is a ranking preference inside an allocation
  tier: the generator tries that room first and falls back to any other
  compatible room. It never moves a course to Saturday, Room TBA or Online to
  keep the room, and a room that is busy at a given time is simply not chosen
  there. The choice list comes from the department's own rooms
  (`RoomAccessPolicy`), filtered to the type the course's face-to-face meeting
  needs — for Integrated Hybrid, a laboratory. The server refuses a room that
  is not available, not reachable this semester, or of the wrong type, using
  the same test as `room_type_match`. Online and field classes take none.

Duration and room follow the panel's section scope; Required Day always
applies to every section.

## Generate Schedule fallback priority

After existing schedules and other hard conflicts prune a course's candidates,
regular physical course generation searches the remaining candidates in this order:

1. Monday-Friday candidates using compatible real rooms.
2. Saturday candidates using compatible real rooms.
3. Sunday candidates only when the existing course/session configuration permits them.
4. Room TBA candidates in the same weekday, Saturday, then Sunday order.

Every candidate in a tier is checked before the next tier is opened. Soft room
compactness, day balancing, and timetable quality scores may rank candidates
inside a tier, but cannot move Saturday or Room TBA ahead of a complete feasible
weekday solution. Explicit Schedule Setup rules remain authoritative, so a
forced Saturday course stays on Saturday.

Online lecture candidates use the same Monday-Saturday search tier. Saturday is
considered while online lecture candidates are explored instead of being withheld
until all weekday online candidates fail. This also applies to the online lecture
block inside a hybrid lecture/laboratory candidate; laboratory-only and
physical-only candidates retain the weekday-first order above.

For a course with both lecture and laboratory hours, the lecture component is
not implicitly Hybrid. When Hybrid is not explicitly selected, compatible
lecture rooms are generated first and the online lecture component is retained
only as a lower-priority fallback after those rooms are unavailable. An
explicit Hybrid selection preserves the online lecture plus physical laboratory
configuration. All online candidates remain subject to the department's
concurrent online-meeting limit, including assignments already chosen earlier
in the same year-level generation.


## Applying generation recommendations

Generation advice changes configuration only after explicit selection. Sync and
queued preview requests apply the same selected operations on the server and
regenerate with the existing eligibility, preflight and requirement rules.
Selection does not save schedules or department/course settings. Automatic
retry strategies continue to change only ordering or search seeds, not the user's
configured patterns, meeting shapes, delivery modes or preferred days.

The supported existing operations set/clear a Split pattern, turn off an
Integrated split or a balanced Split, enable/set/disable Hybrid Split, turn off
all Integrated splits in one section, set/clear a delivery-mode pin, enable
Friday/Saturday pairs, or add a preferred day. Turning balanced Split off clears
its pattern and Hybrid selection. Enabling Hybrid Split clears a forced delivery
pin; disabling it keeps the two balanced meetings and pins them On-site.
Selecting Online removes the Hybrid marker while retaining the configured
balanced meeting shape. Other course settings stay in place.

An explicit batch rejects foreign targets, unsupported values, contradictory
changes and stale course eligibility before dispatch. Repeated identical
operations apply once. A batch that changes nothing must be refreshed.
Year-level preferred-day and Friday/Saturday changes include every section in
the run, so the global UI preview and server scope agree. Custom Split patterns
require two different supported days.

Unsupported corrections such as removing a course/configuration reference or
clearing a Required Day are guidance for the existing configuration workflow.
Generated single-meeting fallback metadata is a report, not an Apply operation.
Supported suggestions are still **requires regeneration**: room-capacity
arithmetic, available physical intervals and an incomplete search do not verify
a complete year-level timetable. No new recommendation alternatives or timetable
probes are introduced by this phase. Saving a regenerated draft still requires
fresh validation through the existing save/batch boundary.


## Instructor selection after recommendation retirement

Ranked instructor suggestions and generated conflict reassignment options are
retired. Users choose instructors through the existing manual selection and
assignment workflows, including permitted manual conflict reassignment. Teaching
department/program eligibility, approval-stage restrictions, part-time
availability, overlap refusal and projected unit ceilings still apply to single,
bulk and linked-group saves. The old override flag never permits a conflicting
assignment. Instructor-only changes retain their current validation scope and do
not acquire placement checks unrelated to the assignment.

Conflict placement suggestions keep the assigned instructor and validate every
affected kept or moved meeting. Applying a suggestion revalidates current saved
state atomically; its preview does not authorize saving. A bounded search with no
suggestion means manual review is needed, not that every possible fix was ruled
out. Faculty records, teaching history and load accounting remain available.


## Manual placement room validation and save status

Manual placement checks physical-room selections only for active on-site
meetings. A second meeting participates when a two-day pattern is selected and
its duration is positive; single meetings and consecutive runs ignore retained
second-meeting fields. Room TBA remains restricted to laboratory meetings.
The modal must not report readiness while a save-validation error is present.
Save errors remain retryable, and placement-quality preferences do not block saving.

## Explicit session enhancements (recommendation integration Phase 6)

Manual Placement, Draft Review and Generate share the same enhancement policy
and complete-group placement checks. A Regular lecture-only class can be offered
two equal, matching-time Split meetings when no full-length placement was found.
Its selected duration is retained, must split evenly on the half-hour grid, and
must fit the course contact-hour ceiling. On-site stays on-site; Regular Online
stays online and displays **Online (All)**. These options address fragmented
time, not an aggregate physical room-time deficit.

An eligible major's Integrated On-site group can explicitly change its lecture
to online while retaining an on-site laboratory and both component durations.
The option is labelled **Integrated Hybrid** and explains the delivery change.
It is offered only if the original on-site group has no placement and a complete
hybrid group passes validation. An unavailable laboratory cannot be solved by
moving the lecture online. This explicit choice changes the selected delivery;
no retry or recommendation lookup clears that choice automatically.

Field courses, Consecutive Days runs and already-split classes do not acquire
these reshapes. Required Days, permitted days, fixed patterns, operating hours,
room eligibility, section/instructor occupancy and concurrent same-course online
limits still apply. A search with no result is bounded evidence, not proof that
every possible timetable is impossible.

Generate's balanced-Split enhancement probe and the CSP solver use the same
day-pair policy: prefer the eligible MW/TTh pairs and explicitly enabled
Friday/Saturday pair. If explicit Preferred Days exclude all those pairs, try
other permitted spaced pairs before adjacent pairs. Sunday still requires the
department setting, and every proposed group must pass the existing constraints.
When a Manual session-alternative check returns no options for a class with a
Required Day, the UI explains that two-day alternatives need different days.
It does not clear the Required Day or treat a failed request as an empty result.

Manual users request session alternatives explicitly and stage one complete
option before using the existing save action. Draft Review replaces the affected
course rows and rechecks the draft. Generate applies one selected enhancement
and regenerates; its group witness is not a verified year-level timetable.
`enable_balanced_split` preserves delivery and duration settings;
`set_integrated_hybrid` explicitly changes only the target's Integrated delivery.
Both operations are excluded from combined Apply all requests until a combined
timetable probe exists. The UI and server reject mixing one with another
adjustment; existing legacy combination checks remain. Recommendations never
write schedules, instructor assignments or per-run rules.

## Recommendation selection and compatibility

Manual Best Match order, meeting pairing and complete-group feasibility come from
the shared backend placement provider. Frontend day/room browsing filters do not
prove a placement valid. Generate uses the shared policy's versioned selection
metadata to prioritize untried options before failed attempts, then by impact;
ties retain provider order. Skipping a retry because time expired does not count
as trying that adjustment. Unsupported operations, invalid adjustment values,
resolved recommendations and advice without adjustments are not applicable.

Selection metadata describes a recommendation, not authorization or a verified
year-level timetable. Applying still requires explicit user selection and current
server validation. The UI additionally refuses operations its preview does not
understand. Stored results without recognized metadata retain the legacy display
adapter and the same application safeguards. No adapter automatically changes
settings, persists rows or restores retired instructor recommendations.

Restore validation also covers retained room home-program allocations and course teaching-department, teaching-program, and delegated-source program references. Restore those archived parents first; restoring a child must not silently discard its assignments.

## Curriculum document import

Implemented from [curriculum_document_import_plan](curriculum_document_import_plan.md). Routes: `GET/PUT /api/curriculum-import-settings`, `POST /api/curriculum-imports/validate`, `POST /api/curriculum-imports`, all behind `capability:curriculum.manage`; the UI is `/{secretary|program_head}/curriculum/import`.

- Files (PDF with selectable text, CSV, XLSX, DOCX; 10 MiB, 50 PDF pages, 5,000 table rows) are read in the browser. The server receives the reviewed JSON draft and a client-declared SHA-256, not the file, so it validates domain integrity but cannot re-prove the draft against the source.
- An import always creates a **new, deactivated** curriculum in the importer's department. Program heads import only into their own program. Activation and section assignment remain separate existing actions.
- The unique internal `curriculum.code` is assigned by the server and cannot be supplied (`metadata.code` is rejected): program code, then major if any, then the effective school year's start year (`BSIT-2020`); the department code replaces the program when none is selected; `-2`, `-3`, … is appended when taken. Validation previews it, and the commit assigns it again inside the transaction. The CMO number and series are stored separately. Manually created curricula keep their editable code.
- Terms stay `1` First Semester, `2` Second Semester, `3` Summer. A term comes only from the document's own label or Summer heading, never from column order or code. An absent Summer is not created; an explicitly empty group is reported and not created.
- Source values and reviewer values are kept separately. Every difference between them (code, title, credits), every extraction flag (look-alike codes, blank or merged numeric cells), every printed-versus-calculated group total mismatch, every group without a printed total, and every category override is a **required review**: import is blocked until the reviewer records a reason. Nothing is silently repaired or dropped.
- Prerequisites are `none`, confirmed `courses` (draft rows, with an explicit all/any connector when there are several), or a recorded `condition`. Unreviewed source text blocks import. Self-references and cycles are errors; references to the same or a later term are flagged for review, not converted into co-requisites. Conditions are recorded, not enforced.
- Classification precedence: reviewer choice (override needs a reason), exact code rule, longest prefix rule, otherwise the reviewer must choose. Unknown codes are never defaulted to Major. A prefix ends at a space, digit, or separator (`IT` matches `IT 101`/`IT101`, not `ITEM 101`).
- Existing department courses with the same normalized code are reused unchanged only when category and credits match; mismatches block, a title mismatch needs review, archived matches block. Import never edits, reclassifies, or re-delegates an existing course.
- Credits stay in whole units (the course schema is integer); fractional credits are rejected. New courses store credits in the legacy `lecture_hours`/`lab_hours`/`units` fields exactly as manual encoding does, so scheduling behaves identically. Per-placement minutes are frozen from the department's rates (`lecture_minutes = lec × rate`, `laboratory_minutes = lab × rate`; total credits are independent of minutes).
- The scheduler still uses the legacy 60/180 minutes-per-unit derivation. Saving other rates is allowed, but every import under them must acknowledge that the recorded minutes are not yet used for scheduling.
- A row describing total hours (for example `Practicum (486 hours)`) must have an explicit basis: `weekly` from credits, or `total_hours` (no weekly minutes). Both require review. Weekly hours are never inferred from total hours. The scheduler does not yet honour `total_hours`; such a course would still be scheduled from its credits, so it should not be scheduled until a supported basis exists.
- Only the department secretary may change import settings; other `curriculum.manage` holders can read them. Saving replaces rates and rules atomically with an expected revision, rejects duplicate rules, requires acknowledgment of more specific rules that override broader prefixes, and never recalculates existing placements, courses, or schedules.
- Commit reruns authorization and validation inside one transaction with the department row locked, rejects a changed settings revision or a changed draft/catalog fingerprint (409), and rolls back everything on any failure. A repeated `request_key` with the same body returns the recorded outcome; with a different body it conflicts.
