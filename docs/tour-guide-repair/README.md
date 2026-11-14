# Tour Guide repair verification

Verified locally on 2026-11-09 (Asia/Shanghai). All **12 existing workflow guide IDs** were repaired in `wicars-ui`. This is a frontend repair; no tour-related backend source or API changes were required.

## Resulting behavior

- Help starts or restarts manually with the current page context. An explicit Help request during loading waits visibly and opens when ready; Exit cancels that request.
- One runner handles action and review steps. Library pause/update events cannot complete a task. Back, restart, Exit, Escape, unmount, session expiry, and another guide cancel old work.
- The spotlight receives the actual visible element validated by readiness. Required unavailable targets show Retry/Exit; optional missing controls are skipped. A successful click can remove its own control without crashing positioning.
- Instructions respect role, prerequisites, saved views, open forms, department deep links, selected section, and generator stage/run state. Opening Help preserves selections and generator drafts.
- Saving, submitting, applying curricula/settings, immediate instructor assignments, and launching jobs are review-only. Completing Help records reviewed guidance, not a successful application save.
- Named guidance, target focus controls, modal-contained portals, Escape handling, viewport fitting, and reduced-motion rules support keyboard and narrow-screen use. Completed and dismissed outcomes are separate v4 per-user/guide/variant records.

