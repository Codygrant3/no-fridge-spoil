import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Barcode, Loader2, Keyboard, Camera } from 'lucide-react';
import { lookupBarcode, type BarcodeProductInfo } from '../services/barcodeService';

interface BarcodeScannerProps {
    isOpen: boolean;
    onClose: () => void;
    onProductFound: (product: BarcodeProductInfo) => void;
}

export function BarcodeScanner({ isOpen, onClose, onProductFound }: BarcodeScannerProps) {
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [manualBarcode, setManualBarcode] = useState('');
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scannerContainerId = 'barcode-live-scanner';

    const handleBarcodeFound = useCallback(async (barcode: string) => {
        setIsLookingUp(true);
        setError(null);
        try {
            const product = await lookupBarcode(barcode);
            onProductFound(product);
            handleClose();
        } catch (err) {
            console.error('Lookup error:', err);
            setError('Failed to lookup product. Try manual entry.');
        } finally {
            setIsLookingUp(false);
        }
    }, [onProductFound]);

    // Start live camera scanner
    const startLiveScanner = useCallback(async () => {
        setCameraError(null);

        // Check if getUserMedia is available (requires HTTPS)
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera requires HTTPS. Use the photo capture option instead.');
            return;
        }

        try {
            const scanner = new Html5Qrcode(scannerContainerId, {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                ],
                verbose: false,
            });
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 280, height: 160 },
                    aspectRatio: 1.0,
                },
                async (decodedText) => {
                    // Success — stop scanner and lookup
                    try {
                        await scanner.stop();
                    } catch {
                        // Ignore stop errors
                    }
                    setCameraActive(false);
                    await handleBarcodeFound(decodedText);
                },
                () => {
                    // Scan frame — no barcode found (ignore, this fires every frame)
                }
            );

            setCameraActive(true);
        } catch (err) {
            console.error('Camera start failed:', err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
                setCameraError('Camera permission denied. Please allow camera access and try again.');
            } else if (msg.includes('NotFoundError')) {
                setCameraError('No camera found on this device.');
            } else {
                setCameraError(`Camera error: ${msg}. Try the photo capture option.`);
            }
        }
    }, [handleBarcodeFound]);

    // Stop live scanner
    const stopLiveScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                const state = scannerRef.current.getState();
                if (state === 2) { // SCANNING
                    await scannerRef.current.stop();
                }
            } catch {
                // Ignore cleanup errors
            }
            scannerRef.current = null;
        }
        setCameraActive(false);
    }, []);

    // Auto-start live scanner when opened
    useEffect(() => {
        if (isOpen && !showManualEntry && !isLookingUp) {
            // Small delay to ensure DOM is ready
            const timer = setTimeout(() => {
                startLiveScanner();
            }, 300);
            return () => clearTimeout(timer);
        }
        return () => {
            stopLiveScanner();
        };
    }, [isOpen, showManualEntry]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopLiveScanner();
        };
    }, []);

    // Photo capture fallback
    const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Stop live scanner if running
        await stopLiveScanner();

        setIsLookingUp(true);
        setError(null);

        try {
            const tempScanner = new Html5Qrcode('barcode-decoder-temp');
            try {
                const result = await tempScanner.scanFile(file, true);
                await tempScanner.clear();
                await handleBarcodeFound(result);
            } catch {
                try {
                    const result = await tempScanner.scanFile(file, false);
                    await tempScanner.clear();
                    await handleBarcodeFound(result);
                } catch {
                    setError('No barcode found in photo. Try holding the camera closer.');
                    setIsLookingUp(false);
                }
            }
        } catch {
            setError('Failed to process image.');
            setIsLookingUp(false);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleManualSubmit = async () => {
        const trimmed = manualBarcode.trim();
        if (!trimmed) {
            setError('Please enter a barcode');
            return;
        }
        await stopLiveScanner();
        await handleBarcodeFound(trimmed);
    };

    const handleClose = useCallback(() => {
        stopLiveScanner();
        setShowManualEntry(false);
        setManualBarcode('');
        setError(null);
        setCameraError(null);
        setIsLookingUp(false);
        onClose();
    }, [onClose, stopLiveScanner]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
            {/* Hidden elements */}
            <div id="barcode-decoder-temp" style={{ display: 'none' }} />
            <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageCapture}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-14 pb-4">
                <div className="flex items-center gap-2.5 text-[var(--text-primary)]">
                    <Barcode className="w-5 h-5 text-[var(--accent-color)]" />
                    <span className="font-semibold text-lg">Scan Barcode</span>
                </div>
                <button
                    onClick={handleClose}
                    className="p-2.5 rounded-2xl glass-thin active:scale-95 transition-transform"
                    aria-label="Close scanner"
                >
                    <X className="w-5 h-5 text-[var(--text-primary)]" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center px-5">
                {isLookingUp ? (
                    <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-12 h-12 text-[var(--accent-color)] animate-spin mb-4" />
                        <p className="text-[var(--text-primary)] text-lg font-medium">Looking up product...</p>
                    </div>
                ) : showManualEntry ? (
                    <div className="w-full max-w-md glass-card-elevated rounded-3xl p-6">
                        <div className="flex items-center gap-3 mb-5">
                            <Keyboard className="w-5 h-5 text-[var(--accent-color)]" />
                            <h3 className="text-[var(--text-primary)] text-lg font-semibold">Enter Barcode</h3>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={manualBarcode}
                            onChange={(e) => setManualBarcode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                            placeholder="Enter barcode numbers..."
                            className="w-full p-4 glass-thin rounded-2xl text-[var(--text-primary)] text-lg text-center tracking-widest mb-4 outline-none focus:ring-1 focus:ring-[var(--accent-color)]/30"
                            autoFocus
                        />
                        <button
                            onClick={handleManualSubmit}
                            disabled={isLookingUp || !manualBarcode.trim()}
                            className="w-full py-3.5 btn-primary rounded-2xl font-bold disabled:opacity-50"
                        >
                            Look Up Product
                        </button>
                    </div>
                ) : (
                    <div className="w-full max-w-md flex flex-col items-center">
                        {/* Live Scanner View */}
                        <div className="w-full rounded-3xl overflow-hidden glass-card-elevated mb-4 relative">
                            <div
                                id={scannerContainerId}
                                className="w-full"
                                style={{ minHeight: '300px' }}
                            />

                            {/* Scanning overlay */}
                            {cameraActive && (
                                <div className="absolute bottom-0 left-0 right-0 p-3 text-center">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-thin text-sm text-[var(--text-secondary)]">
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        Scanning...
                                    </div>
                                </div>
                            )}

                            {/* Camera error state */}
                            {cameraError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                    <Camera className="w-12 h-12 text-[var(--text-muted)] mb-3" />
                                    <p className="text-[var(--text-secondary)] text-sm mb-4">{cameraError}</p>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="btn-primary px-6 py-3 rounded-2xl text-sm font-semibold"
                                    >
                                        <Camera className="w-4 h-4 inline mr-2" />
                                        Take Photo Instead
                                    </button>
                                </div>
                            )}

                            {/* Loading state while camera initializes */}
                            {!cameraActive && !cameraError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-[var(--accent-color)] animate-spin mb-3" />
                                    <p className="text-[var(--text-muted)] text-sm">Starting camera...</p>
                                </div>
                            )}
                        </div>

                        <p className="text-[var(--text-muted)] text-sm text-center mb-6 px-4">
                            Center the barcode within the frame. Ensure good lighting.
                        </p>

                        {/* Action buttons */}
                        <div className="w-full flex gap-3">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-3.5 glass-thin rounded-2xl flex items-center justify-center gap-2 text-[var(--text-secondary)] text-sm font-medium active:scale-95 transition-transform"
                            >
                                <Camera className="w-4 h-4" />
                                Photo
                            </button>
                            <button
                                onClick={() => {
                                    stopLiveScanner();
                                    setShowManualEntry(true);
                                    setError(null);
                                }}
                                className="flex-1 py-3.5 glass-thin rounded-2xl flex items-center justify-center gap-2 text-[var(--text-secondary)] text-sm font-medium active:scale-95 transition-transform"
                            >
                                <Keyboard className="w-4 h-4" />
                                Manual
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-4 rounded-2xl text-center max-w-md text-sm" style={{ background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.15)', color: '#fca5a5' }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Back to camera from manual entry */}
            {showManualEntry && (
                <div className="p-5 pb-8">
                    <button
                        onClick={() => {
                            setShowManualEntry(false);
                            setError(null);
                        }}
                        className="w-full text-center text-[var(--accent-color)] text-sm font-medium"
                    >
                        Back to live scanner
                    </button>
                </div>
            )}
        </div>
    );
}
