# No Fridge Spoil IPIE Loop

Operating log for inspect → plan → implement → evaluate cycles.
The loop rule lives in `.cursor/rules/ipie-loop.mdc`.

## Cycle 0 — 2026-08-21 (closed)

**Inspect:** Handover P0 (dirty-tree checkpoint) and P1 hosted CI were already merged on `main` (`7909077`, PR #2). Remaining implementable gaps were provider-hardcoded OCR diagnostics, manual-only receipt retry, and a thin shorthand corpus.

**Plan:** Three file-disjoint cloud agents from `main`.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Receipt recovery | [#3](https://github.com/Codygrant3/no-fridge-spoil/pull/3) | `receiptRecoveryService.ts`, `App.tsx` AccountGate, tests |
| Shorthand corpus | [#4](https://github.com/Codygrant3/no-fridge-spoil/pull/4) | `receiptItemResolver.ts`, corpus, resolver tests |
| OCR diagnostics | [#5](https://github.com/Codygrant3/no-fridge-spoil/pull/5) | `receiptOCRService.ts`, Scan health label, receipt API labels, tests |

**Evaluate:** Hosted `verify` plus Vercel checks passed on all three (`gh pr checks` 2026-08-21). Not merged. Child agents could not open PRs (`ManagePullRequest` missing / `gh` integration denied); coordinator opened the drafts.

Still open from handover: real receipt-image benchmark, more frequent durable server recovery, hotspot splits, hardware QA, PaddleOCR evidence.

## Cycle 1 — 2026-08-21 (closed)

**Inspect:**

- Shopping list page hardcodes `selectedCategory = 'other'`. Inventory→list already uses `shoppingCategory()` in `src/services/shoppingActionService.ts`, so manual and quick-add items never group.
- Shopping add field is a `<label>` with no accessible name.
- No `ShoppingList` page tests.
- No `MealPlanner` page tests. `useModalFocus` exists; planner is uncharacterized.
- Cycle 0 PRs occupy recovery, resolver, and OCR diagnostic files. Cycle 1 must not edit those.

**Plan:**

1. Coordinator: encode this loop, refresh handover status (this PR).
2. Cloud agent: reuse `shoppingCategory` on the shopping page, label the add field, add page tests.
3. Cloud agent: Meal Planner characterization tests (picker, missing-ingredients action, focus/Escape). No CSS redesign.

File ownership is in `docs/superpowers/plans/2026-08-21-ipie-cycle-1.md`.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Loop + handover | [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6) | IPIE rule, ledger, cycle-1 plan, handover refresh |
| Meal Planner tests | [#7](https://github.com/Codygrant3/no-fridge-spoil/pull/7) | `src/__tests__/pages/MealPlanner.test.tsx` only |
| Shopping categories | [#8](https://github.com/Codygrant3/no-fridge-spoil/pull/8) | `ShoppingList.tsx`, export `shoppingCategory`, page tests |

**Evaluate:** Hosted `verify` plus Vercel passed on [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6), [#7](https://github.com/Codygrant3/no-fridge-spoil/pull/7), and [#8](https://github.com/Codygrant3/no-fridge-spoil/pull/8) (`gh pr checks` 2026-08-21). Not merged.

## Cycle 2 — 2026-08-21 (closed)

**Inspect:** Open drafts occupy recovery, resolver, OCR, shopping list, meal planner tests, and loop docs. Remaining disjoint gaps: no Recipes page tests (service-only coverage); ReviewItems tests do not lock skip-without-expiration or keep-original-name.

**Plan:**
1. Recipes page characterization: For you / Make now / Catalogue, meal+diet filters, search, opening Cook Mode.
2. ReviewItems characterization: missing expiration skips confirm; declining a suggestion keeps `originalName`.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| ReviewItems skip/keep-original | [#9](https://github.com/Codygrant3/no-fridge-spoil/pull/9) | `ReviewItems.test.tsx` only |
| Recipes page tests | [#10](https://github.com/Codygrant3/no-fridge-spoil/pull/10) | `Recipes.test.tsx` only |

**Evaluate:** Hosted `verify` plus Vercel passed on [#9](https://github.com/Codygrant3/no-fridge-spoil/pull/9) and [#10](https://github.com/Codygrant3/no-fridge-spoil/pull/10). Ledger [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6) re-ran green. Not merged.

## Cycle 3 — 2026-08-21 (closed)

**Inspect:** Open drafts now also cover Recipes and ReviewItems tests. Remaining disjoint gaps: no CookMode page-level tests (only CookTimer + open-from-Recipes); Eat This Tonight uses `parseInt(prepTime)` instead of `prepMinutes`/`cookMinutes` and has no tests.

**Plan:**
1. CookMode characterization: exit, next/prev step, ingredient check.
2. Eat This Tonight: prefer numeric minutes for the <30 min pick; add widget tests.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Eat This Tonight minutes | [#11](https://github.com/Codygrant3/no-fridge-spoil/pull/11) | widget + tests |
| Cook Mode tests | [#12](https://github.com/Codygrant3/no-fridge-spoil/pull/12) | `CookMode.test.tsx`, voice-help close label |

**Evaluate:** Hosted `verify` plus Vercel passed on [#11](https://github.com/Codygrant3/no-fridge-spoil/pull/11) and [#12](https://github.com/Codygrant3/no-fridge-spoil/pull/12). Ledger [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6) re-ran green. Not merged.

## Cycle 4 — 2026-08-21 (closed)

**Inspect:** Ten green drafts occupy most page/test files. Still free: `substitutionService` (no tests; fuzzy `includes` matching), Alerts beyond the one timer test (shopping add + calendar download), if shoppingActionService is mocked.

**Plan:**
1. Substitution service characterization (exact match, inventory sort). Do not widen fuzzy matching.
2. Alerts: add-to-list feedback and calendar reminder download, mocking `shoppingActionService`.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Substitution tests | [#13](https://github.com/Codygrant3/no-fridge-spoil/pull/13) | `substitutionService.test.ts` only |
| Alerts actions | [#14](https://github.com/Codygrant3/no-fridge-spoil/pull/14) | `Alerts.test.tsx`, Add/Calendar labels |

**Evaluate:** Hosted `verify` plus Vercel passed on [#13](https://github.com/Codygrant3/no-fridge-spoil/pull/13) and [#14](https://github.com/Codygrant3/no-fridge-spoil/pull/14). Ledger [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6) re-ran green on `5838a7f`. Not merged.

## Cycle 5 — 2026-08-22 (in progress)

**Inspect:** The asked to continue. `#3`–`#14` stay green and occupy recovery, resolver, OCR/Scan, shopping, planner tests, review tests, recipes tests, cook widget/mode, substitutions, and Alerts. Remaining user-visible gaps that do not touch those files: `YYYY-MM-DD` fields still use `Date` / `toISOString()` in Inventory, meal-plan week start, and sealed shelf-life estimates. Profile/Scan/`index.css` splits still deferred.

**Plan:** Three file-disjoint agents from `main` (`0c8fbf4`). Ownership in `docs/superpowers/plans/2026-08-22-ipie-cycle-5.md`.

1. Inventory: local-calendar urgency, opened date, and freeze date; search field name; expand page tests.
2. Meal plan service: local Monday week start; service tests (do not edit `MealPlanner.test.tsx`).
3. Sealed shelf-life: `estimateExpirationDate` via `calculateExpirationFromShelfLife`; characterize keyword order. Do not edit Scan or ReviewItems.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Inventory local calendar | [#15](https://github.com/Codygrant3/no-fridge-spoil/pull/15) | `Inventory.tsx`, `Inventory.test.tsx` |
| Sealed shelf-life dates | [#16](https://github.com/Codygrant3/no-fridge-spoil/pull/16) | `sealedShelfLifeService.ts`, new tests |
| Meal-plan week start | [#17](https://github.com/Codygrant3/no-fridge-spoil/pull/17) | `mealPlanService.ts`, new tests |

**Evaluate:** Hosted `verify` plus Vercel passed on [#15](https://github.com/Codygrant3/no-fridge-spoil/pull/15), [#16](https://github.com/Codygrant3/no-fridge-spoil/pull/16), and [#17](https://github.com/Codygrant3/no-fridge-spoil/pull/17). Ledger [#6](https://github.com/Codygrant3/no-fridge-spoil/pull/6) re-ran green on `0f32287`. Not merged.

## Cycle 6 — 2026-08-22 (in progress)

**Inspect:** Fifteen green drafts occupy calendar, receipt, shopping, planner, cook, alerts, and inventory files. Still free: no Profile page tests (hotspot — characterize first, do not split); ProfileSwitcher create field has no accessible name.

**Plan:** Two file-disjoint agents from `main`. Ownership in `docs/superpowers/plans/2026-08-22-ipie-cycle-6.md`.

1. Profile characterization for local-first sections (unsigned-in). Tests only unless a name is missing.
2. ProfileSwitcher: name the create field; switch / create / cancel-delete tests.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| ProfileSwitcher name | [#18](https://github.com/Codygrant3/no-fridge-spoil/pull/18) | `ProfileSwitcher.tsx`, new tests |
| Profile characterization | [#19](https://github.com/Codygrant3/no-fridge-spoil/pull/19) | `Profile.test.tsx` only |

**Evaluate:** Drafts opened; hosted CI not yet terminal at Cycle 7 start.

## Cycle 7 — 2026-08-22 (in progress)

**Inspect:** `#3`–`#19` occupy receipt, shopping, planner, cook, alerts, inventory, calendar services, Profile tests, and ProfileSwitcher. Still free and user-visible: no OnboardingCarousel tests; BarcodeScanner manual field has placeholder only.

**Plan:** Two file-disjoint agents from `main`. Ownership in `docs/superpowers/plans/2026-08-22-ipie-cycle-7.md`.

1. Onboarding checklist characterization (dismiss, scan, warning days, notifications gated on first item).
2. BarcodeScanner: name the manual field; close / manual lookup / HTTPS camera-error tests. Mock camera.

**Implement:**

| Agent | Draft PR | Files |
| --- | --- | --- |
| Barcode manual name | [#20](https://github.com/Codygrant3/no-fridge-spoil/pull/20) | `BarcodeScanner.tsx`, new tests |
| Onboarding checklist | (pending push) | `OnboardingCarousel.test.tsx` |
