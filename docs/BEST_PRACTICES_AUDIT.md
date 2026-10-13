# Best-practices sweep — October 13, 2026

Scope: source inspection of main at `a6d7efc`, repository workflows/configuration/design docs, and dependency audit of the planning checkout's existing lockfile. This is a targeted sweep, not a security certification, complete accessibility audit, or real-device performance measurement. No application code/dependencies/workflows were changed. All remediation is proposed pending Claude review in draft PR #216.

## Existing strengths to preserve

Strict TypeScript, React Hooks linting, a committed npm lockfile and npm ci in CI provide a useful baseline. Domain logic is separated from browser UI; released sets are hash-locked; TypeScript and independent Python implementations have shared vectors. CI already runs lint, typecheck, tests, set validation, build and independent verification. Sheet already implements Escape, focus trapping and restoration. Ticket mining uses a bounded eight-entry cache and a serialized opening queue; do not describe all caches as unbounded. New work should preserve these mechanisms rather than replace them gratuitously.

## Findings and canonical owners

| Finding | Evidence/status | Owner and outcome |
| --- | --- | --- |
| HTTP failure can remain cached for a visit | Reproduced with actual transpiled main loader and a fake fetch: two calls returned null, one fetch, despite next response configured healthy. Non-OK/non-array paths do not reset the cached promise. | New retry/schema-validation issue; recover and distinguish empty from failed. |
| Worker fallback breaks pool bounds/close semantics | Reproduced with actual transpiled main pool, failing Worker constructor and controllable computeTicket: pool size 2 accepted three concurrent fallback jobs, and all resolved after close. | New scheduler/fallback issue; bound concurrency, track close, preserve proof outputs. |
| Dependency advisories in tooling tree | npm audit: 34 package findings, 17 high/13 moderate/4 low; npm audit --omit=dev: zero. These counts include propagated dependencies and do not establish production exploitability. | New dependency triage/update-automation issue; record advisory paths and exposure, test supported upgrades. |
| Mutable workflow action tags and broad deployment permissions | Workflow source uses major tags; deploy grants pages/id-token writes at workflow level to build and deploy. | New CI-hardening issue; reviewed SHA pins and per-job permissions. Not evidence of compromise. |
| Documentation contradicts itself/current components | DESIGN bans button gradients then describes a gradient primary; navigation/Sheet descriptions differ. ARCHITECTURE includes unconditional latency/free/delivery wording and historical hosting wording. | New docs reconciliation issue; distinguish facts/proposals, remove unsupported guarantees. |
| Import/migration replacement can lose data | File-import failure already reproduced in #181. Main move.ts removes old keys before writing the backup; failure safety needs the same transaction/recovery contract. | Reuse #181; add migration acceptance cases. |
| Quota and concurrent-tab persistence | Existing #87 tracks quota/state writes and signing races; source player.ts uses storage read-modify-write without an atomic cross-tab reservation. Simultaneous-tab race needs deterministic reproduction. | Reuse #87; do not claim concurrency guarantee from a fresh read. |
| Full-resolution finish cache retains blob URLs indefinitely | Confirmed source shape: global Map of promises/created blob URLs, no eviction/revocation. Symptom attribution still unconfirmed. | Reuse #226 and #8; bounded shared ownership, error recovery and measured mobile work. |
| Modal background isolation needs verification | Sheet has focus trapping/aria-modal but no inspected inert management for background/lower sheets. Screen-reader/pointer leakage not reproduced. | Reuse #12/#73; nested-modal accessibility tests before selecting fix. |
| App state/effect and UI bloat | Existing #72 and #227 cover boundaries, first-pack disclosure and navigation. | Reuse existing issues; no framework rewrite or duplicate epic. |

## Reproduction method and limits

The two module checks extracted main source with git show, transpiled with the installed TypeScript compiler and supplied controlled network/worker/compute adapters in an isolated Node process. They touched no player save, live relay or real leaderboard. They establish module behavior; they do not establish phone crashes, wall-clock compute cancellation, or network availability. Remediation PRs should add maintained regression tests to the repository.

The npm audits ran without modifying package.json/package-lock.json or installing upgrades. Re-run on the actual upgrade target branch; review advisory IDs and reachable paths rather than converting severity counts into product-risk claims. No npm audit fix --force was run. No device/browser sweep was executed during this docs task. The required mobile/a11y matrix remains #73/#211/#8/#12.

## Execution order

Address save safety and recovery first, alongside blank-image/retry failures. Then repair bounded verification fallback and establish phone measurements. Review dependency/CI hardening in small separate PRs. Reconcile docs before agents use stale descriptions to implement navigation or generation changes. Adopt AGENTS.md and CODE_QUALITY.md through Claude's review, keeping product drafts separate from mandatory compatibility rules. Successful issue creation or a passing documentation check is not completion of remediation.

The issue links below are the canonical implementation owners; #32 and #227 link this sweep into the existing backlog.

- https://github.com/evanlin23/BrainrotTCG/issues/228
- https://github.com/evanlin23/BrainrotTCG/issues/229
- https://github.com/evanlin23/BrainrotTCG/issues/230
- https://github.com/evanlin23/BrainrotTCG/issues/231
- https://github.com/evanlin23/BrainrotTCG/issues/232
