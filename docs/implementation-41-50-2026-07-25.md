# Product Improvement Cycle 41-50

Date: 2026-07-25

## Completed improvements

41. Live alert timing
    - Expiration wording refreshes every minute while Alerts remains open.
    - Returning to the visible app immediately refreshes the alert clock.

42. Local-calendar date safety
    - Expiration calculations and notification groups use local date-only values instead of UTC string slicing.
    - Impossible dates such as February 30 are rejected instead of silently normalized.

43. Duplicate-free shopping adds
    - Adding the same shopping item again increments its quantity instead of creating another row.
    - Matching is case-insensitive and a collected item becomes active again when re-added.

44. Per-item shopping controls
    - Shopping rows now expose compact increase, decrease, and remove actions.
    - Single-item removal participates in the existing Undo workflow.

45. Background-accurate cook timers
    - Cook timers count down from an absolute deadline instead of assuming every interval fires on time.
    - Start, pause, resume, restart, visibility recovery, and voice-driven set-and-start behavior remain consistent.

46. Delivery-aware notifications
    - Service-worker notification failures fall back to the page Notification API.
    - Duplicate-prevention history is written only after the browser accepts the notification.

47. Resilient text copying
    - Invite links and impact summaries share one Clipboard API helper.
    - Browsers without the modern API use a temporary-text fallback and report failure clearly.

48. Safe route preloading
    - Intent-based lazy-route preloads absorb transient chunk failures.
    - A failed speculative request no longer creates an unhandled promise rejection.

49. Deferred media loading
    - Offscreen product, alert, recipe, receipt, and queued-scan images use lazy loading and asynchronous decoding.
    - The first-viewport market hero remains high priority.

50. Private scan failure handling
    - Single-item and receipt failures display classified user guidance instead of raw provider or browser exceptions.
    - Camera shutdown also detaches the video element source to release the stream completely.

## Verification

- TypeScript project check
- ESLint
- Unit and component tests
- Playwright browser tests
- Supabase migration ordering
- Production bundle budgets
- Production build secret scan
- High-severity dependency audit

No new Supabase or IndexedDB migration is required for this cycle.
