import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, Barcode, Camera, Check, ChevronLeft, ImagePlus, Layers3, Loader2, Search, Settings2, Trash2, X } from 'lucide-react';
import type { VisionAnalysisResult } from '../services/visionService';
import { analyzeImage } from '../services/visionService';
import { ReviewItems, type ScannedItem } from '../components/ReviewItems';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { generateUUID } from '../utils/uuid';
import { compressImage, compressReceiptImage } from '../services/imageCompressionService';
import {
    analyzeReceipt,
    checkReceiptOcrHealth,
    classifyReceiptOcrError,
    clearQueuedReceiptScan,
    getReceiptOcrDiagnostics,
    getQueuedReceiptScans,
    queueReceiptScan,
    updateQueuedReceiptScan,
    type QueuedReceiptScan,
    type ReceiptAnalysisResult,
    type ReceiptJobProgressStatus,
} from '../services/receiptOCRService';
import { ScanQueue, type QueuedScan } from '../services/scanQueueService';
import { getShelfLifeDefaults, estimateExpirationDate } from '../services/sealedShelfLifeService';
import { getDefaultSampleReceipt } from '../services/sampleReceiptService';
import { checkReceiptImageQuality, type ReceiptImageQualityIssue } from '../services/receiptImageQualityService';
import {
    clearReceiptPrivacyData,
    clearReceiptPreviews,
    deleteReceiptHistoryEntry,
    getReceiptHistory,
    getReceiptPrivacySettings,
    saveReceiptHistory,
    setReceiptPrivacySettings,
    type ReceiptHistoryEntry,
    type ReceiptPrivacySettings,
} from '../services/receiptHistoryService';

type ReceiptStepStatus = 'idle' | 'active' | 'done' | 'error';
type ReceiptSource = 'camera' | 'gallery' | 'sample';

const initialReceiptSteps: Record<string, ReceiptStepStatus> = {
    uploaded: 'idle',
    compressed: 'idle',
    sent: 'idle',
    parsed: 'idle',
    review: 'idle',
};

interface ScanProps {
    onBack?: () => void;
}

function getCameraErrorMessage(error: unknown): string {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Camera access is blocked. Allow camera permission in your browser, or choose a photo instead.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No camera was found on this device. Choose a photo from your gallery instead.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'The camera is being used by another app. Close it there and try again, or choose a photo.';
    }
    return 'The camera could not start. Try again or choose a photo from your gallery.';
}

