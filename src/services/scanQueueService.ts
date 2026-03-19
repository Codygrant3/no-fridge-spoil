import { compressImage } from './imageCompressionService';
import { analyzeImage } from './visionService';
import type { VisionAnalysisResult } from './visionService';
import type { ScannedItem } from '../components/ReviewItems';
import { generateUUID } from '../utils/uuid';

export interface QueuedScan {
    id: string;
    file: File;
    thumbnail: string;  // Base64 preview
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: ScannedItem[];
    error?: string;
}

export class ScanQueue {
    private queue: QueuedScan[] = [];
    private processing = false;
    private onUpdate: (queue: QueuedScan[]) => void;

    constructor(onUpdate: (queue: QueuedScan[]) => void) {
        this.onUpdate = onUpdate;
    }

    async add(file: File): Promise<string> {
        const id = generateUUID();
        const thumbnail = await this.createThumbnail(file);

        const queuedItem: QueuedScan = {
            id,
            file,
            thumbnail,
            status: 'pending',
        };

        this.queue.push(queuedItem);
        this.onUpdate([...this.queue]);

        if (!this.processing) {
            this.processNext();
        }

        return id;
    }

    private async processNext(): Promise<void> {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const item = this.queue.find(i => i.status === 'pending');

        if (!item) {
            this.processing = false;
            return;
        }

        item.status = 'processing';
        this.onUpdate([...this.queue]);

        try {
            const compressed = await compressImage(item.file);
            const result = await analyzeImage(compressed);

            // Convert to ScannedItem format
            const scannedItem: ScannedItem = {
                id: generateUUID(),
                name: result.item_name,
                brand: result.brand !== 'Unknown' ? result.brand : undefined,
                category: this.getCategoryFromResult(result),
                confidence: result.confidence,
                expirationDate: result.expiration_date !== 'Unknown' ? result.expiration_date : '',
                quantity: 1,
            };

            item.status = 'completed';
            item.result = [scannedItem];
        } catch (error) {
            item.status = 'failed';
            item.error = error instanceof Error ? error.message : 'Unknown error';
        }

        this.onUpdate([...this.queue]);

        // Process next item after short delay
        setTimeout(() => this.processNext(), 500);
    }

    private getCategoryFromResult(result: VisionAnalysisResult): string {
        if (result.category === 'fresh_produce') return 'Produce Section';
        if (result.brand?.toLowerCase().includes('milk') || result.item_name.toLowerCase().includes('milk')) {
            return 'Dairy Section';
        }
        if (result.item_name.toLowerCase().includes('chicken') || result.item_name.toLowerCase().includes('beef')) {
            return 'Meat & Poultry';
        }
        return 'Grocery';
    }

    private async createThumbnail(file: File): Promise<string> {
        const MAX_THUMB = 120; // px — small thumbnail for queue preview
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(MAX_THUMB / img.width, MAX_THUMB / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(url); resolve(''); return; }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
            img.src = url;
        });
    }

    getQueue(): QueuedScan[] {
        return [...this.queue];
    }

    getAllResults(): ScannedItem[] {
        return this.queue
            .filter(i => i.status === 'completed' && i.result)
            .flatMap(i => i.result!);
    }

    getCompletedCount(): number {
        return this.queue.filter(i => i.status === 'completed').length;
    }

    clear(): void {
        this.queue = [];
        this.onUpdate([]);
    }
}
