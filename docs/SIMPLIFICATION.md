# Simplification proposal — awaiting Claude review

Status: draft, no implementation authorized for merge before Claude review. This proposal supersedes the navigation layout proposed in #188 where they differ. Existing main has newer reveal/short-screen fixes; reconcile those before implementing rather than overwrite them. No application changes are included here.

## Audit and decisions

| Feedback | Assessment and proposed response |
| --- | --- |
| Confusing landing page | Valid usability report. Lead with one featured pack and one Open pack action; move explanation and secondary destinations out of the first decision. Validate with strangers (#211). |
| Start with one pack | Good progressive-disclosure hypothesis, not a gameplay restriction. Initially show one set; after the first successfully recorded opening expose other sets and navigation. Opening remains repeatable. |
| Collection/Profile/Hall of Fame/Achievements/Settings | Current nouns mix objects, identity and utility. Use three primary destinations in stable order: Open packs, My cards, Rankings. Put Player and Sound & display in utilities. |
| Best pulls hidden in profile | Valid. My cards contains Cards and Best pulls; recent/all packs are a filter in the pulls view. Player contains display name, Goals & rewards, and Save & restore. Avoid duplicate homes for these functions. |
| World firsts and Legends | Valid naming confusion. Keep historical links/data, but remove both from the primary ranking experience. An optional Archive explains first verified submissions and historical unverified screenshots explicitly. |
| Today and all-time | Use Today's submissions / All-time submissions, showing top 10 verified pack pulls. UTC day and first trusted receipt time, not opening time. Multiple entries by one person remain allowed. |
| Per-card rankings | Useful secondary exploration. Select a card from My cards or a card detail; show its top 10 verified instances. Do not add another primary navigation item. |
| Space is hidden | Valid. Show Open pack with a desktop “Press Space to open” hint and a tap/click button on all devices. Keyboard handling excludes text inputs and obeys modal focus. No A toggle or auto-opening. |
| Phone lag and blank images | Valid reported symptoms; causes unconfirmed. Measure and reproduce, then fix. Existing WebP/finish thumbnails mean the old asset list in #8 is stale. |
| Top 99 is uninteresting | Top 10 is a reasonable UI hypothesis. It does not justify silently discarding proofs or changing qualifying rules before the ranking architecture is agreed. |

## First-minute flow

A fresh visitor sees the logo, a featured pack, Open pack, and a small Card guide. Sound/reduced-motion controls remain available immediately. No autoplay trailer, leaderboard verification, or large collection grid competes with that first action. Tell users this is a local save; do not invent sign-in or accounts.

Reveal keeps visible button alternatives to swiping, Skip reveal animation, and a clear exit. Share card and Share pack live above results. Unlock the expanded interface only after the pack is successfully recorded, including a skip/exit that records it. Never unlock from an animation timer, ticket allocation or partial failed save. Persist a small onboarding flag; recognize returning users with legacy collection/history without resetting their progression. Decide whether a small “See all packs” bypass is useful during Claude review. Clearing site data resets local onboarding; this is not an account-recovery solution.

After that first result, introduce My cards and Rankings without an interrupting tutorial. Keep set selection near Open pack. Goals can appear as one concise next-reward hint, reusing #212. Keep accessibility controls, card explanations and sharing free of progression gates.

## Architecture boundaries

Use one navigation definition for desktop/mobile, labels, destination order, and active state. Separate a small first-pack flow coordinator from presentation; use existing persistence/event mechanisms before introducing a new framework. #72 remains the owner for broader app-state work. Define explicit opening/revealing/result/error states and idempotent recording; test resize, background/foreground and error recovery at state boundaries.

Use a shared image loading state model: loading, ready, failed, retrying. Reserve dimensions, render a recognizable placeholder, and provide a bounded fallback/error indication. Finished-card generation currently hides images until ready; thumbnail failures lack a common recovery path. Investigate both. A plain-art fallback must not imply it depicts the exact special finish. Bound rendering concurrency and caches, prioritize visible cards, and revoke blob URLs only when no active consumer uses them. Reuse existing generated thumbnails. An eager URL manifest does not itself prove every image downloads.

Separate foreground pack work from background prefetch and leaderboard verification. Pause optional work in hidden tabs; avoid simultaneous unbounded canvas renders and proof verification on mobile. Preserve Argon2/proof semantics and verified scores. Code-split secondary views only where traces justify it. Do not rewrite the app merely to satisfy an architectural label.

Ranking selectors, ingestion eligibility and static snapshot generation must share a versioned contract (see RANKINGS.md). UI display size is independent of retained evidence. Navigation/onboarding/image changes do not need a generator-version bump; finish probabilities or deterministic generation changes do, as already proposed in #203.

## Verification and rollout

Before implementation record first interactive-pack time, network transfer, image decode/render latency, long tasks and retained memory on a representative Android phone and iPhone, plus desktop. Proposed targets: LCP <=2.5s under an explicitly recorded mobile test profile, no indefinite blank card, and no input-blocking repeated render/verify work. Treat these as targets, not measured current results. Tune budgets from baseline and retain test conditions.

#73 covers fresh/returning users, keyboard/touch, narrow/short screens, resize mid-reveal, background return, reduced motion, failed images, slow/offline recovery and save failures. #211 uses 5–8 uncoached newcomers: open, understand rarity/modifiers, share a card, find best pulls and explain today's rankings. Report counts and observed confusion, not invented population statistics.

Ship in small reviewed slices: image reliability/performance baseline; first-pack disclosure and navigation; ranking contracts and daily snapshots; per-card boards; automatic submission. Claude reviews each proposal and reconciles existing drafts before any merge. Do not gate QoL fixes on publishing automation or accounts.

## Research limits

Progressive disclosure, recognition over recall and prioritizing the primary task guide this proposal. Attempts to fetch Nielsen Norman Group's progressive-disclosure article and web.dev's LCP guidance were blocked by the environment (HTTP 403); their contents were not reviewed. No additional simplification skill was installed or invoked. Validate these hypotheses with actual players and device measurements.
