import { ai } from './ai-client';
import { makeImageCacheKey, getCachedResponse, setCachedResponse } from './aiCacheService';

export interface VisionAnalysisResult {
    item_name: string;
    brand: string;
    expiration_date: string;
    date_type: 'Use By' | 'Best By' | 'Best Before' | 'Expires' | 'Sell By' | 'Unknown';
    confidence: 'High' | 'Medium' | 'Low';
    notes: string;
    category?: 'packaged' | 'fresh_produce' | 'unknown';
}

// Helper to convert File to Base64
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result && typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to read file as base64'));
            }
        };
        reader.onerror = () => reject(new Error('FileReader error: ' + reader.error?.message));
        reader.onabort = () => reject(new Error('File reading was aborted'));
        reader.readAsDataURL(file);
    });
}

export async function analyzeImage(imageFile: File): Promise<VisionAnalysisResult> {
    if (!ai) {
        throw new Error("Missing Gemini API Key. Please check your .env file.");
    }

    // Check cache first
    const cacheKey = makeImageCacheKey(imageFile);
    const cached = await getCachedResponse<VisionAnalysisResult>(cacheKey, 'vision');
    if (cached) {
        console.log('AI Cache hit: vision analysis');
        return cached;
    }

    try {
        const currentYear = new Date().getFullYear();
        const prompt = `
        Analyze this image of a food product to extract inventory details.
        
        IMPORTANT: Today's date is ${new Date().toISOString().split('T')[0]}. The current year is ${currentYear}.
        When interpreting 2-digit years (like "26" or "25"), assume they refer to 20XX (e.g., "26" = 2026, "25" = 2025).
        Food expiration dates are typically in the near future, so dates should usually be within 1-3 years from now.
        
        Return ONLY a raw JSON object (no markdown formatting) with these fields:
        1. item_name: Specific product name (e.g., "Chobani Greek Yogurt Strawberry 5.3oz").
        2. brand: Brand name (e.g., "Chobani"). If unknown, use "Unknown".
        3. expiration_date: Format strictly as "YYYY-MM-DD". Use 4-digit years. If the label shows "22 MAR 26", that means 2026-03-22. If not found, use "Unknown".
        4. date_type: Type of date found ("Use By", "Best By", "Best Before", "Expires", "Sell By"). If unsure/not found, "Unknown".
        5. confidence: "High" if date and name are clear. "Medium" if one is blurry. "Low" if unsure.
        6. category: "fresh_produce" if it looks like loose fruits/vegetables without a label, otherwise "packaged".
        7. notes: A short string explaining what you found or any issues (e.g. "Date is smudged").
        
        If it's fresh produce (like an apple), set expiration_date to "Unknown", category to "fresh_produce", and confidence to "Medium".
        `;

        const base64Image = await fileToBase64(imageFile);

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: imageFile.type,
                                data: base64Image,
                            },
                        },
                    ],
                },
            ],
        });

        const text = response.text || "";

        // Clean up markdown code blocks if present (Gemini sometimes adds ```json ... ```)
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const data = JSON.parse(cleanedText) as VisionAnalysisResult;

        // Ensure defaults if AI misses fields
        const result: VisionAnalysisResult = {
            item_name: data.item_name || "Unknown Item",
            brand: data.brand || "Unknown",
            expiration_date: data.expiration_date || "Unknown",
            date_type: isValidDateType(data.date_type) ? data.date_type : "Unknown",
            confidence: isValidConfidence(data.confidence) ? data.confidence : "Low",
            category: isValidCategory(data.category) ? data.category : "unknown",
            notes: data.notes || "Analyzed by AI"
        };

        // Cache successful result
        await setCachedResponse(cacheKey, 'vision', result);

        return result;

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error("Gemini Vision Error:", error);
        return {
            item_name: "Error Analyzing Image",
            brand: "Unknown",
            expiration_date: "Unknown",
            date_type: "Unknown",
            confidence: "Low",
            notes: `Failed to connect: ${errorMessage}. Check API Key & Console.`,
            category: "unknown"
        };
    }
}

// Type Guards to ensure runtime safety
function isValidDateType(val: unknown): val is VisionAnalysisResult['date_type'] {
    return ['Use By', 'Best By', 'Best Before', 'Expires', 'Sell By', 'Unknown'].includes(val as string);
}

function isValidConfidence(val: unknown): val is VisionAnalysisResult['confidence'] {
    return ['High', 'Medium', 'Low'].includes(val as string);
}

function isValidCategory(val: unknown): val is VisionAnalysisResult['category'] {
    return ['packaged', 'fresh_produce', 'unknown'].includes(val as string);
}
