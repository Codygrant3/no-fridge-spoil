import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let recognitionQueue: Promise<void> = Promise.resolve();

async function getWorker(): Promise<Worker> {
    if (!workerPromise) {
        workerPromise = import('tesseract.js')
            .then(({ createWorker }) => createWorker('eng', 1, {
                cacheMethod: 'write',
                logger: () => undefined,
            }))
            .catch(error => {
                workerPromise = null;
                throw error;
            });
    }
    return workerPromise;
}

export function recognizeTextLocally(image: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        recognitionQueue = recognitionQueue
            .catch(() => undefined)
            .then(async () => {
                try {
                    const worker = await getWorker();
                    const result = await worker.recognize(image);
                    resolve(result.data.text.trim());
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export async function stopLocalOcrWorker(): Promise<void> {
    if (!workerPromise) return;
    const worker = await workerPromise.catch(() => null);
    workerPromise = null;
    if (worker) await worker.terminate();
}
