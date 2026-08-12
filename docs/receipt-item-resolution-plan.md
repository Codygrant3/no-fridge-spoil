# Receipt Item Resolution Plan

## Goal

Turn short, store-specific receipt descriptions into useful inventory data without silently inventing a product. The original OCR description and receipt line remain the source of truth.

## Proposed Data Captured Per Line

- Original OCR name and complete source line
- Canonical product name and brand
- Category and storage/shelf-life lookup key
- Package count, package size, and unit
- Sold-by-weight amount kept separate from inventory quantity
- Retailer item code or PLU candidate
- Unit price and line total from the OCR provider
- Resolution method, field confidence, unresolved tokens, and alternatives
- User-confirmed correction suitable for a household/store alias

## Layered Resolution

1. **Confirmed household alias:** Exact normalized merchant and receipt-description match. This is the only user-trained result eligible for immediate high-confidence acceptance.
2. **Exact catalog alias:** Use a barcode, retailer item code, or previously verified catalog alias when the match is unique.
3. **Store-aware tokens:** Interpret a brand token only when the merchant context supports it, such as `GV` at Walmart or `KS` at Costco.
4. **Conservative shorthand expansion:** Expand stable grocery terms such as `MLK`, `BNLS`, and `CHKN`. Ambiguous tokens remain unresolved.
5. **Candidate ranking:** Rank household history and catalog candidates, but require user review for fuzzy matches.
6. **Manual review:** Show the raw line, proposed name, confidence, and up to three alternatives. Never auto-accept a tied or low-confidence result.

## Privacy Boundary

- Run normalization and household-alias lookup locally or in the authenticated app backend.
- Do not send full receipt images or household purchase history to an additional language-model provider.
- If a server-side language model is evaluated later, send only the minimum redacted line-item text, require structured output, rate limit it, and keep every result review-only until measured on a consented real-receipt corpus.
- Store learned aliases by household and normalized merchant. Do not create a cross-household correction dictionary from private purchase data.

## Evaluation Gates

- Zero incorrect high-confidence auto-accepts in the test and pilot corpora
- At least 95% of ambiguous lines routed to review
- Original OCR evidence retained for every transformed name
- Weighted quantities never written as fractional inventory counts
- Non-item lines such as coupons and discounts identified before inventory creation
- Accuracy reported separately by retailer and by resolution method

## Rollout

1. Run the deterministic resolver in shadow mode and log only resolution metadata, not raw receipt text.
2. Collect opt-in, user-confirmed corrections with merchant scope.
3. Enable high-confidence household aliases first.
4. Enable medium-confidence proposals in the review screen, never as silent changes.
5. Add barcode/retailer catalog enrichment where a stable identifier is available.
6. Consider custom Azure models only for retailers with enough consented examples and repeatable layouts.

