# Product Improvement Cycle 51-60

Date: 2026-07-25

## Completed improvements

51. Quiet-hours-safe notification scheduling
    - Opening the app during quiet hours no longer prevents recurring checks from being installed.
    - Every check re-reads notification frequency, enabled state, permission, and quiet hours.

52. Notification permission resilience
    - Rejected browser permission requests now return a clean unavailable result.
    - Scheduler startup failures are caught without interrupting app startup.

53. Voice assistant lifecycle and feedback
    - Auto-hide timers are canceled before replacement and on unmount.
    - Microphone failures remain visible with actionable guidance, while Escape and a labeled close button dismiss the status panel.

54. Keyboard-safe duplicate review
    - Duplicate merge review is exposed as a labeled modal dialog.
    - Focus moves to Close, Escape dismisses the dialog, and focus returns to Review.

55. Keyboard-safe achievement details
    - Achievement dialogs move focus to Close and support Escape.
    - Closing restores focus to the badge that opened the dialog.

56. Storage-safe legacy cleanup
    - IndexedDB migration, receipt queue cleanup, and deleted-account auth cleanup use guarded local storage helpers.
    - Blocked browser storage can no longer stop database initialization or cleanup.

57. Bounded batch thumbnail decoding
    - Queued scan thumbnails settle after five seconds when image decoding stalls.
    - Object URLs and event handlers are released on success, failure, and timeout.

58. Reliable receipt image validation
    - Receipt metadata decoding now receives a realistic five-second window on mobile devices.
    - Corrupt or unreadable image files produce a blocking, user-facing quality issue instead of silently bypassing checks.

59. Canonical and accessible route loading
    - Hash routes correctly preserve query parameters, including household invitation links.
    - Unknown routes normalize to inventory, and lazy loading is announced as a busy live status.

60. Household action confirmations
    - Member removal requires confirmation naming the affected person.
    - Ownership transfer requires confirmation explaining the loss of owner-only control.

## Verification

- TypeScript project check: passed
- ESLint: passed
- Unit and component tests: 51 files, 350 tests passed
- Playwright browser tests: 7 passed, 1 credential-dependent cloud test skipped
- Supabase migrations: 7 ordered migrations verified
- Production bundle budgets: passed
- Production build secret scan: 35 text assets checked
- High-severity dependency audit: 0 vulnerabilities
- Active development preview: HTTP 200 at `http://127.0.0.1:5173/`

No new Supabase or IndexedDB migration is required for this cycle.
