# Concurrency, Redis, and multi-browser review

Review date: 2026-10-12. Scope: the production verification limits remaining after the four CRUD phases. This is a review; application code was not changed.

## Findings

### P1: Instructor assignment does not share the scheduling write lock

`backend/app/Http/Controllers/Faculty/InstructorAssignmentController.php:232` validates conflicts and projects faculty load before the transaction at line 258. The subsequent update at line 269 does not reload and revalidate under `SchedulingScopeLock`. Two requests assigning the same faculty to different overlapping classes can both validate the earlier state, then update different schedule rows successfully. A concurrent workflow transition can also invalidate the earlier stage check.

Evidence: source review, not real MySQL contention. Correction: use the existing semester lock, reload and recheck stage, scope, conflicts, and load inside the transaction, then persist. Include assignment-clearing paths in coordination with finalization.

### P1: Room structural changes can miss the semester of a first booking

`backend/app/Services/RoomStructuralUpdate.php:20` derives lock scopes only from bookings already present before acquiring locks. An unused room produces no semester locks; a room used only in an older semester omits a first booking in the current semester. Schedule creation locks the semester but does not lock the room before reading its eligibility, so these paths lack a shared exclusion boundary. A concurrent room closure/type change and first booking can each validate without seeing the other's change.

Evidence: source review, not a reproduced database race. Correction: coordinate relevant scheduling semesters even when no booking exists, or establish consistent room locking across all booking and room-edit paths; verify with real concurrent database sessions.

### P2: Cache version initialization can reset a newer version

`backend/app/Support/ApiCache.php:42` calls `Cache::add($versionKey, 1)` without a TTL. In the installed Laravel implementation (`backend/vendor/laravel/framework/src/Illuminate/Cache/Repository.php:462`), this bypasses the store's atomic add implementation and uses get followed by put. With Redis, the subsequent increment is atomic, but initialization is not.

Reproduced with a deterministic interleaving using the test array cache and Laravel's cache-miss event: an outer initializer reads a missing key, two intervening invalidations advance it to version 3, then the delayed initializer overwrites it with 1 and increments to 2. A retained version-2 response becomes readable again. Probe passed 4 assertions confirming this defect. This establishes the application/framework race, not a real Redis server test.

Correction: use an atomic initialization/version strategy that cannot reset or reuse an older generation. Preserve compatibility with supported cache stores; simply setting a short TTL can introduce version reuse after expiration.

### P2: In-flight frontend reads can undo cache invalidation

`wicars-ui/src/lib/dataCache.ts:145` removes pending-request references without cancelling or invalidating their completion. At line 196, every completed loader writes its result regardless of when it started. Its unconditional cleanup can also remove a newer request's pending entry.

Reproduced: start a delayed revision-1 request; invalidate the scheduler cache; fetch revision 2; then complete revision 1. The cache now contains revision 1 and considers it fresh. This can occur after either local writes or remote live-update events.

Correction: track a generation/request identity per cache key; only the current generation may populate cache and clear its pending entry. Ensure callers also avoid replacing visible state with a superseded result.

## Verification and environment

- One temporary frontend reproduction plus seven existing live-update tests passed. The reproduction asserts the defective behavior described above, not that the implementation is correct.
- One temporary backend cache-initialization reproduction passed, with four assertions.
- Temporary probes were removed after recording results. No application code, service configuration, or production records were modified.
- Local `MySQL80` is installed but stopped. No listeners were found on the checked conventional MySQL, Redis, API, frontend, and Reverb ports.
- Local PHP has MySQL support but no Redis extension; the backend Composer requirements do not include Predis. The Redis config defaults to phpredis. These are local readiness findings, not claims about the deployed server.
- No real MySQL/MariaDB contention, Redis integration, or two-browser live session was exercised. Completing those checks requires isolated test services and an API/frontend/Reverb deployment with test accounts.

The earlier full-suite passes remain valid, but those suites did not cover the newly reproduced interleavings. Address these findings before claiming concurrent deployment readiness.
