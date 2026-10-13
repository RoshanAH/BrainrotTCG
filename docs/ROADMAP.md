# Product and launch roadmap

Brainrot TCG should become a meme pack opener built to produce ridiculous, recognizable, shareable moments. Short-form spectacle is the primary product direction; long-term collecting gives people reasons to return. Verification supports credible pulls and a separate technical storytelling lane.

Three loops guide the product: open a recognizable and entertaining pack; collect toward an achievable goal; share something a friend wants to watch or open. Global growth comes from collaborators who understand local meme scenes, not just translating English captions.

## Two public faces

- **Viral entertainment first:** dramatic rare-card reveals, rare-pack hunts, surprising modifier combinations, funny ordinary pulls and creator reactions. Optimize the game and export experience for TikTok, Instagram Reels and YouTube Shorts. Start with an 80% viral / 20% technical publishing mix as a hypothesis, not a fixed rule.
- **Technical credibility:** explain how pulls verify, versioning, the serverless architecture and design tradeoffs. Use developer-focused Shorts plus deeper YouTube, LinkedIn and build posts when appropriate. Do not make a verification tutorial the default opening of a viral clip.

Use [SHORT_FORM_CREATIVE.md](SHORT_FORM_CREATIVE.md) for the reveal/clip brief. A satisfying payoff, visible upgrade goal and easy sharing should connect spectacle to repeat play.

## Current baseline

Main already has deterministic versioned pulls, independent verification, era sets, a collection, share images/links, a global Hall of Fame, and verified XP/levels with cosmetics. These are foundations, not future promises. The usability/navigation work is still proposed in [PR #188](https://github.com/evanlin23/BrainrotTCG/pull/188); additional versioned finishes are proposed in [PR #203](https://github.com/evanlin23/BrainrotTCG/pull/203). Neither is assumed merged or deployed by this roadmap. Existing save/focus reports remain tracked in #87, #181 and #186.

The roadmap is an experiment sequence, not a promise of virality or fixed launch dates. The phases below are relative to starting the pilot; move forward when the evidence supports it.

## Phase 1: ready first minute and four-week distribution experiment

Goal: a stranger opens a pack, enjoys a recognizable reveal, understands the result and can share a watchable clip without coaching.

| Work | Owner issue | Evidence of completion |
| --- | --- | --- |
| New-player sessions, mobile/keyboard/short-screen checks | #211 | Task-success counts, reproducible blockers, retest and readiness decision |
| Address save/storage and focus problems | #181, #87, #186 | Required fixes validated; unconfirmed reports stay explicitly unconfirmed |
| Accessible discovery and mobile performance | #12, #8 | Gesture alternatives are visible; representative device/network measurements |
| Three recurring content formats and review queue | #213 | Twelve draft briefs/assets reviewed for humor, legibility and provenance |
| Clip-ready rare reveals and reusable rendering | #68, #38 | A funny, readable vertical export with hook, anticipation and payoff from a verified pull; failure handling |
| Launch experiment and weekly scorecard | #77 | Twelve approved posts over four weeks; weekly repeat/change/stop decisions |
| Aggregate measurement | #74 | First-pack/share funnel counts and documented privacy/measurement limits |
| Brand/creator assets and canonical link | #78, #67 | Small usable kit and links that work on target platforms |
| Public-content rules, moderation and takedown path | #21, #22, #75, #76 | Policy decisions and responsibilities are explicit before broad promotion |

Begin posting manually after the release-readiness decision and account/content authorization. Parallel draft production is useful while product blockers are being addressed. Do not make an elaborate landing trailer (#80) a gate for learning whether a simple gameplay clip works.

Candidate formats: rare-card/rare-pack hunts, "common card, legendary behavior," and "your internet era in five cards." Every post needs a recognizable hook and a payoff; a score alone is not the joke.

## Phase 2: predictable collecting and repeatable production

Goal: returning players can explain what they are working toward, and editors can repeat winning formats.

- #212 exposes the next existing cosmetic/collection goal on the pack screen. Reuse verified progression rather than introduce a spending economy immediately.
- #14 completes binder rewards/showcases; #52 handles remaining achievement work. Completed XP/titles issue #50 remains closed.
- #16 produces reviewed monthly set drafts using the current real-image/credits policy; #58 explains releases in the app. Do not claim a recurring job is operational without run evidence.
- #214 adds approved scheduling/publishing for one verified destination after #213/#38 and the #77 experiment. Automate drafts and rendering first.
- #15 collects community proposals with credit and review; #79 chooses an actual community home and moderation owner.

Advance when users understand the goal, some voluntarily return, and at least one post format repeatedly brings engaged players. Define numerical targets after the baseline; small playtests do not establish population-level retention.

## Phase 3: a community release and regional creator pilot

Goal: release one set that participants helped shape and one collaboration that feels native to a local meme scene.

Use #15/#16/#42 for proposals, reviewed content and a regional pilot, #11 for localization and #78/#79 for creator/community support. Select one scene with a willing collaborator before expanding to many countries. Credit contributors, pay attention to cultural context and permissions, and let native speakers review the jokes. Announce a release as an event people helped create.

## Later: only after the core loops work

Keep trading/gifting (#19), battles (#18), an advanced economy (#48/#51), seasons (#56), live feeds (#54), embeds (#40), additional platform integrations (#63–#65) and a global profile leaderboard (#85) as separate hypotheses. They are not launch prerequisites. Broad social publishing is not the same deliverable as Hall of Fame notifications (#62).

## Success measures

| Question | Measure | Limit |
| --- | --- | --- |
| Can strangers play? | Observed first-pack task completion and time/friction | Report participant counts and context |
| Do they share? | Aggregate share-action events / comparable gameplay events; qualitative recipient feedback | A share click does not prove an external post |
| Does content bring players? | Campaign-tagged aggregate visits and first-pack events, plus post reach/watch/completion where available | Avoid assuming cross-platform attribution or unique people |
| Do they return? | Voluntary feedback and documented aggregate repeat-visit signals | Person-level D1/D7 retention needs an explicitly designed, consented measurement method |
| Is production worth repeating? | Reviewed usable assets, editing time, and engaged visits by format | Views alone are not product growth |

A weekly review records the sample, observation, decision and next experiment. Measure whether flashy reveals improve watch-through, shares and engaged game visits; do not optimize empty views at the expense of payoff. Use [SOCIAL_PIPELINE.md](SOCIAL_PIPELINE.md) for production, [PROGRESSION.md](PROGRESSION.md) for serverless constraints, and [ISSUE_HYGIENE.md](ISSUE_HYGIENE.md) for backlog rules. Issue #1 is the live index; the docs hold rationale and operating details.
