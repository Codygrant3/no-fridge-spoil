# Three-Model Project Improvement Review

Date: 2026-07-25

Repository: `C:\Users\chris\No Fridge Spoil`

## Panel

| Reviewer | Verified model | Mode |
| --- | --- | --- |
| Sol | `gpt-5.6-sol` | Read-only, x-high reasoning |
| Grok | `grok-4.5` | Read-only, high reasoning |
| Opus | `claude-opus-5` | Read-only, high reasoning |

All reviewers inspected the current dirty working tree, including the partially
completed Google/Gemini removal. No reviewer was asked to edit files.

## Executive conclusion

The panel agrees that the product direction is sound, but the current tree should
not be packaged or deployed yet. The Google-free source migration is substantially
underway, while the deployable artifacts, dependency lockfile, cloud OCR controls,
receipt retention, and job worker still need release-level hardening.

The panel's strongest shared recommendation is to finish a narrow containment and
backend-safety release before adding more UI or recommendation features.

## Consensus priorities

### 1. Revoke Google credentials and prove a clean artifact

Consensus: 3 of 3 reviewers.

The stale `dist/` still contains the old Google SDK and key-shaped material, while
`@google/genai` remains in `package.json` and the lockfile. Deployment scripts can
publish `dist/`, so source cleanup alone is not sufficient.

Actions:

1. Revoke every Google key that appeared in a browser build.
2. Remove Google key lines from local and hosted environment configuration.
3. Uninstall `@google/genai` and update the lockfile.
4. Delete and rebuild `dist/`.
5. Add a CI artifact scan for `AIza`, `generativelanguage`, and Google TTS hosts.
6. Make deployment scripts build and scan before publishing.

### 2. Enforce OCR budgets, consent, and provider selection

Consensus: 3 of 3 reviewers.

`.env.example` advertises monthly page and dollar limits, cloud fallback controls,
user consent, and a Mistral provider, but runtime code does not enforce them.
`api/receipt-ocr.ts` remains Azure-specific and the database reservation is daily.

Actions:

1. Add a server-only `ReceiptOcrProvider` interface.
2. Keep Azure as the initial provider and add Mistral only behind the interface.
3. Enforce monthly user, household, and project page/dollar caps atomically.
4. Require an explicit cloud-upload consent record before job creation.
5. Fail closed in production when provider pricing is missing or zero.
6. Add a provider kill switch and cost-health alert.

### 3. Make the receipt queue genuinely durable

Consensus: 3 of 3 reviewers.

The browser drives the practical processing path. The scheduled worker runs daily
and processes one job, so abandoned tabs can leave jobs queued or stuck for hours.
Final-attempt lease expiration can also leave raw uploads without a reclamation path.

Actions:

1. Drain bounded job batches within the worker time budget.
2. Run the worker every minute or use a durable queue trigger.
3. Add a reaper for expired leases, exhausted attempts, and orphaned uploads.
4. Alert on oldest queue age and terminal cleanup failures.
5. Keep browser `PUT` processing only as an optional acceleration path.

### 4. Stop retaining receipt images in localStorage

Consensus: 3 of 3 reviewers.

Failed receipt scans are stored as base64 data URLs in `localStorage`. This can
exceed browser quota, exposes sensitive purchase data on shared devices, has no
bounded byte budget, and has no reliable expiration policy. Successful preview
object URLs are also persisted even though they cannot survive a reload.

Actions:

1. Move queued receipt blobs to IndexedDB.
2. Default preview persistence to off.
3. Add total-byte limits, expiration timestamps, and cleanup on confirmation.
4. Revoke object URLs and clear only after a successful retry.
5. Provide one user-visible deletion path for all local receipt artifacts.

### 5. Complete cross-browser local item capture

Consensus: 3 of 3 reviewers.

The new local scan path depends on experimental `BarcodeDetector` and `TextDetector`
support. Unsupported browsers and unlabeled produce will frequently produce
`Unidentified item`.

Actions:

1. Add a manual produce/category picker immediately.
2. Add lazy-loaded PaddleOCR.js in a worker for dates and labels.
3. Preprocess images and expose capability/latency states.
4. Preserve barcode and manual review as the guaranteed fallback.
5. Keep any cloud vision retry explicit and consented.

### 6. Strengthen release and regression gates

Consensus: 3 of 3 reviewers.

