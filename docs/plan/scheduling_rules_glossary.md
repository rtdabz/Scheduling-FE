# Scheduling rules glossary

Rules and constraints are separate layers that share one vocabulary of rule ids
(`SchedulingPolicy::CONSTRAINT_CATALOG`, relied on by the UI).

- **Rules** (`Engine\Rules`) run in `RuleEngine` against live database records.
- **Constraints** (`Engine\Constraints\Families`) run in the kernel against an
  in-memory snapshot, with no database access. The solver uses these.

A rule id means the same thing in both layers; what differs is where the
evidence comes from. A concern listed under Rules but not under Constraints
needs live records and has no kernel counterpart.

# Part 1 — Rules (`Engine\Rules`, live records)


### OverlapConflict — one resource, one class at a time

A room, an instructor and a section can each hold only one class in a given
semester, day and time span. Field and online rooms are shared without limit, so
they never clash on booking.

| Rule id | Meaning |
|---|---|
| `room_conflict` | A room cannot host overlapping classes in the same semester. |
| `faculty_conflict` | An instructor cannot teach overlapping classes. A clash someone chose to override is not raised again while the instructor, day and time are unchanged. |
| `section_conflict` | A section cannot attend overlapping classes. |
| `subject_section_time_conflict` | Different online sections taking the same course cannot use overlapping times. |

Generation also *prefers* to keep an online meeting from overlapping another
section's face-to-face meeting of the same course, because one instructor often
teaches both. This is a solver preference (`SOFT_MIXED_MODE_COURSE_OVERLAP_PENALTY`),
not a rule: a dense load may still place the overlap, and manual saves are not
blocked. Any overlap that remains shows up as `faculty_conflict` once one
instructor is assigned to both.

### ReferenceIntegrityRule — the records exist and are usable

| Rule id | Meaning |
|---|---|
| `semester_exists`, `section_exists`, `subject_exists`, `faculty_exists` | The selected record must exist. |
| `room_exists` | The selected room must exist, unless the placement allows an unresolved room. |
| `section_active`, `subject_active` | Inactive sections and subjects cannot be scheduled. |

### CurriculumPlacementRule — the course belongs in this section's term

| Rule id | Meaning |
|---|---|
| `semester_enabled` | Only enabled academic semesters accept schedules. |
| `section_semester_alignment` | The section belongs to the schedule's semester. |
| `section_semester_period_alignment` | The section's period (1st, 2nd, summer) matches its semester. |
| `subject_section_semester_alignment` | The course's curriculum semester matches the section's semester. |
| `subject_section_year_alignment` | The course's curriculum year level matches the section's year level. |

### DepartmentAssignmentRule — schedule, room, course and instructor belong together

| Rule id | Meaning |
|---|---|
| `schedule_department_alignment` | The schedule's department matches its section's department. |
| `room_department_alignment` | A room is shared, owned by the section's department, or granted to it for that window. |
| `major_department_alignment` | A major course with a department matches the section's department. |
| `major_faculty_department_alignment` | A major course goes to an instructor of the department that offers it. |
| `service_subject_faculty_department_alignment` | A GEC service course goes to an instructor of the college that offers it. |
| `major_faculty_program_alignment`, `service_subject_faculty_program_alignment` | A course tied to a program goes to an instructor in that program. |

### InstructorAvailabilityRule — the instructor can teach then

| Rule id | Meaning |
|---|---|
| `faculty_active` | Inactive instructors cannot be assigned. |
| `part_time_faculty_availability` | Part-time instructors teach from 5:00 PM on weekdays, or any time on weekends. |

### RoomAvailabilityRule — the room is open

| Rule id | Meaning |
|---|---|
| `room_availability` | Only rooms marked available can be assigned. |

### RoomTypeRule — the room suits the delivery

| Rule id | Meaning |
|---|---|
| `room_type_match` | The delivery mode and room match what the course (or this component) needs: laboratory, lecture room, field, or online where that is an allowed fallback. |

### OperatingHoursRule — the times are real and inside opening hours

| Rule id | Meaning |
|---|---|
| `slot_grid` | Times sit on the 30-minute grid. |
| `operating_hours` | The meeting is inside the institution's opening hours. |
| `field_evening_window` | Field courses finish by the institution's field end time. |

