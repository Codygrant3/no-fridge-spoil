import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Zap, Camera, ImagePlus, Loader2, X, AlertCircle, Check, Barcode } from 'lucide-react';
import type { VisionAnalysisResult } from '../services/visionService';
import { analyzeImage } from '../services/visionService';
import { ReviewItems, type ScannedItem } from '../components/ReviewItems';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { generateUUID } from '../utils/uuid';
import { compressImage, compressReceiptImage } from '../services/imageCompressionService';
import { analyzeReceipt } from '../services/receiptOCRService';
import { ScanQueue, type QueuedScan } from '../services/scanQueueService';
import { getShelfLifeDefaults, estimateExpirationDate } from '../services/sealedShelfLifeService';

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

    // Auto-start camera on mount, cleanup on unmount
    useEffect(() => {
        if (supportsLiveVideo && !cameraActive && !isScanning && !showReview && !showBarcodeScanner) {
            startCamera();
        }
        return () => {
            stopCamera();
        };
    }, []);

    // Initialize/cleanup scan queue when batch mode toggles
    useEffect(() => {
        if (batchMode) {
            setScanQueue(new ScanQueue((queue) => setQueuedScans(queue)));
        } else {
            setScanQueue(null);
            setQueuedScans([]);
        }
    }, [batchMode]);

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

    const processImage = useCallback(async (file: File) => {
        setIsScanning(true);
        setProgress(0);
        setError(null);
        stopCamera();

        // Compress image based on scan mode
        const compressedFile = scanMode === 'receipt'
            ? await compressReceiptImage(file)
            : await compressImage(file);

        // Progress simulation
        const progressInterval = setInterval(() => {
            setProgress(prev => Math.min(prev + 10, 85));
        }, 200);

        try {
            if (scanMode === 'receipt') {
                // RECEIPT MODE - Process entire receipt
                const receiptResult = await analyzeReceipt(compressedFile);
                clearInterval(progressInterval);
                setProgress(100);

                // Convert receipt items to ScannedItem format
                const items: ScannedItem[] = receiptResult.items.map(item => ({
                    id: generateUUID(),
                    name: item.name,
                    brand: item.brand,
                    category: item.category,
                    confidence: item.confidence,
                    expirationDate: '', // User will fill in review
                    quantity: item.quantity,
                }));

                setScannedItems(items);
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
                setShowReview(true);
            }, 300);
        } catch (err) {
            console.error('Scan failed:', err);
            clearInterval(progressInterval);
            setIsScanning(false);
            setProgress(0);

            const error = err as Error;
            if (error.message.includes('API Key')) {
                setError('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.');
            } else {
                setError(`Scan failed: ${error.message}`);
            }
        }
    }, [stopCamera, parseResultToItems, scanMode]);

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
                await processImage(file);
            }
        }, 'image/jpeg', 0.8);
    }, [processImage, batchMode, scanQueue]);

    const handleGalleryClick = () => {
        galleryInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processImage(file);
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
                onConfirm={handleConfirmItems}
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
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
                            <p className="text-[var(--text-muted)] text-sm font-medium">
                                {scanMode === 'receipt' ? 'Position receipt here' : 'Position item here'}
                            </p>
                        </div>
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
            <div className="pb-8 px-6">
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
                        onClick={cameraActive ? stopCamera : () => setBatchMode(!batchMode)}
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
