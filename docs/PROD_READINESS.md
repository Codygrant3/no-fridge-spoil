# Production readiness loop

Goal: a responsible production rollout, not a silent promote of current `main`.

Operating rule: `.cursor/rules/ipie-loop.mdc`.
Cycle log: `docs/IPIE_LOOP.md`.
Handover gaps: `docs/CURSOR_HANDOVER.md` §18.

The coordinator does **not** merge unless The explicitly says to merge. This loop prepares the tree, keeps drafts green, and closes remaining file-disjoint P1 gaps.

## Definition of ready

All of these must be true:

1. Green drafts that fix user-visible or data-integrity bugs are on `main`.
2. `npm run verify:release` has passed on the merged tree (not claimed from skipped runs).
3. `npm run verify:release:cloud` has passed against a local Supabase stack, or the skip is recorded as unavailable.
4. Receipt retry no longer depends on a manual button for signed-in online households (`#3`).
5. `YYYY-MM-DD` grocery dates on Inventory, meal-plan week start, sealed estimates, Alerts freeze, and usage “today” (`#24`) use local calendar helpers.
6. Shopping adds use `shoppingCategory` (`#8`); meal-plan missing-ingredient adds follow after `#8` lands.
7. Receipt compression can abort (`#23`) and Scan actually passes a signal (stacks on `#5` + `#23`).
8. Remaining honest blockers are written down: consented receipt-image benchmark, hardware QA, Hobby cron still daily.

## Phase A — Land drafts (human merge gate)

Suggested order after The says merge:

1. `#6` docs
2. Test-only: `#7` `#9` `#10` `#13` `#19` `#21` `#22`
3. Isolated product: `#8` `#11` `#12` `#14` `#15` `#16` `#17` `#18` `#20` `#23` `#24`
4. Receipt stack last: `#4` then `#5` then `#3`

Do not squash across ownership. Re-run `gh pr checks` after each merge.

## Phase B — Release gates on merged `main`

- Device: `npm run verify:release`
- Cloud: start local Supabase, then `npm run verify:release:cloud`
- Record pass/fail in `docs/IPIE_LOOP.md`. Never describe a skipped gate as passed.

## Phase C — Stacked P1 after merge

These collide with open drafts today:

- Persist/resume receipt `jobId` (`#3` + `#5`)
- Wire Scan cancel into `compressReceiptImage(file, signal)` (`#5` + `#23`)
- Alerts freeze local calendar (`#14`)
- Meal-plan shopping `category` via `shoppingCategory` (`#8` + `#17`)

## Phase D — Cannot close in this loop

- Consented, de-identified receipt-image OCR benchmark
- Physical iOS Safari / Android Chrome hardware QA
- More frequent than daily Vercel Hobby cron (infra change)

## Current snapshot — 2026-08-22

- `main`: `0c8fbf4`
- Drafts `#3`–`#24`: hosted `verify` green, unmerged
- Device baseline: `npm run verify:release` passed on the unmerged docs branch (`53ae4cb`, same app code as `main`).
- Phase A rehearsal: all 22 draft branches merged locally in checklist order with **no conflicts**. Integrated `verify:release` passed (`7a4be2f`, 467 tests). Not landed on GitHub.
- Cloud gate: `verify:release:cloud` unavailable here (no Docker, no `supabase` CLI, no `.env.local`). Not claimed as passed.
- File-disjoint P1s that do not touch `#3`–`#24` are exhausted. Next product work is Phase C after merge, then Phase B gates on merged `main`.
- This loop is active. Merge is waiting on The. Do not invent more page tests.
