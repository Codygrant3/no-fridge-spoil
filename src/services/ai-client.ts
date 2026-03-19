/**
 * Shared Google Generative AI client.
 * Single initialization point — all services import from here.
 */
import { GoogleGenAI } from '@google/genai';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/** Shared AI client instance, or null if no API key is configured. */
export const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;