The [repair plan](../plan/tour_guide_repair_plan.md) retains the original defects and design specification. The [onboarding decision](../plan/decisions.md#task-based-interactive-guides-on-the-existing-tour-library) records the stable behavior.

## Authenticated browser acceptance

**51/51 scenarios passed**, with **zero browser page errors and zero attempted domain writes**. Every applicable help path finished and recorded `completed`; the locked Course Assignment case correctly exposed no Help for inaccessible controls. Screenshots and per-step results are stored beside the JSON evidence.

| Guide ID | Cases | Representative coverage |
| --- | ---: | --- |
| `rooms` | 5 | List, Grid, clicked card removal, building already open, empty rooms, 320px |
| `instructors` | 4 | List, Grid, filtered empty results, details already open |
| `sections` | 4 | Create-form walkthrough, read-only Dean, form already open, 390px |
| `course-list` | 3 | Populated list, filtered empty results, Dean keyboard navigation |
| `curriculum` | 5 | Secretary import boundary, Program Head creation, VPAA/Dean browse, 320px |
| `course-teaching` | 4 | Existing selection retained, locked workspace, unlocked mobile fixture, no curriculum |
| `instructor-assignment` | 3 | Overview/List, department deep link with saved Grid, empty assignments |
| `cross-department-assignment` | 2 | Secretary List, Program Head department deep link with saved Grid |
| `schedule-builder-plotting` | 6 | Live read-only data, editable closed/open Manual Plotting, empty Program Head scope, open picker, 390px |
| `schedule-builder-faculty-assignment` | 1 | Approved assignment workflow with review-only assignment launch |
| `schedule-builder-review` | 1 | Submitted schedule review |
| `schedule-generator` | 13 | Empty eligible scope, restored stages 1–4, queued/running/blocked/failed/cancelled/complete/partial, 320px |

Evidence: [30 page scenarios](page-guides-final/results.json), [21 builder/generator scenarios](scheduler-guides/results.json). Viewports include 1440×900, 1366×768, 390×844, and 320×568. The harness used headless installed Chrome with reduced motion enabled. Geometry checks required tooltips and Exit controls to fit the viewport. Page action steps used the focus control before activating the actual target; the Courses scenario used keyboard navigation throughout Help.

Most cases read the live local Laravel API. Missing/empty datasets, unavailable curriculum, unlocked delegation, editable-program mappings, schedule statuses, restored drafts, and generation run outcomes used **browser-only response/storage fixtures** where identified. These fixtures did not change server records or permissions. All domain writes were intercepted and failed the case; the partial-run read-validation POST was fulfilled locally and is recorded separately. No job was launched and no timetable was saved by acceptance testing. Five temporary local Sanctum tokens were revoked after testing; credentials are not stored in this directory.

## Automated checks

| Check | Result |
| --- | --- |
| Focused Vitest run | **13 files, 164 tests passed** |
| Installed Joyride integration | **6 passed**, included above |
| `npm run build` | **Passed** (TypeScript and Vite production build) |
| Shared guide/new-file scoped ESLint | **Passed** |
| Browser harness `node --check` | **Passed**, both scripts |
| `git diff --check` | **Passed** |
| Whole-repository `npm test` | **Not green / not completed**; unrelated failures and a stalled worker |
| Whole-repository `npm run lint` | **Failed**, 1,053 errors and 26 warnings in that run, including existing local preview copies |

The focused run includes 49 helper tests, 20 runner/hook regressions, six real installed-Joyride integration tests, current page contracts, scheduler/generator content checks, existing page-operation tests, and the Archive fixture type check. The real-engine regressions verify STOP/PAUSED with STEP_AFTER/UPDATE, focus after Next/Back, disappearing targets, modal pause/resume, Escape, and shared-modal keyboard scope.

Exact focused command:

```powershell
npm test -- src/onboarding src/pages/secretary/Sections.guide.test.tsx src/pages/shared/Rooms.test.tsx src/pages/shared/Faculty.cache.test.tsx src/pages/curriculum/CurriculumListPage.test.tsx src/pages/ClassSchedules/InstructorAssignment.test.tsx src/pages/ClassSchedules/CourseTeachingAssignments.test.tsx src/pages/ClassSchedules/SchedulerPanel/workflowGuideContent.test.ts src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.test.tsx src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/generationGuideContent.test.ts src/pages/vpaa/Archive.test.tsx --maxWorkers=1 --testTimeout=15000
```

Exact scoped lint command:

```powershell
npx eslint src/hooks/useWorkflowGuide.ts src/components/help/WorkflowGuideButton.tsx src/onboarding/TaskGuideRunner.tsx src/onboarding/TaskGuideRunner.test.tsx src/onboarding/TaskGuideRunner.integration.test.tsx src/onboarding/TaskTooltip.tsx src/onboarding/joyrideTour.ts src/onboarding/taskGuide.ts src/onboarding/taskGuide.test.ts src/onboarding/tourDiagnostics.ts src/pages/ClassSchedules/SchedulerPanel/workflowGuideContent.ts src/pages/ClassSchedules/SchedulerPanel/workflowGuideContent.test.ts src/pages/secretary/Sections.guide.test.tsx
```

The separate Room Requests failure was reproduced with:

```powershell
npm test -- src/pages/shared/RoomRequests.test.tsx -t 'labels the list tabs Sent and Received' --maxWorkers=1 --testTimeout=15000
```

It expects a `Received` tab while the current dialog labels the tabs `Requester`/`Requestee` (`RoomRequestModals.tsx`). Those source/test files are unchanged by this repair. This is not a full-suite pass. Existing diagnostics in broader page components also remain; the scoped lint result above must not be read as whole-repository lint approval.

## Repeating browser checks

Start the local frontend and API. Use isolated local accounts and an external JSON `AUTH_FILE` containing `{ id, role, token }` entries for the account IDs referenced by the scripts, or adapt the case account mappings to the test environment. Install Playwright outside application dependencies or set `PLAYWRIGHT_MODULE` to an existing module URL. Set `CHROME_PATH` for the installed browser. The scripts never write credentials into evidence.

```powershell
$env:AUTH_FILE = 'C:/path/outside-the-repository/test-credentials.json'
$env:PLAYWRIGHT_MODULE = 'file:///C:/path/to/playwright/index.mjs'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:OUTPUT_DIR = 'C:/path/to/page-guide-results'
node docs/tour-guide-repair/verify-page-guides.mjs
$env:OUTPUT_DIR = 'C:/path/to/scheduler-guide-results'
node docs/tour-guide-repair/verify-scheduler-guides.mjs
```

Optional case filters are `CASE_FILTER` (page cases, regular expression) and `SCENARIO` (scheduler cases, substring). Frontend/API URLs are configurable in the scripts. Revoke temporary verification tokens afterwards.

## Generator header Help popup follow-up

The separately toggled question-mark popup in the generator header was still anchored to its right-side icon with `left: 0`. Its fixed width overflowed the modal and was clipped by the generator's `overflow-hidden` container. The full header is now its positioning boundary; the popup aligns inside the right edge and is constrained to the header width. The trigger also reports its expanded state and associated content.

Verified **12/12 layout scenarios**: all four stages at 1440×900, 390×844, and 320×568. These checks render the real generator inside the same modal wrapper with isolated browser-only API fixtures. They verify viewport and ancestor clipping, visible popup corners, text width, correct stage copy, and opening/closing, with zero page errors or write attempts. The generator's **25 existing tests** and `npm run build` also passed after this fix.

Evidence: [header popup results](generator-header-help/results.json), [320px Setup Courses screenshot](generator-header-help/stage-2-320.png). Repeat with `node docs/tour-guide-repair/verify-generator-header-help.mjs` and the `PLAYWRIGHT_MODULE`/`CHROME_PATH` configuration above; this isolated check needs no credentials or backend server.

## Coverage limits

Native 200% browser zoom, touch hardware, screen-reader output, Firefox, and WebKit were not tested. Browser fixtures verify help behavior for otherwise unavailable branches; they do not prove server-side generation or persistence for those states. Lifecycle and delayed/missing-target cases additionally have focused component coverage. There were no unresolved tour failures in the recorded focused tests or Chrome acceptance matrix; repository-wide test/lint health remains a separate limitation.
