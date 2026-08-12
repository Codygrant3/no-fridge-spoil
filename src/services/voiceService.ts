/**
 * Local voice commands for hands-free cooking and inventory actions.
 * Speech recognition is provided by the browser; command parsing and speech
 * synthesis stay on the client and do not require an API key.
 */

export type VoiceCommand =
    | 'next_step'
    | 'previous_step'
    | 'repeat'
    | 'start_timer'
    | 'pause_timer'
    | 'set_timer'
    | 'check_timer'
    | 'next_ingredient'
    | 'skip_to_step'
    | 'what_temperature'
    | 'add_item'
    | 'check_expiration'
    | 'suggest_recipe'
    | 'unknown';

export interface VoiceResponse {
    command: VoiceCommand;
    parameters?: Record<string, string | number>;
    spokenResponse: string;
}

export interface VoiceServiceConfig {
    onTranscript?: (text: string) => void;
    onResponse?: (response: VoiceResponse) => void;
    onListeningChange?: (isListening: boolean) => void;
    onError?: (error: string) => void;
    autoReadSteps?: boolean;
    preferLocalRecognition?: boolean;
}

const SMALL_NUMBERS: Readonly<Record<string, number>> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
};

export function sanitizeTranscript(raw: string): string {
    return raw
        .replace(/[^\w\s.,!?''"-]/g, '')
        .slice(0, 200)
        .trim();
}

function parseSpokenNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;

    const words = value.toLowerCase().replace(/-/g, ' ').split(/\s+/);
    let total = 0;
    let matched = false;
    for (const word of words) {
        if (word === 'and') continue;
        const number = SMALL_NUMBERS[word];
        if (number === undefined) return undefined;
        total += number;
        matched = true;
    }
    return matched ? total : undefined;
}

function parseTimerMinutes(transcript: string): number | undefined {
    const hourMatch = transcript.match(/\b([\w-]+)\s*hours?\b/);
    const minuteMatch = transcript.match(/\b([\w-]+)\s*(?:minutes?|mins?)\b/);
    const secondMatch = transcript.match(/\b([\w-]+)\s*seconds?\b/);
    const hours = parseSpokenNumber(hourMatch?.[1]) ?? 0;
    const minutes = parseSpokenNumber(minuteMatch?.[1]) ?? 0;
    const seconds = parseSpokenNumber(secondMatch?.[1]) ?? 0;
    const totalMinutes = hours * 60 + minutes + seconds / 60;
    return totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes)) : undefined;
}

function response(
    command: VoiceCommand,
    spokenResponse: string,
    parameters?: Record<string, string | number>,
): VoiceResponse {
    return parameters ? { command, parameters, spokenResponse } : { command, spokenResponse };
}

