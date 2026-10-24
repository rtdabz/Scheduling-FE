# Scheduling Core Phase 8 Versioned Configuration Confirmation

## Decision

Phase 8 introduces a versioned contract between generation configuration,
recommendation persistence, and later schedule-plan acceptance.

The phase adds:

- A deterministic SHA-256 fingerprint for normalized `GenerationConfiguration`.
- A schema-versioned `GenerationConfigurationConfirmation` contract.
- A shared pre-solve boundary that validates the complete configuration.
- Rejection of missing or stale warning confirmations before solver invocation.
- A versioned `_scheduling` envelope in recommendation `input_payload` JSON.
- A compatible confirmation workflow in the class-placement recommendation UI.

The existing `recommended_schedules` row array and legacy root input fields remain
unchanged so current API and frontend consumers continue to work.

## Configuration Confirmation

`PrepareGenerationConfigurationForSolve` owns the pre-solve sequence:

1. Map the current legacy request into an immutable `GenerationConfiguration`.
2. Validate it through `ValidateGenerationConfiguration` and one scheduling snapshot.
3. Calculate a canonical configuration fingerprint.
4. Reject hard configuration violations.
5. Require confirmation for every warning rule ID.
6. Reject a confirmation whose fingerprint no longer matches the configuration.
7. Return one `PreparedGenerationConfiguration` for the solver and persistence path.

A confirmation payload has this shape:

```json
{
  "schema_version": 1,
  "configuration_fingerprint": "sha256",
  "confirmed_warning_rule_ids": ["same_day_concentration"]
}
```

Confirmations are configuration-specific. Changing a course, mode, split option,
pattern, tentative row, search limit, or any other normalized option changes the
fingerprint and requires a new review.

## Failure Contract

Configuration failures return HTTP 422 before search begins.

`configuration_confirmation_required` includes:

- The current configuration fingerprint.
- Every warning rule ID requiring confirmation.
- The complete configuration validation result.
- Existing machine-applicable recommendations.

`configuration_confirmation_stale` uses the same payload but indicates that the
configuration changed after the submitted confirmation was issued.

`generation_configuration_invalid` carries blocking hard violations and cannot
be confirmed into a solve.

Queued section previews persist this structured payload in
`schedule_generation_runs.result` rather than reducing it to an error string.

## Recommendation Payload Versioning

New section recommendations keep legacy fields at the root of `input_payload`
and add a reserved `_scheduling` envelope:

```json
{
  "section_id": 10,
  "course_ids": [20],
  "mode": "on-site",
  "_scheduling": {
    "schema_version": 1,
    "generation_configuration_schema_version": 1,
    "recommendation_rows_schema_version": 1,
    "generation_configuration": {},
    "configuration_fingerprint": "sha256",
    "snapshot_fingerprint": "sha256",
    "confirmed_warning_rule_ids": []
  }
}
```

`ScheduleRecommendationPayload` reads and writes this envelope. No database
migration is required because `input_payload` is already JSON.

The stored snapshot fingerprint identifies the scheduling state used during
configuration validation. The configuration fingerprint identifies the exact
options the user reviewed. They are deliberately separate concurrency tokens.

## Adopted Paths

The Phase 8 pre-solve boundary is used by section-level:

- Recommendation generation and persistence.
- Synchronous preview.
- Queued preview worker execution.
- Recommendation selection and regeneration.
- Automatic generation and application.

Successful preview and selection responses include an additive
`configuration_contract` summary. Existing response fields are preserved.

The class-placement recommendation panel displays server warning text and only
retries after the user selects `Confirm and continue`. Selection sends the same
confirmation contract that produced the reviewed preview.

## Deferred Adoption

Year-level generation retains its existing multi-section orchestration and
diagnostic confirmation workflow. Migrating it requires a versioned aggregate
contract containing one configuration and fingerprint per section.

Recommendation acceptance also retains its current persistence path. It must not
be switched to `CommitSchedulePlan` until recommendation status locking and plan
commit can occur under the same scheduling lock and database transaction.

Phase 9 should add instrumentation and use it to measure the temporary additional
snapshot query cost before consolidating legacy preflight and solver loading.

## Exit Criteria

- Normalized configurations have stable deterministic fingerprints.
- Warning confirmation is explicit and bound to one exact configuration.
- Missing and stale confirmations stop before solver invocation.
- Hard configuration failures cannot be overridden by confirmation.
- New recommendation payloads are schema-versioned without breaking legacy readers.
- Queued section failures retain structured confirmation data.
- The UI can review and submit confirmation without silently accepting warnings.
- Existing recommendation rows and response shapes remain compatible.
