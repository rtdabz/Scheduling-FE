# Curriculum Document Upload and Configuration Plan

Date: 2026-10-27

Status: Implemented 2026-10-27 for Phases 0, 1, 3, and 4, with the Phase 2 scheduling integration deferred. Sections 1–15 are the original plan and its proposals. Section 16 records the verified contracts, deviations, and remaining gates; where they differ, section 16 is authoritative.

## 1. Recommendation and scope

Add a reviewed import workflow to the existing Curriculum Management module:

**Upload -> Extract -> Preview -> Configure -> Import**

Parse supported files locally in the browser, normalize them into one editable draft, validate that draft on the backend, and commit the complete curriculum in one transaction. Start with a deterministic extractor for the supplied TCC BSIT PDF and a standard CSV/XLSX template. Add DOCX tables through the same draft contract. Require manual mapping when layout or content is ambiguous.

Keep the existing three-term representation. Store credit units separately from resolved scheduling minutes, and freeze each imported placement's conversion values. Department configuration changes apply to future imports; they must not rewrite approved schedules or existing course records.

Use native file selection, existing React state, Axios, TanStack tables, and current authorization/cache conventions. Do not introduce an upload framework, generic parser plugin system, OCR service, AI extraction service, new state-management library, or queue for this small reference document. Those additions need evidence from unsupported inputs or measured resource limits.

The initial target is a **new, deactivated curriculum**, followed by the existing activation and section-assignment workflows. Importing into or replacing an existing active curriculum is a separate operation subject to its structural-edit locks; it is not an implicit side effect of this feature.

## 2. Evidence and limitations

### Sources examined

- Application code and dependencies in this standalone React/TypeScript/Vite frontend checkout.
- [Architecture](architecture.md), [database](database.md), [business rules](business_rules.md), [coding standards](coding_standards.md), [decisions](decisions.md), and the historical [curriculum audit](reports/curriculum_module_audit.md).
- User-supplied `TCC_BSIT_active_curriculum-1.pdf`, page 1, at `C:/Users/toman/Downloads/Applications/TCC_BSIT_active_curriculum-1.pdf`.
- Current primary library documentation linked in section 11, checked on 2026-10-27.

The reference PDF is 153,213 bytes, one page, 612 x 1008 PDF points, with selectable text. Its SHA-256 is `3ba201472f92e08b13cb09dea39b483abb298269337c103b7b1a978c0fc66496`. Its embedded title identifies an XLSX source. This does not establish that the source workbook is available.

The PDF was rendered and visually inspected. Read-only extraction using the bundled `pdfplumber` runtime checked the text, numeric row counts, table geometry, and source totals. This is evidence analysis, not a production parser or a benchmark of the proposed JavaScript libraries.

**Backend limitation:** backend source, migrations, live schema, and API responses are absent from this checkout. Laravel 12/PHP 8.2+, Sanctum, constraints, and scheduling service names are described by project documentation; they have not been independently verified against backend code in this task. Backend work must begin with that verification.

### Documentation conflicts

The historical curriculum audit refers to plural `curricula`, `/api/curricula`, and automatic deactivation of competing curricula. Current `database.md` specifies singular `curriculum` and multiple simultaneously active curricula. The frontend calls `/curriculum`, and its lifecycle mapper groups multiple active records by department/program. Follow these current sources; do not restore the historical single-active behavior. Confirm backend implementation before migration design is finalized.

The historical audit's master-course synchronization descriptions also must not override the current rule that `curriculum_course` determines each curriculum's year and term. Sections explicitly select a curriculum; there is no safe global "first active curriculum" fallback.

## 3. Existing implementation and reuse map

Paths below are relative to the repository root.

| Area | Verified implementation | Reuse or required extension |
|---|---|---|
| List and authoring entry | `src/pages/curriculum/CurriculumListPage.tsx` selects management or review UI using `curriculum.manage` | Add Import beside the existing authoring actions; preserve review access |
| Metadata | `src/components/curriculum/CurriculumFormModal.tsx` saves name, unique code, program, and effective school year | Reuse metadata controls; separate CMO number and series from the internal identifier |
| Authoring scope | `src/lib/curriculumAccess.ts` and its tests enforce capability, department, and Program Head program scope in the UI | Mirror this UX and verify server authorization; do not grant imports by role name alone |
| Detail state | `src/hooks/curriculum/useCurriculumDetail.ts` loads groups and constructs First/Second/Summer placeholders | Reuse group labels and cache refresh; do not persist empty Summer placeholders |
| Existing table | `src/components/curriculum/CourseTable.tsx` uses `DataTable` and `useDataTable`, totals, and Major-first sorting | Reuse the table primitives for draft rows with prerequisites, category, issue markers, and editable cells |
| Year/term navigation | `src/components/curriculum/SemesterCard.tsx` supports years 1-4 and numeric terms 1, 2, 3 | Preserve controls; preview must distinguish absent Summer from an empty UI placeholder |
| Manual encoding | `src/components/curriculum/AddCourseModal.tsx`, `EditCourseModal.tsx` | Reuse field conventions and error presentation, but not their auto-formatting or default-to-Major behavior for uncertain extraction |
| API calls | `src/services/curriculum/curriculumService.ts` has create/update/duplicate/activate, full detail, and single/batch attachment | Add a small import service beside it; no ad hoc Axios client |
| Batch encoding | `useCurriculumDetail.ts` calls `/curriculum/{id}/courses/batch-create` and processes individual success/error results | Reuse backend validation/course resolution where verified; this partial-success contract is insufficient for an atomic document import |
| Print | `src/lib/curriculumPrintable.ts` renders separate Summer sections and a `Preq` column | Extend it to print persisted prerequisites and structured CMO metadata; the current row renderer does not populate prerequisites |
| Scheduling durations | `src/pages/ClassSchedules/SchedulerPanel/courseSlotPlan.ts` and `GenerateSchedule/courseClassConfig.ts` | Centralize use of resolved placement minutes; retain legacy fallback for existing data |
| Course/catalog representation | `src/pages/secretary/CourseManager.tsx`, `src/types/curriculum.ts` | Keep existing response compatibility while adding explicit credit/minute fields where curriculum context exists |
| Transport and refresh | `src/lib/api.ts`, `idempotency.ts`, `cacheGroups.ts`, `apiError.ts`, `useLiveRefresh` | Reuse authentication, error handling, idempotency conventions, and post-commit cache/live refresh |

No PDF-reading, CSV-reading, XLSX-reading, or DOCX-reading dependency is declared in `package.json`. Existing `jspdf` and `jspdf-autotable` generate documents; they do not provide the required input extraction.

