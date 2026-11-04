# Module health review — 2026-11-04

Review of the current working trees in `C:/Users/toman/backend` and `C:/Users/toman/wicars-ui`, including existing uncommitted changes. Requested outcome: report defects for Claude to fix. No application code or existing tests were changed.

**Result:** five confirmed defects: two P1 issues (nonterminating timeslot input and memory exhaustion during realistic schedule generation), and three P2 issues (incomplete activity-log results, unauthorized conflict-review audit writes, and non-atomic archive/audit writes). Frontend lint and the Gantt test harness also need repair; those are listed separately under verification.

## Confirmed findings

### MH-01 — P1: Zero-minute timeslot request never terminates normally

- **Location:** backend `app/Services/TimeslotService.php:21`; route at `routes/api.php:250`; `app/Http/Controllers/Scheduling/TimeslotController.php`, `getAvailableSlots()`.
- **Trigger:** an authenticated account with `schedule.view` requests `GET /api/timeslots/available/0`. The route's `whereNumber('duration')` accepts zero, and the GET controller passes it directly to the service. The POST endpoint has a minimum-duration validation, but this GET endpoint does not.
- **Failure:** `addMinutes(0)` never advances the loop. It repeatedly appends the same time until a runtime/resource limit stops it. Repeated requests can occupy PHP workers and exhaust memory.
- **Evidence:** an isolated child process using the real `TimeslotService` and fixed 07:00–20:30 settings returned 13 entries for duration 60. Duration 0 did not return and was terminated by the parent after five seconds. No hanging request was sent to the running application.
- **Smallest repair:** validate the same positive, bounded duration on both public entry points, and reject nonpositive durations at the shared service boundary so other callers cannot recreate the loop.
- **Acceptance:** GET duration 0 returns a prompt validation error; valid duration 60 still succeeds; direct nonpositive service input fails promptly. Exercise invalid input in a timeout-controlled process until fixed.

### MH-02 — P2: Activity Log silently drops older results and truncates CSV exports

- **Location:** backend `app/Http/Controllers/Admin/ActivityLogController.php:58`, `:71`, `:94`, `:100`, and `:112`; frontend CSV caller at `src/pages/vpaa/ActivityLog.tsx:268`.
- **Trigger:** more than 500 audit rows exist in one source. Ordinary page-one and CSV requests use a candidate limit of 500 per source; category/status/search filtering happens after this limit.
- **Failure:** totals are incomplete, searches can return no results for matching older records, and the CSV button silently omits older records. The export's 10,000-row check cannot detect records already discarded by the candidate limit.
- **Evidence:** with exactly 501 scheduling audit rows, the API reports `meta.total = 500`; searching for a marker present only in the oldest row returns 0 instead of 1; CSV contains 500 data rows instead of 501. Three independent temporary regression checks reproduced these failures.
- **Smallest maintainable repair:** count and filter the complete matching dataset before pagination. Apply the same complete filtering to exports, with an explicit export limit checked against the true matching count. Preserve the two-source normalization and existing category/event aliases; simply increasing the candidate limit moves the failure threshold.
- **Acceptance:** 501-row and mixed-source fixtures have correct totals, older search/category/status matches are returned, and CSV exports include all matching rows up to the documented limit. Over-limit exports must explicitly fail rather than silently truncate.

### MH-03 — P2: Conflict review bypasses record scope and accepts nonexistent conflicts

- **Location:** backend `app/Http/Controllers/Scheduling/ScheduleConflictController.php:313`–`:340`.
- **Trigger:** call `POST /api/conflicts/{rule}:{lowId}:{highId}/review` with a syntactically valid identifier. The handler checks only identifier syntax, looks up the first schedule optionally, and inserts an audit entry.
- **Failure:** a secretary can add a `conflict_reviewed` entry under another department's schedule. Entirely nonexistent schedule IDs also produce an audit entry. The route's `schedule.view` permission does not establish permission to the referenced records, and this handler omits the scope checks used by the neighboring recommendation handler.
- **Evidence:** a secretary assigned to department A received HTTP 200 when reviewing a department B schedule. A request for `room_conflict:999991:999992` created an audit entry despite neither schedule existing.
- **Smallest repair:** reuse the existing conflict visibility/department and program scope rules; verify both referenced records and the actual conflict before writing its review audit. Preserve legitimate cross-department conflict visibility where the actor is authorized to one side.
- **Acceptance:** unauthorized department/program references return 403 without inserting an audit; missing/nonexistent conflicts return 404 without inserting an audit; an authorized real conflict can still be reviewed.

