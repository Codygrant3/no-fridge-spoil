# Phase C apply playbook

Do **not** apply these patches onto current `main` (`0c8fbf4`) or onto `#6`.
They were cut from the Phase A rehearsal tip `7a4be2f` → stacked commit `c1510e1`.
Apply only after Phase A lands on GitHub `main`.

The four patches are file-disjoint and apply independently. Sequential apply
reproduces the stacked tree `44ab905`. Keep the combined patch as a one-shot fallback.

## After Phase A is on `main`

From a clean checkout of merged `main`:

```bash
git checkout -b cursor/alerts-freeze-local-3203
git apply docs/superpowers/patches/2026-08-22-phase-c-alerts-freeze.patch

git checkout main
git checkout -b cursor/scan-cancel-compress-3203
git apply docs/superpowers/patches/2026-08-22-phase-c-scan-cancel.patch

git checkout main
git checkout -b cursor/meal-plan-shopping-category-3203
git apply docs/superpowers/patches/2026-08-22-phase-c-meal-plan-category.patch

git checkout main
git checkout -b cursor/receipt-resume-jobid-3203
git apply docs/superpowers/patches/2026-08-22-phase-c-receipt-resume.patch
```

Or apply the combined patch on a single integration branch if The wants one PR:

```bash
git apply docs/superpowers/patches/2026-08-22-phase-c.patch
```

## File ownership

| Patch | Branch | Files |
| --- | --- | --- |
| `2026-08-22-phase-c-alerts-freeze.patch` | `cursor/alerts-freeze-local-3203` | `Alerts.tsx`, `Alerts.test.tsx` |
| `2026-08-22-phase-c-scan-cancel.patch` | `cursor/scan-cancel-compress-3203` | `Scan.tsx`, `Scan.receipt.test.tsx` |
| `2026-08-22-phase-c-meal-plan-category.patch` | `cursor/meal-plan-shopping-category-3203` | `mealPlanService.ts`, `mealPlanService.test.ts` |
| `2026-08-22-phase-c-receipt-resume.patch` | `cursor/receipt-resume-jobid-3203` | `receiptOCRService.ts`, `receiptRecoveryService.ts`, their tests |

Open each as a draft. Do not squash across ownership. Re-run `gh pr checks` after each merge.

## Verified 2026-08-22

- `git apply --check` clean for each scoped patch on `7a4be2f`
- Sequential apply tree equals stacked `c1510e1` (`44ab905`)
- Combined patch still checks clean on `7a4be2f`
- Alerts scoped patch does **not** apply on current `main`-equivalent app tree (expected)
