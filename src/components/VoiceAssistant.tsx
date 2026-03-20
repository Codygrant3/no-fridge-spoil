import { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { VoiceService, type VoiceCommand, type VoiceResponse } from '../services/voiceService';

interface VoiceAssistantProps {
    onCommand?: (command: VoiceCommand, params?: Record<string, string | number>) => void;
    isEnabled?: boolean;
}

export function VoiceAssistant({ onCommand, isEnabled = true }: VoiceAssistantProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const [voiceService, setVoiceService] = useState<VoiceService | null>(null);

    useEffect(() => {
        const service = new VoiceService({
            onTranscript: (text) => {
                setTranscript(text);
                setShowPopup(true);
            },
            onResponse: (res: VoiceResponse) => {
                setResponse(res.spokenResponse);
                onCommand?.(res.command, res.parameters);

                // Auto-hide popup after response
                setTimeout(() => {
                    setShowPopup(false);
                    setTranscript('');
                    setResponse('');
                }, 3000);
            },
            onListeningChange: setIsListening,
            onError: (error) => {
                console.error('Voice error:', error);
                setShowPopup(false);
            },
        });

        setVoiceService(service);

        return () => {
            service.destroy();
        };
    }, [onCommand]);

    const toggleListening = useCallback(() => {
        if (!voiceService) return;

        if (isListening) {
            voiceService.stopListening();
        } else {
            voiceService.startListening();
            setShowPopup(true);
        }
    }, [voiceService, isListening]);

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
                <div className="fixed inset-x-4 bottom-52 glass-thin border border-[var(--border-color)] rounded-3xl p-4 z-50 shadow-xl">
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
                            onClick={() => {
                                setShowPopup(false);
                                voiceService?.stopListening();
                            }}
                            className="p-1 hover:bg-white/10 rounded-lg"
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
                                        height: `${Math.random() * 20 + 10}px`,
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
