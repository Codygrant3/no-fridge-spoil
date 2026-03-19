import { ai } from './ai-client';

export interface ReceiptLineItem {
    name: string;
    brand?: string;
    quantity: number;
    price?: string;
    category: string;
    confidence: 'High' | 'Medium' | 'Low';
}

export interface ReceiptAnalysisResult {
    storeName?: string;
    date?: string;
    items: ReceiptLineItem[];
    totalItemsDetected: number;
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result && typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to read file'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function analyzeReceipt(imageFile: File): Promise<ReceiptAnalysisResult> {
    if (!ai) {
        throw new Error("Missing Gemini API Key");
    }

    try {
        const prompt = `
        Analyze this grocery receipt image and extract ALL food items purchased.

        Instructions:
        1. Extract each line item's product name (be specific, e.g., "Organic Whole Milk" not just "Milk")
        2. Detect brand names if visible
        3. Determine quantity (default to 1 if unclear)
        4. Categorize each item (Produce, Dairy, Meat, Pantry, Frozen, Beverages, etc.)
        5. Skip non-food items (cleaning supplies, pharmacy items, etc.)
        6. Confidence: "High" if text is clear, "Medium" if partially obscured, "Low" if guessing

        Return ONLY valid JSON in this structure:
        {
            "storeName": "Store name if visible",
            "date": "Receipt date if visible (YYYY-MM-DD format)",
            "items": [
                {
                    "name": "Organic Whole Milk",
                    "brand": "Horizon",
                    "quantity": 1,
                    "price": "4.99",
                    "category": "Dairy",
                    "confidence": "High"
                }
            ],
            "totalItemsDetected": 12
        }

        Focus on food items only. Be thorough—extract every food item visible on the receipt.
        `;

        const base64Image = await fileToBase64(imageFile);

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: [{
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
            }],
        });

        const text = response.text || "";
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanedText) as ReceiptAnalysisResult;

        return {
            storeName: data.storeName,
            date: data.date,
            items: data.items || [],
            totalItemsDetected: data.items?.length || 0,
        };
    } catch (error) {
        console.error("Receipt OCR failed:", error);
        throw new Error("Failed to analyze receipt");
    }
}
