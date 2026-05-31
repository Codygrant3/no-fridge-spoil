import type { ReceiptAnalysisResult } from './receiptOCRService';

export interface SampleReceiptFixture {
    id: string;
    name: string;
    imageDataUrl: string;
    result: ReceiptAnalysisResult;
}

function receiptSvg(lines: string[]): string {
    const textLines = lines.map((line, index) =>
        `<text x="42" y="${70 + index * 46}" font-family="Consolas, monospace" font-size="28" fill="#111">${line}</text>`
    ).join('');

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="720" height="980" viewBox="0 0 720 980">
            <rect width="720" height="980" fill="#fbfaf6"/>
            <rect x="24" y="24" width="672" height="932" rx="12" fill="#fff" stroke="#ddd7c8" stroke-width="3"/>
            ${textLines}
        </svg>
    `)}`;
}

export const sampleReceiptFixtures: SampleReceiptFixture[] = [
    {
        id: 'fresh-market-weeknight',
        name: 'Fresh Market Weeknight',
        imageDataUrl: receiptSvg([
            'FRESH MARKET',
            'DATE 2026-05-02',
            '',
            'ORGANIC WHOLE MILK     4.99',
            'BANANAS                1.79',
            'CHICKEN BREAST         8.49',
            'DISH SOAP              3.99',
            '',
            'TOTAL                 19.26',
        ]),
        result: {
            storeName: 'Fresh Market',
            date: '2026-05-02',
            totalItemsDetected: 3,
            skippedItems: ['Dish Soap'],
            items: [
                { name: 'Organic Whole Milk', brand: 'Horizon', quantity: 1, price: '4.99', category: 'Dairy', confidence: 'High' },
                { name: 'Bananas', quantity: 6, price: '1.79', category: 'Produce', confidence: 'High' },
                { name: 'Chicken Breast', quantity: 1, price: '8.49', category: 'Meat', confidence: 'Medium' },
            ],
        },
    },
    {
        id: 'pantry-restock',
        name: 'Pantry Restock',
        imageDataUrl: receiptSvg([
            'CORNER GROCER',
            'DATE 2026-05-03',
            '',
            'BROWN RICE             3.49',
            'BLACK BEANS            2.19',
            'OAT MILK               5.29',
            'PAPER TOWELS           6.49',
        ]),
        result: {
            storeName: 'Corner Grocer',
            date: '2026-05-03',
            totalItemsDetected: 3,
            skippedItems: ['Paper Towels'],
            items: [
                { name: 'Brown Rice', quantity: 1, price: '3.49', category: 'Pantry', confidence: 'High' },
                { name: 'Black Beans', quantity: 2, price: '2.19', category: 'Pantry', confidence: 'Medium' },
                { name: 'Oat Milk', quantity: 1, price: '5.29', category: 'Dairy', confidence: 'High' },
            ],
        },
    },
    {
        id: 'produce-run',
        name: 'Produce Run',
        imageDataUrl: receiptSvg([
            'FARM STAND',
            'DATE 2026-05-04',
            '',
            'AVOCADOS               4.00',
            'ROMAINE LETTUCE        2.99',
            'STRAWBERRIES           5.99',
            'FLOWERS                8.00',
        ]),
        result: {
            storeName: 'Farm Stand',
            date: '2026-05-04',
            totalItemsDetected: 3,
            skippedItems: ['Flowers'],
            items: [
                { name: 'Avocados', quantity: 4, price: '4.00', category: 'Produce', confidence: 'High' },
                { name: 'Romaine Lettuce', quantity: 1, price: '2.99', category: 'Produce', confidence: 'High' },
                { name: 'Strawberries', quantity: 1, price: '5.99', category: 'Produce', confidence: 'Medium' },
            ],
        },
    },
];

export function getDefaultSampleReceipt(): SampleReceiptFixture {
    return sampleReceiptFixtures[0];
}