### Important unit semantics

The manual curriculum form explicitly calls lecture/laboratory entries **credit units**. The hook sends those values as API `lecture_hours` and `lab_hours`, then maps those same response fields back to `lec_units` and `lab_units`.

Meanwhile, `courseSlotPlan.ts` computes lecture slots as `lectureHours * 2` and laboratory slots as `labHours * 6`, on a 30-minute grid. A 2-lecture-unit/1-laboratory-unit course therefore has component defaults of 120 and 180 minutes, while its Regular single block defaults to `units * 60`, or 180 minutes. The documented Integrated and Regular behaviors are different today.

**Do not multiply the legacy fields during import and feed them back into these calculations.** That would multiply laboratory time twice. Do not rename, repurpose, or blanket-convert existing database values without auditing backend consumers.

## 4. Reference PDF findings

### Header extraction

| Required metadata | Observed value | Handling |
|---|---|---|
| CMO | 25 | Store separately from the unique curriculum code |
| Series | 2015 | Distinct from effective year |
| Effective school year | 2020-2021 | Preserve; do not use PDF creation date or current year |
| Program | Bachelor of Science in Information Technology (BSIT) | Match an existing authorized program; require review if missing/ambiguous |
| Year levels | First, Second, Third, Fourth | Normalize headings for detection only |
| Terms | First Semester, Second Semester, Summer | Preserve as three distinct terms |

Student ID/name/entry-year blanks and the evaluator signature table are form furniture, not curriculum records. The preparatory-mathematics note is a curriculum note requiring review, not an ordinary course row. Preserve the source text without inventing a code, units, or applicability rule.

### Reviewed year/term inventory

Numeric triples below mean **lecture units / laboratory units / total credit units**, not contact hours. Computed values use visually reviewed course rows, including two malformed text-position cells described below.

| Year | Term | Listed rows | Printed totals | Row-derived totals | Result |
|---|---|---:|---|---|---|
| 1 | First Semester | 6 | 14 / 3 / 17 | 14 / 3 / 17 | Matches after cell review |
| 1 | Second Semester | 6 | 15 / 2 / 17 | 15 / 2 / 17 | Matches |
| 1 | Summer | 0 | Not present | Not applicable | Do not create an imported Summer group |
| 2 | First Semester | 7 | 16 / 4 / 20 | 16 / 4 / 20 | Matches after cell review |
| 2 | Second Semester | 9 | 21 / 5 / 26 | 21 / 5 / 26 | Matches |
| 2 | Summer | 3 | 7 / 2 / 9 | 7 / 2 / 9 | Separate group |
| 3 | First Semester | 9 | 23 / 4 / 27 | 23 / 4 / 27 | Matches |
| 3 | Second Semester | 10 | 23 / 4 / 27 | **26 / 4 / 30** | **Source discrepancy; block pending review** |
| 3 | Summer | 3 | 8 / 1 / 9 | 8 / 1 / 9 | Separate group |
| 4 | First Semester | 5 | 11 / 4 / 15 | 11 / 4 / 15 | Matches |
| 4 | Second Semester | 1 | 6 / 0 / 6 | 6 / 0 / 6 | Practicum; see duration caveat |
| 4 | Summer | 0 | Not present | Not applicable | Do not create an imported Summer group |

There are **59 listed rows in ten populated groups**. All ten Third Year, Second Semester rows show 3 credits. Across the curriculum, row-derived totals are **147 lecture + 29 laboratory = 176 credits**. Summing the printed term totals gives **144 + 29 = 173 credits**. The document does not explicitly print either grand total; both are calculated here.

Neither 176 nor a corrected Third Year total is an approved institutional correction. Preserve the printed 27 and the calculated 30 together. A reviewer must resolve which source value or course list is authoritative and record a reason. Never drop the tenth course merely to force agreement.

### Extraction and domain edge cases

| Evidence | Risk | Required behavior |
|---|---|---|
| First/Second tables are side by side with shared vertical positions | Flat text extraction interleaves semesters | Segment year bands and table regions before reading rows |
| First Summer table extends to approximately x=350 on a 612-point-wide page | A fixed half-page crop truncates prerequisites | Derive each table's extent from its headers/grid, including the full prerequisite column |
| Headings use spaced letters such as `S U M M E R` | Literal word matching misses headings | Collapse spacing for known heading recognition only |
| Year 1 `GEC 1` reads as `3 03`; Year 2 `IT 108` as `2 13` in text extraction | TU glyph is positioned beside the Lab digit; even grid extraction produces merged/empty cells | Flag ambiguity, show the crop, and suggest reviewed 3/0/3 or 2/1/3 values; never accept Lab=3 or Lab=13 silently |
| `I1 125` is present in the PDF text, while a later prerequisite says `IT125` | A likely source inconsistency can become an unmatched prerequisite | Retain original code and suggest a possible code correction; the prerequisite text itself is kept verbatim |
| `PATH FITt 2`, `PATH FiIT3`, `GEE11`, `IT Elec 1`, and `IT Elective 1` differ in spelling/spacing | Aggressive normalization changes identity | Retain original text and approved value separately; do not silently equate look-alike letters or aliases |
| `R101` is used against `ROTC/CWTS 101` | Alias is not an exact identity | Reviewer resolves the alias; slash within `ROTC/CWTS` is part of a code |
| `IT108/109/110/112`, `IT Elective 2 & 3` | Shared prefixes and connectors have ambiguous semantics | Suggest references using the draft's known codes; require confirmation of references and all/any semantics |
| `1st2nd3rdyr/1stSem` and `100% Completed Core Courses` | Prerequisites include conditions, not just course IDs | Preserve verbatim as reference text; no classification, course IDs, or enrollment enforcement |
| `Prac 101`, `Practicum (486 hours)`, 6/0/6 | Total placement hours cannot be inferred from weekly credit conversion | Capture 486 as source-described total hours; block import until a supported scheduling basis is reviewed. Do not assign 486 weekly hours or assume 6 weekly hours |
| Long titles, mixed font sizes, and a wrapped practicum prerequisite | Naive baseline/token splitting corrupts cells | Group with font-relative tolerance and row boundaries; attach continuation text within its column |

The practicum is **not automatically a Field course by its name**. Existing rules require an explicit room requirement or department course rule. Import must not change that policy.

## 5. Priority decisions

