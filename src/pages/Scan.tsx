import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Zap, Camera, ImagePlus, Loader2, X, AlertCircle, Check, Barcode } from 'lucide-react';
import type { VisionAnalysisResult } from '../services/visionService';
import { analyzeImage } from '../services/visionService';
import { ReviewItems, type ScannedItem } from '../components/ReviewItems';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { generateUUID } from '../utils/uuid';
import { compressImage, compressReceiptImage } from '../services/imageCompressionService';
import {
    analyzeReceipt,
    checkGeminiReceiptHealth,
    classifyReceiptOcrError,
    clearQueuedReceiptScan,
    getGeminiReceiptDiagnostics,
    getQueuedReceiptScans,
    queueReceiptScan,
    type QueuedReceiptScan,
    type ReceiptAnalysisResult,
} from '../services/receiptOCRService';
import { ScanQueue, type QueuedScan } from '../services/scanQueueService';
import { getShelfLifeDefaults, estimateExpirationDate } from '../services/sealedShelfLifeService';
import { getDefaultSampleReceipt } from '../services/sampleReceiptService';
import { checkReceiptImageQuality, type ReceiptImageQualityIssue } from '../services/receiptImageQualityService';
import {
    clearReceiptPrivacyData,
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

export function Scan() {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
    const [showReview, setShowReview] = useState(false);
    const [scanMode, setScanMode] = useState<'single' | 'receipt'>('single');
    const [batchMode, setBatchMode] = useState(false);
    const [scanQueue, setScanQueue] = useState<ScanQueue | null>(null);
    const [queuedScans, setQueuedScans] = useState<QueuedScan[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [receiptSteps, setReceiptSteps] = useState(initialReceiptSteps);
    const [receiptDiagnostics, setReceiptDiagnostics] = useState(() => getGeminiReceiptDiagnostics());
    const [isCheckingReceiptHealth, setIsCheckingReceiptHealth] = useState(false);
    const [queuedReceipts, setQueuedReceipts] = useState<QueuedReceiptScan[]>(() => getQueuedReceiptScans());
    const [lastReceiptFile, setLastReceiptFile] = useState<File | null>(null);
    const [receiptQualityIssues, setReceiptQualityIssues] = useState<ReceiptImageQualityIssue[]>([]);
    const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryEntry[]>(() => getReceiptHistory());
    const [receiptPrivacy, setReceiptPrivacy] = useState<ReceiptPrivacySettings>(() => getReceiptPrivacySettings());
    const [receiptMeta, setReceiptMeta] = useState<{
        storeName?: string;
        date?: string;
        skippedItems?: string[];
        source?: ReceiptSource;
        previewUrl?: string;
        cacheHit?: boolean;
        estimatedCostCents?: number;
    } | undefined>();

    // Live camera state
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Input refs
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Check for camera support (HTTPS required for getUserMedia)
    // Initialize directly to avoid setState in effect
    const supportsLiveVideo = typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function';

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    }, []);

    // Start live camera
    const startCamera = useCallback(async () => {
        setCameraError(null);

        // Fallback for HTTP/insecure contexts where getUserMedia is undefined
        if (!navigator.mediaDevices?.getUserMedia) {
            cameraInputRef.current?.click();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                setCameraActive(true);
            }
        } catch (err) {
            console.error('Camera error:', err);
            const error = err as Error;
            setCameraError(`Camera error: ${error.message}. Try using the Gallery or Capture button instead.`);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
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
            brand: item.brand,
            category: getShelfLifeDefaults(item.name)?.category || item.category,
            confidence: item.confidence,
            expirationDate: '',
            quantity: item.quantity,
            sourceLine: item.sourceLine,
            sourceRegion: item.sourceRegion,
        }));
    }, []);

    const buildReceiptPreview = useCallback((file: File): string | undefined => {
        return URL.createObjectURL(file);
    }, []);

    const runReceiptHealthCheck = useCallback(async () => {
        setIsCheckingReceiptHealth(true);
        try {
            setReceiptDiagnostics(await checkGeminiReceiptHealth());
        } finally {
            setIsCheckingReceiptHealth(false);
        }
    }, []);

    const processImage = useCallback(async (file: File, source: ReceiptSource = 'gallery') => {
        setIsScanning(true);
        setProgress(0);
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
                return;
            }
        }
        if (scanMode === 'receipt') {
            setReceiptSteps({ ...initialReceiptSteps, uploaded: 'done', compressed: 'active' });
            setReceiptDiagnostics(getGeminiReceiptDiagnostics());
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
                const receiptResult = await analyzeReceipt(compressedFile);
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
                });
                saveReceiptHistory(receiptResult, {
                    source,
                    previewUrl,
                    cacheHit: receiptResult.cacheHit,
                });
                setReceiptHistory(getReceiptHistory());
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
        } catch (err) {
            console.error('Scan failed:', err);
            clearInterval(progressInterval);
            setIsScanning(false);
            setProgress(0);

            const error = err as Error;
            if (scanMode === 'receipt') {
                const diagnostics = classifyReceiptOcrError(error);
                setReceiptDiagnostics(diagnostics);
                setReceiptSteps(prev => {
                    const activeStep = Object.entries(prev).find(([, status]) => status === 'active')?.[0];
                    return activeStep ? { ...prev, [activeStep]: 'error' } : { ...prev, parsed: 'error' };
                });
                if (lastReceiptFile || file) {
                    queueReceiptScan(file, diagnostics.message)
                        .then(() => setQueuedReceipts(getQueuedReceiptScans()))
                        .catch(queueError => console.warn('Receipt queue failed:', queueError));
                }
            }

            if (error.message.includes('API Key') || error.message.includes('VITE_GEMINI_API_KEY')) {
                setError('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.');
            } else {
                setError(`Scan failed: ${error.message}`);
            }
        }
    }, [stopCamera, parseResultToItems, scanMode, markReceiptStep, mapReceiptResultToItems, buildReceiptPreview, lastReceiptFile]);

    const retryQueuedReceipt = useCallback(async (queued: QueuedReceiptScan) => {
        const response = await fetch(queued.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], queued.name, { type: queued.type });
        clearQueuedReceiptScan(queued.id);
        setQueuedReceipts(getQueuedReceiptScans());
        await processImage(file, 'gallery');
    }, [processImage]);

    const loadSampleReceipt = useCallback(() => {
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
            configured: true,
            reachable: 'ok',
            status: 'configured',
            message: 'Sample receipt loaded locally. Gemini was not called.',
        });
        setReceiptMeta({
            storeName: sample.result.storeName,
            date: sample.result.date,
            skippedItems: sample.result.skippedItems,
            source: 'sample',
            previewUrl: sample.imageDataUrl,
            cacheHit: false,
            estimatedCostCents: 0,
        });
        saveReceiptHistory(sample.result, {
            source: 'sample',
            previewUrl: sample.imageDataUrl,
            cacheHit: false,
        });
        setReceiptHistory(getReceiptHistory());
        setScannedItems(mapReceiptResultToItems(sample.result));
        setShowReview(true);
    }, [mapReceiptResultToItems]);

    const updateReceiptPrivacy = useCallback((updates: Partial<ReceiptPrivacySettings>) => {
        const next = { ...receiptPrivacy, ...updates };
        setReceiptPrivacy(next);
        setReceiptPrivacySettings(next);
    }, [receiptPrivacy]);

    const clearReceiptData = useCallback(async () => {
        await clearReceiptPrivacyData();
        setReceiptHistory([]);
    }, []);

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
        <div className="min-h-full bg-[var(--bg-primary)] flex flex-col">
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
            <header className="flex items-center justify-between p-4 pt-12">
                <button
                    onClick={() => { stopCamera(); }}
                    className="w-10 h-10 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center border border-[var(--border-color)] inventory-card"
                >
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>

                {/* SCAN MODE TOGGLE */}
                <div className="flex bg-[var(--bg-secondary)] rounded-full p-1 border border-[var(--border-color)] inventory-card">
                    <button
                        onClick={() => setScanMode('single')}
                        disabled={isScanning}
                        className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
                            scanMode === 'single' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--text-secondary)]'
                        }`}
                    >
                        Single Item
                    </button>
                    <button
                        onClick={() => setScanMode('receipt')}
                        disabled={isScanning}
                        className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
                            scanMode === 'receipt' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--text-secondary)]'
                        }`}
                    >
                        Receipt
                    </button>
                </div>

                <button
                    onClick={() => { stopCamera(); setShowBarcodeScanner(true); }}
                    className="w-10 h-10 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center border border-[var(--border-color)] inventory-card"
                    title="Barcode Scanner"
                >
                    <Barcode className="w-5 h-5 text-[var(--accent-color)]" />
                </button>
            </header>

            {/* Instructions */}
            <div className="px-4 mt-4">
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
                <div className="px-4 mt-4 space-y-3">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 inventory-card">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                                <p className="text-white text-sm font-bold">Receipt OCR setup</p>
                                <p className="text-[var(--text-secondary)] text-xs mt-1">{receiptDiagnostics.message}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                receiptDiagnostics.status === 'configured'
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
                            {isCheckingReceiptHealth ? 'Checking Gemini...' : 'Check Gemini health'}
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
                        className="w-full py-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-sm font-bold disabled:opacity-50"
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
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 inventory-card">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-white text-sm font-bold">Receipt privacy</p>
                                <p className="text-[var(--text-secondary)] text-xs mt-1">History: {receiptHistory.length} saved</p>
                            </div>
                            <button
                                type="button"
                                onClick={clearReceiptData}
                                className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-200 text-xs font-bold"
                            >
                                Clear
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
                        {receiptHistory.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {receiptHistory.slice(0, 3).map(entry => (
                                    <div key={entry.id} className="rounded-xl bg-[var(--bg-tertiary)] p-3">
                                        <p className="text-white text-xs font-bold">{entry.storeName || 'Receipt scan'}</p>
                                        <p className="text-[var(--text-muted)] text-[10px]">
                                            {entry.itemCount} items · {entry.status} · {entry.cacheHit ? 'cache hit' : 'fresh OCR'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {queuedReceipts.length > 0 && (
                        <div className="bg-[var(--bg-secondary)] border border-orange-400/30 rounded-2xl p-4 inventory-card">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-white text-sm font-bold">Offline receipt queue</p>
                                    <p className="text-[var(--text-secondary)] text-xs mt-1">{queuedReceipts.length} receipt{queuedReceipts.length !== 1 ? 's' : ''} waiting to retry</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {queuedReceipts.slice(0, 3).map(scan => (
                                    <div key={scan.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-tertiary)] p-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-white text-xs font-bold">{scan.name}</p>
                                            <p className="truncate text-[var(--text-muted)] text-[10px]">{scan.reason}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => retryQueuedReceipt(scan)}
                                            disabled={isScanning}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 text-xs font-bold disabled:opacity-50"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Camera Error */}
            {cameraError && (
                <div className="px-4 mt-4">
                    <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <AlertCircle className="w-5 h-5 text-[var(--danger-color)] shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[var(--danger-color)] text-sm">{cameraError}</p>
                            <button
                                onClick={startCamera}
                                className="text-red-300 text-sm underline mt-2 font-medium"
                            >
                                Try again
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
                        <button onClick={() => setError(null)} className="ml-auto">
                            <X className="w-4 h-4 text-[var(--warning-color)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Camera Viewfinder */}
            <div className="flex-1 flex items-center justify-center p-6 relative">
                <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-black inventory-card glow-green">
                    {/* Frame corners */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[var(--accent-color)] rounded-tl-2xl z-20" />
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[var(--accent-color)] rounded-tr-2xl z-20" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[var(--accent-color)] rounded-bl-2xl z-20" />
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[var(--accent-color)] rounded-br-2xl z-20" />

                    {/* Live Video Feed */}
                    {cameraActive ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <button
                            onClick={supportsLiveVideo ? startCamera : () => cameraInputRef.current?.click()}
                            className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-tertiary)] active:bg-[var(--bg-secondary)] transition-colors"
                        >
                            <Camera className="w-12 h-12 text-[var(--accent-color)] mb-3" />
                            <p className="text-[var(--text-secondary)] text-sm font-semibold">
                                Tap to open camera
                            </p>
                            <p className="text-[var(--text-muted)] text-xs mt-1">
                                {scanMode === 'receipt' ? 'Photograph your receipt' : 'Point at your food item'}
                            </p>
                        </button>
                    )}

                    {/* Scanning overlay */}
                    {isScanning && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
                            <div className="bg-[var(--bg-secondary)]/95 backdrop-blur-sm px-6 py-3 rounded-full flex items-center gap-3 border border-[var(--border-color)] inventory-card">
                                <Loader2 className="w-5 h-5 text-[var(--accent-color)] animate-spin" />
                                <span className="text-[var(--accent-color)] font-bold text-sm tracking-wide">
                                    SCANNING...
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
                                {scanMode === 'receipt' ? 'PROCESSING RECEIPT' : 'SCANNING ITEM'}
                            </span>
                            <span className="text-[var(--accent-color)] text-sm font-bold">{progress}%</span>
                        </div>
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-200"
                                style={{ width: `${progress}%` }}
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
            <div className="pb-32 px-6">
                <div className="flex items-center justify-around">
                    {/* Gallery */}
                    <button
                        onClick={handleGalleryClick}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                    >
                        <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center border border-[var(--border-color)] inventory-card">
                            <ImagePlus className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-bold tracking-wide">GALLERY</span>
                    </button>

                    {/* Capture / Start Camera */}
                    <button
                        onClick={cameraActive ? capturePhoto : startCamera}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
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

                    {/* Batch Mode / Close Camera */}
                    <button
                        onClick={cameraActive ? stopCamera : toggleBatchMode}
                        disabled={isScanning}
                        className="flex flex-col items-center gap-2 disabled:opacity-50"
                    >
                        <div className={`w-16 h-16 rounded-xl flex items-center justify-center border border-[var(--border-color)] inventory-card ${cameraActive ? 'bg-[var(--danger-color)]' : batchMode ? 'bg-[var(--accent-color)] glow-green' : 'bg-[var(--bg-secondary)]'
                            }`}>
                            {cameraActive ? (
                                <X className="w-6 h-6 text-white" />
                            ) : (
                                <Zap className={`w-6 h-6 ${batchMode ? 'text-white' : 'text-white/60'}`} />
                            )}
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-bold tracking-wide">
                            {cameraActive ? 'CLOSE' : batchMode ? 'BATCH' : 'SINGLE'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
