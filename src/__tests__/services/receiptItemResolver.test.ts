import { describe, expect, it } from 'vitest';
import { receiptShorthandCorpus } from '../fixtures/receiptShorthandCorpus';
import { resolveReceiptItem } from '../../services/receiptItemResolver';

describe('receiptItemResolver', () => {
  it.each(receiptShorthandCorpus.filter(testCase => testCase.expectedName))(
    'resolves $id without discarding the original description',
    (testCase) => {
      const result = resolveReceiptItem(testCase.rawDescription, {
        merchantName: testCase.merchantName,
        sourceLine: testCase.sourceLine,
        learnedAliases: testCase.learnedAliases,
        catalogCandidates: testCase.catalogCandidates,
      });

      expect(result.originalName).toBe(testCase.rawDescription);
      expect(result.canonicalName).toBe(testCase.expectedName);
      expect(result.brand).toBe(testCase.expectedBrand);
      expect(result.packageInfo).toEqual(testCase.expectedPackageInfo);
      expect(result.soldByWeight).toEqual(testCase.expectedSoldByWeight);
      expect(result.itemCode).toBe(testCase.expectedItemCode);
      expect(result.isLikelyAdjustment).toBe(testCase.expectedAdjustment ?? false);
      expect(result.shouldReview).toBe(testCase.expectedReview);
    },
  );

  it('does not auto-resolve ambiguous or unknown descriptions', () => {
    for (const testCase of receiptShorthandCorpus.filter(testCase => !testCase.expectedName)) {
      const result = resolveReceiptItem(testCase.rawDescription, {
        merchantName: testCase.merchantName,
        sourceLine: testCase.sourceLine,
        learnedAliases: testCase.learnedAliases,
        catalogCandidates: testCase.catalogCandidates,
      });

      expect(result.shouldReview, testCase.id).toBe(true);
      expect(result.confidence, testCase.id).toBe('Low');
    }
  });

  it('offers alternatives without choosing between tied catalog candidates', () => {
    const testCase = receiptShorthandCorpus.find(entry => entry.id === 'ambiguous-green-or-grain-mix');
    expect(testCase).toBeDefined();

    const result = resolveReceiptItem(testCase!.rawDescription, {
      catalogCandidates: testCase!.catalogCandidates,
    });

    expect(result.alternatives).toHaveLength(2);
    expect(result.alternatives).toEqual(expect.arrayContaining(['Ancient Grain Mix', 'Green Salad Mix']));
    expect(result.unresolvedTokens).toContain('GRN');
    expect(result.shouldReview).toBe(true);
  });

  it('scopes learned aliases to the matching merchant', () => {
    const alias = {
      merchantName: 'Kroger',
      rawDescription: 'HOUSE MLK',
      canonicalName: 'Kroger Whole Milk',
    };

    expect(resolveReceiptItem('HOUSE MLK', {
      merchantName: 'Kroger',
      learnedAliases: [alias],
    }).method).toBe('learned-alias');

    const otherStore = resolveReceiptItem('HOUSE MLK', {
      merchantName: 'Costco',
      learnedAliases: [alias],
    });
    expect(otherStore.method).not.toBe('learned-alias');
    expect(otherStore.shouldReview).toBe(true);
  });

  it('keeps weighted quantity separate from inventory package count', () => {
    const result = resolveReceiptItem('BANANAS', {
      sourceLine: 'BANANAS 2.43 LB @ 0.59/LB 1.43',
    });

    expect(result.soldByWeight).toEqual({ value: 2.43, unit: 'lb' });
    expect(result.packageInfo).toBeUndefined();
  });

  it('keeps unverified barcode catalog results in review', () => {
    const result = resolveReceiptItem('036000291452', {
      catalogCandidates: [{
        name: 'Community Catalog Product',
        aliases: ['036000291452'],
        barcode: '036000291452',
        source: 'open-food-facts',
        verified: false,
      }],
    });

    expect(result).toMatchObject({
      canonicalName: 'Community Catalog Product',
      method: 'barcode-lookup',
      confidence: 'Medium',
      shouldReview: true,
      autoAccepted: false,
      barcode: '036000291452',
    });
  });

  it('auto-accepts only exact household and verified catalog aliases', () => {
    const verified = resolveReceiptItem('CAT MILK', {
      catalogCandidates: [{
        name: 'Verified Milk',
        aliases: ['CAT MILK'],
        verified: true,
        source: 'internal-catalog',
      }],
    });

    expect(verified).toMatchObject({ method: 'catalog-alias', autoAccepted: true, shouldReview: false });
    expect(resolveReceiptItem('ORG MLK')).toMatchObject({ autoAccepted: false, shouldReview: true });
  });

  it('scopes new store-brand tokens to the matching merchant', () => {
    const target = resolveReceiptItem('GG ORG MLK', { merchantName: 'Target' });
    expect(target).toMatchObject({
      brand: 'Good & Gather',
      method: 'store-alias',
      shouldReview: true,
      autoAccepted: false,
    });

    const walmart = resolveReceiptItem('GG ORG MLK', { merchantName: 'Walmart' });
    expect(walmart.brand).toBeUndefined();
    expect(walmart.method).not.toBe('store-alias');
    expect(walmart.shouldReview).toBe(true);
    expect(walmart.autoAccepted).toBe(false);

    const safeway = resolveReceiptItem('OO ORG MLK', { merchantName: 'Safeway' });
    expect(safeway).toMatchObject({
      brand: 'O Organics',
      method: 'store-alias',
      shouldReview: true,
      autoAccepted: false,
    });

    const costco = resolveReceiptItem('OO ORG MLK', { merchantName: 'Costco' });
    expect(costco.brand).toBeUndefined();
    expect(costco.method).not.toBe('store-alias');
  });
});