| Priority | Decision needed | Proposed resolution |
|---|---|---|
| P1 | Credit fields currently masquerade as hours | Add explicit placement credits and resolved minutes; preserve legacy fields and fallback until all relevant readers are compatible |
| P1 | PDF source totals and identities disagree | Treat disagreements as blocking review items; preserve evidence, approved corrections, and reasons |
| P1 | Existing batch endpoint permits partial outcomes | New import commit is all-or-nothing; share validation/resolution internals, not the current row-by-row persistence flow |
| P1 | Existing course category affects ownership, teaching delegation, and room eligibility | Department rules propose classifications for import; never bulk-reclassify existing/shared courses |
| P1 | Configuration edits could change approved scheduling behavior | Freeze placement conversions and existing meeting durations; configuration changes are prospective |
| P2 | CMO label is currently stored in globally unique `curriculum.code` | Add structured CMO fields while retaining a separate unique internal code; the same CMO can govern several curricula |
| P2 | Variable layouts exceed one reliable parser | Support the verified TCC layout and structured templates first; use explicit mapping/review for other layouts |

## 6. Canonical draft and term handling

Use a small typed draft shared by file adapters, preview, and validation. Do not pass parser-specific objects to UI components or persistence endpoints.

| Draft part | Required information |
|---|---|
| Source | Filename, format, byte size, SHA-256, extractor version; source data is untrusted |
| Metadata | Name, separate unique curriculum code, CMO number/series, effective school year, selected department/program, retained notes |
| Course row | Stable draft row ID, exact source code/title, approved code/title, year, term, lecture/lab credits, reported TU, computed TU, prerequisite text (source and corrected), category proposal/approval, catalog-resolution decision |
| Provenance | Page and bounding box for PDF; sheet/row/cell for XLSX; table/row for DOCX; line/column for CSV |
| Group totals | Key `(year_level, term)`, source-declared Lec/Lab/TU when present, independently computed values, discrepancy resolution |
| Configuration | Authorized department policy revision, applied classification rule IDs/values, conversion snapshot; approved row overrides with reasons |
| Validation | Issue code, severity, stable row ID/field, actionable message, and review state |

Source values and reviewer edits must remain distinguishable. Preserve official title casing; do not run imported titles through `formatCourseName` automatically. A matching key may trim/collapse whitespace and uppercase, as existing code does, while retaining the original string. Do not remove internal spaces, punctuation, or leading numeric zeros indiscriminately.

Keep the current transport representations and map explicitly at boundaries:

| Meaning | Curriculum placement | Semester/course scheduling enum | UI label |
|---|---:|---|---|
| First term | 1 | `1st` | First Semester |
| Second term | 2 | `2nd` | Second Semester |
| Summer | 3 | `summer` | Summer |

`semester_id` remains the identifier of an academic-year-specific semester record; it is never the numeric placement term. Effective school year is also not a `semester_id`.

Do not infer a term from course code, array index, current active semester, or the table's reading order. Detect both the year band and term header. Summer inherits the immediately enclosing year section only when that boundary is unambiguous. For multi-page inputs, carry context only across a verified continuation; otherwise request mapping.

Group and validate totals by `(year_level, term)` before aggregating overall totals. Missing Summer is valid and distinct from an explicitly empty Summer section. Preserve source row order in preview/provenance; existing saved curriculum sorting can remain Major-first.

## 7. Classification and conversion policy

### Department classification rules

Use literal **exact-code** and **prefix** matches, scoped to the offering department. No custom regular expressions or scripting language is needed.

Proposed precedence:

1. Authorized row-level correction, with a reason.
2. Exact normalized course-code rule.
3. Longest matching normalized prefix.
4. Unclassified: require a reviewer choice. Do not default an unknown row to Major.

A prefix matches a code prefix ending at a word boundary or before a digit/separator: `IT` matches `IT 101`, `IT101`, and `IT Elec 1`, but not `ITEM 101`. Show representative matches in settings so administrators can see the effect.

Reject duplicate normalized `(department, match_kind, match_value)` rules and opposite classifications at the same specificity. Show overlaps between shorter/longer prefixes and exact exceptions. Permit an intentional more-specific exception only with visible precedence and explicit acknowledgment when saving settings. File order and database row order never decide a classification.

Rules are department-specific proposals; **`courses.course_category` remains the authoritative stored category for a reused catalog course**. Matching a shared Minor with a Major proposal is a catalog conflict, not permission to change that shared course. Review may reuse the existing category if correct, or create an owned variant only if the verified backend ownership/uniqueness rules permit it. Otherwise block that row. Do not add a placement-category override without updating every ownership/delegation consumer; that is a larger domain change.

When reusing a course, compare code, title, credits, category, owner, program, and archive status. An imported code alone is insufficient identity. Preserve `teaching_department_id` and `teaching_program_id`; rules do not assign a teaching department or make a Major delegable. Changing rules does not rewrite prior imports or catalog records.

Illustrative settings only; the IT/GEC/GEE classifications must be approved by the institution:

```json
{
  "revision": 1,
  "lecture_minutes_per_unit": 60,
  "laboratory_minutes_per_unit": 180,
  "classification_rules": [
    { "match_kind": "prefix", "match_value": "IT", "category": "major" },
    { "match_kind": "prefix", "match_value": "GEC", "category": "minor" },
    { "match_kind": "prefix", "match_value": "GEE", "category": "minor" }
  ]
}
```

### Unit-to-hour conversion

Store configuration in minutes per credit unit, and display the equivalent hours:

- `lecture_minutes = lecture_units * lecture_minutes_per_unit`.
- `laboratory_minutes = lab_units * laboratory_minutes_per_unit`.
- `weekly_contact_minutes = lecture_minutes + laboratory_minutes` for ordinary weekly component-based courses.
- `total_credits = lecture_units + lab_units`, independent of contact minutes.

At 60/180, 2 lecture + 1 lab credits mean **3 credits, 120 lecture minutes, 180 laboratory minutes, 300 contact minutes (5 hours)**. At a second department's 60/120 policy, the same credits mean 240 minutes (4 hours). These are test cases, not an assertion that every course must become one continuous block.

Apply the offering department's policy selected for the curriculum, not the user's department or a delegated teaching department. Snapshot its values and revision on new placements. Revalidate when policy changes between preview and commit.

Use positive finite rates and decimal credit storage appropriate to the verified schema. Derived scheduling minutes must be whole minutes and fit the supported scheduling grid/components; do not silently round a 75-minute component into a 60- or 90-minute meeting. Zero credits, unusually large credits, and nonweekly practicum/internship hours need explicit existing-policy support rather than a blanket assumption.