### MH-04 — P2: Archive audit failure leaves the record archived despite a failed response

- **Location:** backend `app/Support/ArchiveAuditRecorder.php:31`–`:47`; unwrapped delete calls in `app/Http/Controllers/Academic/DepartmentsController.php:90`, `ProgramController.php:84`, `CoursesController.php:248`, and `DesignationController.php:127`.
- **Trigger:** the new required audit insert throws after one of these controllers soft-deletes a record.
- **Failure:** the response is HTTP 500, but the soft delete remains persisted and its audit is missing. Cache invalidation after `delete()` is skipped. The user sees failure even though the record was removed, and a retry encounters an already-archived record.
- **Evidence:** injected an exception into `SchedulingAuditLog::creating`, deleted an otherwise deletable department as VPAA, observed HTTP 500, and verified that `deleted_at` was nevertheless populated. The department path was executed; the sibling paths listed above have the same unwrapped delete/observer structure.
- **Smallest repair:** wrap the record deletion and required audit write in a database transaction at each affected mutation boundary, following the transactional archive paths already used for rooms/faculty. Keep cache invalidation after successful commit.
- **Acceptance:** fault-injected audit failure rolls back the soft delete for each affected entity; successful deletion creates exactly one archive audit and invalidates the relevant caches.

### MH-05 — P1: Realistic year-level generation exhausts the configured 512 MB memory budget

- **Location:** backend `app/Services/Scheduling/Engine/CspSolver.php:2234`–`:2380`, especially the nested candidate append at `:2345`; reproduction at `tests/Feature/RealisticDepartmentLoadTest.php:51`; memory budget at `phpunit.xml:21`.
- **Trigger:** run the existing realistic-load test with its defaults: 21 sections sharing six courses, three laboratory courses per section, six laboratory rooms, and 600 persisted rows from other year levels.
- **Failure:** `buildDefaultLectureLabDomain()` eagerly creates combinations of day pairs, component orders, start pairs, and room options. The realistic scenario runs out of memory while appending those candidates, before it can return a schedule or a controlled failure. A deployment with the same memory budget can terminate generation requests/workers on this workload.
- **Evidence:** `php vendor/phpunit/phpunit/phpunit --filter RealisticDepartmentLoadTest --do-not-cache-result` fails **even in a fresh process**, with `Allowed memory size of 536870912 bytes exhausted` at `CspSolver.php:2345`. This is separate from full-suite accumulation: the smaller `GenerationPerformanceBenchmarkTest` passed alone, producing 60 rows in about 44 seconds, although it had exhausted memory after earlier tests in the full run.
- **Recommended repair:** measure and bound candidate materialization at this shared domain builder. Prune infeasible candidates before retaining them, avoid retaining unnecessary complete combinations, and return explicit resource/search-limit diagnostics if a supported budget is reached. Preserve hard constraints and required room/day coverage; blindly truncating candidates or only raising the memory limit can hide valid placements or move the crash threshold.
- **Acceptance:** the existing realistic-load test completes under the repository's configured memory limit with valid schedules; repeated year-level generation does not retain prior domains; constraint/parity tests still pass. Track peak memory as well as wall time.

## Verification

