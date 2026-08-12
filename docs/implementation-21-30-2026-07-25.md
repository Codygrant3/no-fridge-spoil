# Product Improvement Cycle 21-30

Date: 2026-07-25

## Completed improvements

21. Durable receipt previews
    - Opted-in receipt previews are stored as IndexedDB blobs instead of temporary browser URLs.
    - Preview URLs are created only when needed and revoked when hidden, replaced, or unmounted.

22. Complete device backups
    - Backup format version 3 includes inventory, stats, settings, shopping items, profiles, meal plans, tags, and sanitized receipt history.
    - Restores validate every record, reject unsupported versions, remove cloud-only fields, and apply valid data atomically.

23. Backup controls in Profile
    - Device data can be downloaded as JSON without an account or network connection.
    - Restore validates file size and content, then reports imported and skipped records.

24. Scalable inventory rendering
    - Inventory initially renders 24 matching products and loads additional batches on demand.
    - Search and filter changes reset the visible batch without changing the underlying inventory.

25. Undo for destructive list actions
    - Clearing collected items or the entire shopping list now offers an immediate Undo action.
    - Restored entries receive fresh local mutation metadata so future synchronization remains consistent.

26. Time-aware alert badges
    - Expiration alert counts refresh every minute and whenever the app becomes visible again.
    - Badges no longer remain stale while the app stays open across an expiration threshold.

27. Resilient camera recovery
    - Camera startup retries with simpler constraints when a device rejects the preferred rear-camera request.
    - Permission denial, missing hardware, busy devices, and ended streams receive safe guidance and a retry path.

28. Expandable receipt history
    - Receipt records show timestamps and can reveal saved previews on demand.
    - Longer histories support Show all and Collapse controls without loading every preview into memory.

29. More usable account passwords
    - Password fields have accessible show and hide controls, explicit labels, and clear minimum-length guidance.
    - Account creation and recovery consistently enforce the eight-character requirement.

30. Enforced bundle budgets
    - OCR, barcode scanning, major screens, and application CSS now have explicit production size limits.
    - Local OCR is isolated in a lazy chunk and every production build runs bundle and secret checks.

## Verification

- TypeScript project check
- ESLint
- Unit and component tests
- Playwright browser tests
- Supabase migration ordering
- Production bundle budgets
- Production build secret scan
- High-severity dependency audit

No new Supabase server migration is required for this cycle. Backup format version 3 and the optional IndexedDB receipt-preview blob are applied by the existing local database.
