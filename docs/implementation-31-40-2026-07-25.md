# Product Improvement Cycle 31-40

Date: 2026-07-25

## Completed improvements

31. Adaptive startup
    - The branded splash plays only once per browser session instead of delaying every reload.
    - Reduced-motion users enter the product immediately.

32. Predictable route scrolling
    - Every application view starts at the top when selected.
    - Long inventory, receipt, or profile pages no longer carry their old scroll position into another view.

33. Intent-based route preloading
    - Bottom navigation begins loading a destination when its button receives pointer or keyboard focus.
    - Lazy routes remain split while likely next views feel more immediate.

34. Reviewed device restore
    - Backup files are inspected before any database write.
    - Profile shows file name, backup date, format version, section counts, and warnings before requiring explicit confirmation.

35. Searchable receipt history
    - Saved receipts can be filtered by store, date, source, or processing status.
    - Search results preserve the recent/all-history expansion behavior.

36. Individual receipt deletion
    - A single receipt record can be removed without clearing the full history.
    - Each deletion requires a second confirmation on the selected record.

37. Camera lifecycle privacy
    - Live camera startup now attaches to a permanently mounted video target.
    - Active streams stop when the app moves to the background and expose a clear Resume camera action.

38. Keyboard-complete shopping options
    - The three-dot menu moves focus to the first available action when opened.
    - Arrow, Home, End, and Escape keys work as expected, with focus returned to the trigger.

39. Honest impact reporting and sharing
    - Nonfunctional period controls were replaced with an explicit all-time estimate label and methodology note.
    - Native share, clipboard fallback, cancellation, and failure now provide appropriate user feedback.

40. Valid expiration calendar reminders
    - Expiring-item alerts now expose a Calendar action.
    - Generated ICS files use timezone-safe all-day dates, escaped text, valid metadata, safe file names, and released object URLs.

## Verification

- TypeScript project check
- ESLint
- Unit and component tests
- Playwright browser tests
- Supabase migration ordering
- Production bundle budgets
- Production build secret scan
- High-severity dependency audit

No new Supabase or IndexedDB migration is required. Device backups remain format version 3.
