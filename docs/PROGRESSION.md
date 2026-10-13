# Progression without a dedicated backend

Progression is the long-term layer underneath the short-form spectacle: it should provide a reliable goal between lucky pulls. The game already derives XP, levels, titles and cosmetic rewards from verified pack history. Start by exposing the next achievable reward (#212); complete binder/showcase work under #14. This plan introduces no economy or generator changes.

| Option | Player benefit | Architectural cost |
| --- | --- | --- |
| Level/collection milestones | Predictable cosmetics, titles, backgrounds, wrappers | Re-derive from verified history; no spending ledger |
| Cosmetic shop | Choose what to buy with earned points | Validate earning rules and replay versioned purchases |
| Shorter reveals and visible auto controls | Fewer gestures and less waiting | Presentation only; keep accessibility controls free |
| Better prefetch/scheduling | Less waiting between fixed-cost tickets | Device CPU/memory limits; no reduction in required work |
| Cheaper mining or better odds | More packs or different outcomes | Each pull needs provable eligibility and a versioned derivation |

## Recommended next step

Show one next reward, progress and a preview on the pack screen, with a link to choosing unlocked cosmetics. A level or pack-count path is predictable even during a poor run. Collection completion offers a separate goal. Do not hide wrist-friendly opening, skipping or shorter animations behind an upgrade.

Uniformly multiplying every score does not increase variety or change the wait between interesting cards. Existing score distributions are uneven; pricing a shop directly from uncapped lucky scores could let one pack buy everything. Playtest pacing before designing a large upgrade tree.

## If purchases are added

Define a visible wallet separately from lifetime progress and best-pull score. Each record needs an ID, rule version, cosmetic ID, cost and ticket position. A verifier derives earned value from the packs and replays purchases in order, rejecting overspending. A player signature alone does not prove a balance: the player owns that signing key. Include supported legacy-save behavior and regression tests before changing persistent data.

Editable browser saves can fork into two individually valid spending histories. For personal, non-transferable cosmetics that may be an acceptable limit. Exclusive ownership, trading or ranked financial advantages require an agreed canonical ledger/authority. GitHub Issues/Actions could provide authority without a dedicated backend, but still introduce central-service trust, delays, quotas and moderation; make that choice explicit.

## Version boundaries

- Presentation-only speed controls do not change pull contents or need a proof-format bump.
- New progression/earning rules and saved purchase schemas need explicit versions and migration behavior.
- If a shared profile must prove purchases or equipped rewards, design a versioned profile extension; do not silently reinterpret the current wire format.
- Changed odds require new immutable set/modifier versions. Changed ticket algorithms/cost rules require their own explicit version and eligibility design.
- Preserve old definitions and verifier behavior. The new-finish proposal in PR #203 uses modifier table 2 and new set versions; it is not assumed released here.

Spendable upgrades, cheaper mining, better odds and trading are future designs. This roadmap prioritizes predictable collecting and cosmetics before those commitments.