Current tests can pass while deployable secrets, invalid dates, stuck jobs, or
unsupported mobile camera behavior remain.

Actions:

1. Scan built artifacts for credentials and removed provider hosts.
2. Add invalid/unknown expiration confirmation tests.
3. Test monthly budgets, consent denial, queue draining, lease recovery, and cleanup.
4. Add authenticated receipt-job end-to-end tests.
5. Add mobile browser coverage and a sanitized receipt-image benchmark.
6. Include `scripts/` in a TypeScript project because those scripts gate CI.

### 7. Make account migration and sync conflicts explicit

Consensus: 2 of 3 reviewers; the third flagged the broader local-first account gate.

The first signed-in household can automatically claim unassigned local records, and
pending local writes use unconditional upserts without visible conflict resolution.

Actions:

1. Show a migration preview before uploading device-only data.
2. Let users keep a device-only inventory.
3. Add revision-based optimistic concurrency.
4. Surface conflicts instead of silently selecting the latest write.
5. Consider allowing local use before sign-in and gate only cloud features.

### 8. Fix local data-integrity hazards

Consensus: supported by multiple reviewers through separate findings.

Confirmed hazards include truthy `"Unknown"` expiration values, image cache keys
based on filename/size/mtime rather than content, and a client cost fallback that
invents one cent when the server value is missing.

Actions:

1. Normalize unknown expiration values to an empty field.
2. Validate inventory records before persistence.
3. Reject invalid dates in status calculation.
4. Hash image content for the local vision cache key.
5. Represent unknown provider cost as unknown or zero, never an invented charge.

### 9. Add focused security controls

Consensus: all reviewers found additional security work, with different emphasis.

Actions:

1. Validate Azure `operation-location` against the configured HTTPS host before polling.
2. Add a strict Content-Security-Policy now that Google AI hosts are gone.
3. Add `Permissions-Policy` for camera and microphone.
4. Cache or protect detailed `/api/health` queue metrics.
5. Minimize unauthenticated database work in health endpoints.

### 10. Reduce scale and maintenance hotspots

Consensus: 3 of 3 reviewers.

The largest hotspots are receipt review rendering, the scan page, global CSS,
Open Food Facts fan-out, and process-local serverless caches.

Actions:

1. Cap Open Food Facts concurrency and deduplicate barcodes per receipt.
2. Persist product lookup cache entries with a TTL.
3. Move receipt review state into a reducer.
4. Memoize normalized inventory maps and receipt rows.
5. Virtualize long receipts and split feature CSS.

## Notable individual catches

### Sol 5.6

- `"Unknown"` can pass a truthy expiration-date check and corrupt inventory status.
- Notification scheduling can remain stale after quiet hours or a date boundary.
- Large receipt review lists recalculate too much work on every keystroke.

### Grok 4.5

- Client receipt cost currently defaults a missing value to one cent.
- Azure polling should validate the `operation-location` host to prevent SSRF.
- The full account gate conflicts with the stated local-first product direction.

### Opus 5

- Final-attempt lease expiration can strand jobs and raw receipt uploads indefinitely.
- A strict CSP is now inexpensive and should be added during the Google removal.
- Open Food Facts enrichment can fan out one concurrent request per receipt line.
- The local image cache key can collide because it does not hash file content.

## Recommended implementation order

### Release 1: Containment

- Revoke Google credentials.
- Remove dependency and lockfile residue.
- Rebuild and scan artifacts.
- Normalize unknown dates and fix image cache hashing.
- Add CI secret/provider-host gates.

### Release 2: Privacy and cost safety

- Move receipt queues to IndexedDB.
- Disable preview retention by default.
- Enforce consent and monthly/global budgets.
- Validate Azure poll URLs.

### Release 3: Durable receipt operations

- Frequent bounded worker.
- Lease/job reaper and orphaned-upload cleanup.
- Queue age and provider-cost health alerts.

### Release 4: Google-free feature parity

- Manual produce picker.
- Cross-browser worker OCR.
- Capability and confidence UX.
- Sanitized receipt-image benchmark.

### Release 5: Collaboration and scale

- Explicit local-to-cloud migration.
- Sync conflict handling.
- Open Food Facts concurrency/cache.
- Review-list and CSS performance work.

## Ship gate

Do not package or deploy until Release 1 is complete. Do not enable cloud receipt
scanning broadly until Releases 2 and 3 are complete.
