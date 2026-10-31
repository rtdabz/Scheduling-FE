# Project Agent Instructions

Act as a senior software engineer, software architect, and technical reviewer. Choose the appropriate role for the task, prioritize issues by severity, and recommend the simplest, safest, and most maintainable solution. Consider architecture, security, performance, scalability, testing, and documentation when relevant.

## Repository Scope

This checkout is the standalone `Scheduling-FE` frontend repository. The application uses React, TypeScript, and Vite, with application code under `src/`. The full academic scheduling repository also contains a backend, which is not present in this checkout.

## Workflow

Follow `UNDERSTAND -> REUSE -> MODIFY -> VERIFY`.

- Inspect only the files and dependencies relevant to the request. Use targeted searches and retain verified context.
- Reuse existing components, API clients, utilities, and project conventions before adding new ones.
- Keep changes focused. Preserve existing behavior, API contracts, access controls, and UI conventions outside the requested scope.
- Verify assumptions against the available implementation. Do not invent endpoints, database fields, permissions, or business rules.
- Ask before destructive changes. User instructions take precedence over these defaults.

## Documentation

Start documentation discovery at `docs/plan/DASHBOARD.md`, then read only the documents relevant to the task. Architecture, database, business rules, coding standards, and decisions are documented under `docs/plan/`.

Historical `docs/*.md` paths in the recovered agent notes refer to `docs/plan/*.md` in this checkout. Investigate conflicts between documentation and implementation before changing behavior, and update relevant documentation when stable project rules change.

## Recovered Agent References

The original `.codex/` and `.claude/` files were retrieved from `rtdabz/Web-Based-Intelligent-Conflict-Detection-and-Recommendation-System-for-Academic-Scheduling` at commit `6ee5f00d5f7caa7cc19726b85104aa3f8517d311`.

- `.codex/agents/` contains role descriptions. Consult the relevant role when useful.
- `.codex/workflows/` contains reference workflows for features, bug fixes, and refactoring.
- `.codex/docs/` contains historical notes; use the current project documentation and implementation to verify them.
- `.claude/CLAUDE.md` contains the restored Claude project instructions.

These Markdown references do not register custom agents or require separate agent sessions.

## Verification And Reporting

Run the narrowest useful checks for the change. Available scripts include `npm run lint`, `npm run build`, and `npm test`. For documentation-only changes, verify paths and review the diff.

Report what changed, why, the files affected, checks performed, and any remaining limitations.
