# Gemini Removal and Replacement Plan

Date: 2026-07-15

Status: Investigation complete. Removal implementation and provider benchmark are pending.

Release status: Blocked until the exposed Google credentials are revoked or rotated
and a new production build no longer contains them.

## Executive decision

Remove Gemini and Google Cloud TTS from the browser bundle. Replace them with a
local-first capture stack and keep cloud processing as an explicit, server-only
fallback for low-confidence scans.

Recommended production shape:

1. Barcode first: Open Food Facts product lookup with a local cache.
2. Text and date capture: PaddleOCR.js in a lazy-loaded web worker.
3. Item normalization: the existing deterministic receipt resolver and shelf-life rules.
4. Voice commands: a local finite-intent parser plus browser speech synthesis.
5. Receipt fallback: keep Azure Document Intelligence behind the API initially.
6. Supplemental OCR option: benchmark Mistral OCR 4 behind the same server interface.
7. Recall checks: cached openFDA enforcement data, never an LLM assertion.
8. User review: preserve raw OCR evidence and require confirmation for ambiguous results.

This gives the app a viable zero-API-cost mode. Cloud spend occurs only when a user
chooses a higher-accuracy retry or a configurable confidence threshold sends a scan
to the fallback provider.

## Current repository findings

| Area | Current behavior | Removal action |
| --- | --- | --- |
| AI client | `src/services/ai-client.ts` constructs `GoogleGenAI` from `VITE_GEMINI_API_KEY`. | Delete after the final caller is migrated. |
| Single-item photo | `src/services/visionService.ts` sends the complete image to Gemini 2.0 Flash. | Replace with barcode, local OCR/date parsing, and manual produce selection. |
| Scan queue | `src/services/scanQueueService.ts` calls the Gemini vision service. | Route through the new local capture coordinator. |
| Voice intent | `src/services/voiceService.ts` sends transcripts to Gemini for a fixed command list. | Replace with a deterministic parser; this does not need an LLM. |
| Voice output | Google TTS is called directly from the browser when enabled. | Use `speechSynthesis`; offer server-side speech only as an opt-in fallback. |
| Fact checking | `src/services/factCheckService.ts` uses Gemini for product, storage, and recall claims. | It has no live callers. Remove it and use authoritative data services if the feature is activated later. |
| Recipes | The working tree now uses a local structured recipe catalogue and deterministic inventory matching. | No Gemini replacement is required. |
| Receipt OCR | `api/receipt-ocr.ts` already uses server-side Azure Document Intelligence `prebuilt-receipt`. | Preserve as the first cloud fallback while local OCR is benchmarked. |
| Product data | The app has browser Open Food Facts v0 lookup and a newer server-side v3 helper. | Consolidate on the cached server v3 helper and validate GTINs. |
| Build residue | `@google/genai`, a Vite chunk, service-worker exclusions, tests, and environment examples remain. | Remove only after the feature callers are migrated. |

## High-priority risks

### 1. Browser-exposed keys

`VITE_GEMINI_API_KEY` and `VITE_GOOGLE_CLOUD_TTS_API_KEY` are secrets in a public
client namespace. Vite documents that `VITE_*` variables are bundled into the
client source and must not contain API keys. A fresh local production build confirmed
Google API key-shaped values in two generated JavaScript chunks. The environment
files are not tracked by Git, but that does not protect values compiled into browser
assets. Revoke or rotate the keys, disable their APIs, and rebuild without them.

### 2. Cost reporting currently defaults to zero

`AZURE_DOCUMENT_INTELLIGENCE_COST_PER_PAGE_USD` defaults to `0.00`, and
`api/receipt-ocr.ts` records cost from that value. Provider cost dashboards will
therefore under-report spend unless deployment configuration is kept current.

### 3. Daily limits are not budget controls

