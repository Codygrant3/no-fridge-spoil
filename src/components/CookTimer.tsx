import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Play, Pause } from 'lucide-react';
import type { VoiceService } from '../services/voiceService';

interface CookTimerProps {
    voiceService: VoiceService | null;
    defaultSeconds?: number;
}

export interface CookTimerHandle {
    getSeconds: () => number;
    setSeconds: (s: number) => void;
    start: () => void;
    pause: () => void;
    isRunning: () => boolean;
}

export const CookTimer = forwardRef<CookTimerHandle, CookTimerProps>(
    function CookTimer({ voiceService, defaultSeconds = 5 * 60 }, ref) {
        const [timerSeconds, setTimerSeconds] = useState(defaultSeconds);
        const [isTimerRunning, setIsTimerRunning] = useState(false);

        useImperativeHandle(ref, () => ({
            getSeconds: () => timerSeconds,
            setSeconds: (s: number) => { setTimerSeconds(s); },
            start: () => setIsTimerRunning(true),
            pause: () => setIsTimerRunning(false),
            isRunning: () => isTimerRunning,
        }), [timerSeconds, isTimerRunning]);

        // Timer countdown logic
        useEffect(() => {
            if (!isTimerRunning || timerSeconds <= 0) return;

            const interval = setInterval(() => {
                setTimerSeconds(prev => {
                    if (prev <= 1) {
                        setIsTimerRunning(false);
                        voiceService?.speak('Timer complete!');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(interval);
        }, [isTimerRunning, voiceService]); // removed timerSeconds — not needed with functional update

        const formatTime = useCallback((seconds: number): string => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, []);

        return (
            <div className="relative w-56 h-56 mb-8">
                {/* Background circle */}
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="112" cy="112" r="100"
                        fill="none" stroke="var(--bg-tertiary)" strokeWidth="12"
                    />
                    {/* Progress circle */}
                    <circle
                        cx="112" cy="112" r="100"
                        fill="none" stroke="var(--accent-color)" strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 100}
                        strokeDashoffset={2 * Math.PI * 100 * (1 - timerSeconds / defaultSeconds)}
                        className="transition-all duration-1000 drop-shadow-[0_0_10px_var(--accent-color)]"
                    />
                </svg>
                {/* Timer display */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-bold text-white font-mono">
                        {formatTime(timerSeconds)}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] mt-2 font-semibold tracking-wide">
                        MINUTES REMAINING
                    </span>
                    <button
                        onClick={() => setIsTimerRunning(r => !r)}
                        className="mt-4 flex items-center gap-2 px-5 py-2 bg-[var(--bg-secondary)] rounded-full text-sm text-white hover:bg-[var(--bg-tertiary)] transition-all border border-[var(--border-color)] inventory-card font-semibold"
                    >
                        {isTimerRunning ? (
                            <><Pause className="w-4 h-4" /> PAUSE</>
                        ) : (
                            <><Play className="w-4 h-4" /> RESUME</>
                        )}
                    </button>
                </div>
            </div>
        );
    }
);
