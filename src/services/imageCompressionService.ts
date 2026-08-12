import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 0.3,              // 300KB max
  maxWidthOrHeight: 1024,      // HD quality sufficient for OCR
  useWebWorker: true,          // Don't block main thread
};

export async function compressImage(file: File, signal?: AbortSignal): Promise<File> {
  try {
    const compressed = await imageCompression(file, { ...DEFAULT_OPTIONS, signal });
    console.log(`Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
    return compressed;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Scan cancelled.', 'AbortError');
    console.error('Compression failed, using original:', error);
    return file; // Fallback to original if compression fails
  }
}

// For receipt scanning (needs higher quality for text OCR)
export async function compressReceiptImage(file: File): Promise<File> {
  const receiptOptions = {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1920,  // Keep higher resolution for text
    useWebWorker: true,
    fileType: 'image/jpeg', // Azure receipt OCR accepts JPEG but not WebP
  };

  try {
    const compressed = await imageCompression(file, receiptOptions);
    console.log(`Receipt compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
    return compressed;
  } catch (error) {
    console.error('Receipt compression failed:', error);
    return file;
  }
}
