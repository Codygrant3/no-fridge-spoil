# Production readiness loop

Goal: a responsible production rollout, not a silent promote of current `main`.

Operating rule: `.cursor/rules/ipie-loop.mdc`.
Cycle log: `docs/IPIE_LOOP.md`.
Handover gaps: `docs/CURSOR_HANDOVER.md` §18.

The coordinator merged `#3`–`#25` after The said merge (Cycle 14).

## Definition of ready

| # | Criterion | Evidence on merged `main` `ef7c4eb` |
| --- | --- | --- |
| 1 | Green drafts that fix user-visible or data-integrity bugs are on `main` | `#3`–`#25` merge-committed. No squash. No conflicts. |
| 2 | `npm run verify:release` passed on the merged tree | Passed in `/tmp/merged-main` after `npm ci`. 474 tests, 8 device e2e, PWA, audit 0. |
| 3 | `npm run verify:release:cloud` passed, or skip recorded as unavailable | Local command **unavailable** (no Docker, no `supabase` CLI, no `.env.local`). Hosted `cloud` **passed** on merged `ef7c4eb` ([run 32576244408](https://github.com/Codygrant3/no-fridge-spoil/actions/runs/32576244408)). Not claimed as the local command. |
| 4 | Receipt retry no longer depends on a manual button (`#3`) | `receiptRecoveryService` retries online and passes `resumeJobId`. |
| 5 | Grocery `YYYY-MM-DD` uses local calendar helpers | Inventory `#15`, sealed `#16`, meal-plan week `#17`, Alerts freeze `#14`, usage today `#24`. |
| 6 | Shopping adds use `shoppingCategory` | `#8` shopping page; `#17` meal-plan missing ingredients. |
| 7 | Receipt compression abort + Scan signal | `#23` API; `#5` `compressReceiptImage(file, scanAbort.signal)`. |
| 8 | Honest leftover blockers written | Phase D below. |

## Phase A — Landed 2026-08-22

Merge-commit order (GitHub `main`):

1. `#6` docs → `7bdb541`
2. `#25` hosted cloud CI → `6b3163f`
3. Test-only: `#7` `#9` `#10` `#13` `#19` `#21` `#22`
4. Isolated product: `#8` `#11` `#12` `#14` `#15` `#16` `#17` `#18` `#20` `#23` `#24`
5. Receipt stack: `#4` then `#5` then `#3` → HEAD `ef7c4eb`

## Phase B — Release gates on merged `main`

- Device: `npm run verify:release` **passed** on `ef7c4eb` (local worktree, real `node_modules`).
- Cloud: local `npm run verify:release:cloud` **unavailable** (no Docker / no `supabase` CLI / no `.env.local`). Not claimed as passed.
- Hosted CI for `ef7c4eb`: [run 32576244408](https://github.com/Codygrant3/no-fridge-spoil/actions/runs/32576244408) — `verify` passed, `cloud` passed.

## Phase C — Landed on those drafts

Do **not** re-apply the leftover patches. These heads are on `main`:

| P1 | PR | Head |
| --- | --- | --- |
| Alerts freeze local date | `#14` | `934234f` |
| Meal-plan `shoppingCategory` | `#17` | `e3f5cdb` |
| Scan cancel + compression signal | `#5` | `b0c913e` |
| Receipt `jobId` resume | `#5` + `#3` | `b0c913e` / `7d053b6` |

Playbook (fallback only): `docs/superpowers/plans/2026-08-22-phase-c-apply.md`.

## Phase D — Cannot close in this loop

- Consented, de-identified receipt-image OCR benchmark
- Physical iOS Safari / Android Chrome hardware QA
- More frequent than daily Vercel Hobby cron (infra change)

## Current snapshot — 2026-08-22 (after merge)

- GitHub `main`: `ef7c4eb` (`Merge pull request #3`).
- Phase A complete. Phase C hunks landed with their drafts. Phase B device gate passed locally.
- Phase B local cloud command unavailable in this environment. Hosted `verify` + `cloud` passed on `ef7c4eb`.
- Remaining production-rollout work is Phase D. Do not invent more page tests.