The database defaults allow 20 receipt scans per user per day and 50 per household
per day. For one-page receipts, the user limit permits 600 cloud pages per month.
At the planning rate of $0.01 per page, that is $6 per maximally active user per
month. Add monthly user, household, and project-wide dollar caps before broad access.

### 4. Receipt images are sensitive

Receipts can expose store location, purchase history, timestamps, loyalty details,
and partial payment identifiers. Local processing should be the default. A cloud
retry must disclose the provider, what is uploaded, retention behavior, and whether
the image is stored. Do not retain the source image by default.

### 5. Product-photo parity has one intentional gap

Local OCR can read labels and dates, but it cannot reliably identify an unlabeled
apple or onion. The free, reliable fallback is a small produce/category picker, not
a speculative model guess. A general cloud vision provider can remain an optional
future experiment after a measured accuracy and privacy review.

## Target capture pipeline

```text
Image or barcode
  -> barcode/GTIN lookup (Open Food Facts cache)
  -> local OCR worker (PaddleOCR.js)
  -> deterministic date, quantity, and item parsing
  -> local/store-scoped aliases and shelf-life rules
  -> confidence gate
       high: review and save
       low: manual correction or explicit cloud retry
  -> server fallback adapter (Azure first; Mistral/AWS optional)
  -> same normalized result contract
  -> review and save
```

The cloud adapter should be selected only on the server:

```ts
type ReceiptOcrProviderId = 'azure' | 'mistral' | 'aws';

interface ReceiptOcrProvider {
  readonly id: ReceiptOcrProviderId;
  analyze(image: ArrayBuffer, mimeType: string): Promise<NormalizedReceiptResult>;
}
```

Use an environment value such as `RECEIPT_OCR_PROVIDER=azure`; never expose provider
keys through `VITE_*`. Keep provider-specific payloads outside the client contract.

## Free replacement stack

| Capability | Default | Runtime API cost | Notes |
| --- | --- | ---: | --- |
| Receipt and label text | PaddleOCR.js / PP-OCRv5 | $0 | Apache 2.0 and runs in-browser; lazy-load models in a worker. |
| OCR baseline | Tesseract.js | $0 | Useful as a benchmark, not the preferred receipt engine. |
| Product identity | Barcode + Open Food Facts | $0 | Cache results and respect 15 product reads/min/IP. |
| Receipt shorthand | Existing local resolver | $0 | Preserve raw text; ambiguous lines remain review-only. |
| Expiry/storage rules | Existing local shelf-life rules | $0 | Deterministic and available offline. |
| Recipe matching | Local recipe catalogue | $0 | Already migrated in the working tree. |
| Voice intent | Local parser | $0 | The command vocabulary is finite and testable. |
| Voice output | Browser `speechSynthesis` | $0 | No Google TTS key is needed. |
| Recall lookup | openFDA + server cache | $0 | Free key supports 120,000 requests/day. |

Free does not mean resource-free: browser OCR adds a model download, CPU time, and
battery use. Cache model files, run inference off the main thread, show progress,
and retain a manual entry path for lower-powered devices.

## Supplemental provider options

| Provider | Planning price | Strength | Main tradeoff | Recommendation |
| --- | ---: | --- | --- | --- |
| Azure Document Intelligence | Assume $10/1,000 pages | Existing receipt schema, mapper, queue, and tests | Region-specific pricing; F0 is capped at 500 pages/month | Keep as initial fallback. Confirm the deployment region price. |
| Mistral OCR 4 | $4/1,000 OCR pages; $5/1,000 Document AI pages | Lowest listed page price in this comparison | General document output needs a receipt parser and accuracy benchmark | Add as the first supplemental adapter candidate. |
| AWS Textract AnalyzeExpense | $10/1,000 pages for first 1M | Structured expense fields and mature service | Same planning price as Azure and only a temporary new-customer free tier | Benchmark only if Azure accuracy is insufficient. |
| Cloudflare Whisper | $0.0005/audio minute | Very inexpensive voice fallback and daily free AI allocation | Audio leaves the device; paid Workers plan is needed above free allocation | Optional, consented speech-recognition fallback. |

