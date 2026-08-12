# Product Improvement Cycle 11-20

Date: 2026-07-25

## Completed improvements

11. Local-first account access
    - Device inventory, scanning, recipes, lists, and alerts remain available while signed out or while cloud session restoration is unavailable.
    - Cloud synchronization starts only after a valid session and household are present.

12. Account flows in Profile
    - Sign in, account creation, and password reset now live inside Profile instead of blocking the product.
    - Password recovery remains a focused full-screen flow because it requires an explicit credential update.

13. Resilient preference storage
    - Browser preference reads and writes tolerate blocked storage, privacy mode, and quota failures.
    - A session-memory fallback prevents render-time crashes without pretending data was durably saved.

14. IndexedDB receipt history
    - Receipt history metadata moved from localStorage into the versioned Dexie database.
    - Legacy metadata migrates automatically and is removed from localStorage.

15. Accessible receipt editing
    - Brand, category, price, expiration, quantity, and bulk controls have associated labels.
    - Invalid expiration fields expose `aria-invalid`.

16. Complete receipt-data deletion
    - The destructive control requires a second explicit confirmation.
    - It clears receipt history, queued image blobs, previews, and receipt OCR cache in one operation.

17. Production diagnostic privacy
    - Production compilation drops direct console and debugger statements.
    - Development diagnostics remain available locally.

18. Offline and update feedback
    - The status bar reports offline readiness, reconnects, registration failure, pending sync, and available updates.

19. Safe application recovery
    - The error boundary no longer renders stack traces or internal error messages.
    - Users receive retry and return-home actions with a short incident reference.

20. Keyboard-complete receipt settings
    - The receipt settings drawer moves focus inside, traps Tab navigation, closes with Escape or backdrop selection, and returns focus to its trigger.

## Verification

- TypeScript project check
- ESLint
- Unit and component tests
- Playwright browser tests
- Supabase migration ordering
- Production build and forbidden-provider scan
- High-severity dependency audit

No new Supabase server migration is required for this cycle. IndexedDB schema version 10 is applied automatically in the browser.
