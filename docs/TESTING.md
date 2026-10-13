# Agent verification workflow

Draft guidance for Claude review, linked from AGENTS.md. This is a testing plan plus commands that already exist. Browser/integration infrastructure described as proposed below is not installed by this docs PR. No test plan guarantees zero defects; the goal is reproducible evidence for the affected contracts.

## 1. Establish scope before changing code

Read AGENTS.md, package.json, .github/workflows/ci.yml and the existing tests nearest the feature. Record the base/head commits, intended behavior and compatibility requirements. Map the change to the layers below. Reproduce a reported bug before fixing it when possible; otherwise mark its cause unconfirmed and define a reproduction experiment.

Use an isolated browser context and disposable storage. Never test destructive import/reset against someone's real save, send live relay/GitHub submissions, post social content, or deploy a production build as a testing shortcut. Exported player saves contain private keys; use deterministic test-only identities, never attach real saves to artifacts. Use fake adapters for external writes. The proposed browser harness must block unexpected outbound network by default and intercept relay/GitHub/social destinations with fake endpoints; instructions alone do not prevent incidental app submissions. Explicitly allow only required local fixture assets. A production read-only smoke check is separate from a deployment.

## 2. Choose the right layers

| Layer | Purpose | Repository baseline / proposed work |
| --- | --- | --- |
| Static checks | Invalid types, hook misuse, unused code and immutable set changes | Existing npm run lint, npm run typecheck, npm run check:sets |
| Unit | Pure rules, parsers, state transitions, ordering, migration validation, queue accounting | Existing Vitest engine/game/utils tests; add focused failure cases with fixes |
| Component interaction | Mounted controls, effects, image errors, keyboard/focus and loading state | Current server-rendered component tests check markup only; mounted browser/DOM tests are proposed, choose one shared setup |
| Integration | Real collaborating modules with fake external boundaries: open/record/reload, import/rollback, verify/intake/snapshot | Existing inbox/relay/history tests give partial coverage; cross-module harness is proposed |
| End-to-end | Actual built app, browser workers/storage/assets and player task sequences | Proposed under #73; no npm browser-test command exists yet |
| Contract/compatibility | TypeScript/Python agree; old proof/set/save formats still work | Existing spec vectors, set lock, independent-verifier CI; add explicit supported save fixtures |
| Workflow | Intake/build behavior, permissions and packaging without real writes | Pure inbox tests exist; broader workflow fixture/dry-run checks are proposed |
| Accessibility/visual/performance | Focus/readability/layout, image rendering, and actual phone responsiveness | Manual/browser device checks plus proposed #73 automation; screenshots alone prove none of the others |

Prefer a few tests that assert important observable behavior over many tests mirroring internal function calls. Use the smallest layer that catches the defect, then add an integration/browser case when a boundary is involved. Avoid duplicating every unit case in E2E. Do not use line coverage or snapshot count as the definition of correctness.

## 3. Existing commands

Run from the repository root with the CI-supported Node version (currently 22); preserve the committed lockfile and use npm ci when installation is needed.

```sh
npm run check
npm run build
```

`check` runs ESLint, both TypeScript projects, Vitest and released-set validation. `build` runs Vite and static preview generation; it may take minutes when the preview cache is cold. CI runs both for application PRs. Reuse a valid preview cache but exercise a cold run when its invalidation/build logic changes.

For a focused iteration use the existing runner, for example:

```sh
npm test -- src/game/history.test.ts
```

Finish an application change with npm run check. CI also requires build; run it locally for packaging/assets/exports and resolve CI's build result before calling the PR fully verified. For proof/generator/spec changes also run the independent verifier using the isolated Python environment with the CI Python version (currently 3.13) and pinned cryptography package (currently 50.0.1). Activate that environment or invoke its interpreter explicitly; the command below assumes python resolves to it, not an arbitrary system installation:

```sh
python -I spec/verify_pull.py --vectors spec/vectors.json spec/vectors-python.json
```

Inspect CI if versions or commands change; do not invent a test:e2e script. Docs-only work needs local-link/consistency review and git diff --check. A failure, skipped test or zero-test invocation is not a pass. Do not hide exit status through logging pipelines.

## 4. Required cross-module contracts

Integration fixtures use real generation/scoring/encoding where that is the contract, and fake storage/network/clock/worker boundaries where deterministic fault injection is needed. Do not stub the function whose correctness the test is meant to establish. Keep a small real Argon2/proof path; use known vectors or a test-only adapter for repeated presentation scenarios. Test-only overrides must not ship a production way to fake verified pulls.

