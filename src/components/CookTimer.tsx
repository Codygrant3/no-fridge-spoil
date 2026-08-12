import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from 'react';
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
        const secondsRef = useRef(defaultSeconds);
        const deadlineRef = useRef<number | null>(null);
        const completionAnnouncedRef = useRef(false);

        const setTimerValue = useCallback((seconds: number) => {
            const safeSeconds = Math.max(0, Math.round(seconds));
            secondsRef.current = safeSeconds;
            setTimerSeconds(safeSeconds);
            completionAnnouncedRef.current = false;
            if (isTimerRunning && safeSeconds > 0) {
                deadlineRef.current = Date.now() + safeSeconds * 1000;
            } else if (safeSeconds === 0) {
                deadlineRef.current = null;
                setIsTimerRunning(false);
            }
        }, [isTimerRunning]);

        const startTimer = useCallback(() => {
            const seconds = secondsRef.current > 0 ? secondsRef.current : defaultSeconds;
            if (seconds <= 0) return;
            if (secondsRef.current <= 0) {
                secondsRef.current = seconds;
                setTimerSeconds(seconds);
            }
            deadlineRef.current = Date.now() + seconds * 1000;
            completionAnnouncedRef.current = false;
            setIsTimerRunning(true);
        }, [defaultSeconds]);

        const pauseTimer = useCallback(() => {
            if (deadlineRef.current !== null) {
                const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
                secondsRef.current = remaining;
                setTimerSeconds(remaining);
            }
            deadlineRef.current = null;
            setIsTimerRunning(false);
        }, []);

        useImperativeHandle(ref, () => ({
            getSeconds: () => secondsRef.current,
            setSeconds: setTimerValue,
            start: startTimer,
            pause: pauseTimer,
            isRunning: () => isTimerRunning,
        }), [isTimerRunning, pauseTimer, setTimerValue, startTimer]);

        useEffect(() => {
            if (!isTimerRunning || deadlineRef.current === null) return;
            const tick = () => {
                if (deadlineRef.current === null) return;
                const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
                secondsRef.current = remaining;
                setTimerSeconds(remaining);
                if (remaining > 0) return;
                deadlineRef.current = null;
                setIsTimerRunning(false);
                if (!completionAnnouncedRef.current) {
                    completionAnnouncedRef.current = true;
                    voiceService?.speak('Timer complete!');
                }
            };
            tick();
            const interval = window.setInterval(tick, 250);
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') tick();
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => {
                window.clearInterval(interval);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }, [isTimerRunning, voiceService]);

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
                        strokeDashoffset={2 * Math.PI * 100 * (
                            1 - Math.min(1, timerSeconds / Math.max(1, defaultSeconds))
                        )}
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
                        type="button"
                        onClick={isTimerRunning ? pauseTimer : startTimer}
                        aria-label={isTimerRunning ? 'Pause timer' : timerSeconds === 0 ? 'Restart timer' : 'Start timer'}
                        className="mt-4 flex items-center gap-2 px-5 py-2 bg-[var(--bg-secondary)] rounded-full text-sm text-white hover:bg-[var(--bg-tertiary)] transition-all border border-[var(--border-color)] inventory-card font-semibold"
                    >
                        {isTimerRunning ? (
                            <><Pause className="w-4 h-4" /> PAUSE</>
                        ) : (
                            <><Play className="w-4 h-4" /> {timerSeconds === defaultSeconds ? 'START' : timerSeconds === 0 ? 'RESTART' : 'RESUME'}</>
                        )}
                    </button>
                </div>
            </div>
        );
    }
);