### MeetingDayRule — which days a meeting may use

| Rule id | Meaning |
|---|---|
| `valid_day` | The day is a supported institutional day name. |
| `preferred_pattern` | When a pattern (e.g. MWF) is declared, every day belongs to it. |
| `field_day_constraint` | Non-NSTP field courses run on weekdays only. |
| `minor_day_constraint` | Minor courses run Monday to Saturday, not Sunday. |
| `sunday_classes` | Sunday is used only when the department secretary has enabled Sunday classes (off by default). Classes already on Sunday stay when it is turned off. |
| `forced_course_day` | A course with a Required Day is scheduled on that day. |

### DeliveryModeRule — the delivery is allowed

| Rule id | Meaning |
|---|---|
| `delivery_mode` | Mode is on-site, online or field. |
| `hybrid_mode` | Field schedules cannot be hybrid. |
| `hybrid_eligibility` | Hybrid is limited to eligible lecture-and-laboratory courses under the department setting. |
| `hybrid_component_type` | Every hybrid meeting says whether it is the lecture or the laboratory. |
| `hybrid_component_shape` | Integrated Hybrid: online lecture, on-site laboratory, at the chosen lengths. Hybrid Split: the fixed Hybrid Split length. |
| `major_sunday_mode_constraint` | Major Sunday meetings are online when the department's Sunday-online setting is on. |

### ClassDurationRule — weekly contact time

| Rule id | Meaning |
|---|---|
| `class_duration` | A section's meetings for one course do not add up to more weekly time than the course carries. Judged across all its meetings, and only when a save adds time past the ceiling. |

### MeetingGroupRule — linked meetings judged together

| Rule id | Meaning |
|---|---|
| `hybrid_component_count`, `hybrid_components` | A hybrid group has exactly one lecture and one laboratory component. |
| `minor_split_component_count` | A minor split session has exactly two linked meetings. |
| `minor_split_eligibility` | Balanced split sessions are for eligible minor courses or lecture-only majors chosen in Step 2. |
| `minor_split_pattern` | The group's days match its configured pattern. |
| `minor_split_duration` | The group's combined duration does not exceed the course's contact time. |
| `split_group_same_time` | Both meetings of a Split Session or Hybrid Split share one start and end time. |
| `split_group_day_separation` | Components that need separate meetings do not share a day. |

# Part 2 — Constraints (`Engine\Constraints\Families`, snapshot)

Reported in `SchedulingConstraintKernel::RULE_PRIORITY` order, lowest first.
Meanings of each rule id are the same as in Part 1.

| Constraint family | Rule ids it enforces | Snapshot data it reads |
|---|---|---|
| `DeliveryModeConstraints` | `hybrid_mode`, `hybrid_eligibility`, `hybrid_component_type`, `hybrid_component_shape`, `major_sunday_mode_constraint` | course, department settings |
| `MeetingDayConstraints` | `preferred_pattern`, `field_day_constraint`, `minor_day_constraint`, `sunday_classes`, `forced_course_day` | course, required day, department settings |
| `OperatingHoursConstraints` | `slot_grid`, `operating_hours`, `field_evening_window` | opening, closing and field end time |
| `RoomTypeConstraints` | `room_type_match` | course, room |
| `RoomAvailabilityConstraints` | `room_availability`, `room_department_alignment` | rooms and their grant windows |
| `OverlapConflict` | `room_conflict`, `faculty_conflict`, `section_conflict`, `subject_section_time_conflict` | persisted schedules plus candidate rows |
| `InstructorAvailabilityConstraints` | `faculty_active`, `part_time_faculty_availability` | faculty, employment type, availability windows |
| `SectionLoadConstraints` | `class_duration` | the section's scheduled minutes per course |
| `MeetingGroupConstraints` | `hybrid_component_count`, `hybrid_components`, `minor_split_component_count`, `minor_split_eligibility`, `minor_split_pattern`, `minor_split_duration`, `split_group_same_time`, `split_group_day_separation` | the linked meeting group |

Rules with no constraint counterpart, because they need live records:
`ReferenceIntegrityRule`, `CurriculumPlacementRule`, `DepartmentAssignmentRule`
(except `room_department_alignment`, which the kernel enforces through
`RoomAvailabilityConstraints`).