Azure's public pricing page confirms a 500-page F0 tier but renders paid values by
region. The Azure figures below deliberately use a conservative planning assumption
of $0.01/page and should be replaced with the actual resource-region price before
launch. AWS lists $0.01/page for AnalyzeExpense. Mistral lists $4 per 1,000 OCR pages.

## Monthly receipt OCR estimate

Assumptions:

- 6 one-page receipt scans per monthly active user (MAU).
- Local OCR resolves 80% of scans.
- 20% use cloud fallback.
- Azure production planning rate: $0.01/page, without treating F0 as an overage credit.
- Mistral OCR 4 rate: $0.004/page.
- AWS AnalyzeExpense rate: $0.01/page.
- Hosting, database, image egress, taxes, and engineering costs are excluded.

Formula:

```text
monthly pages = MAU * 6
cloud pages = monthly pages * 20%
provider cost = cloud pages * provider page price
```

### Local-first, 20% cloud fallback

| MAU | Total pages | Cloud pages | Azure estimate | Mistral estimate | AWS estimate |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 600 | 120 | $1.20* | $0.48 | $1.20 |
| 1,000 | 6,000 | 1,200 | $12 | $4.80 | $12 |
| 10,000 | 60,000 | 12,000 | $120 | $48 | $120 |
| 50,000 | 300,000 | 60,000 | $600 | $240 | $600 |
| 100,000 | 600,000 | 120,000 | $1,200 | $480 | $1,200 |

`*` Azure F0 can cover up to 500 pages/month for a prototype, so this 120-page case
can be $0 while the resource stays on F0. F0 should be treated as a hard-cap test
tier, not as 500 free pages automatically deducted from production S0 usage.

### All-cloud comparison

| MAU | Cloud pages | Azure estimate | Mistral estimate | AWS estimate |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 600 | $6 | $2.40 | $6 |
| 1,000 | 6,000 | $60 | $24 | $60 |
| 10,000 | 60,000 | $600 | $240 | $600 |
| 50,000 | 300,000 | $3,000 | $1,200 | $3,000 |
| 100,000 | 600,000 | $6,000 | $2,400 | $6,000 |

The 80% local success target saves 80% of page-processing cost. More importantly,
it keeps most receipt images on the user's device.

## Optional cloud voice estimate

Assume 20 commands per MAU per month at 4 seconds each, or 1.33 audio minutes per
MAU. At Cloudflare Whisper's listed $0.0005 per audio minute, gross usage value is:

| MAU | Audio minutes/month | Gross model cost |
| ---: | ---: | ---: |
| 100 | 133 | $0.07 |
| 1,000 | 1,333 | $0.67 |
| 10,000 | 13,333 | $6.67 |
| 50,000 | 66,667 | $33.33 |
| 100,000 | 133,333 | $66.67 |

Cloudflare currently includes 10,000 AI neurons per day; Whisper large-v3-turbo is
listed at 46.63 neurons per audio minute. That free allocation can absorb roughly
214 audio minutes per day if no other Workers AI models consume it. Daily peaks and
the minimum paid Workers plan can change the invoice, so browser/on-device speech
should remain the default.

## Cost and privacy controls required before launch

1. Add `monthly_receipt_limit` for users and households in addition to daily limits.
2. Add a project-wide monthly page and dollar ceiling with a kill switch.
3. Set a nonzero provider price in deployment config and alert if it is missing.
4. Record local attempts, cloud fallback reason, provider, pages, latency, and cost.
5. Never auto-fallback because of an exception; ask the user before a cloud upload.
6. Strip image metadata and compress/crop locally before cloud transfer.
7. Default source-image retention to zero and keep parsed results only.
8. Cache Open Food Facts and openFDA responses server-side with bounded TTLs.
9. Rate-limit by account, household, IP hash, and project budget.
10. Show a manual correction path whenever confidence is below the acceptance gate.