**Scheduling compatibility decision:** use resolved contact/component minutes as the baseline for newly imported, policy-aware placements. Regular must not silently keep a 3-hour `units * 60` default when the approved conversion requires 5 contact hours. A combined block still has to satisfy room/component eligibility; courses requiring separate lecture and lab meetings must use an eligible Integrated configuration. Hybrid Split's fixed meetings remain eligible only when their sum matches the resolved lecture requirement. Existing authorized duration overrides, custom lab duration, field rules, and meeting shapes need a documented precedence review, not automatic deletion or replacement.

Suggested precedence is supported explicit per-course/section configuration, then existing applicable duration defaults/overrides, then the frozen placement baseline. All overrides remain subject to the same hard duration and component constraints. Show the baseline and effective overridden durations so an override cannot silently violate a newly approved contact-hour requirement. Confirm the exact policy with backend scheduling owners before enabling custom rates.

### Preservation guarantees

- Saving settings changes only future import defaults. It does not recalculate existing placements, move meetings, change approvals, or update master course hours/category.
- A duplicated curriculum copies its placement snapshots; using new conversion settings is an explicit reviewed action on the copy.
- Selected-section curriculum placement is the authority in manual scheduling, generation, suggestions, preflight, validation, and exports. Never resolve rates by the latest active curriculum globally.
- Resolve duration data by `(curriculum_id, course_id)` and the selected section. A shared course ID can appear in several curricula with different frozen conversions. A frontend course map or generation snapshot keyed only by course ID must not overwrite one placement's minutes with another's; adapt those consumers before supporting mixed-curriculum section batches.
- Existing rows without snapshots follow the verified legacy behavior. Do not backfill them with today's department rates.
- Approved/in-progress submissions and schedule history retain existing meeting times and snapshots. Importing a new curriculum does not assign it to existing sections.

## 8. Proposed persistence changes

Verify actual column types, policies, model hooks, foreign keys, and migrations in the backend first. Prefer additive changes; do not rename the existing tables or remove legacy fields.

| Table | Proposed additions | Purpose and integrity |
|---|---|---|
| `curriculum` | Nullable `cmo_number` string and `cmo_series` year/integer | Separate regulatory metadata from globally unique `code`; reuse effective year/program/department/status/description |
| `departments` | `lecture_minutes_per_unit`, `laboratory_minutes_per_unit`, `curriculum_import_settings_revision` | Existing documentation stores department scheduling settings here; use prospective defaults and optimistic revision checks |
| New `curriculum_classification_rules` | ID, department FK, match kind/value, category, enabled flag, timestamps | Unique normalized `(department_id, match_kind, match_value)`; validate enums and literal match length; update settings revision transactionally |
| `curriculum_course` | Nullable explicit `lecture_units`, `lab_units`; `lecture_minutes`, `laboratory_minutes`; `conversion_snapshot` JSON | Preserve imported credits and resolved durations per curriculum; snapshot includes policy values/revision and offering department; fields form one complete versioned bundle for new rows |
| `curriculum_course` | `prerequisites_text` | Keep the curriculum-specific prerequisite exactly as written (reference data only); avoid writing prerequisites globally onto a shared course |
| New `curriculum_imports` | Curriculum FK, department FK, actor FK, scoped unique request key, payload hash, source metadata, extractor version, reviewed import record/summary, timestamps | Successful-import audit and retry outcome; bounded JSON retains raw-versus-reviewed values, group totals, rule snapshot, issue resolutions, and row-to-course mapping |

Keep `curriculum_course`'s documented unique `(curriculum_id, course_id)` and its year/semester lookup index. A repeated course in another term is an explicit placement conflict under this existing model, even when the source repeats it. Do not loosen that uniqueness to make extraction pass.

No separate term table is needed for this feature: compute Lec/Lab/TU totals from approved placements and retain source-declared totals and discrepancies in the import record. Do not store computed totals as an independently mutable authority. `course_categories`/`course_category_mapping` do not substitute for exact-code/prefix import rules.

