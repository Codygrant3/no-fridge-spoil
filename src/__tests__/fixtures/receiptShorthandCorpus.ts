import type {
  ReceiptCatalogCandidate,
  ReceiptItemAlias,
  ReceiptPackageInfo,
  ReceiptWeightInfo,
} from '../../services/receiptItemResolver';

export interface ReceiptShorthandCase {
  id: string;
  rawDescription: string;
  merchantName?: string;
  sourceLine?: string;
  expectedName?: string;
  expectedBrand?: string;
  expectedPackageInfo?: ReceiptPackageInfo;
  expectedSoldByWeight?: ReceiptWeightInfo;
  expectedItemCode?: string;
  expectedAdjustment?: boolean;
  expectedReview: boolean;
  learnedAliases?: readonly ReceiptItemAlias[];
  catalogCandidates?: readonly ReceiptCatalogCandidate[];
}

export const receiptShorthandCorpus: readonly ReceiptShorthandCase[] = [
  {
    id: 'dairy-organic-whole-milk',
    rawDescription: 'ORG WHL MLK 1 GAL',
    expectedName: 'Organic Whole Milk',
    expectedPackageInfo: { size: 1, unit: 'gallon' },
    expectedReview: true,
  },
  {
    id: 'meat-boneless-skinless-chicken',
    rawDescription: 'BNLS SKNLS CHKN BRST',
    expectedName: 'Boneless Skinless Chicken Breast',
    expectedReview: true,
  },
  {
    id: 'meat-ground-beef-ratio',
    rawDescription: 'GRND BF 90/10',
    expectedName: 'Ground Beef 90/10',
    expectedReview: true,
  },
  {
    id: 'dairy-shredded-cheddar',
    rawDescription: 'SHRD CHDR CHS 8 OZ',
    expectedName: 'Shredded Cheddar Cheese',
    expectedPackageInfo: { size: 8, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'frozen-mixed-vegetables',
    rawDescription: 'FRZ MIX VEG 12OZ',
    expectedName: 'Frozen Mixed Vegetables',
    expectedPackageInfo: { size: 12, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'produce-strawberries',
    rawDescription: 'STRAWB 1LB',
    expectedName: 'Strawberries',
    expectedPackageInfo: { size: 1, unit: 'lb' },
    expectedReview: true,
  },
  {
    id: 'produce-romaine-hearts',
    rawDescription: 'RMAINE HRTS 3CT',
    expectedName: 'Romaine Hearts',
    expectedPackageInfo: { count: 3 },
    expectedReview: true,
  },
  {
    id: 'eggs-large-brown-dozen',
    rawDescription: 'LG BRN EGGS 1DZ',
    expectedName: 'Large Brown Eggs',
    expectedPackageInfo: { count: 12 },
    expectedReview: true,
  },
  {
    id: 'beverage-orange-juice',
    rawDescription: 'OJ NO PULP 52OZ',
    expectedName: 'Orange Juice No Pulp',
    expectedPackageInfo: { size: 52, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'dairy-vanilla-oat-milk',
    rawDescription: 'OAT MLK VAN 64OZ',
    expectedName: 'Oat Milk Vanilla',
    expectedPackageInfo: { size: 64, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'walmart-store-brand',
    merchantName: 'Walmart Supercenter',
    rawDescription: 'GV 2% MLK GLN',
    expectedName: '2% Milk',
    expectedBrand: 'Great Value',
    expectedPackageInfo: { size: 1, unit: 'gallon' },
    expectedReview: true,
  },
  {
    id: 'costco-store-brand',
    merchantName: 'Costco Wholesale',
    rawDescription: 'KS ORG EVOO 2PK',
    expectedName: 'Organic Extra Virgin Olive Oil',
    expectedBrand: 'Kirkland Signature',
    expectedPackageInfo: { count: 2 },
    expectedReview: true,
  },
  {
    id: 'kroger-store-brand',
    merchantName: 'Kroger',
    rawDescription: 'KRO GRK YOG VAN 32OZ',
    expectedName: 'Greek Yogurt Vanilla',
    expectedBrand: 'Kroger',
    expectedPackageInfo: { size: 32, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'household-learned-alias',
    merchantName: 'Kroger',
    rawDescription: 'SMP TRTH ORG MLK',
    expectedName: 'Simple Truth Organic Milk',
    expectedBrand: 'Simple Truth',
    expectedReview: false,
    learnedAliases: [
      {
        merchantName: 'Kroger',
        rawDescription: 'SMP TRTH ORG MLK',
        canonicalName: 'Simple Truth Organic Milk',
        brand: 'Simple Truth',
        category: 'Dairy',
      },
    ],
  },
  {
    id: 'produce-code-learned-alias',
    merchantName: 'Neighborhood Farm Stand',
    rawDescription: '4011 BNNA',
    expectedName: 'Bananas',
    expectedItemCode: '4011',
    expectedReview: false,
    learnedAliases: [
      {
        merchantName: 'Neighborhood Farm Stand',
        rawDescription: '4011 BNNA',
        canonicalName: 'Bananas',
        category: 'Produce',
      },
    ],
  },
  {
    id: 'catalog-exact-alias',
    merchantName: 'Corner Grocer',
    rawDescription: 'TSTY BTE MDRS LNTL',
    expectedName: 'Madras Lentils',
    expectedBrand: 'Tasty Bite',
    expectedReview: false,
    catalogCandidates: [
      {
        merchantName: 'Corner Grocer',
        name: 'Madras Lentils',
        brand: 'Tasty Bite',
        category: 'Pantry',
        aliases: ['TSTY BTE MDRS LNTL'],
        verified: true,
        source: 'curated-test-catalog',
      },
    ],
  },
  {
    id: 'normal-description-milk',
    rawDescription: 'Organic Whole Milk',
    expectedName: 'Organic Whole Milk',
    expectedReview: false,
  },
  {
    id: 'normal-description-bananas',
    rawDescription: 'BANANAS',
    expectedName: 'Bananas',
    expectedReview: false,
  },
  {
    id: 'non-food-dish-soap',
    rawDescription: 'DSH SOAP',
    expectedName: 'Dish Soap',
    expectedReview: true,
  },
  {
    id: 'non-food-paper-towels',
    rawDescription: 'PPR TWL 6PK',
    expectedName: 'Paper Towels',
    expectedPackageInfo: { count: 6 },
    expectedReview: true,
  },
  {
    id: 'weighted-produce',
    rawDescription: 'BANANAS',
    sourceLine: 'BANANAS 2.43 LB @ 0.59/LB 1.43',
    expectedName: 'Bananas',
    expectedSoldByWeight: { value: 2.43, unit: 'lb' },
    expectedReview: false,
  },
  {
    id: 'beverage-club-soda',
    rawDescription: 'CLB SODA 1L',
    expectedName: 'Club Soda',
    expectedPackageInfo: { size: 1, unit: 'l' },
    expectedReview: true,
  },
  {
    id: 'deli-sliced-turkey',
    rawDescription: 'SLCD TURK BRST 9OZ',
    expectedName: 'Sliced Turkey Breast',
    expectedPackageInfo: { size: 9, unit: 'oz' },
    expectedReview: true,
  },
  {
    id: 'ambiguous-green-or-grain-mix',
    rawDescription: 'GRN MIX',
    expectedReview: true,
    catalogCandidates: [
      { name: 'Green Salad Mix', category: 'Produce' },
      { name: 'Ancient Grain Mix', category: 'Pantry' },
    ],
  },
  {
    id: 'unknown-retailer-code',
    rawDescription: 'XJ9 4837',
    expectedReview: true,
  },
  {
    id: 'manufacturer-coupon',
    rawDescription: 'MFR CPN',
    expectedName: 'Manufacturer Coupon',
    expectedAdjustment: true,
    expectedReview: true,
  },
  {
    id: 'loyalty-discount',
    rawDescription: 'LOYALTY DISC',
    expectedName: 'Loyalty Discount',
    expectedAdjustment: true,
    expectedReview: true,
  },
  {
    id: 'dairy-cream-cheese',
    rawDescription: 'CR CHS',
    expectedName: 'Cream Cheese',
    expectedReview: true,
  },
] as const;