## Implementation order

### Phase 0: contain exposure

1. Disable the deployed Gemini and Google TTS paths.
2. Rotate any keys that have appeared in a Vite build.
3. Set the real Azure page price and add a configuration health check.
4. Add monthly and global provider budget caps.

### Phase 1: remove Gemini without losing core workflows

1. Replace Gemini voice intent parsing with a deterministic, exported parser and tests.
2. Remove Google TTS and set Cook Mode to browser synthesis.
3. Remove the unused fact-check service; use existing local storage rules.
4. Replace single-item Gemini vision with barcode, label OCR, and manual produce entry.
5. Keep Azure receipt OCR unchanged as the server fallback during this phase.

### Phase 2: local OCR benchmark

1. Lazy-load PaddleOCR.js in a web worker.
2. Build a de-identified image corpus, not only synthetic OCR strings.
3. Measure item-line recall, date accuracy, total/merchant accuracy, latency, and review rate.
4. Keep the existing shorthand benchmark and require zero unsafe auto-accepts.
5. Enable local receipt OCR only after mobile memory and long-task checks pass.

### Phase 3: provider-neutral fallback

1. Extract the current Azure call behind `ReceiptOcrProvider`.
2. Add a Mistral OCR adapter and run both providers on the same consented corpus.
3. Add AWS only if its receipt accuracy materially exceeds the other providers.
4. Select by server environment or controlled experiment, never client input.

### Phase 4: package cleanup and proof

1. Remove `@google/genai`, `src/services/ai-client.ts`, environment examples, Vite chunks, service-worker exceptions, and stale tests.
2. Require a repository search with zero Gemini/Google TTS references.
3. Inspect the production bundle for old API hosts and key fragments.
4. Run typecheck, unit tests, receipt resolver benchmark, production build, and browser smoke tests.
5. Verify offline barcode-cache, local OCR failure, manual correction, cloud consent, quota denial, and provider outage paths.

## Acceptance gates

- No API key or provider credential is present in browser source or network requests.
- A user can add an item with all cloud providers disabled.
- Receipt and product images remain local unless the user explicitly chooses cloud retry.
- Ambiguous receipt shorthand is never silently accepted.
- Cloud fallback stays below the configured page and dollar budget.
- Provider cost records cannot default silently to zero.
- The app clearly survives provider quota, timeout, malformed output, and outage cases.
- Mistral replaces Azure only if the benchmark meets the same field accuracy and review-safety gates.

## Verification performed

- `npm run typecheck`: passed.
- Focused recipe, receipt resolver, and receipt OCR tests: 51 passed across 3 files.
- `npm run build`: passed.
- The build still emits a Gemini SDK chunk of 248.18 kB minified, 49.71 kB gzip.
- Google API key-shaped values were detected in `ai-client` and `CookMode` output chunks.
- Google AI/TTS hosts remain in the generated service worker, Cook Mode, and Gemini SDK chunks.
- Local environment files are not tracked by Git.
- No provider accuracy comparison was run because the repository does not contain a
  consented, de-identified receipt-image ground-truth corpus or alternate provider credentials.

## Source references

- [Vite environment variables and secret warning](https://vite.dev/guide/env-and-mode)
- [Azure Document Intelligence pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/)
- [Azure prebuilt receipt model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0)
- [AWS Textract pricing](https://aws.amazon.com/textract/pricing/)
- [Mistral API pricing](https://mistral.ai/pricing/api/)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [PaddleOCR and PaddleOCR.js](https://github.com/PaddlePaddle/PaddleOCR)
- [Tesseract.js](https://github.com/naptha/tesseract.js/)
- [Open Food Facts API limits and licensing](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/)
- [openFDA API limits](https://open.fda.gov/apis/authentication/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