- Frontend `npm run build`: passed TypeScript compilation and production bundling. Build printed a plugin-timing warning.
- Backend `php artisan route:list --json`: passed; 185 routes registered.
- Targeted temporary PHPUnit reproduction: six tests, ten assertions, six expected failures exposing MH-02, MH-03, and MH-04. The harness uses the repository's SQLite in-memory test configuration.
- MH-01: isolated, timeout-controlled service reproduction, as described above.
- Frontend `npm run lint`: failed with **1,046 errors and 28 warnings**. Of these, **55 errors and 24 warnings are under `src/`**; **991 errors and four warnings are outside `src/`**. Most external errors come from declaration files under `room-transfer-preview.local/tools/package/types/`. This is a failing quality check, not evidence that 1,046 runtime behaviors are broken. The application's errors include hook/ref rules, mixed component exports, explicit `any`, and unused declarations. Separate local/generated preview tooling from the app's lint scope, then address the source diagnostics without blindly applying hook refactors.
- Frontend full run: 145 of 146 test files completed; the run stalled in `src/components/GanttDepartmentLogos.test.tsx` and was stopped. Ten other files initially reported 38 failures under concurrent build/lint/test load. Rerunning those ten files with one worker and a 15-second test timeout passed **all 173 tests**. Do not report those transient failures as confirmed application defects.
- Gantt test isolation: the dean schedule adapter test passes alone. The three dashboard cases consistently fail because they look for a `Week` button that the current dashboards do not render. The original file also supplies a newly allocated `toast` object on every render (`src/components/GanttDepartmentLogos.test.tsx:14`); `InstructorTimetableModal` includes `toast` in its fetching effect dependencies (`src/components/InstructorTimetableModal.tsx:155`), which repeatedly retriggers state updates with this mock. A temporary diagnostic copy with a stable hoisted toast mock passed both instructor timetable cases. The production toast API is memoized (`src/context/ToastContext.tsx:148`). **Repair this test harness and update its obsolete dashboard expectations; this evidence does not establish a production Gantt rendering defect.** The existing test file was not edited.
- Backend total across separated runs: **1,328 existing tests passed; one existing test terminates with memory exhaustion** (MH-05). Breakdown: the initial run completed 688 passing tests, the smaller benchmark passed alone, the next partition completed 258 passing tests, and the final partition passed all 381 tests (3,006 assertions). The realistic-load test failed alone with exit code 255. The original single-process suite remains unverified beyond its memory failure; these partitioned successes do not mean the full command passes.

## Scope and limitations

This is a source and automated-check review, not a claim that every UI workflow is verified. It includes routing, build/module resolution, the existing automated suites, and targeted inspection of scheduling, curriculum/import, rooms, archives, activity logs, and permissions. It does not include authenticated browser walkthroughs, production database checks, real mail/OAuth delivery, live queue/WebSocket integration, or a production-database concurrency test.

Existing work in both repositories was preserved. Only this review document was added to the tracked source trees. Temporary probes and logs are under the Windows temporary directory; a diagnostic Gantt test copy was run from an ignored `node_modules/.vite/module-review` directory. Normal build/test tooling may update ignored generated artifacts.

## Claude handoff

Fix MH-01 and MH-05 first, then MH-02 through MH-04. Keep changes focused and preserve existing work. Convert the reproduction scenarios into focused regression tests, run the affected existing suites, and rerun frontend build/lint when frontend code changes. Do not infer a broken UI module solely from a test timeout under concurrent machine load.


## Reproduction harness for Claude

Save the following as a temporary PHP file without a UTF-8 BOM. From the backend directory, run it with the existing PHPUnit configuration:

```powershell
php vendor/phpunit/phpunit/phpunit C:/path/to/ModuleReviewTest.php --do-not-cache-result
```

These tests assert the intended behavior and currently fail. They use an in-memory database; do not change them to use the development or production database.

