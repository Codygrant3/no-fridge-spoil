export interface InventoryItem {
    id: string;
    name: string;
    brand?: string;
    expirationDate: string; // YYYY-MM-DD
    dateType: string;
    addedAt: string;
    status: 'good' | 'expiring_soon' | 'expired';
    quantity: number;
    storageLocation: 'fridge' | 'freezer' | 'pantry';
    consumedAt?: string; // For tracking waste stats
    openedDate?: string; // YYYY-MM-DD - Track when item was opened
}

export type FilterType = 'all' | 'expiring_soon' | 'expired' | 'good';
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';
