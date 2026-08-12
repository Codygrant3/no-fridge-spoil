import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { VoiceService, type VoiceCommand, type VoiceResponse } from '../services/voiceService';

interface VoiceAssistantProps {
    onCommand?: (command: VoiceCommand, params?: Record<string, string | number>) => void;
    isEnabled?: boolean;
}

const LISTENING_BARS = [14, 26, 18, 30, 22];

export function VoiceAssistant({ onCommand, isEnabled = true }: VoiceAssistantProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const voiceServiceRef = useRef<VoiceService | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimeout = useCallback(() => {
        if (!hideTimeoutRef.current) return;
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
    }, []);

    const closePopup = useCallback(() => {
        clearHideTimeout();
        voiceServiceRef.current?.stopListening();
        setShowPopup(false);
        setTranscript('');
        setResponse('');
    }, [clearHideTimeout]);

    useEffect(() => {
        const service = new VoiceService({
            onTranscript: (text) => {
                setTranscript(text);
                setShowPopup(true);
            },
            onResponse: (res: VoiceResponse) => {
                clearHideTimeout();
                setResponse(res.spokenResponse);
                onCommand?.(res.command, res.parameters);

                // Auto-hide popup after response
                hideTimeoutRef.current = setTimeout(() => {
                    setShowPopup(false);
                    setTranscript('');
                    setResponse('');
                    hideTimeoutRef.current = null;
                }, 3000);
            },
            onListeningChange: setIsListening,
            onError: () => {
                clearHideTimeout();
                setResponse('Voice input is unavailable. Check microphone access and try again.');
                setShowPopup(true);
                hideTimeoutRef.current = setTimeout(() => {
                    setShowPopup(false);
                    setResponse('');
                    hideTimeoutRef.current = null;
                }, 5000);
            },
        });

        voiceServiceRef.current = service;

        return () => {
            clearHideTimeout();
            service.destroy();
            voiceServiceRef.current = null;
        };
    }, [clearHideTimeout, onCommand]);

    useEffect(() => {
        if (!showPopup) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closePopup();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closePopup, showPopup]);

    const toggleListening = useCallback(() => {
        const voiceService = voiceServiceRef.current;
        if (!voiceService) return;

        if (isListening) {
            voiceService.stopListening();
        } else {
            clearHideTimeout();
            setResponse('');
            voiceService.startListening();
            setShowPopup(true);
        }
    }, [clearHideTimeout, isListening]);

    if (!isEnabled) return null;

    return (
        <>
            {/* Floating Voice Button */}
            <button
                onClick={toggleListening}
                className={`fixed bottom-36 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-50 transition-all ${isListening
                        ? 'bg-[var(--accent-color)] animate-pulse shadow-green-500/50'
                        : 'glass-thin border border-[var(--border-color)] hover:border-[var(--accent-color)]'
                    }`}
                aria-label={isListening ? 'Stop listening' : 'Start voice assistant'}
            >
                {isListening ? (
                    <Mic className="w-6 h-6 text-white" />
                ) : (
                    <MicOff className="w-6 h-6 text-[var(--text-muted)]" />
                )}
            </button>

            {/* Voice Popup */}
            {showPopup && (
                <div
                    className="fixed inset-x-4 bottom-52 glass-thin border border-[var(--border-color)] rounded-3xl p-4 z-50 shadow-xl"
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {isListening && (
                                <span className="w-2 h-2 bg-[var(--accent-color)] rounded-full animate-pulse" />
                            )}
                            <span className="text-sm text-[var(--text-muted)]">
                                {isListening ? 'Listening...' : 'Processing...'}
                            </span>
                        </div>
                        <button
                            onClick={closePopup}
                            className="p-1 hover:bg-white/10 rounded-lg"
                            aria-label="Close voice assistant"
                        >
                            <X className="w-4 h-4 text-[var(--text-muted)]" />
                        </button>
                    </div>

                    {transcript && (
                        <p className="text-white text-lg mb-2">"{transcript}"</p>
                    )}

                    {response && (
                        <p className="text-emerald-400 text-sm">{response}</p>
                    )}

                    {!transcript && isListening && (
                        <div className="flex items-center justify-center gap-1 py-4">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 bg-[var(--accent-color)] rounded-full animate-pulse"
                                    style={{
                                        height: `${LISTENING_BARS[i]}px`,
                                        animationDelay: `${i * 0.1}s`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
