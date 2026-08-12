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

export function createScanThumbnail(file: File, timeoutMs = 5_000): Promise<string> {
    const maxThumbnailSize = 120;
    return new Promise((resolve) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        let settled = false;
        let timeout = 0;
        const settle = (value: string) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            URL.revokeObjectURL(url);
            resolve(value);
        };
        timeout = window.setTimeout(() => settle(''), timeoutMs);

        image.onload = () => {
            const scale = Math.min(maxThumbnailSize / image.width, maxThumbnailSize / image.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            const context = canvas.getContext('2d');
            if (!context) {
                settle('');
                return;
            }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            settle(canvas.toDataURL('image/jpeg', 0.6));
        };
        image.onerror = () => settle('');
        image.src = url;
    });
}

export class ScanQueue {
    private queue: QueuedScan[] = [];
    private processing = false;
    private onUpdate: (queue: QueuedScan[]) => void;
    private activeController: AbortController | null = null;
    private nextTimer: number | null = null;

    constructor(onUpdate: (queue: QueuedScan[]) => void) {
        this.onUpdate = onUpdate;
    }

    async add(file: File): Promise<string> {
        const id = generateUUID();
        const thumbnail = await createScanThumbnail(file);

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
        const controller = new AbortController();
        this.activeController = controller;

        try {
            const compressed = await compressImage(item.file, controller.signal);
            controller.signal.throwIfAborted();
            const result = await analyzeImage(compressed);
            controller.signal.throwIfAborted();
            if (!this.queue.includes(item)) return;

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
            if (controller.signal.aborted || !this.queue.includes(item)) return;
            item.status = 'failed';
            item.error = error instanceof Error ? error.message : 'Unknown error';
        } finally {
            if (this.activeController === controller) this.activeController = null;
        }

        if (!this.queue.includes(item)) return;
        this.onUpdate([...this.queue]);

        // Process next item after short delay
        this.nextTimer = window.setTimeout(() => {
            this.nextTimer = null;
            void this.processNext();
        }, 500);
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
        this.activeController?.abort(new DOMException('Scan queue cleared.', 'AbortError'));
        this.activeController = null;
        if (this.nextTimer !== null) window.clearTimeout(this.nextTimer);
        this.nextTimer = null;
        this.processing = false;
        this.queue = [];
        this.onUpdate([]);
    }
}