Prerequisites are curriculum reference data only. The extracted text is stored exactly as written (corrected only where extraction misread it; the original stays in the import record's `source.prerequisites`). It is not classified, reviewed, or validated, never blocks an import, and does not affect room assignment, instructor assignment, or schedule generation.

The practicum's 486-hour statement stays in the source title/import record. This plan does not invent teaching-week counts to convert it into weekly minutes. Phase 0 must establish a supported weekly scheduling treatment, or explicitly extend the placement model with a nonweekly basis and a scheduling guard before enabling import of that row. The ordinary weekly snapshot schema alone does not represent a total-hours practicum policy.

Avoid duplicating complete master-course records. For a new course, keep writing the verified legacy-compatible credits to the existing legacy fields until their contract is migrated. For an existing course, initial import reuse should require compatible title/category/credit data; mismatches go through explicit catalog review and must not mutate historical/shared records. Any future support for different catalog credit versions needs its own backend-compatible workflow.

### Migration and rollback sequence

1. Inventory actual schema and duplicate/null-owner code behavior, including archived records. Composite uniqueness with nullable owners may not guarantee uniqueness for shared courses on every database; preserve scope and verify concurrency behavior.
2. Add nullable placement/metadata fields and the small settings/rules/import audit structures. Initialize prospective 60/180 defaults without recalculating existing placements.
3. Deploy backend readers/writers that understand complete snapshots and retain legacy fallback. Cover every placement writer: manual attach/batch-create, replacement, duplication, and import. Duplication copies snapshots; new attachment follows an explicit compatibility policy.
4. Deploy scheduler/UI compatibility before enabling nondefault conversions. New fields are additive to existing response shapes; old clients must not receive actual minutes inside legacy credit-shaped fields.
5. Enable imports into deactivated curricula after the acceptance gates below pass. Do not bulk-reclassify or backfill historical schedules as part of rollout.
6. Roll back by disabling new imports/settings and retaining audit data. If any placement has nondefault rates, do not roll back readers to a legacy-only release that ignores its snapshot. Keep the compatibility reader or restrict scheduling those new curricula until a corrected release is deployed. Dropping populated columns/tables is a separate reviewed destructive action.

## 9. Proposed API and commit boundary

These routes are **design suggestions only**, not endpoints verified in this checkout:

| Proposed operation | Responsibility |
|---|---|
| `GET /departments/{id}/curriculum-import-settings` | Authorized read of rates, rules, and revision |
| `PUT /departments/{id}/curriculum-import-settings` | Administrator-authorized atomic rule/rate update with expected revision |
| `POST /curriculum-imports/validate` | Validate normalized JSON draft, resolve catalog proposals, return field issues/totals, payload fingerprint, and expected revisions; no curriculum/course writes |
| `POST /curriculum-imports` | Revalidate the reviewed JSON and expected revisions against fresh state; atomically commit the curriculum and audit outcome |

Reuse the shared API client and existing capability/scoping services. There is no verified settings-management capability in the inspected curriculum code. Map configuration management to an existing appropriate backend administrator permission if one exists; otherwise propose and review a narrowly scoped new capability. `curriculum.manage` must not silently grant all department-wide policy changes. Authors can review/correct their authorized import without automatically acquiring permission to save global rules.

Validation response should include normalized rows, catalog decisions, per-group reported/calculated totals, rule matches, resolved minute previews, blocking issues, warnings requiring acknowledgment, and an immutable payload/settings/catalog revision binding. Error paths need stable row IDs in addition to normal Laravel field errors so table sorting does not move messages to the wrong row.

Return a canonical payload fingerprint and the settings/relevant catalog revisions for freshness checks. After edits, invalidate the local validation result and validate again. These values are not security credentials: commit reruns authorization and validation against current state. This avoids a custom signed-token/session mechanism when fresh validation already provides the required integrity.

Commit in this order:

1. Authenticate and reauthorize department/program scope. Derive permitted ownership on the server rather than trusting supplied IDs.
2. Check the unique import request key and payload hash. Same key/body returns the recorded outcome; same key/different body is a conflict. A file hash alone is not an import idempotency key.
3. Inside the commit transaction, re-read and lock relevant settings/catalog rows, compare revisions, rerun canonical validation, and resolve course identities before writes. New courses can reference other draft row IDs at this stage. Reject stale previews with a clear conflict response.
4. Create the **deactivated** curriculum, create approved new courses or reuse compatible ones, create all placements/snapshots with their prerequisite text, and write the required audit/import record. Reuse existing domain services/model events where verified.
5. Roll back the entire transaction if any row, uniqueness constraint, authorization check, or required audit write fails. Never return a successful curriculum with a subset of the document's courses.
6. After commit, publish existing live-refresh/audit notifications as appropriate and invalidate `curriculum`, `courses`, `schedules`, and `dashboards` caches. Return curriculum ID, row-to-course mapping, reused/created counts, group totals, and reviewed-warning summary.

Use the documented database queue only if later measurements require asynchronous extraction. Neither this one-page file nor bounded JSON validation justifies new jobs or storage sessions by itself.

With browser extraction, the server receives JSON and a client-declared file hash, not the source bytes. It can validate domain integrity, but cannot independently prove that the submitted values/hash reproduce the source document. Label provenance accordingly. If institutional policy requires authoritative source retention/reparsing, add a private source-file upload and server-computed hash as a separate explicit extension; do not imply it already exists.

## 10. Extraction design

### PDF

1. Check file signature/size/page count; load the selected local bytes with PDF.js in its worker. Use the same library version for worker and main code and serve worker assets locally through Vite.
2. Extract text items with coordinates. Normalize page rotation and dimensions before comparing positions.
3. Locate metadata and known year bands. Detect repeated `Course Code`, term, `Lec`, `Lab`, `TU`, and `Preq` anchors within each band.
4. Establish independent left/right semester regions. A separate Summer region may span past the midpoint; its actual right boundary must include prerequisites. Do not use one fixed page split for every table.
5. Build rows from course-code anchors, then assign title/numeric/prerequisite items using local column bands and font-relative baseline tolerance. Restrict continuation text to the same row/column. Keep source coordinates.
6. Treat blank/merged numeric cells as uncertain. Arithmetic and source totals can generate suggestions, but do not silently repair digits, codes, prerequisites, or term assignment. Show the affected source crop.
7. Parse total rows as source declarations, not courses. Reset term/year context at each verified boundary. Exclude header furniture, notes, and evaluator rows.
8. Compare each course's credits and each term's totals, including Summer independently. Require reviewer resolution before final backend validation.

Text extraction alone cannot reliably infer tables for arbitrary layouts. The TCC extractor is a bounded layout-specific function with a fixture, not a universal curriculum recognizer. Other layouts use header/column mapping and explicit grouping confirmation. When text is absent, unreadable, or insufficient, identify the file as needing OCR or a structured replacement; do not claim a successful empty import.

The supplied file contains malformed text coordinates, so the implementation spike must test whether PDF.js emits the same merged fragments observed with `pdfplumber`. Browser extraction parity is an acceptance gate, not an assumed result.

### CSV and XLSX

Provide a standard course template with year level, term, code, official title, lecture credits, laboratory credits, total credits, and prerequisite text. Capture CMO/series/effective-year/program once in the metadata step or a recognized metadata sheet; detect conflicting repeated metadata rather than accepting the last row.

Use real CSV parsing for quoted commas, embedded newlines, BOMs, and empty cells. Preserve strings/leading zeros; validate numeric fields explicitly instead of global dynamic typing. Detect malformed rows and column mapping ambiguities.

For XLSX, expose sheet selection; preserve row/cell coordinates, blank cells, and explicit header mappings. Recognize side-by-side semester blocks through the same logical grouping rules only after fixture verification. Do not assume a styled workbook has a single header row. Treat formula results as untrusted cached values and recompute all curriculum totals; no formula or macro execution is needed. Missing cached required values remain validation errors. Legacy XLS/XLSM is not in the first support set.

### DOCX

Use Mammoth to convert semantic tables for extraction. Read only whitelisted table/row/cell and heading text into draft objects; ignore links, attributes, embedded images, and external resources. Do not insert converted HTML with `dangerouslySetInnerHTML` or into the live DOM. Raw-text mode discards table structure and is unsuitable for automatic semester assignment.

Nested tables, merged cells, and visual columns require fixtures and explicit mapping; conversion does not guarantee preservation of Word page geometry. If the document lacks semantic table structure, offer manual mapping or conversion to the supported template. Legacy DOC and arbitrary image formats need separate scope.

## 11. Library comparison

Recommendations are based on the required capabilities and avoiding duplicate dependencies. Bundle size, browser memory, and Vite worker compatibility still need measurement on the selected versions; no numerical size/performance claims are made here.

| Task | Preferred choice | Alternatives and tradeoffs |
|---|---|---|
| File selection/progress | Native `<input type="file">`, File/Blob APIs, existing buttons/spinner/toasts | No dropzone or upload manager needed. Label local read/extraction progress accurately; network progress applies to final submission |
| PDF text and source preview | `pdfjs-dist` (PDF.js), lazy-loaded with its worker | Provides text/geometry and page rendering. `react-pdf` adds a UI wrapper without solving table extraction; export-only jsPDF cannot parse input. [PDF.js text-item API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html#~TextItem), [browser examples](https://mozilla.github.io/pdf.js/examples/) |
| CSV/TSV | Papa Parse, lazy-loaded | Local files, quoting, workers, chunking, and parser errors. Reuse native APIs around it; avoid a handwritten CSV splitter. [Official documentation](https://www.papaparse.com/docs) |
| XLSX import | `read-excel-file`, lazy-loaded; evaluate its worker entry for bounded imports | Import-focused browser/Node reader with schema support. Cached formula results can be absent; validate them. Supports XLSX rather than legacy XLS. [Maintainer documentation](https://github.com/catamphetamine/read-excel-file) |
| Broader spreadsheet formats | SheetJS CE only if XLS/ODS or richer workbook requirements justify it | Wider scope and additional distribution/version management. Pin a maintained official build; do not blindly add the public-registry `xlsx` package. Its maintainer advisory covers affected releases through 0.20.1 and recommends 0.20.2+. Check newer advisories before installation. [Official installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), [maintainer advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363) |
| Spreadsheet read/write with styles | ExcelJS only if future authoring/export needs require it | More functionality than this import needs. Browser support excludes streaming workbook readers/writers, so it is not a browser-streaming shortcut. Do not install it alongside another XLSX reader without a concrete reason. [Maintainer README](https://raw.githubusercontent.com/exceljs/exceljs/master/README.md) |
| DOCX semantic tables | Mammoth, lazy-loaded | Preserves semantic tables rather than Word page layout; unsanitized output must never be rendered as trusted HTML. Raw text loses layout. [Maintainer documentation/security notes](https://github.com/mwilliamson/mammoth.js) |
| Scanned PDF OCR | Deferred | The sample has selectable text. An OCR dependency/service needs an actual scanned-file corpus, accuracy checks, and a separate resource/privacy design |

The proposed complete first support set needs four format libraries: PDF.js, Papa Parse, one XLSX reader, and Mammoth. Add them incrementally by phase, with exact versions locked and licenses/advisories checked. Do not install libraries during this planning task. Use dynamic imports so ordinary Curriculum pages do not eagerly load all parsers.

## 12. Preview, configuration, and validation UX

Use one focused import route or full-width panel reachable from Curriculum Management. A 59-row, multi-group editor needs more room than the current single-semester Add Course modal. Keep the existing colors, controls, table density, modal/confirmation conventions, and toast/error components.

| Step | User sees and does | Exit condition |
|---|---|---|
| Upload | Choose a supported file; see format/size guidance and selected-file information | Readable supported file within configured limits |
| Extract | See real stage/page progress, cancel, or choose sheet/column mapping | A draft exists, including uncertainty markers |
| Preview | Confirm metadata; navigate Year -> First/Second/Summer; inspect source crops; edit rows and prerequisites | Required metadata/placement/credit issues resolved |
| Configure | Inspect rule matches, correct classifications, choose compatible existing/new catalog records, and review credit-to-hour results | Every row classified and all relevant conflicts/conditions acknowledged; settings edits require separate administrator authority |
| Import | Review counts, discrepancies/resolutions, new/reused courses, and deactivated status; validate and submit | Backend validation clean; atomic commit succeeds |

Reuse `DataTable`/`useDataTable` directly for draft rows with stable row IDs. The existing `CourseTable` expects persisted course IDs, actions, and Major-first sorting, so forcing draft rows through its current props would create false persisted identities. Extract a small shared column/cell definition only where useful; do not build a new general table framework.

Show source and approved values on demand, editable prerequisites, category/rule explanation, credit totals, computed contact hours, and issue links that focus the affected cell. Source order is useful during correction; regular saved sorting remains available. Edits to prerequisites/group membership/units invalidate dependent validation and totals immediately.

Display separate counts for errors, required reviews, and informational warnings. Import stays disabled while blockers or required reviews remain. Never hide invalid rows from the final count or silently skip them. Canceled extraction discards the uncommitted draft; navigating away from edits needs a clear discard prompt. Do not promise durable drafts until server persistence is deliberately added.

On success show the curriculum link, ten-group-style term summary as appropriate, created/reused counts, total credits, and resolved source discrepancies. Activation remains a separate existing action. Network failures retain the reviewed draft and retry key; no optimistic success toast before commit.

### Validation matrix

| Check | Blocking or review behavior |
|---|---|
| Metadata | Required curriculum identifier, name, authorized existing program/department, CMO/series where supplied or required by policy, valid consecutive effective years; source-missing data is requested, never invented |
| Year/term | Existing supported years 1-4 and terms 1/2/3 only; ambiguous headers/mappings block; absent Summer is valid |
| Code/title | Required exact source/approved text, backend length rules, Unicode/control checks; retain punctuation and official wording |
| Duplicate rows | Repeated normalized code/identity within the draft requires explicit resolution; do not silently merge or remove a repeated course |
| Catalog conflicts | Department/program ownership, shared course identity, category/title/credit mismatch, archived matches, and existing placement conflicts require explicit compatible resolution |
| Credit values | Required finite nonnegative decimals within verified policy bounds; distinguish blank from zero; Lec+Lab must equal approved TU; no NaN, negative, or silently rounded values |
| Source term totals | Compare Lec, Lab, and TU independently for every group; mismatch blocks until a reviewer resolves the source discrepancy with a reason |
| Missing reported totals | Compute totals but label them as calculated; do not fabricate a printed total. Require explicit group completeness confirmation when the source offers no cross-check |
| Prerequisites | None. Stored verbatim as reference text; empty or missing values are stored as none |
| Classification | No unresolved category, duplicate/conflicting rule, or silent shared-course reclassification; record authorized overrides |
| Scheduling conversion | Positive rates, correct offering department/revision, representable component minutes, no double multiplication; practicum basis and override conflicts require resolution |
| Freshness and concurrency | Settings/catalog/program/archive/permission changes since preview cause fresh validation; expected revisions are rechecked and request-key/body mismatch conflicts |

Both frontend and backend validate. The server owns authorization, catalog resolution, totals, minute calculations, and commit integrity. Browser flags and correction acknowledgments are untrusted input until validated under an authorized user's scope.

## 13. Security and performance boundaries

- Treat every document and extracted string as untrusted data. Document text cannot grant permissions or change parser behavior.
- Keep source bytes local by default; no third-party document upload or external URL fetch is needed. Do not store student-form content unnecessarily.
- Escape all extracted UI text through React. Do not execute PDF actions, office macros, spreadsheet formulas, hyperlinks, or document-embedded resources. Reject unsupported macro/legacy formats.
- Proposed initial operational limits for testing: 10 MiB selected file, 50 PDF pages, 2,000 candidate course rows, and a 30-second extraction budget with cancellation. These are provisional product limits, not current system rules; enforce them before expensive parsing where possible and tune from measured fixtures.
- XLSX/DOCX are compressed containers. Measure/check entry counts, expanded size, and parsing work where the library permits it; a small compressed file can still exhaust resources. Browser workers improve responsiveness, but do not make unbounded decompression safe. If the chosen library cannot enforce safe limits, reject untrusted complex files or use an isolated bounded server parser before broad support.
- Reuse current API timeouts with an explicit import request budget. Multipart is unnecessary for the recommended JSON flow. If source upload is later introduced, handle content-type boundaries, explicit upload timeout, and idempotency because the current fingerprint helper skips `FormData`/`Blob` and would not provide these automatically.
- Server validation caps arrays/string lengths, calculates in batches, and fetches catalog candidates/rules once per scope, avoiding per-row queries. Database constraints and commit-time checks remain the authority under concurrent imports.
- Load parser chunks on demand, terminate/release workers on cancel, release PDF page/canvas buffers, and render source previews only as requested. Do not rasterize all pages up front.
- Use existing audit mechanisms and restricted import-record access. Bound retained JSON and define retention with the institution. If originals become necessary, use private storage, verified content types, server-computed hashes, and authorized retrieval.

## 14. Phased delivery and acceptance gates

| Phase | Work | Acceptance gate |
|---|---|---|
| 0. Confirm evidence and contracts | Verify backend schema/policies/validators and duration consumers; record this PDF as the primary fixture; obtain institution-reviewed code, prerequisite, practicum, and total resolutions | Known source discrepancies stay explicit; no backend/schema claims rely only on historical notes |
| 1. Data and policy compatibility | Add structured metadata, prospective department settings/rules, placement snapshots/prerequisites, and bounded import audit/idempotency; document authorization and API contracts | Additive migration works on representative existing data; old curricula and response contracts remain compatible |
| 2. Scheduling integration | Resolve new placement minute baselines through section-selected curriculum in backend policy/snapshot/kernel/manual/generation/recommendation paths and frontend duration helpers; preserve legacy paths | Cross-department conversions and new/legacy curricula agree between client/server; approved schedules and history unchanged |
| 3. Canonical review and atomic import | Build draft editor, server validation/commit, metadata review, rule/collision review, and CSV/XLSX templates using existing UI/client conventions | Invalid/stale/unauthorized drafts cannot persist; one failure rolls everything back; retries return the same outcome |
| 4. Primary PDF and DOCX extraction | Add PDF.js TCC layout extraction/source previews and Mammoth table mapping; test side-by-side and Summer geometry against the canonical workflow | All 59 source rows accounted for; ten groups correct; known malformed cells and 27-vs-30 mismatch reliably surfaced, never silently "fixed" |
| 5. Controlled release | Verify format variants, resource limits, accessibility, cache/live refresh, printing, migration recovery, and administrator settings UX | Acceptance matrix below passes in both repositories; enable gradually with import/settings switches and documented recovery |

Phases 0-2 are prerequisites to scheduling imports with configurable rates. Parsing spikes may run earlier for evidence, but do not enable persistence until the backend contracts and snapshot readers are ready. Each format is advertised only after its own tests pass; the complete feature includes PDF, CSV, XLSX, and DOCX.

### Implementation verification to add later

| Layer | Minimum meaningful cases |
|---|---|
| PDF fixture | Correct metadata/year/term assignment; 59 accounted rows; ten groups; no Year 1/4 Summer; Year 2 Summer prerequisite tail preserved; row-source mapping and no header/evaluator rows |
| Extraction uncertainty | `3 03`, `2 13`, `I1 125`, PATH variants, aliases, wrapped conditions, long titles, rotation, repeated/page-continuation headers; missing text and scanned/encrypted files return actionable errors |
| Totals | Inventory in section 4; Third Year Second Semester shows printed 27 versus calculated 30; overall calculated 176 versus printed-total sum 173 until a recorded correction |
| Rules | Exact over prefix, longest prefix, prefix boundary, case/space normalization, duplicate/conflicting rules, intentional exception acknowledgment, unmatched codes, different departments, shared-course conflict, authorized override |
| Conversion | 2+1 at 60/180 -> 120+180 minutes; same credits at 60/120 -> 120+120; lecture-only/lab-only; fractional credits; unsupported grid duration; no double multiplication; practicum total-hours exception |
| Scheduling | Policy-aware Regular/Integrated/Hybrid/Split paths, custom lab/default precedence, manual saves, suggestions, generation and apply validation; same course offered under different department policies; legacy-null fallback |
| API/database | Capability and cross-department/program denials, unauthorized settings writes, archived/concurrent matches, stale settings/catalog revisions, atomic rollback, request replay/body conflict, complete metadata/prerequisite/snapshot round trip |
| UI | Edit and revalidate, group moves update both totals, keyboard/focus/error announcements, cancel/discard, network retry, retained draft, summary and deactivated status, review-only users |
| Other formats | Quoted/multiline/BOM CSV; malformed rows; XLSX sheet selection, blanks/leading zeros/cached or missing formula results; DOCX tables/merged cells and inert malicious links/HTML |
| Preservation/performance | Approved meetings/status/history unchanged after rule/rate update; duplication snapshot behavior; bounded parsing/cancel; parser chunks excluded from ordinary initial page load; batch-query counts |
| Output | Saved detail and printed curriculum show reviewed CMO/series, correct group credits, and prerequisites without truncating essential conditions |

Use the existing Vitest/Testing Library setup for frontend behavior and verified PHPUnit/backend conventions for server cases. Run targeted cases first, then `npm run lint`, `npm run build`, and `npm test` for the implementation release. Backend tests and migration checks run in the backend repository; this checkout cannot supply them.

## 15. Work performed for this planning task

- Inspected only curriculum, access, transport, cache, relevant scheduling duration code, dependencies, and related planning documents.
- Rendered and visually inspected the complete supplied PDF, then checked text/coordinates, all ten numeric row groups, source totals, and calculated totals. A tolerance-aware numeric-row count confirmed 59 rows; ambiguous numeric-cell interpretation was reviewed against the rendered page.
- Compared maintained primary documentation for file-format libraries; no packages were installed and no runtime code was authored.
- Added this plan and a dashboard link. Documentation verification checks local links, arithmetic, formatting/diff, and the changed-file scope. Application tests/build are unnecessary for these documentation-only changes and are not evidence that the proposed feature works.

Remaining implementation gates are backend verification, institutional resolution of the identified PDF discrepancies, agreement on practicum and duration-override semantics, and browser parser/security/performance validation. These do not prevent completing the plan; they prevent treating its proposed behavior as an already verified implementation.

## 16. Implementation record (2026-10-27)

Backend: `c:\Users\toman\backend` (Laravel). Verified against its code before implementation; business rules are in [business rules](business_rules.md#curriculum-document-import) and schema in [database](database.md#curriculum_course).

### Verified facts that shaped the implementation

- Credits are integer `courses.lecture_hours`/`lab_hours`/`units`. The backend solver derives time as lecture × 2 and lab × 6 thirty-minute slots (60/180 minutes per unit). Durations are course-keyed across `CspSolver`, generation, preflight, and the frontend helpers.
- `curriculum.code` is globally unique; `curriculum_course` is unique on `(curriculum_id, course_id)`; `courses` is unique on `(course_code, department_id)` and codes are normalized to uppercase on write.
- `batch-create` allows partial success and updates existing courses, so the import has its own all-or-nothing path and never updates existing courses.
- `IdempotentRequests` is cache-based (10 minutes); import idempotency is durable in `curriculum_imports`.
- **PDF.js parity:** `pdfjs-dist@6.4.299` emits clean `3`/`0`/`3` and `2`/`1`/`3` cells for `GEC 1` and `IT 108`, unlike the merged `3 03` and `2 13` fragments pdfplumber produced. The extractor still flags merged or repeated numeric runs (unit-tested with a synthetic `3 03`).

### Delivered

| Area | Implementation |
|---|---|
| Migration | `2026_10_27_100001_add_curriculum_import_support`: CMO fields, department rates and revision, `curriculum_classification_rules`, placement snapshot and prerequisite columns, `curriculum_imports` |
| API | `GET/PUT /curriculum-import-settings` (department from the session; PUT is secretary-only), `POST /curriculum-imports/validate`, `POST /curriculum-imports` under `capability:curriculum.manage` |
| Services | `App\Services\Curriculum\CurriculumImportSettings`, `CurriculumImportValidator`, `CurriculumImportService`, `IssueList` |
| Existing endpoints | `store`/`update` accept CMO fields; `duplicate` copies placement snapshots; `/curriculum/{id}/full` adds `cmo_*`, `prerequisites_text`, `prerequisites_review`, and `placement` (null for legacy rows) |
| Frontend | `src/lib/curriculumImport/*` (draft model, PDF layout extractor, CSV/XLSX/DOCX adapters, prerequisite suggestions), `CurriculumImportPage` with Upload → Preview → Configure → Import, settings modal, source crops, row review modal; Import button on the curriculum list; the printable uses CMO fields and prints stored prerequisites |
| Dependencies | Exact versions: `pdfjs-dist@6.4.299` (Apache-2.0), `papaparse@5.7.0` (MIT), `read-excel-file@9.3.12` (MIT), `mammoth@1.13.0` (BSD-2-Clause), dev `@types/papaparse@5.5.2`. All are lazy chunks; none is in the main entry bundle. `npm audit --omit=dev` reports no advisories for them |

### Deviations from the proposal

- Settings routes derive the department from the session (as `scheduling-settings` does) instead of `/departments/{id}`. Settings writes are restricted to the department secretary, mirroring the existing Sunday-classes rule; no new capability was added.
- Review resolution is one generic mechanism: each review issue has a stable key, and the reviewer submits `acknowledgements[key] = reason`. Group discrepancies, source corrections, extraction flags, overrides, title mismatches, prerequisite-order and nonweekly-basis reviews all use it.
- Catalog resolution is automatic (reuse a compatible same-code course, otherwise create) with mismatches blocking. There is no per-row "create owned variant" choice.
- Fractional credits are rejected because the course schema is integer.
- The internal curriculum code is generated by `CurriculumCodeGenerator` (`PROGRAM[-MAJOR]-STARTYEAR`, with a numeric suffix when taken) instead of being entered by the reviewer; the import UI shows it read-only.
- The fingerprint binds the canonical draft, settings revision, and per-row catalog decisions, so catalog changes after validation return 409.

### Deferred: Phase 2 scheduling integration

Placement minutes and the `total_hours` basis are stored but **not read by any scheduling path**. New courses keep credits in the legacy fields, so imported curricula schedule exactly like manually encoded ones at 60/180. Non-default rates are allowed but each import must acknowledge that they are not yet used. A `total_hours` practicum would still be scheduled from its credits. Placement-aware durations through `SectionCurriculumResolver` → solver/generation/preflight/manual/recommendation paths and `courseSlotPlan.ts`/`courseClassConfig.ts`, keyed by `(curriculum_id, course_id)`, remain a separate reviewed change.

### Reference PDF results (fixture `src/lib/curriculumImport/__fixtures__/tcc_bsit_pdf_text.json`; backend fixture `tests/Fixtures/tcc_bsit_import_draft.json`)

59 rows in ten groups; no Year 1/Year 4 Summer; Year 2 Summer prerequisites retained; 147 + 29 = 176 calculated credits against 173 from printed totals; only Year 3 Second Semester mismatches (printed 23/4/27, calculated 26/4/30, a blocking review); `I1 125`, `PATH FITt 2`, and `PATH FiIT3` flagged, with `IT 125`, `PATH FIT 2`, and `PATH FIT 3` offered as suggestions but never applied; `R101`, `IT125`, and `PATH FIT 2/3` references left for the reviewer; `IT Elective n` proposed only as aliases; both conditions proposed as conditions; the practicum blocked until a basis is chosen, with 486 hours recorded only as source text or as `total_hours`.

### Remaining gates

- The institution must resolve the identified PDF discrepancies; the import records the reasons a reviewer gives but does not decide them.
- DOCX and XLSX side-by-side layouts are tested with constructed fixtures only; no real TCC workbook or document was available.
- `read-excel-file` and Mammoth expose no decompression-size limits. Only the 10 MiB file, 50-page, and 5,000-row limits plus a 30-second extraction budget are enforced.
- There is no durable server draft: a page reload discards the draft, and the page warns before unload.
