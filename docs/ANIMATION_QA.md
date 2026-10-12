# Local animation QA - 2026-10-12

Base: `Codygrant3/no-fridge-spoil` main `c280417f7b9f7c034de11fd6ba6ec65f959a4934`, verified through the GitHub read connector. Local branch: `codex/animation-upgrade`.

## Changes

- Reworked the 3.6-second receipt intro into a dimensional receipt scan, staggered grocery photo cards, and a completion check. Reuses the three existing WebP food images. No runtime dependencies or generated video assets are shipped.
- Added a sliding active navigation marker, short route fades, bounded six-row entry stagger, panel/feedback reveals, and press/hover feedback. Actions execute immediately; no animation-end dependency.
- Added Profile > Replay intro. Startup remains once per session and is bypassed for reduced motion. Explicit replay with reduced motion is static until dismissed; enabling reduced motion during playback dismisses immediately.
- Skip and Escape work throughout. The intro traps its single keyboard control, makes the background inert, preserves prior accessibility attributes, and returns focus to the replay trigger or main content.
- Inventory filter state is now exposed with aria-pressed. Hash routes, lazy loading, data flows, API imports, and deployment configuration are preserved.

## Actual validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:run -- --maxWorkers=4`: 70 files / 477 tests passed.
- `npm run build`: passed, including bundle budgets and build secret scan (36 text assets).
- Bundle results: main 571.3 KiB, CSS 136.5 KiB; both within existing budgets.
- `npx playwright test e2e/motion.spec.ts --workers=1`: 5 passed.
- `npx playwright test --workers=2 --output=artifacts/final-e2e`: 13 passed, 1 skipped (cloud-account test; no cloud configuration).
- `npm run test:e2e:pwa -- --workers=1 --output=artifacts/final-pwa`: 1 passed; service-worker install and offline shell.
- Mobile-emulated walkthrough with the bundled sample receipt: 1 passed. Confirmed sample review/add, populated inventory, row expansion, filtering, navigation, and intro replay. Recorded video and screenshot.
- `git diff --check`: passed.

Screenshots visually reviewed at 320x700, 390x844, and 1024x900: intro text/cards are legible without collisions; the warm cream/green identity remains; navigation and CTAs remain usable. The route animation uses the existing main element without adding a layout wrapper or applying transforms, preserving desktop widths and viewport positioning of fixed dialogs. No claim of physical-device FPS or Safari testing.

## Environment and boundaries

Initial sandbox Vitest run was blocked by EPERM on temporary-file renames before any tests ran. The authorized local rerun outside the sandbox passed. The supported interactive browser tool failed twice during initialization; the repository's Playwright Chromium tests and their rendered screenshots supplied browser verification.

No push, PR, deployment, credential change, production change, or ManimGX installation change occurred. The separate ESM import repair is not included. Cloud checks and physical-device QA were not run. Publication remains blocked by the previously reported GitHub integration write restriction.
