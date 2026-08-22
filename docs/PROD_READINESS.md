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
5. `YYYY-MM-DD` grocery dates on Inventory, meal-plan week start, sealed estimates, Alerts freeze (`#14`), and usage “today” (`#24`) use local calendar helpers.
6. Shopping adds use `shoppingCategory` (`#8`); meal-plan missing-ingredient adds use it on `#17`.
7. Receipt compression can abort (`#23`) and Scan actually passes a signal (`#5`).
8. Remaining honest blockers are written down: consented receipt-image benchmark, hardware QA, Hobby cron still daily.

## Phase A — Land drafts (human merge gate)

Suggested order after The says merge:

1. `#6` docs
2. `#25` hosted cloud CI
3. Test-only: `#7` `#9` `#10` `#13` `#19` `#21` `#22`
4. Isolated product: `#8` `#11` `#12` `#14` `#15` `#16` `#17` `#18` `#20` `#23` `#24`
5. Receipt stack last: `#4` then `#5` then `#3`

Do not squash across ownership. Re-run `gh pr checks` after each merge.

## Phase B — Release gates on merged `main`

- Device: `npm run verify:release`
- Cloud: start local Supabase, then `npm run verify:release:cloud`
- Record pass/fail in `docs/IPIE_LOOP.md`. Never describe a skipped gate as passed.

## Phase C — Now on existing drafts

All four stacked P1s now live on existing drafts. Do **not** open post-merge Phase C PRs if these heads landed:

| P1 | Draft | Head |
| --- | --- | --- |
| Alerts freeze local date | `#14` | `934234f` (hosted `verify` passed) |
| Meal-plan `shoppingCategory` | `#17` | `e3f5cdb` (hosted `verify` passed) |
| Scan cancel + compression signal | `#5` | `b0faa16` / `b0c913e` (hosted `verify` pending) |
| Receipt `jobId` resume | `#5` + `#3` | `b0c913e` / `7d053b6` (hosted `verify` pending) |

Playbook: `docs/superpowers/plans/2026-08-22-phase-c-apply.md`. Keep the patches only as a fallback if a draft lands without its Cycle 11–13 commit.

## Phase D — Cannot close in this loop

- Consented, de-identified receipt-image OCR benchmark
- Physical iOS Safari / Android Chrome hardware QA
- More frequent than daily Vercel Hobby cron (infra change)

## Current snapshot — 2026-08-22

- `main`: `0c8fbf4`
- Drafts `#3`–`#25` remain drafts. `#24` hosted `verify` green on `678c6cf`. `#25` hosted `verify` + `cloud` green on `776a3c6`.
- Draft `#14` writes Alerts freeze dates with `formatDate` (`934234f`). Hosted `verify` passed (2m53s). One Vercel preview passed; `no-fridge-spoilv2` is Hobby-rate-limited.
- Draft `#17` categorizes meal-plan missing-ingredient adds with `shoppingCategory` (`e3f5cdb`). Hosted `verify` passed (2m37s).
- Draft `#5` cancels receipt compression through `AbortSignal` and resumes a stored `jobId` without a second POST (`b0c913e`). Focused Scan/OCR tests passed. Hosted `verify` pending.
- Draft `#3` persists/passes that `jobId` on queued retry (`7d053b6`). Consent is still stored `cloudOcrConsent`. Hosted `verify` pending.
- Device baseline: `npm run verify:release` passed on the unmerged docs branch (`53ae4cb`, same app code as `main`).
- Phase A rehearsal: `#3`–`#24` merged locally with **no conflicts**. Integrated `verify:release` passed (`7a4be2f`, 467 tests). Not landed on GitHub. Does not yet include `#25`.
- Cloud gate: hosted `cloud` job passed on `#25` against disposable local Supabase. The exact local command `npm run verify:release:cloud` was not run here (no Docker). Not claimed as passed.
- File-disjoint product P1s that do not need consented images or devices are on drafts `#3`–`#25`. Remaining rollout work is Phase A merge, Phase B gates on merged `main`, then Phase D.
- Latest `#6` Vercel previews are Hobby-rate-limited. Hosted `verify` on `9895e05` passed (2m43s).
- This loop is active. Merge is waiting on The. Do not invent more page tests.
