import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

interface BundleBudget {
  label: string;
  pattern: RegExp;
  maxBytes: number;
  minBytes?: number;
  required?: boolean;
}

interface PublicAssetBudget {
  label: string;
  path: string;
  maxBytes: number;
}

const assetsDirectory = join(process.cwd(), 'dist', 'assets');
const budgets: BundleBudget[] = [
  { label: 'main application', pattern: /^index-.*\.js$/, minBytes: 100 * 1024, maxBytes: 600 * 1024, required: true },
  { label: 'lazy local OCR', pattern: /^ocr-.*\.js$/, maxBytes: 650 * 1024, required: true },
  { label: 'barcode scanner', pattern: /^barcode-.*\.js$/, maxBytes: 400 * 1024, required: true },
  { label: 'scan screen', pattern: /^Scan-.*\.js$/, maxBytes: 180 * 1024, required: true },
  { label: 'profile screen', pattern: /^Profile-.*\.js$/, maxBytes: 90 * 1024, required: true },
  { label: 'inventory screen', pattern: /^Inventory-.*\.js$/, maxBytes: 50 * 1024, required: true },
  { label: 'shopping list screen', pattern: /^ShoppingList-.*\.js$/, maxBytes: 50 * 1024, required: true },
  { label: 'application styles', pattern: /^index-.*\.css$/, maxBytes: 160 * 1024, required: true },
];

const publicAssetBudgets: PublicAssetBudget[] = [
  { label: 'notification icon', path: 'dist/pwa-192x192.png', maxBytes: 80 * 1024 },
  { label: 'install icon', path: 'dist/pwa-512x512.png', maxBytes: 450 * 1024 },
];

async function main(): Promise<void> {
  const files = await readdir(assetsDirectory);
  const failures: string[] = [];
  const checked: string[] = [];

  for (const budget of budgets) {
    const candidateFiles = files.filter(file => budget.pattern.test(file));
    const matches: string[] = [];
    for (const file of candidateFiles) {
      const bytes = (await stat(join(assetsDirectory, file))).size;
      if (!budget.minBytes || bytes >= budget.minBytes) matches.push(file);
    }
    if (budget.required && matches.length === 0) {
      failures.push(`${budget.label}: expected bundle was not found`);
      continue;
    }
    for (const file of matches) {
      const bytes = (await stat(join(assetsDirectory, file))).size;
      checked.push(`${budget.label} ${(bytes / 1024).toFixed(1)} KB`);
      if (bytes > budget.maxBytes) {
        failures.push(
          `${budget.label}: ${(bytes / 1024).toFixed(1)} KB exceeds ${(budget.maxBytes / 1024).toFixed(0)} KB`,
        );
      }
    }
  }

  for (const budget of publicAssetBudgets) {
    const bytes = (await stat(join(process.cwd(), budget.path))).size;
    checked.push(`${budget.label} ${(bytes / 1024).toFixed(1)} KB`);
    if (bytes > budget.maxBytes) {
      failures.push(`${budget.label}: ${(bytes / 1024).toFixed(1)} KB exceeds ${(budget.maxBytes / 1024).toFixed(0)} KB`);
    }
  }

  if (failures.length > 0) {
    console.error('Bundle budget check failed:');
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Bundle budgets passed (${checked.join(', ')}).`);
}

void main().catch(error => {
  console.error('Bundle budget check could not complete.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