export function parseVoiceIntent(rawTranscript: string): VoiceResponse {
    const transcript = sanitizeTranscript(rawTranscript).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!transcript) return response('unknown', "I didn't catch a command. Please try again.");

    const stepMatch = transcript.match(/\b(?:go|skip|jump)\s+(?:to\s+)?step\s+([\w-]+)\b/);
    const stepNumber = parseSpokenNumber(stepMatch?.[1]);
    if (stepNumber && stepNumber > 0) {
        return response('skip_to_step', `Going to step ${stepNumber}.`, { stepNumber });
    }

    if (/\b(?:set|start)\s+(?:a\s+)?timer\b/.test(transcript) || /\btimer\s+for\b/.test(transcript)) {
        const minutes = parseTimerMinutes(transcript);
        if (minutes) return response('set_timer', `Setting a timer for ${minutes} minutes.`, { minutes });
    }

    if (/\b(?:pause|stop)\s+(?:the\s+)?timer\b/.test(transcript)) {
        return response('pause_timer', 'Pausing the timer.');
    }
    if (/\b(?:how much time|time left|check (?:the )?timer)\b/.test(transcript)) {
        return response('check_timer', 'Checking the timer.');
    }
    if (/\b(?:start|resume)\s+(?:the\s+)?timer\b/.test(transcript)) {
        return response('start_timer', 'Starting the timer.');
    }

    const addMatch = transcript.match(/^(?:please\s+)?add\s+(.+?)(?:\s+to\s+(?:my\s+)?inventory)?$/);
    if (addMatch?.[1]) {
        const itemName = addMatch[1].trim();
        return response('add_item', `Ready to add ${itemName}.`, { itemName });
    }

    const expirationMatch = transcript.match(/\bwhen does\s+(.+?)\s+expire\b/)
        ?? transcript.match(/\bcheck (?:the )?expiration(?: date)?(?: for| of)?\s+(.+)$/);
    if (expirationMatch?.[1]) {
        const itemName = expirationMatch[1].trim();
        return response('check_expiration', `Checking ${itemName}.`, { itemName });
    }

    if (/\b(?:suggest|find|show)\s+(?:me\s+)?(?:a\s+)?recipes?\b|\bwhat can i (?:make|cook)\b/.test(transcript)) {
        return response('suggest_recipe', 'Opening recipe suggestions.');
    }
    if (/\b(?:what|which)\s+(?:is\s+the\s+)?(?:oven\s+)?temperature\b|\boven temp\b/.test(transcript)) {
        return response('what_temperature', 'Checking the cooking temperature.');
    }
    if (/\b(?:next ingredient|what ingredient is next)\b/.test(transcript)) {
        return response('next_ingredient', 'Checking the next ingredient.');
    }
    if (/\b(?:previous step|go back|back one|last step)\b/.test(transcript)) {
        return response('previous_step', 'Going back one step.');
    }
    if (/\b(?:repeat|say that again|what was that|repeat step)\b/.test(transcript)) {
        return response('repeat', 'Repeating the current step.');
    }
    if (/\b(?:next step|continue|move on|what(?:'s| is) next)\b/.test(transcript)) {
        return response('next_step', 'Moving to the next step.');
    }

    return response('unknown', "I didn't recognize that command. Please try again.");
}

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

interface SpeechRecognitionInterface extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    processLocally?: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    start(): void;
    stop(): void;
}

interface SpeechRecognitionConstructor {
    new(): SpeechRecognitionInterface;
}

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
}

export class VoiceService {
    private recognition: SpeechRecognitionInterface | null = null;
    private synthesis: SpeechSynthesis | null;
    private config: VoiceServiceConfig;
    private isListening = false;

    constructor(config: VoiceServiceConfig = {}) {
        this.config = {
            autoReadSteps: false,
            preferLocalRecognition: true,
            ...config,
        };
        this.synthesis = window.speechSynthesis ?? null;

        const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionClass) return;

        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        if (this.config.preferLocalRecognition && 'processLocally' in this.recognition) {
            this.recognition.processLocally = true;
        }

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            const result = event.results[event.results.length - 1];
            const transcript = result?.[0]?.transcript?.trim() ?? '';
            if (!transcript) return;
            this.config.onTranscript?.(transcript);

            if (result.isFinal) {
                const parsed = parseVoiceIntent(transcript);
                this.config.onResponse?.(parsed);
                void this.speak(parsed.spokenResponse);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.config.onListeningChange?.(false);
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            this.config.onError?.(event.error);
            this.isListening = false;
            this.config.onListeningChange?.(false);
        };
    }

    startListening(): boolean {
        if (!this.recognition) {
            this.config.onError?.('Speech recognition is not supported in this browser');
            return false;
        }

        try {
            this.recognition.start();
            this.isListening = true;
            this.config.onListeningChange?.(true);
            return true;
        } catch (error) {
            console.error('Failed to start voice recognition:', error);
            this.config.onError?.('Could not start voice recognition');
            return false;
        }
    }

    stopListening(): void {
        this.recognition?.stop();
        this.isListening = false;
        this.config.onListeningChange?.(false);
    }

    toggleListening(): boolean {
        if (this.isListening) {
            this.stopListening();
            return false;
        }
        return this.startListening();
    }

    async speak(text: string): Promise<void> {
        if (!text || !this.synthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
        this.stopSpeaking();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        this.synthesis.speak(utterance);
    }

    stopSpeaking(): void {
        this.synthesis?.cancel();
    }

    isSupported(): boolean {
        return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    getIsListening(): boolean {
        return this.isListening;
    }

    destroy(): void {
        this.stopListening();
        this.stopSpeaking();
        if (this.recognition) {
            this.recognition.onresult = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition = null;
        }
        this.config = {};
    }
}
