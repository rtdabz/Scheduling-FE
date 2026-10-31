## 2026-08-13 - Post-CSP schedule quality evaluation

- Keep Rule Engine and CSP ownership of hard constraints unchanged.
- Rank valid CSP candidates in a separate `ScheduleQualityEvaluator`.
- Use a higher-is-better score composed of resource usage, fair distribution, schedule compactness, and configuration compliance.
- Exclude instructor availability until the faculty-assignment phase.
- Keep the CSP's internal heuristics only for search ordering and candidate diversity; they are not the final timetable selection score.
- Treat weekday preference, earlier weekday starts, idle gaps, and section day spread as soft evaluation penalties; forced or anchored Saturday placements are exempt from optional-weekend penalties.
- Bound post-CSP candidate exploration to fit the web request budget, and precompute tentative compactness penalties before sorting without changing candidate validity rules.
- Store part-time subject day/time windows as department scheduling settings and score them after CSP; they remain optional and never alter forced-day hard constraints.