```php
<?php
namespace Tests\Feature;
use App\Models\User;
use App\Models\SchedulingAuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
class ModuleReviewTest extends TestCase
{
    use RefreshDatabase;
    private function seedLogRows(): User {
        $user = User::factory()->create(['role' => 'vpaa']);
        $rows = [];
        for ($i = 0; $i < 501; $i++) {
            $rows[] = ['user_id' => $user->id, 'action' => 'schedule_created', 'metadata' => json_encode(['marker' => $i === 0 ? 'oldest-needle' : 'normal']), 'created_at' => now()->subSeconds(501 - $i)];
        }
        DB::table('scheduling_audit_logs')->insert($rows);
        return $user;
    }
    public function test_activity_log_counts_all_matching_records(): void {
        $user = $this->seedLogRows();
        $this->actingAs($user, 'sanctum')->getJson('/api/activity-log')->assertOk()->assertJsonPath('meta.total', 501);
    }
    public function test_activity_log_search_finds_older_match(): void {
        $user = $this->seedLogRows();
        $this->actingAs($user, 'sanctum')->getJson('/api/activity-log?search=oldest-needle')->assertOk()->assertJsonPath('meta.total', 1);
    }
    public function test_activity_log_exports_all_501_records(): void {
        $user = $this->seedLogRows();
        $csv = $this->actingAs($user, 'sanctum')->get('/api/activity-log?export=csv')->assertOk()->streamedContent();
        $this->assertCount(502, explode("\n", trim($csv)), 'CSV needs one header plus 501 records');
    }
    public function test_conflict_review_rejects_nonexistent_conflict(): void {
        $user = $this->grantCapabilities(User::factory()->create(['role' => 'secretary']), ['schedule.view']);
        $response = $this->actingAs($user, 'sanctum')->postJson('/api/conflicts/room_conflict:999991:999992/review');
        $this->assertDatabaseCount('scheduling_audit_logs', 0);
        $response->assertNotFound();
    }
    public function test_failed_archive_audit_does_not_archive_department(): void {
        $vpaa = User::factory()->create(['role' => 'vpaa']);
        $department = \App\Models\Departments::create(['department_name' => 'Audit Test', 'department_code' => 'AUD']);
        SchedulingAuditLog::creating(function () { throw new \RuntimeException('Injected audit failure'); });
        $this->actingAs($vpaa, 'sanctum')->deleteJson('/api/departments/'.$department->id)->assertStatus(500);
        $this->assertNull($department->fresh()->deleted_at, 'A failed archive must not commit the archive without its audit');
    }
    public function test_conflict_review_cannot_write_another_departments_audit(): void {
        $own = \App\Models\Departments::create(['department_name' => 'Own', 'department_code' => 'OWN']);
        \App\Models\Program::create(['department_id' => $own->id, 'code' => 'OWN']);
        $other = \App\Models\Departments::create(['department_name' => 'Other', 'department_code' => 'OTHER']);
        $program = \App\Models\Program::create(['department_id' => $other->id, 'code' => 'OTHER']);
        $term = \App\Models\Semester::create(['academic_year' => '2026-2027', 'semester' => '1st', 'is_active' => true]);
        $section = \App\Models\Sections::create(['section_name' => 'OTHER-1A', 'year_level' => '1', 'semester' => '1st', 'department_id' => $other->id, 'program_id' => $program->id, 'semester_id' => $term->id, 'status' => 'active']);
        $course = \App\Models\Course::create(['course_code' => 'OTHER101', 'course_name' => 'Other', 'department_id' => $other->id, 'units' => 1, 'lecture_hours' => 1, 'lab_hours' => 0, 'course_category' => 'major', 'year_level' => '1', 'semester' => '1st', 'status' => 'active']);
        $schedule = \App\Models\Schedule::create(['semester_id' => $term->id, 'section_id' => $section->id, 'course_id' => $course->id, 'department_id' => $other->id, 'day' => 'Monday', 'start_time' => '08:00', 'end_time' => '09:00', 'mode' => 'online', 'status' => 'draft']);
        $user = $this->grantCapabilities(User::factory()->create(['role' => 'secretary', 'department_id' => $own->id]), ['schedule.view']);
        $this->actingAs($user, 'sanctum')->postJson('/api/conflicts/room_conflict:'.$schedule->id.':999992/review')->assertForbidden();
    }
}
```