- Opening: one allocated ticket/identity produces the expected versioned pack; reveal, skip or exit records it exactly once; remount/reload and interrupted opening recover consistently. Save failures do not claim success or award twice.
- Persistence: export/import round trip preserves identity/history/modifiers/progression; invalid identity, malformed-but-valid JSON, quota failure mid-write and supported legacy formats preserve or recover the old save. Host migration uses the same replacement guarantees and validates message origin/source.
- Concurrency: two same-origin browser pages sharing storage exercise simultaneous ticket allocation, rename/import during mining, and signing while another tab records. Separate browser contexts do not share localStorage and cannot reproduce this race.
- Sharing: every pack entry point opens the same card treatment and supports individual-card/pack actions. Generated image decodes, has expected dimensions and preserves modifiers; proof link independently reconstructs the result. Clipboard/share cancellation is recoverable. Do not assume a fake clipboard proves an OS share sheet works.
- Ranking/intake: real proof verification and pure selectors feed fake transport/filing; duplicate events, invalid signatures, limits, interrupted filing, retries and moderation/rebuild work. Daily/per-card/stale-cutoff contracts apply only when those proposals are implemented; they are not current shipped features.
- Async recovery: failed HTTP then success, invalid snapshot, worker constructor/load/crash, fallback bounds, close, late completion and image decode/generation failure. Bounded queues do not silently lose plausible winners.

## 5. Browser task matrix

Use the built app served locally for packaging smoke, not only Vite dev mode. Start npm run preview after a build, verify an actual page/asset response, and use isolated contexts. The proposed harness must commit its runner/browser versions, document installation and the exact serve URL (including /BrainrotTCG/ for that build base), detect readiness, and stop only processes it started. A PID or open port is not a functional check. Keep valid proof fixtures for ordinary and rare/modifier states; do not mine randomly until a rare test finally passes.

Minimum smoke journey: fresh visit -> open -> reveal/skip -> result -> card detail -> share -> My cards/current equivalent -> reload -> same saved result. Also verify a valid shared pull and an invalid link. Test current behavior; future labels/unlocks become expectations only after implementation.

For UI changes add affected cases: 390x844 and short/narrow phone viewports, desktop keyboard, visible Space/click alternatives, text-input shortcut exclusion, nested sheets, Tab/Shift-Tab/Escape, reduced motion, resizing mid-reveal, background/foreground return, image failures, slow network and retries. Check visible actions and stable card geometry, not just a screenshot. Capture browser page errors, failed asset requests, and unhandled rejections; distinguish expected injected failures from unexpected errors.

Proposed automated browser coverage: Chromium smoke on PRs; focused Firefox/WebKit plus failure/concurrency/visual scenarios on relevant changes or scheduled/manual runs. Browser-engine emulation is not an Android/iPhone hardware test. Actual phone and screen-reader checks remain required for mobile/accessibility release claims. Visual baselines use stable fixtures, fonts and motion; reviewers must inspect changed baselines rather than bulk-accept them.

## 6. GitHub workflow and static-host checks

Check workflow syntax with a documented supported validator once added; review permissions, fork-PR behavior and external action versions. Do not execute secret-bearing/deployment workflows against live destinations to test syntax. Integration-test scripts with fake GitHub/relay adapters and disposable output directories. Fixture cases cover event payload parsing, intake budgets, cache invalidation, verified/rejected issue selection, snapshot generation and interrupted/repeated runs.

Test build output at both configured host bases when base-path/hosting/redirect logic changes: assets and shared-link previews resolve correctly, old version links remain usable, and migration validates origins. A local valid build does not prove the external host serves it. After an authorized deployment, separately check expected build identity and public asset/proof routes. The current review hold excludes deploying these drafts.

## 7. Speed, flakiness and evidence

Keep tests independent, restore globals/mocks/storage and close workers/contexts. Inject clocks for rollover/backoff; avoid fixed sleeps in favor of observable completion with bounded timeouts. Use seeded fixtures. Retry only an identified transient infrastructure failure, recording the initial failure; a pass on retry alone is not proof of correctness. Quarantines need an issue, owner and exit condition and must be visible in CI.

Proposed CI split: fast static/unit/integration gate, browser smoke gate, existing independent-verifier gate, and build/preview validation; heavier real-device/performance and expanded browser runs provide separate release evidence. Do not duplicate builds unnecessarily. Adopt runtime/coverage budgets from measured baseline; prioritize branches around save/verification/error contracts instead of imposing an arbitrary global percentage.

Every handoff includes:

```text
Change / base and head commits:
Acceptance criteria exercised:
Commands and results (including test counts/skips where available):
Browser/device/network and flows checked:
Fault injection / compatibility fixtures:
Unexpected failures and linked issues:
Not run / blocked / manual checks still needed:
Artifacts (sanitized screenshots, trace, report):
```

Artifacts must belong to this run and avoid private keys, credentials and personal data. Keep them small with defined retention; don't commit generated test output or add a second permanent QA notebook. PR validation records the evidence, issues own unresolved gaps, and this doc owns the reusable workflow.

## Issue ownership and implementation status

- #233 owns the shared cross-module integration/component harness and deterministic fault injection.
- #73 owns browser E2E, interaction, visual and accessibility smoke automation.
- #234 owns safe workflow/packaging fixture tests and documented workflow validation.
- #8/#12/#211 retain measured phone performance, accessibility and newcomer validation; emulated tests cannot close those alone.

The existing Vitest/check/build/independent-verifier commands are available. Additional harnesses, browser scripts and workflow validators above are proposals, not installed tools or passing suites.