function ReceiptHistoryCard({
    entry,
    onDelete,
}: {
    entry: ReceiptHistoryEntry;
    onDelete: (id: string) => Promise<void>;
}) {
    const [expanded, setExpanded] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [deleteArmed, setDeleteArmed] = useState(false);
    const hasPreview = Boolean(entry.previewBlob || entry.previewUrl);

    useEffect(() => {
        return () => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [blobUrl]);

    const togglePreview = () => {
        if (expanded) {
            setExpanded(false);
            setBlobUrl(null);
            return;
        }
        if (entry.previewBlob) setBlobUrl(URL.createObjectURL(entry.previewBlob));
        setExpanded(true);
    };

    const scannedAt = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(entry.scannedAt));
    const previewSource = blobUrl || entry.previewUrl;

    return (
        <article className="rounded-xl bg-[var(--bg-tertiary)] p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-white text-xs font-bold">{entry.storeName || 'Receipt scan'}</p>
                    <p className="text-[var(--text-muted)] text-[10px]">{scannedAt}</p>
                    <p className="text-[var(--text-muted)] text-[10px]">
                        {entry.itemCount} items · {entry.status} · {entry.cacheHit ? 'cache hit' : 'fresh OCR'}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    {hasPreview && (
                        <button
                            type="button"
                            className="rounded-md border border-[var(--border-color)] px-2 py-1 text-[10px] font-bold text-white"
                            aria-expanded={expanded}
                            onClick={togglePreview}
                        >
                            {expanded ? 'Hide' : 'Preview'}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`rounded-md border px-2 py-1 text-[10px] font-bold ${
                            deleteArmed
                                ? 'border-red-400/50 text-red-200'
                                : 'border-[var(--border-color)] text-[var(--text-secondary)]'
                        }`}
                        aria-label={deleteArmed
                            ? `Confirm deletion of receipt from ${entry.storeName || 'unknown store'}`
                            : `Delete receipt from ${entry.storeName || 'unknown store'}`}
                        onClick={() => {
                            if (!deleteArmed) {
                                setDeleteArmed(true);
                                return;
                            }
                            void onDelete(entry.id);
                        }}
                    >
                        {deleteArmed ? 'Confirm' : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            {expanded && previewSource && (
                <img
                    src={previewSource}
                    alt={`Receipt from ${entry.storeName || 'unknown store'}`}
                    loading="lazy"
                    decoding="async"
                    className="mt-3 max-h-48 w-full rounded-md object-contain"
                />
            )}
        </article>
    );
}

export function Scan({ onBack }: ScanProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [receiptJobStatus, setReceiptJobStatus] = useState<ReceiptJobProgressStatus>('uploading');
    const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
    const [showReview, setShowReview] = useState(false);
    const [scanMode, setScanMode] = useState<'single' | 'receipt'>('single');
    const [batchMode, setBatchMode] = useState(false);
    const [scanQueue, setScanQueue] = useState<ScanQueue | null>(null);
    const [queuedScans, setQueuedScans] = useState<QueuedScan[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [showReceiptTools, setShowReceiptTools] = useState(false);
    const [receiptSteps, setReceiptSteps] = useState(initialReceiptSteps);
    const [receiptDiagnostics, setReceiptDiagnostics] = useState(() => getReceiptOcrDiagnostics());
    const [isCheckingReceiptHealth, setIsCheckingReceiptHealth] = useState(false);
    const [queuedReceipts, setQueuedReceipts] = useState<QueuedReceiptScan[]>([]);
    const [lastReceiptFile, setLastReceiptFile] = useState<File | null>(null);
    const [receiptQualityIssues, setReceiptQualityIssues] = useState<ReceiptImageQualityIssue[]>([]);
    const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryEntry[]>([]);
    const [receiptPrivacy, setReceiptPrivacy] = useState<ReceiptPrivacySettings>(() => getReceiptPrivacySettings());
    const [receiptDeleteArmed, setReceiptDeleteArmed] = useState(false);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const [historyQuery, setHistoryQuery] = useState('');
    const [receiptMeta, setReceiptMeta] = useState<{
        storeName?: string;
        date?: string;
        skippedItems?: string[];
        source?: ReceiptSource;
        previewUrl?: string;
        cacheHit?: boolean;
        estimatedCostCents?: number;
        fieldConfidence?: ReceiptAnalysisResult['fieldConfidence'];
        resolutionMode?: ReceiptAnalysisResult['resolutionMode'];
        resolutionStats?: ReceiptAnalysisResult['resolutionStats'];
    } | undefined>();

    // Live camera state
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraNotice, setCameraNotice] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Input refs
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const receiptToolsTriggerRef = useRef<HTMLButtonElement>(null);
    const receiptToolsDialogRef = useRef<HTMLElement>(null);
    const receiptToolsCloseRef = useRef<HTMLButtonElement>(null);

    // Check for camera support (HTTPS required for getUserMedia)
    // Initialize directly to avoid setState in effect
    const supportsLiveVideo = typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function';

    const refreshQueuedReceipts = useCallback(async () => {
        setQueuedReceipts(await getQueuedReceiptScans());
    }, []);

    const refreshReceiptHistory = useCallback(async () => {
        setReceiptHistory(await getReceiptHistory());
    }, []);

    const filteredReceiptHistory = useMemo(() => {
        const query = historyQuery.trim().toLowerCase();
        if (!query) return receiptHistory;
        return receiptHistory.filter(entry => [
            entry.storeName,
            entry.date,
            entry.status,
            entry.source,
            new Date(entry.scannedAt).toLocaleDateString(),
        ].some(value => value?.toLowerCase().includes(query)));
    }, [historyQuery, receiptHistory]);

    useEffect(() => {
        void refreshQueuedReceipts();
        void refreshReceiptHistory();
    }, [refreshQueuedReceipts, refreshReceiptHistory]);

    useEffect(() => {
        const previewUrl = receiptMeta?.previewUrl;
        return () => {
            if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
        };
    }, [receiptMeta?.previewUrl]);

    useEffect(() => {
        if (!showReceiptTools) return;
        const dialog = receiptToolsDialogRef.current;
        const closeButton = receiptToolsCloseRef.current;
        const triggerButton = receiptToolsTriggerRef.current;
        const focusFrame = window.requestAnimationFrame(() => closeButton?.focus());
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowReceiptTools(false);
                return;
            }
            if (event.key !== 'Tab' || !dialog) return;
            const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ));
            if (controls.length === 0) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
            triggerButton?.focus();
        };
    }, [showReceiptTools]);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.onended = null;
                track.stop();
            });
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    }, []);

    // Start live camera
    const startCamera = useCallback(async () => {
        setCameraError(null);
        setCameraNotice(null);

        // Fallback for HTTP/insecure contexts where getUserMedia is undefined
        if (!navigator.mediaDevices?.getUserMedia) {
            cameraInputRef.current?.click();
            return;
        }

        try {
            stopCamera();
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });
            } catch (primaryError) {
                const name = primaryError instanceof Error ? primaryError.name : '';
                if (name !== 'OverconstrainedError') throw primaryError;
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.onended = () => {
                        streamRef.current = null;
                        setCameraActive(false);
                        setCameraError('The camera stopped. Try again or choose a photo from your gallery.');
                    };
                }
                setCameraActive(true);
            } else {
                stream.getTracks().forEach(track => track.stop());
            }
        } catch (err) {
            console.error('Camera error:', err);
            setCameraError(getCameraErrorMessage(err));
        }
    }, [stopCamera]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, [stopCamera]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'hidden' || !streamRef.current) return;
            stopCamera();
            setCameraNotice('Camera paused while the app was in the background. Resume when you are ready.');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [stopCamera]);

    const toggleBatchMode = useCallback(() => {
        setBatchMode(prev => {
            const next = !prev;
            if (next) {
                setScanQueue(new ScanQueue((queue) => setQueuedScans(queue)));
            } else {
                setScanQueue(current => {
                    current?.clear();
                    return null;
                });
                setQueuedScans([]);
            }
            return next;
        });
    }, []);

    const selectScanMode = useCallback((mode: 'single' | 'receipt') => {
        stopCamera();
        setScanMode(mode);
        if (mode === 'receipt') {
            scanQueue?.clear();
            setScanQueue(null);
            setQueuedScans([]);
            setBatchMode(false);
        }
        setShowReceiptTools(false);
        setError(null);
        setCameraError(null);
        setCameraNotice(null);
        setReceiptQualityIssues([]);
    }, [scanQueue, stopCamera]);

    useEffect(() => {
        if (!showReview) return;
        const main = document.querySelector<HTMLElement>('.editorial-main');
        if (main) main.scrollTop = 0;
    }, [showReview]);

    const getCategoryFromResult = useCallback((result: VisionAnalysisResult): string => {
        if (result.category === 'fresh_produce') return 'Produce Section';
        if (result.brand?.toLowerCase().includes('milk') || result.item_name.toLowerCase().includes('milk')) return 'Dairy Section';
        if (result.item_name.toLowerCase().includes('chicken') || result.item_name.toLowerCase().includes('beef')) return 'Meat & Poultry';
        return 'Grocery';
    }, []);

    const parseResultToItems = useCallback((result: VisionAnalysisResult): ScannedItem[] => {
        return [{
            id: generateUUID(),
            name: result.item_name,
            brand: result.brand !== 'Unknown' ? result.brand : undefined,
            category: getCategoryFromResult(result),
            confidence: result.confidence,
            expirationDate: result.expiration_date !== 'Unknown' ? result.expiration_date : '',
            quantity: 1,
            imageUrl: undefined,
        }];
    }, [getCategoryFromResult]);

    const markReceiptStep = useCallback((step: keyof typeof initialReceiptSteps, status: ReceiptStepStatus) => {
        setReceiptSteps(prev => ({ ...prev, [step]: status }));
    }, []);

    const mapReceiptResultToItems = useCallback((receiptResult: ReceiptAnalysisResult): ScannedItem[] => {
        return receiptResult.items.map(item => ({
            id: generateUUID(),
            name: item.name,
            originalName: item.originalName ?? item.name,
            brand: item.brand,
            category: getShelfLifeDefaults(item.name)?.category || item.category,
            confidence: item.confidence,
            price: item.price,
            fieldConfidence: item.fieldConfidence,
            expirationDate: '',
            quantity: item.quantity,
            sourceLine: item.sourceLine,
            sourceRegion: item.sourceRegion,
            resolution: item.resolution,
            resolutionDecision: item.resolution?.autoAccepted ? 'auto' : undefined,
        }));
    }, []);

    const buildReceiptPreview = useCallback((file: File): string | undefined => {
        return URL.createObjectURL(file);
    }, []);

    const runReceiptHealthCheck = useCallback(async () => {
        setIsCheckingReceiptHealth(true);
        try {
            setReceiptDiagnostics(await checkReceiptOcrHealth());
        } finally {
            setIsCheckingReceiptHealth(false);
        }
    }, []);

    const processImage = useCallback(async (
        file: File,
        source: ReceiptSource = 'gallery',
        queueOnFailure = true,
    ): Promise<boolean> => {
        setIsScanning(true);
        setProgress(0);
        setReceiptJobStatus('uploading');
        setError(null);
        stopCamera();
        setReceiptMeta(undefined);
        if (scanMode === 'receipt') {
            setLastReceiptFile(file);
            const quality = await checkReceiptImageQuality(file);
            setReceiptQualityIssues(quality.issues);
            if (!quality.ok) {
                setIsScanning(false);
                setError(quality.issues.map(issue => issue.message).join(' '));
                setReceiptSteps({ ...initialReceiptSteps, uploaded: 'error' });
                return false;
            }
        }
        if (scanMode === 'receipt') {
            setReceiptSteps({ ...initialReceiptSteps, uploaded: 'done', compressed: 'active' });
            setReceiptDiagnostics(getReceiptOcrDiagnostics());
        }

        // Compress image based on scan mode
        const compressedFile = scanMode === 'receipt'
            ? await compressReceiptImage(file)
            : await compressImage(file);
        if (scanMode === 'receipt') {
            markReceiptStep('compressed', 'done');
            markReceiptStep('sent', 'active');
        }

        // Progress simulation
        const progressInterval = setInterval(() => {
            setProgress(prev => Math.min(prev + 10, 85));
        }, 200);

        try {
            if (scanMode === 'receipt') {
                // RECEIPT MODE - Process entire receipt
                const receiptResult = await analyzeReceipt(compressedFile, {
                    cloudConsent: receiptPrivacy.cloudOcrConsent,
                    onProgress: job => {
                        setReceiptJobStatus(job.status);
                        if (job.status === 'queued') {
                            markReceiptStep('sent', 'done');
                            markReceiptStep('parsed', 'active');
                            setProgress(value => Math.max(value, 45));
                        } else if (job.status === 'processing') {
                            setProgress(value => Math.max(value, 60));
                        } else if (job.status === 'retrying') {
                            setProgress(value => Math.max(value, 70));
                        } else if (job.status === 'completed') {
                            setProgress(100);
                        }
                    },
                });
                markReceiptStep('sent', 'done');
                markReceiptStep('parsed', 'done');
                clearInterval(progressInterval);
                setProgress(100);

                const items = mapReceiptResultToItems(receiptResult);
                const previewUrl = buildReceiptPreview(file);

                setScannedItems(items);
                setReceiptMeta({
                    storeName: receiptResult.storeName,
                    date: receiptResult.date,
                    skippedItems: receiptResult.skippedItems,
                    source,
                    previewUrl,
                    cacheHit: receiptResult.cacheHit,
                    estimatedCostCents: receiptResult.estimatedCostCents,
                    fieldConfidence: receiptResult.fieldConfidence,
                    resolutionMode: receiptResult.resolutionMode,
                    resolutionStats: receiptResult.resolutionStats,
                });
                await saveReceiptHistory(receiptResult, {
                    source,
                    previewBlob: file,
                    cacheHit: receiptResult.cacheHit,
                });
                await refreshReceiptHistory();
            } else {
                // SINGLE ITEM MODE - Process single item
                const result = await analyzeImage(compressedFile);
                clearInterval(progressInterval);
                setProgress(100);

                const items = parseResultToItems(result);
                setScannedItems(items);
            }

            setTimeout(() => {
                setIsScanning(false);
                if (scanMode === 'receipt') {
                    markReceiptStep('review', 'done');
                }
                setShowReview(true);
            }, 300);
            return true;
        } catch (err) {
            console.error('Scan failed:', err);
            clearInterval(progressInterval);
            setIsScanning(false);
            setProgress(0);

            const error = err as Error;
            let userMessage = 'This item could not be analyzed. Try another photo or enter it manually.';
            if (scanMode === 'receipt') {
                const diagnostics = classifyReceiptOcrError(error);
                userMessage = diagnostics.message;
                setReceiptDiagnostics(diagnostics);
                setReceiptSteps(prev => {
                    const activeStep = Object.entries(prev).find(([, status]) => status === 'active')?.[0];
                    return activeStep ? { ...prev, [activeStep]: 'error' } : { ...prev, parsed: 'error' };
                });
                if (queueOnFailure && (lastReceiptFile || file)) {
                    queueReceiptScan(file, diagnostics.message)
                        .then(refreshQueuedReceipts)
                        .catch(queueError => console.warn('Receipt queue failed:', queueError));
                }
            }

            setError(`Scan failed: ${userMessage}`);
            return false;
        }
    }, [stopCamera, parseResultToItems, scanMode, markReceiptStep, mapReceiptResultToItems, buildReceiptPreview, lastReceiptFile, refreshQueuedReceipts, refreshReceiptHistory, receiptPrivacy.cloudOcrConsent]);

    const retryQueuedReceipt = useCallback(async (queued: QueuedReceiptScan) => {
        await updateQueuedReceiptScan(queued.id, {
            retryCount: (queued.retryCount || 0) + 1,
            lastRetryAt: new Date().toISOString(),
            lastError: queued.reason,
        });
        await refreshQueuedReceipts();
        const file = new File([queued.imageBlob], queued.name, { type: queued.type });
        const succeeded = await processImage(file, 'gallery', false);
        if (succeeded) {
            await clearQueuedReceiptScan(queued.id);
        } else {
            await updateQueuedReceiptScan(queued.id, {
                lastError: 'Retry failed. The receipt remains in the private queue.',
            });
        }
        await refreshQueuedReceipts();
    }, [processImage, refreshQueuedReceipts]);

    const retryAllQueuedReceipts = useCallback(async () => {
        for (const queued of await getQueuedReceiptScans()) {
            await retryQueuedReceipt(queued);
        }
    }, [retryQueuedReceipt]);

    const deleteQueuedReceipt = useCallback(async (id: string) => {
        await clearQueuedReceiptScan(id);
        await refreshQueuedReceipts();
    }, [refreshQueuedReceipts]);

    const loadSampleReceipt = useCallback(async () => {
        const sample = getDefaultSampleReceipt();
        setScanMode('receipt');
        setError(null);
        setReceiptSteps({
            uploaded: 'done',
            compressed: 'done',
            sent: 'done',
            parsed: 'done',
            review: 'done',
        });
        setReceiptDiagnostics({
            provider: 'local-sample',
            providerLabel: 'Local sample',
            configured: true,
            reachable: 'ok',
            status: 'ready',
            message: 'Sample receipt loaded locally. Cloud OCR was not called.',
        });
        setReceiptMeta({
            storeName: sample.result.storeName,
            date: sample.result.date,
            skippedItems: sample.result.skippedItems,
            source: 'sample',
            previewUrl: sample.imageDataUrl,
            cacheHit: false,
            estimatedCostCents: 0,
            fieldConfidence: sample.result.fieldConfidence,
            resolutionMode: sample.result.resolutionMode,
            resolutionStats: sample.result.resolutionStats,
        });
        await saveReceiptHistory(sample.result, {
            source: 'sample',
            previewUrl: sample.imageDataUrl,
            cacheHit: false,
        });
        await refreshReceiptHistory();
        setScannedItems(mapReceiptResultToItems(sample.result));
        setShowReceiptTools(false);
        setShowReview(true);
    }, [mapReceiptResultToItems, refreshReceiptHistory]);

    const updateReceiptPrivacy = useCallback((updates: Partial<ReceiptPrivacySettings>) => {
        const next = { ...receiptPrivacy, ...updates };
        setReceiptPrivacy(next);
        setReceiptPrivacySettings(next);
    }, [receiptPrivacy]);

    const clearReceiptData = useCallback(async () => {
        if (!receiptDeleteArmed) {
            setReceiptDeleteArmed(true);
            return;
        }
        await clearReceiptPrivacyData();
        setReceiptHistory([]);
        setQueuedReceipts([]);
        setReceiptDeleteArmed(false);
    }, [receiptDeleteArmed]);

    const clearSavedReceiptPreviews = useCallback(async () => {
        await clearReceiptPreviews();
        await refreshReceiptHistory();
    }, [refreshReceiptHistory]);

    const deleteSavedReceipt = useCallback(async (id: string) => {
        await deleteReceiptHistoryEntry(id);
        await refreshReceiptHistory();
    }, [refreshReceiptHistory]);

    // Capture photo from video stream
    const capturePhoto = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);

        // Convert to blob with slightly lower quality for faster uploads
        canvas.toBlob(async (blob) => {
            if (!blob) return;

            const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });

            if (batchMode && scanQueue) {
                // ADD TO QUEUE - CAMERA STAYS OPEN
                await scanQueue.add(file);
            } else {
                // SINGLE MODE - PROCESS IMMEDIATELY
                // processImage handles compression internally, no need to double-compress
                await processImage(file, 'camera');
            }
        }, 'image/jpeg', 0.8);
    }, [processImage, batchMode, scanQueue]);

    const handleGalleryClick = () => {
        galleryInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processImage(file, 'gallery');
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const handleConfirmItems = async (items: ScannedItem[]) => {
        console.log('Adding items:', items);
        setShowReview(false);
        setScannedItems([]);
    };

    // Handle barcode product found
    const handleBarcodeProduct = useCallback((product: { name: string; brand: string; found: boolean }) => {
        if (!product.found) {
            setError('Product not found in database. Try scanning the item with the camera instead.');
            return;
        }
        const defaults = getShelfLifeDefaults(product.name);
        const item: ScannedItem = {
            id: generateUUID(),
            name: product.name,
            brand: product.brand !== 'Unknown' ? product.brand : undefined,
            category: defaults?.category || 'Grocery',
            confidence: 'High',
            expirationDate: defaults ? estimateExpirationDate(defaults.sealedDays) : '',
            quantity: 1,
            suggestedStorage: defaults?.defaultStorage,
            suggestedDateType: defaults?.dateType,
            autoFillConfidence: defaults?.confidence,
            wasAutoFilled: !!defaults,
        };
        setScannedItems([item]);
        setShowReview(true);
    }, []);

    if (showReview) {
        return (
            <ReviewItems
                items={scannedItems}
                receiptMeta={receiptMeta}
                onConfirm={handleConfirmItems}
                onScanAnother={() => {
                    setShowReview(false);
                    setScannedItems([]);
                    setReceiptMeta(undefined);
                    setScanMode('receipt');
                }}
                onClose={() => {
                    setShowReview(false);
                    setScannedItems([]);
                }}
            />
        );
    }

    return (
        <div className={`market-scan-page ${scanMode === 'receipt' ? 'is-receipt-mode' : ''} min-h-full bg-[var(--bg-primary)] flex flex-col`}>
            {/* Barcode Scanner Modal */}
            <BarcodeScanner
                isOpen={showBarcodeScanner}
                onClose={() => setShowBarcodeScanner(false)}
                onProductFound={handleBarcodeProduct}
            />

            {/* Hidden elements */}
            <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={galleryInputRef}
                onChange={handleFileChange}
            />
            <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={cameraInputRef}
                onChange={handleFileChange}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Header */}
            <header className="market-scan-toolbar flex items-center justify-between p-4 pt-12">
                <button
                    type="button"
                    onClick={() => { stopCamera(); onBack?.(); }}
                    className="w-10 h-10 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center border border-[var(--border-color)] inventory-card"
                    aria-label="Back to home"
                >
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>

                {/* SCAN MODE TOGGLE */}
                <div className="market-mode-toggle" role="tablist" aria-label="Scan type">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={scanMode === 'single'}
                        onClick={() => selectScanMode('single')}
                        disabled={isScanning}
                        className={scanMode === 'single' ? 'is-active' : ''}
                    >
                        Single Item
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={scanMode === 'receipt'}
                        onClick={() => selectScanMode('receipt')}
                        disabled={isScanning}
                        className={scanMode === 'receipt' ? 'is-active' : ''}
                    >
                        Receipt
                    </button>
                </div>

                {scanMode === 'receipt' ? (
                    <button
                        ref={receiptToolsTriggerRef}
                        type="button"
                        onClick={() => setShowReceiptTools(true)}
                        className="market-icon-button"
                        aria-label="Receipt settings and scan history"
                        aria-haspopup="dialog"
                        aria-expanded={showReceiptTools}
                        aria-controls="receipt-tools-dialog"
                        title="Receipt settings and history"
                    >
                        <Settings2 className="w-5 h-5" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => { stopCamera(); setShowBarcodeScanner(true); }}
                        className="market-icon-button"
                        aria-label="Open barcode scanner"
                        title="Barcode scanner"
                    >
                        <Barcode className="w-5 h-5" />
                    </button>
                )}
            </header>

            {/* Instructions */}
            <div className="market-scan-instructions px-4 mt-4">
                <div className="bg-[var(--bg-secondary)] backdrop-blur-sm rounded-full px-6 py-3 text-center border border-[var(--border-color)] inventory-card">
                    <p className="text-[var(--text-primary)] text-sm font-medium">
                        {cameraActive
                            ? scanMode === 'receipt'
                                ? 'Capture your entire receipt with all items visible'
                                : 'Position your item in the frame and tap capture'
                            : scanMode === 'receipt'
                                ? 'Tap CAPTURE to photograph your receipt'
                                : supportsLiveVideo
                                    ? 'Tap the camera button to start scanning'
                                    : 'Tap CAPTURE to take a photo'}
                    </p>
                </div>
            </div>

            {scanMode === 'receipt' && (
                <ol className="market-receipt-journey" aria-label="Receipt scan progress">
                    {['Capture', 'Processing', 'Review'].map((label, index) => {
                        const step = index + 1;
                        const currentStep = isScanning ? 2 : 1;
                        return (
                            <li key={label} className={step === currentStep ? 'is-current' : step < currentStep ? 'is-complete' : ''} aria-current={step === currentStep ? 'step' : undefined}>
                                <span>{step}</span>
                                {label}
                            </li>
                        );
                    })}
                </ol>
            )}

            {scanMode === 'receipt' && showReceiptTools && (
                <div
                    className="market-receipt-drawer-backdrop"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setShowReceiptTools(false);
                    }}
                >
                    <aside
                        id="receipt-tools-dialog"
                        ref={receiptToolsDialogRef}
                        className="market-receipt-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="receipt-tools-heading"
                    >
                        <header>
                            <div>
                                <p className="market-kicker">Receipt intelligence</p>
                                <h2 id="receipt-tools-heading">Settings and history</h2>
                            </div>
                            <button
                                ref={receiptToolsCloseRef}
                                type="button"
                                onClick={() => setShowReceiptTools(false)}
                                aria-label="Close receipt settings"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </header>
                        <div className="market-receipt-tools space-y-3">
                    <div className="market-receipt-panel bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 inventory-card">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                                <p className="text-white text-sm font-bold">Receipt OCR setup</p>
                                <p className="text-[var(--text-secondary)] text-xs mt-1">{receiptDiagnostics.message}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                receiptDiagnostics.status === 'ready'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-orange-500/20 text-orange-300'
                            }`}>
                                {receiptDiagnostics.status}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={runReceiptHealthCheck}
                            disabled={isCheckingReceiptHealth || isScanning}
                            className="mb-3 w-full py-2 rounded-xl bg-blue-500/15 border border-blue-400/30 text-blue-200 text-xs font-bold disabled:opacity-50"
                        >
                            {isCheckingReceiptHealth ? 'Checking Azure...' : 'Check OCR health'}
                        </button>
                        <div className="grid grid-cols-5 gap-1.5">
                            {Object.entries(receiptSteps).map(([step, status]) => (
                                <div key={step} className="rounded-xl bg-[var(--bg-tertiary)] px-2 py-2 text-center">
                                    <p className={`text-[10px] font-bold uppercase ${
                                        status === 'done' ? 'text-emerald-300' :
                                        status === 'active' ? 'text-blue-300' :
                                        status === 'error' ? 'text-red-300' :
                                        'text-[var(--text-muted)]'
                                    }`}>
                                        {status}
                                    </p>
                                    <p className="text-[9px] text-[var(--text-secondary)] mt-1 capitalize">{step}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={loadSampleReceipt}
                        disabled={isScanning}
                        className="market-outline-command w-full py-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-sm font-bold disabled:opacity-50"
                    >
                        Try sample receipt
                    </button>
                    {receiptQualityIssues.length > 0 && (
                        <div className="bg-amber-500/15 border border-amber-400/30 rounded-2xl p-4 inventory-card">
                            <p className="text-amber-200 text-sm font-bold">Image quality</p>
                            <ul className="mt-2 space-y-1">
                                {receiptQualityIssues.map(issue => (
                                    <li key={issue.code} className="text-amber-100/80 text-xs">{issue.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="market-receipt-panel bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 inventory-card">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-white text-sm font-bold">Receipt privacy</p>
                                <p className="text-[var(--text-secondary)] text-xs mt-1">History: {receiptHistory.length} saved</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearReceiptData}
                                aria-pressed={receiptDeleteArmed}
                                className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-200 text-xs font-bold"
                            >
                                {receiptDeleteArmed ? 'Confirm clear' : 'Clear'}
                            </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={receiptPrivacy.saveHistory}
                                    onChange={(e) => updateReceiptPrivacy({ saveHistory: e.target.checked })}
                                />
                                Save history
                            </label>
                            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={receiptPrivacy.savePreviews}
                                    onChange={(e) => updateReceiptPrivacy({ savePreviews: e.target.checked })}
                                />
                                Save previews
                            </label>
                        </div>
                        <label className="mt-3 flex items-start gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-secondary)]">
                            <input
                                type="checkbox"
                                checked={receiptPrivacy.cloudOcrConsent}
                                onChange={(e) => updateReceiptPrivacy({ cloudOcrConsent: e.target.checked })}
                            />
                            <span>
                                Send receipt images to the configured cloud OCR provider. Leave this off to use
                                local single-item scanning and manual entry only.
                            </span>
                        </label>
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                            <label className="text-xs text-[var(--text-secondary)]">
                                Preview retention
                                <select
                                    value={receiptPrivacy.previewRetentionDays}
                                    onChange={(e) => updateReceiptPrivacy({ previewRetentionDays: Number(e.target.value) })}
                                    className="mt-1 w-full rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)] px-3 py-2 text-white"
                                >
                                    <option value={0}>Do not keep previews</option>
                                    <option value={1}>1 day</option>
                                    <option value={7}>7 days</option>
                                    <option value={30}>30 days</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={clearSavedReceiptPreviews}
                                className="self-end px-3 py-2 rounded-xl bg-slate-500/15 text-slate-200 text-xs font-bold"
                            >
                                Clear previews
                            </button>
                        </div>
                        {receiptHistory.length > 0 && (
                            <label className="mt-3 block text-xs text-[var(--text-secondary)]">
                                Search saved receipts
                                <span className="mt-1 flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3">
                                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <input
                                        type="search"
                                        value={historyQuery}
                                        onChange={event => {
                                            setHistoryQuery(event.target.value);
                                            setHistoryExpanded(false);
                                        }}
                                        placeholder="Store, date, status"
                                        className="min-w-0 flex-1 bg-transparent py-2 text-white outline-none"
                                    />
                                </span>
                            </label>
                        )}
                        {filteredReceiptHistory.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {(historyExpanded ? filteredReceiptHistory : filteredReceiptHistory.slice(0, 3))
                                    .map(entry => (
                                        <ReceiptHistoryCard
                                            key={entry.id}
                                            entry={entry}
                                            onDelete={deleteSavedReceipt}
                                        />
                                    ))}
                                {filteredReceiptHistory.length > 3 && (
                                    <button
                                        type="button"
                                        className="w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-xs font-bold text-white"
                                        aria-expanded={historyExpanded}
                                        onClick={() => setHistoryExpanded(value => !value)}
                                    >
                                        {historyExpanded ? 'Show recent only' : `Show all ${filteredReceiptHistory.length} receipts`}
                                    </button>
                                )}
                            </div>
                        )}
                        {receiptHistory.length > 0 && filteredReceiptHistory.length === 0 && (
                            <p className="mt-3 text-xs text-[var(--text-muted)]">No saved receipts match that search.</p>
                        )}
                    </div>
                    {queuedReceipts.length > 0 && (
                        <div className="market-receipt-panel bg-[var(--bg-secondary)] border border-orange-400/30 rounded-2xl p-4 inventory-card">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-white text-sm font-bold">Offline receipt queue</p>
                                    <p className="text-[var(--text-secondary)] text-xs mt-1">{queuedReceipts.length} receipt{queuedReceipts.length !== 1 ? 's' : ''} waiting to retry</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={retryAllQueuedReceipts}
                                    disabled={isScanning}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 text-xs font-bold disabled:opacity-50"
                                >
                                    Retry all
                                </button>
                            </div>
                            <div className="space-y-2">
                                {queuedReceipts.slice(0, 5).map(scan => (
                                    <div key={scan.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-tertiary)] p-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-white text-xs font-bold">{scan.name}</p>
                                            <p className="truncate text-[var(--text-muted)] text-[10px]">
                                                Last error: {scan.lastError || scan.reason}
                                            </p>
                                            <p className="text-[var(--text-muted)] text-[10px]">
                                                {scan.retryCount || 0} retr{(scan.retryCount || 0) === 1 ? 'y' : 'ies'}
                                                {scan.lastRetryAt ? ` · last ${new Date(scan.lastRetryAt).toLocaleTimeString()}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => retryQueuedReceipt(scan)}
                                                disabled={isScanning}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 text-xs font-bold disabled:opacity-50"
                                            >
                                                Retry
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteQueuedReceipt(scan.id)}
                                                disabled={isScanning}
                                                className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-200 text-xs font-bold disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                        </div>
                    </aside>
                </div>
            )}

            {/* Camera Error */}
            {cameraError && (
                <div className="px-4 mt-4">
                    <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-start gap-3 inventory-card" role="alert">
                        <AlertCircle className="w-5 h-5 text-[var(--danger-color)] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[var(--danger-color)] text-sm">{cameraError}</p>
                            <button
                                type="button"
                                onClick={startCamera}
                                className="text-red-300 text-sm underline mt-2 font-medium"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cameraNotice && (
                <div className="px-4 mt-4">
                    <div className="bg-blue-500/15 border border-blue-400/30 rounded-xl p-4 flex items-start gap-3 inventory-card" role="status">
                        <Camera className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-blue-100 text-sm">{cameraNotice}</p>
                            <button
                                type="button"
                                onClick={startCamera}
                                className="text-blue-200 text-sm underline mt-2 font-medium"
                            >
                                Resume camera
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scan Error */}
            {error && (
                <div className="px-4 mt-4">
                    <div className="bg-orange-500/20 border border-orange-500/50 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <AlertCircle className="w-5 h-5 text-[var(--warning-color)] shrink-0 mt-0.5" />
                        <p className="text-[var(--warning-color)] text-sm">{error}</p>
                        <button type="button" onClick={() => setError(null)} className="ml-auto" aria-label="Dismiss scan error">
                            <X className="w-4 h-4 text-[var(--warning-color)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Camera Viewfinder */}
            <div className="market-camera-wrap flex-1 flex items-center justify-center p-6 relative">
                <div
                    className="market-camera-frame relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-black inventory-card glow-green"
                    role="region"
                    aria-label={scanMode === 'receipt' ? 'Receipt camera preview' : 'Item camera preview'}
                >
                    {/* Frame corners */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[var(--accent-color)] rounded-tl-2xl z-20" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[var(--accent-color)] rounded-tr-2xl z-20" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[var(--accent-color)] rounded-bl-2xl z-20" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[var(--accent-color)] rounded-br-2xl z-20" />

                    {/* Keep the video target mounted so a new stream can attach before state changes. */}
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        aria-label={scanMode === 'receipt' ? 'Live receipt camera' : 'Live item camera'}
                        className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? '' : 'invisible'}`}
                    />
                    {!cameraActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-tertiary)]" aria-hidden="true">
                            <Camera className="w-12 h-12 text-[var(--accent-color)] mb-3" />
                            <p className="text-[var(--text-secondary)] text-sm font-semibold">
                                Ready to capture
                            </p>
                            <p className="text-[var(--text-muted)] text-xs mt-1">
                                {scanMode === 'receipt' ? 'Keep the full receipt inside the frame' : 'Place one food item inside the frame'}
                            </p>
                        </div>
                    )}

                    {/* Scanning overlay */}
                    {isScanning && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30" role="status" aria-live="polite">
                            <div className="bg-[var(--bg-secondary)]/95 backdrop-blur-sm px-6 py-3 rounded-full flex items-center gap-3 border border-[var(--border-color)] inventory-card">
                                <Loader2 className="w-5 h-5 text-[var(--accent-color)] animate-spin" />
                                <span className="text-[var(--accent-color)] font-bold text-sm tracking-wide">
                                    {scanMode === 'receipt'
                                        ? receiptJobStatus === 'uploading'
                                            ? 'SECURING RECEIPT'
                                            : receiptJobStatus === 'queued'
                                                ? 'RECEIPT QUEUED'
                                                : receiptJobStatus === 'retrying'
                                                    ? 'RETRYING SAFELY'
                                                    : 'READING RECEIPT'
                                        : 'SCANNING ITEM'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Scan line animation */}
                    {isScanning && (
                        <div
                            className="absolute left-4 right-4 h-0.5 bg-[var(--accent-color)] z-30"
                            style={{
                                top: `${25 + (progress * 0.5)}%`,
                                boxShadow: '0 0 10px var(--accent-color)'
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {isScanning && (
                <div className="px-6 mb-4">
                    <div className="bg-[var(--bg-secondary)] backdrop-blur-sm rounded-3xl p-5 border border-[var(--border-color)] inventory-card">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-white text-sm font-bold tracking-wide">
                                {scanMode === 'receipt'
                                    ? receiptJobStatus === 'queued'
                                        ? 'WAITING FOR RECEIPT WORKER'
                                        : receiptJobStatus === 'retrying'
                                            ? 'RETRYING RECEIPT'
                                            : 'PROCESSING RECEIPT'
                                    : 'SCANNING ITEM'}
                            </span>
                            <span className="text-[var(--accent-color)] text-sm font-bold">{progress}%</span>
                        </div>
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-200"
                                style={{ width: `${progress}%` }}
                                role="progressbar"
                                aria-label={scanMode === 'receipt' ? 'Receipt processing progress' : 'Item scan progress'}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={progress}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Queue Preview */}
            {batchMode && queuedScans.length > 0 && (
                <div className="px-6 mb-4">
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                        {queuedScans.map((scan) => (
                            <div key={scan.id} className="relative flex-shrink-0">
                                <img
                                    src={scan.thumbnail}
                                    alt="queued scan"
                                    loading="lazy"
                                    decoding="async"
                                    className="w-16 h-16 rounded-lg object-cover border-2 border-[var(--border-color)]"
                                />
                                {scan.status === 'processing' && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                                        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                                    </div>
                                )}
                                {scan.status === 'completed' && (
                                    <div className="absolute -top-1 -right-1 bg-[var(--accent-color)] rounded-full p-0.5">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                {scan.status === 'failed' && (
                                    <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5">
                                        <X className="w-3 h-3 text-white" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Batch Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                const allResults = scanQueue?.getAllResults() || [];
                                setScannedItems(allResults);
                                setShowReview(true);
                                scanQueue?.clear();
                                stopCamera();
                            }}
                            className="flex-1 py-3 bg-[var(--accent-color)] text-white rounded-xl text-sm font-bold disabled:opacity-50 action-button glow-green"
                            disabled={scanQueue?.getCompletedCount() === 0}
                        >
                            Review {scanQueue?.getCompletedCount() || 0} Items
                        </button>
                        <button
                            onClick={() => scanQueue?.clear()}
                            className="px-6 py-3 bg-[var(--bg-secondary)] text-white rounded-xl text-sm font-semibold border border-[var(--border-color)] inventory-card"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Controls */}
            <div className="market-camera-controls pb-32 px-6">
                <div className="flex items-center justify-around">
                    {/* Gallery */}
                    <button
                        type="button"
                        onClick={handleGalleryClick}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                        aria-label={scanMode === 'receipt' ? 'Choose a receipt from photos' : 'Choose an item photo'}
                    >
                        <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center border border-[var(--border-color)] inventory-card">
                            <ImagePlus className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-bold tracking-wide">GALLERY</span>
                    </button>

                    {/* Capture / Start Camera */}
                    <button
                        type="button"
                        onClick={cameraActive ? capturePhoto : startCamera}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                        aria-label={cameraActive
                            ? scanMode === 'receipt' ? 'Capture receipt photo' : 'Capture item photo'
                            : scanMode === 'receipt' ? 'Open camera for receipt' : 'Open camera for item'}
                    >
                        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg shadow-white/20 inventory-card glow-green">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${cameraActive
                                ? 'bg-[var(--accent-color)]'
                                : 'border-4 border-gray-300'
                                }`}>
                                <Camera className={`w-10 h-10 ${cameraActive ? 'text-white' : 'text-gray-600'}`} />
                            </div>
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-bold tracking-wide">
                            {cameraActive ? 'CAPTURE' : supportsLiveVideo ? 'START' : 'CAPTURE'}
                        </span>
                    </button>

                    {/* Context action / Close Camera */}
                    <button
                        type="button"
                        onClick={cameraActive
                            ? stopCamera
                            : scanMode === 'receipt'
                                ? () => setShowReceiptTools(true)
                                : toggleBatchMode}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                        aria-label={cameraActive
                            ? 'Close camera'
                            : scanMode === 'receipt'
                                ? 'Open receipt settings and history'
                                : batchMode ? 'Turn off batch scanning' : 'Turn on batch scanning'}
                    >
                        <div className={`w-16 h-16 rounded-xl flex items-center justify-center border border-[var(--border-color)] inventory-card ${cameraActive ? 'bg-[var(--danger-color)]' : batchMode ? 'bg-[var(--accent-color)] glow-green' : 'bg-[var(--bg-secondary)]'
                            }`}>
                            {cameraActive ? (
                                <X className="w-6 h-6 text-white" />
                            ) : scanMode === 'receipt' ? (
                                <Settings2 className="w-6 h-6 text-[var(--accent-color)]" />
                            ) : (
                                <Layers3 className={`w-6 h-6 ${batchMode ? 'text-white' : 'text-[var(--accent-color)]'}`} />
                            )}
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-bold tracking-wide">
                            {cameraActive ? 'CLOSE' : scanMode === 'receipt' ? 'OPTIONS' : batchMode ? 'BATCH ON' : 'BATCH'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
