# Roadmap and issue hygiene

Issue #1 is the live roadmap index. docs/ROADMAP.md explains sequencing; implementation issues define testable deliverables. Existing epics #23–#34 group work and remain open while their goals are unfinished.

## Classify and prioritize

Use `roadmap` for sequenced product/launch work and exactly one of `priority:now`, `priority:next` or `priority:later` for an actively triaged roadmap task. `tracking` marks epics or ongoing notebooks such as #83; these do not need an artificial completion date. `bug`, `enhancement` and `documentation` retain their normal meanings. Labels outside the current roadmap need not be changed merely to fill every field.

Milestones describe evidence-driven phases, without dates until the team commits to them. Assign people only after they accept ownership. Open issues should state the problem, concrete outcome, acceptance checks, dependencies and any unresolved decision. Avoid broad titles that sound complete while only a small follow-up remains.

## Before opening another issue

Search open and closed issues and relevant PRs. Reuse existing work: #38 owns reveal exports/rendering, #74 measurement, #77 launch experiments, #16 monthly drops, #42 regional pilots, #14 binder progression, and #62 Hall of Fame notifications. General scheduled publishing belongs to #214, not a duplicate of #62.

Create a new issue when it has a distinct deliverable or failure reproduction. Split broad work only when the child can be implemented and validated separately. Link dependencies in both the index and child bodies. A new document or discussion does not complete the implementation it describes.

## Review and close

Weekly, review current-milestone blockers, new-player findings, post results, stalled issues and proposed priority changes. Record why an experiment repeats or stops. Preserve relevant acceptance criteria and decisions when editing an issue; keep completed tasks distinguishable from remaining work.

Close as completed only when the whole agreed scope is implemented and validated on main or a verified release. A feature branch or open PR is not a shipped feature. Use PR closing references for finite deliverables and `Refs` for partially resolved tracking work. Close duplicates with a link to the canonical issue; close abandoned experiments with a stated decision rather than pretend they shipped.

Current examples: #50 (XP/titles) and #41 (art pipeline) are closed; #82 was narrowed to remaining rarity decisions. #182–#185/#187 have proposed implementations in PRs #188/#203 and remain open pending merge/release validation. #186's original blank-screen report remains unconfirmed even though related auto-open removal is proposed. #181/#87 still track save/storage problems. Do not bulk-close those based on this docs PR.

## Docs and PR discipline

Use a feature branch and PR for repository changes; do not push directly to main. Keep planning PRs limited to documentation and links. When scope changes, rewrite the PR title/body around the final result. A roadmap update should state which issues were reused, added, narrowed or closed and distinguish actual implementation from proposals.
