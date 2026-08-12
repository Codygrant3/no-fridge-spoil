import { receiptShorthandCorpus } from '../src/__tests__/fixtures/receiptShorthandCorpus';
import { resolveReceiptItem } from '../src/services/receiptItemResolver';

function key(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const labeledItems = receiptShorthandCorpus.filter(testCase => testCase.expectedName && !testCase.expectedAdjustment);
const rawExactMatches = labeledItems.filter(testCase => key(testCase.rawDescription) === key(testCase.expectedName)).length;

const genericResults = receiptShorthandCorpus.map(testCase => ({
  testCase,
  result: resolveReceiptItem(testCase.rawDescription, {
    sourceLine: testCase.sourceLine,
  }),
}));

const storeAwareResults = receiptShorthandCorpus.map(testCase => ({
  testCase,
  result: resolveReceiptItem(testCase.rawDescription, {
    merchantName: testCase.merchantName,
    sourceLine: testCase.sourceLine,
  }),
}));

const fullResults = receiptShorthandCorpus.map(testCase => ({
  testCase,
  result: resolveReceiptItem(testCase.rawDescription, {
    merchantName: testCase.merchantName,
    sourceLine: testCase.sourceLine,
    learnedAliases: testCase.learnedAliases,
    catalogCandidates: testCase.catalogCandidates,
  }),
}));

function identityMatches(
  entries: typeof fullResults,
): number {
  return entries
    .filter(({ testCase }) => testCase.expectedName && !testCase.expectedAdjustment)
    .filter(({ testCase, result }) => (
      key(result.canonicalName) === key(testCase.expectedName)
      && (!testCase.expectedBrand || result.brand === testCase.expectedBrand)
    )).length;
}

const genericMatches = identityMatches(genericResults);
const storeAwareMatches = identityMatches(storeAwareResults);
const fullMatches = identityMatches(fullResults);
const resolvedLabeledItems = fullResults.filter(({ testCase }) => testCase.expectedName && !testCase.expectedAdjustment);
const autoAccepted = resolvedLabeledItems.filter(({ result }) => !result.shouldReview);
const unsafeAutoAccepted = autoAccepted.filter(({ testCase, result }) => (
  key(result.canonicalName) !== key(testCase.expectedName)
  || Boolean(testCase.expectedBrand && result.brand !== testCase.expectedBrand)
));
const ambiguousCases = fullResults.filter(({ testCase }) => !testCase.expectedName);
const ambiguousFlagged = ambiguousCases.filter(({ result }) => result.shouldReview);
const adjustments = fullResults.filter(({ testCase }) => testCase.expectedAdjustment);
const adjustmentsDetected = adjustments.filter(({ result }) => result.isLikelyAdjustment);
const metadataCases = fullResults.filter(({ testCase }) => (
  testCase.expectedPackageInfo || testCase.expectedSoldByWeight || testCase.expectedItemCode
));
const metadataCaptured = metadataCases.filter(({ testCase, result }) => (
  JSON.stringify(result.packageInfo) === JSON.stringify(testCase.expectedPackageInfo)
  && JSON.stringify(result.soldByWeight) === JSON.stringify(testCase.expectedSoldByWeight)
  && result.itemCode === testCase.expectedItemCode
));

const pct = (value: number, total: number) => total === 0 ? 0 : Math.round((value / total) * 1000) / 10;

console.log(JSON.stringify({
  corpusCases: receiptShorthandCorpus.length,
  labeledProductCases: labeledItems.length,
  rawExactMatch: {
    count: rawExactMatches,
    percent: pct(rawExactMatches, labeledItems.length),
  },
  genericTokenIdentityMatch: {
    count: genericMatches,
    percent: pct(genericMatches, labeledItems.length),
  },
  storeAwareIdentityMatch: {
    count: storeAwareMatches,
    percent: pct(storeAwareMatches, labeledItems.length),
  },
  fullLayeredIdentityMatch: {
    count: fullMatches,
    percent: pct(fullMatches, labeledItems.length),
  },
  highConfidenceAutoAccepted: {
    count: autoAccepted.length,
    percent: pct(autoAccepted.length, labeledItems.length),
  },
  unsafeAutoAccepted: unsafeAutoAccepted.length,
  ambiguousCasesFlagged: {
    count: ambiguousFlagged.length,
    total: ambiguousCases.length,
  },
  adjustmentsDetected: {
    count: adjustmentsDetected.length,
    total: adjustments.length,
  },
  metadataCaptured: {
    count: metadataCaptured.length,
    total: metadataCases.length,
  },
}, null, 2));

if (
  fullMatches !== labeledItems.length
  || unsafeAutoAccepted.length > 0
  || metadataCaptured.length !== metadataCases.length
) process.exitCode = 1;
