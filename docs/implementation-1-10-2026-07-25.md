# Receipt and Platform Hardening: Priorities 1-10

## Implementation status

1. Google removal and release gates
   - Removed `@google/genai` and browser Google API environment variables.
   - Production builds scan generated assets for Google key signatures, Gemini and Google TTS endpoints, and the retired SDK marker.
   - Deploy commands now rebuild and run the scanner before publishing.
   - The old Google key must still be revoked in the Google Cloud project that issued it. The locally active `gcloud` project is unrelated, so automated revocation was intentionally not attempted.

2. OCR consent and budgets
   - Cloud receipt upload is off until the user explicitly enables cloud OCR consent.
   - Daily user/household limits remain in place.
   - Monthly project page and cost ceilings are enforced through an advisory-locked Supabase function.
   - Missing cost telemetry is recorded as zero, never a fabricated estimate.

3. Durable receipt queue
   - Browser retries use expiring IndexedDB blobs rather than base64 data in `localStorage`.
   - Queue retention is seven days, with limits of ten receipts and 20 MB.
   - Server workers process bounded batches; maintenance reaps expired or exhausted jobs and removes their private uploads.

4. Receipt image privacy
   - Saved receipt previews are opt-in.
   - The local retry image is deleted only after a successful retry.
   - Legacy `localStorage` retry payloads are deleted during queue access.

5. Cross-browser local OCR
   - Native `BarcodeDetector` and `TextDetector` remain the fast path.
   - Tesseract.js loads lazily as a browser-local WebAssembly fallback.
   - Unidentified produce can be assigned with a quick manual picker in receipt review.

6. Release and test gates
   - Build includes TypeScript project compilation, Vite production generation, and secret scanning.
   - CI inherits the scanner through `npm run build`.
   - Unit coverage includes consent, strict dates, Mistral mapping, shorthand resolution, cloud sync, queue behavior, and protected APIs.

7. Cloud migration and conflicts
   - Signing in no longer automatically assigns device-only records to a household.
   - Profile shows the number of local records and requires an explicit migration action.
   - Cloud version timestamps prevent silent cross-device overwrites.
   - Users can resolve detected conflicts using either the device or cloud version.

8. Security controls
   - CSP and Permissions Policy restrict framing, scripts, workers, provider connections, camera, and microphone.
   - Azure polling accepts only HTTPS operation URLs on the configured Azure origin.
   - Public health responses are minimal; operator details require the cron secret and are cached in-process for 30 seconds.

9. Provider-neutral OCR
   - `RECEIPT_OCR_PROVIDER` selects Azure or Mistral.
   - Optional fallback routing is controlled by `RECEIPT_OCR_FALLBACK_PROVIDER` and `RECEIPT_OCR_CLOUD_FALLBACK_ENABLED`.
   - Both provider outputs use the same deterministic item resolver and review workflow.

10. Performance
    - Open Food Facts lookups are bounded to four concurrent requests.
    - Product results use both process memory and a persistent Supabase cache.
    - Receipt review grouping, confidence analysis, and duplicate detection are memoized.
    - Local OCR remains a lazy chunk outside the initial app path.

## Deployment checklist

1. Apply all Supabase migrations in filename order, including:
   - `20260725000000_receipt_project_budgets.sql`
   - `20260725010000_receipt_job_reaper.sql`
   - `20260725020000_product_lookup_cache.sql`
2. Configure one primary OCR provider and leave fallback disabled until the receipt benchmark passes.
3. Set `RECEIPT_OCR_REQUIRE_USER_CONSENT=true`.
4. Set monthly page and dollar budgets to intentional, nonzero values.
5. Use a unique `CRON_SECRET` of at least 16 characters.
6. Revoke the old Google key in its issuing Google Cloud project.
7. Run `npm run build`, `npm run test:run`, `npm run lint`, `npm run verify:migrations`, and `npm audit --audit-level=high`.

## Scheduling note

The Vercel Hobby plan currently allows cron execution only once per day. The app therefore processes a new job immediately through its authenticated client request and retains the daily worker as recovery. For minute-level unattended recovery on a free deployment, schedule a Supabase Edge Function with Supabase Cron after moving the worker handler into that runtime; do not change `vercel.json` to a sub-daily schedule on Hobby because deployment will fail.
