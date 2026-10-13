# Cleaner code and simpler product changes

This is the working guide linked by AGENTS.md. It is proposed in draft PR #216 for Claude review; adding instructions is not proof that existing code meets them. Prefer understandable, reliable changes over fewer lines, more files, or a named architecture pattern.

## Before editing

State the user problem and observable completion condition. Trace the existing flow from component to browser service to engine/persistence. Identify the single authoritative owner of each value and side effect. Check existing issues and reuse an existing implementation where its behavior fits. Keep a bug fix and a broad refactor separate unless the refactor is needed to make the fix safe.

Choose the least machinery that makes the behavior clear. A direct function is preferable to a configurable framework for one use case. A little duplication can be clearer than coupling two unrelated workflows. Extract shared code when it represents the same stable rule, not merely similar-looking JSX. Do not enforce arbitrary file/function length limits or create a generic manager for a hypothetical future feature.

## Boundaries and naming

`src/engine` owns deterministic domain rules and must stay usable without React, DOM or Vite. `src/game` owns browser adapters, persistence, proof orchestration and sharing. Components render and coordinate interaction; scripts reuse engine rules while owning intake/build operations. Import boundaries should reflect these responsibilities. New ranking selectors belong in shared pure code; UI and Actions must not implement different cutoff rules.

Name functions by what they do and values by what they represent. Prefer `firstReceivedAt` and `verifiedAt` to an ambiguous timestamp when the distinction matters. Keep units and identity clear at boundaries. Avoid boolean positional argument chains, unexplained constants, broad `any`, unsafe casts and helpers whose name conceals a write/network operation. Comments explain an invariant, constraint or reason; rewrite confusing code rather than narrating every line.

Use narrow types and discriminated unions when different states require different data. Validate external JSON/proofs/storage before treating them as typed. Do not turn every small local value into an exported type or every two-line function into another file.

## State and effects

Keep the smallest complete state. A filtered list, selected card score or ranked rows should normally be derived from authoritative data, not copied into state by an effect. Memoize measured expensive calculations when useful; memoization is not a correctness mechanism.

For a pack flow use explicit states such as ready, opening, revealing, result and error if that prevents impossible combinations. Keep recording separate from animation completion: save once, recover clearly, and never award twice because a component remounted. User actions belong in handlers. Effects synchronize with external systems and own cleanup; do not use effect chains to orchestrate a click.

For async work handle success, failure, cancellation and stale completion. A request for the old card must not replace the newly selected card. Share in-flight requests when appropriate, bound rendering/verification concurrency, define retry and cache eviction behavior, and prevent mounted consumers from losing a blob URL prematurely. A failed request must not poison a cache forever. Background work yields to the visible pack and pauses when unnecessary.

## Persistence, verification and compatibility

Treat imported saves, URLs, relay events and issue bodies as untrusted. Validate a complete replacement save before mutating current data; failures preserve the previous usable save. Define migrations and interrupted-write recovery for schema changes. Public proof sharing never includes private identity keys.

Released set versions are immutable. Changes to deterministic inputs, card ordering, odds, modifier tables or RNG consumption need the applicable new set/generator/ticket/proof version, old definitions retained, and compatible independent verification. Do not assume every engine edit requires a proof-format bump: establish which contract changes using spec/PULL_SPEC.md and historical vectors. UI naming, layout and progressive disclosure ordinarily do not change generation. A ranking snapshot schema/policy version is separate from a pack generator version.

For deterministic changes run the set guard and TypeScript vectors, update the spec and independent Python verifier where applicable, and run both vector sets through both implementations as CI specifies. Never update historical expected outputs simply to bless changed old pulls. Make error messages explain the failed rule without exposing secrets.

## Simplification for players

One primary action should be obvious in each state. Expose secondary information when it helps the next decision, not all at once. Use terms a newcomer can infer; explain specialist labels where needed. Put a function in one predictable home and reuse it across entry points. A shared card detail must preserve modifiers and support the same card/pack sharing actions regardless of where it was opened.

Keep visible buttons for gestures and keyboard shortcuts, clear loading/error/empty states, and stable layouts while images load. Preserve focus, Escape behavior, screen-reader names and reduced motion. Do not make accessibility, settings or help an earned unlock. Simplifying navigation must not remove useful information or trap returning players in onboarding.

Use existing design tokens and components before adding local styles or another modal system. Flashy rare-pull presentation can coexist with simple navigation: concentrate spectacle on the result, and preserve readable controls. Existing DESIGN.md contains historical details and some inconsistent descriptions; inspect actual tokens/components and flag a material conflict instead of using stale prose to justify a visual rewrite. Product changes in SIMPLIFICATION.md remain pending review.

## Performance and dependencies

Measure the affected flow before optimizing. Distinguish code imported eagerly from images actually transferred. Use existing prebuilt thumbnails where appropriate; avoid full-resolution recoloring of hidden grid items. Record device, network, cold/warm cache and workload for performance claims. Inspect queue size, long tasks and retained memory, not just bundle size.

Before adding a dependency, state what existing code/platform APIs cannot reasonably provide, browser/worker compatibility, bundle impact and maintenance implications. Avoid a new store/router/task framework for a small feature unless the existing approach demonstrably fails. Keep optional social/network work outside the first-pack critical path.

## Review checklist

- Does the diff solve a concrete user problem and preserve unrelated behavior?
- Is there one authoritative rule/state owner, with understandable names and boundaries?
- Are failure, cancellation, duplicate action, resize/background and recovery paths coherent?
- Are proofs, historical sets, saves and public/private data boundaries preserved?
- Is the main action discoverable on phone and keyboard, with accessible alternatives?
- Did the change remove obsolete machinery rather than leave two parallel paths?
- Do tests detect meaningful broken behavior, including relevant edge cases?
- Are claimed checks/measurements real, limitations explicit, and related docs/issues accurate?

Run npm run check for application changes. Use npm run build when bundling/assets/preview generation changes, relevant browser checks for UI behavior, and independent-verifier checks for proof/generation changes. Do not disable checks, weaken assertions or add snapshot churn to make a diff look verified. Docs-only edits use link/consistency review and git diff --check. Automated linting catches some mistakes; it cannot enforce a clean architecture or comprehensible product.

## Sources and interpretation

The following primary-source guidance was retrieved from its official GitHub source and reviewed on October 13, 2026:

- [Google Engineering Practices: what to look for in a code review](https://github.com/google/eng-practices/blob/master/review/reviewer/looking-for.md): review design, functionality, complexity, tests, naming and documentation; avoid speculative over-engineering.
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [reviewed source](https://github.com/reactjs/react.dev/blob/main/src/content/learn/you-might-not-need-an-effect.md): derive render data directly and handle user events in handlers; effects synchronize external systems.

These principles are adapted to this repository, not an adoption of every external style rule. The simplification recommendations are product hypotheses supported by our reported usability problems; they still need newcomer/device validation. The previously blocked Nielsen Norman Group/web.dev pages were not reviewed and are not cited as verified research here.

See [BEST_PRACTICES_AUDIT.md](BEST_PRACTICES_AUDIT.md) for concrete repository findings, reproductions and existing issue owners.
