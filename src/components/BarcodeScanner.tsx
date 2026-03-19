import { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleBarcodeFound = async (barcode: string) => {
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
    };

    const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLookingUp(true);
        setError(null);

        try {
            const html5QrCode = new Html5Qrcode('barcode-decoder-temp');

            // Try standard scan
            try {
                const result = await html5QrCode.scanFile(file, true); // true = showImage (debug)
                await html5QrCode.clear();
                await handleBarcodeFound(result);
            } catch (firstAttemptErr) {
                // If failed, try again without 'showImage' flag which sometimes affects processing
                console.log('First attempt failed, retrying...', firstAttemptErr);
                try {
                    const result = await html5QrCode.scanFile(file, false);
                    await html5QrCode.clear();
                    await handleBarcodeFound(result);
                } catch (secondAttemptErr) {
                    // Try one last time - specialized handling could go here
                    // For now, fail
                    throw secondAttemptErr;
                }
            }
        } catch (err) {
            console.error('Barcode scan error:', err);
            setError('No barcode found. Tip: Ensure barcode is vertical/horizontal and fills the frame.');
            setIsLookingUp(false);
        }

        // Clear the input for next use
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleManualSubmit = async () => {
        const trimmed = manualBarcode.trim();
        if (!trimmed) {
            setError('Please enter a barcode');
            return;
        }
        await handleBarcodeFound(trimmed);
    };

    const handleClose = () => {
        setShowManualEntry(false);
        setManualBarcode('');
        setError(null);
        setIsLookingUp(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            {/* Hidden element for barcode decoding */}
            <div id="barcode-decoder-temp" style={{ display: 'none' }} />

            {/* Hidden file input for camera capture */}
            <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageCapture}
            />

            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-black/80">
                <div className="flex items-center gap-2 text-white">
                    <Barcode className="w-6 h-6" />
                    <span className="font-semibold">Scan Barcode</span>
                </div>
                <button
                    onClick={handleClose}
                    className="p-2 rounded-full bg-gray-800 text-white"
                    aria-label="Close scanner"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                {isLookingUp ? (
                    <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-16 h-16 text-green-500 animate-spin mb-4" />
                        <p className="text-white text-lg">Processing...</p>
                    </div>
                ) : showManualEntry ? (
                    <div className="w-full max-w-md p-6 bg-gray-900 rounded-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Keyboard className="w-6 h-6 text-green-500" />
                            <h3 className="text-white text-lg font-semibold">Enter Barcode Manually</h3>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={manualBarcode}
                            onChange={(e) => setManualBarcode(e.target.value)}
                            placeholder="Enter barcode numbers..."
                            className="w-full p-4 bg-gray-800 text-white rounded-xl text-lg text-center tracking-widest mb-4"
                            autoFocus
                        />
                        <button
                            onClick={handleManualSubmit}
                            disabled={isLookingUp}
                            className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50"
                        >
                            Look Up Product
                        </button>
                    </div>
                ) : (
                    <div className="w-full max-w-md">
                        {/* Camera Capture Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full p-8 bg-gray-900 rounded-xl flex flex-col items-center justify-center mb-4 active:bg-gray-800 transition-colors"
                        >
                            <div className="w-20 h-20 rounded-full bg-green-600 flex items-center justify-center mb-4">
                                <Camera className="w-10 h-10 text-white" />
                            </div>
                            <p className="text-white text-lg font-semibold mb-1">Take Photo of Barcode</p>
                            <p className="text-gray-400 text-sm text-center">
                                Point your camera at the barcode and take a picture
                            </p>
                        </button>

                        {/* Manual Entry Option */}
                        <button
                            onClick={() => {
                                setShowManualEntry(true);
                                setError(null);
                            }}
                            className="w-full p-4 bg-gray-800 rounded-xl flex items-center justify-center gap-3"
                        >
                            <Keyboard className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-400">Enter barcode manually</span>
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-4 bg-red-500/20 rounded-xl text-red-400 text-center max-w-md">
                        {error}
                    </div>
                )}
            </div>

            {/* Footer */}
            {showManualEntry && (
                <div className="p-4 bg-black/80">
                    <button
                        onClick={() => {
                            setShowManualEntry(false);
                            setError(null);
                        }}
                        className="w-full text-center text-green-500 text-sm underline"
                    >
                        ← Back to camera
                    </button>
                </div>
            )}
        </div>
    );
}
