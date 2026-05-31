export interface ReceiptImageQualityIssue {
    code: 'too-small' | 'large-file' | 'unsupported-type' | 'likely-screenshot' | 'low-light' | 'wide-crop' | 'possible-blur';
    message: string;
}

export interface ReceiptImageQualityResult {
    ok: boolean;
    issues: ReceiptImageQualityIssue[];
}

export async function checkReceiptImageQuality(file: File): Promise<ReceiptImageQualityResult> {
    const issues: ReceiptImageQualityIssue[] = [];

    if (!file.type.startsWith('image/')) {
        issues.push({ code: 'unsupported-type', message: 'Receipt upload must be an image file.' });
    }

    if (file.size < 1_000) {
        issues.push({ code: 'too-small', message: 'Image is very small; receipt text may be unreadable.' });
    }

    if (file.size > 8_000_000) {
        issues.push({ code: 'large-file', message: 'Image is large; compression may take longer before OCR.' });
    }

    if (/screenshot|screen shot/i.test(file.name)) {
        issues.push({ code: 'likely-screenshot', message: 'Screenshots can work, but a direct receipt photo is usually clearer.' });
    }

    const image = await loadImage(file).catch(() => null);
    if (image) {
        if (image.width < 700 || image.height < 900) {
            issues.push({ code: 'too-small', message: 'Receipt image resolution is low; use a closer, sharper photo if OCR misses lines.' });
        }
        const ratio = image.width / image.height;
        if (ratio > 1.2 || ratio < 0.25) {
            issues.push({ code: 'wide-crop', message: 'Receipt shape looks cropped or sideways; include all receipt edges.' });
        }

        const metrics = sampleImageMetrics(image);
        if (metrics.brightness < 70) {
            issues.push({ code: 'low-light', message: 'Receipt image looks dark; better lighting improves OCR.' });
        }
        if (metrics.contrast < 18) {
            issues.push({ code: 'possible-blur', message: 'Receipt text may be blurry or low contrast.' });
        }
    }

    return {
        ok: !issues.some(issue => issue.code === 'unsupported-type' || issue.code === 'too-small'),
        issues,
    };
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        const timeout = window.setTimeout(() => {
            URL.revokeObjectURL(url);
            reject(new Error('Receipt image metadata timed out'));
        }, 200);
        image.onload = () => {
            window.clearTimeout(timeout);
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            window.clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Unable to read receipt image'));
        };
        image.src = url;
    });
}

function sampleImageMetrics(image: HTMLImageElement): { brightness: number; contrast: number } {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { brightness: 128, contrast: 64 };

    ctx.drawImage(image, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 16) {
        values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    }
    const brightness = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - brightness) ** 2), 0) / values.length;
    return { brightness, contrast: Math.sqrt(variance) };
}
