import type { TabType } from '../components/BottomNav';

export const routeTabs: TabType[] = [
    'inventory',
    'scan',
    'alerts',
    'shop',
    'profile',
    'stats',
    'recipes',
    'planner',
];

export function resolveTabFromHash(hashValue: string): TabType {
    const path = hashValue.replace(/^#\/?/, '').split('?')[0];
    return routeTabs.includes(path as TabType) ? path as TabType : 'inventory';
}
