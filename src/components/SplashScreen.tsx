import { useState, useEffect, useRef } from 'react';

/**
 * SplashScreen - Refined animated intro
 *
 * Design Philosophy: "Fresh Simplicity"
 * Features clean 3D letter animations with:
 * - Individual letter flip animations with perspective
 * - Multi-layered depth shadows for 3D effect
 * - Wave motion propagating through text
 * - Color-shifting animated glow
 */

type SplashScreenProps = {
    onComplete: () => void;
};

// Split text into individual characters for animation
const APP_NAME = "No Fridge Spoil";
const LETTERS = APP_NAME.split('');

export function SplashScreen({ onComplete }: SplashScreenProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoError, setVideoError] = useState(false);
    const [phase, setPhase] = useState(0);
    const [lettersVisible, setLettersVisible] = useState<boolean[]>(new Array(LETTERS.length).fill(false));

    useEffect(() => {
        const video = videoRef.current;

        // Safety timeout: if splash hasn't completed in 6 seconds, force it
        const safetyTimeout = setTimeout(() => {
            console.warn('Splash screen safety timeout — forcing completion');
            onComplete();
        }, 6000);

        if (video && !videoError) {
            const handleEnded = () => {
                clearTimeout(safetyTimeout);
                onComplete();
            };

            const handleError = () => {
                console.warn('Video failed to load, falling back to CSS animation');
                setVideoError(true);
            };

            video.addEventListener('ended', handleEnded);
            video.addEventListener('error', handleError);

            // Always start muted to satisfy autoplay policies, then try unmuting
            video.muted = true;
            video.play().then(() => {
                // Try to unmute after playback starts
                video.muted = false;
            }).catch(handleError);

            return () => {
                clearTimeout(safetyTimeout);
                video.removeEventListener('ended', handleEnded);
                video.removeEventListener('error', handleError);
            };
        }

        return () => clearTimeout(safetyTimeout);
    }, [onComplete, videoError]);

    // Animated letter sequence - runs for BOTH video and fallback modes
    useEffect(() => {
        // Phase 1: Background and logo
        const phase1 = setTimeout(() => setPhase(1), 100);

        // Phase 2: Start letter animations with wave effect
        // Delay slightly longer when video is playing to sync with video animation
        const letterDelay = videoError ? 600 : 800;
        const phase2 = setTimeout(() => {
            setPhase(2);
            // Stagger each letter's appearance
            LETTERS.forEach((_, i) => {
                setTimeout(() => {
                    setLettersVisible(prev => {
                        const next = [...prev];
                        next[i] = true;
                        return next;
                    });
                }, i * 80); // 80ms stagger between letters
            });
        }, letterDelay);

        // Phase 3: Tagline
        const phase3 = setTimeout(() => setPhase(3), videoError ? 1800 : 2200);

        // Only handle fade out for CSS fallback mode
        // Video mode handles completion via video 'ended' event
        let phase4: NodeJS.Timeout | undefined;
        let complete: NodeJS.Timeout | undefined;

        if (videoError) {
            phase4 = setTimeout(() => setPhase(4), 2800);
            complete = setTimeout(() => onComplete(), 3500);
        }

        return () => {
            clearTimeout(phase1);
            clearTimeout(phase2);
            clearTimeout(phase3);
            if (phase4) clearTimeout(phase4);
            if (complete) clearTimeout(complete);
        };
    }, [onComplete, videoError]);

    // Video-based splash screen with 3D text overlay
    if (!videoError) {
        return (
            <div className="fixed inset-0 z-[100] bg-[#021a13] flex items-center justify-center overflow-hidden">
                {/* Video background */}
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    playsInline
                    autoPlay
                    muted={false}
                    preload="auto"
                    style={{
                        minWidth: '100%',
                        minHeight: '100%',
                        objectFit: 'cover',
                    }}
                >
                    <source src="/intro.mp4" type="video/mp4" />
                </video>

                {/* 3D Animated Text Overlay - positioned below the logo */}
                <div className="relative z-10 text-center px-4 mt-48" style={{ perspective: '800px' }}>
                    {/* 3D Animated Title */}
                    <h1 className="title-container mb-4" style={{ perspective: '800px' }}>
                        {LETTERS.map((letter, i) => (
                            <span
                                key={i}
                                className={`letter-3d ${lettersVisible[i] ? 'letter-visible' : ''}`}
                                data-letter={letter === ' ' ? '\u00A0' : letter}
                                style={{
                                    '--letter-index': i,
                                    '--wave-delay': `${i * 0.1}s`,
                                } as React.CSSProperties}
                            >
                                {/* Shadow layers for 3D depth */}
                                <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                                <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                                <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                                <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                                {/* Main gradient letter */}
                                <span className="letter-main">{letter === ' ' ? '\u00A0' : letter}</span>
                            </span>
                        ))}
                    </h1>

                    {/* Tagline with fade and slide */}
                    <p className={`tagline ${phase >= 3 ? 'tagline-visible' : ''}`}>
                        Track freshness. Reduce waste.
                    </p>
                </div>

                {/* Styles for video overlay mode */}
                <style>{`
                    /* 3D Letter animation - Premium Fraunces typography */
                    .title-container {
                        display: flex;
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: 0;
                        font-family: 'Fraunces', Georgia, serif;
                        font-optical-sizing: auto;
                        letter-spacing: -0.02em;
                    }
                    .letter-3d {
                        display: inline-block;
                        font-size: clamp(2.5rem, 10vw, 4rem);
                        font-weight: 600;
                        font-style: normal;
                        font-variation-settings: "SOFT" 100, "WONK" 1;
                        position: relative;
                        transform: rotateX(-90deg) translateY(20px);
                        opacity: 0;
                        transform-style: preserve-3d;
                    }

                    /* Stacked shadow layers for 3D depth - deeper shadows */
                    .letter-shadow {
                        position: absolute;
                        left: 0;
                        top: 0;
                        color: rgba(0, 40, 20, 0.5);
                        -webkit-text-stroke: 0;
                    }
                    .letter-shadow:nth-child(1) {
                        transform: translate(2px, 2px);
                        color: rgba(0, 40, 20, 0.4);
                    }
                    .letter-shadow:nth-child(2) {
                        transform: translate(4px, 4px);
                        color: rgba(0, 40, 20, 0.3);
                    }
                    .letter-shadow:nth-child(3) {
                        transform: translate(6px, 6px);
                        color: rgba(0, 40, 20, 0.2);
                    }
                    .letter-shadow:nth-child(4) {
                        transform: translate(8px, 8px);
                        color: rgba(0, 40, 20, 0.15);
                        filter: blur(4px);
                    }

                    /* Main gradient letter on top - richer gradient */
                    .letter-main {
                        position: relative;
                        background: linear-gradient(
                            160deg,
                            #bbf7d0 0%,
                            #4ade80 20%,
                            #22c55e 40%,
                            #16a34a 60%,
                            #4ade80 80%,
                            #86efac 100%
                        );
                        background-size: 300% 300%;
                        -webkit-background-clip: text;
                        background-clip: text;
                        color: transparent;
                        display: inline-block;
                    }

                    .letter-3d.letter-visible {
                        animation:
                            letter-flip 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                            letter-wave 2.5s ease-in-out 0.7s var(--wave-delay) infinite;
                    }
                    .letter-3d.letter-visible .letter-main {
                        animation: color-shift 4s ease-in-out infinite, glow-pulse-text 2.5s ease-in-out infinite;
                    }

                    @keyframes letter-flip {
                        0% {
                            transform: rotateX(-90deg) translateY(30px) scale(0.3);
                            opacity: 0;
                        }
                        50% {
                            transform: rotateX(15deg) translateY(-8px) scale(1.15);
                            opacity: 1;
                        }
                        70% {
                            transform: rotateX(-5deg) translateY(2px) scale(1.02);
                        }
                        100% {
                            transform: rotateX(0deg) translateY(0) scale(1);
                            opacity: 1;
                        }
                    }
                    @keyframes letter-wave {
                        0%, 100% {
                            transform: translateY(0) rotateZ(0deg) scale(1);
                        }
                        25% {
                            transform: translateY(-8px) rotateZ(-1deg) scale(1.02);
                        }
                        75% {
                            transform: translateY(4px) rotateZ(0.5deg) scale(0.99);
                        }
                    }
                    @keyframes color-shift {
                        0%, 100% {
                            background-position: 0% 50%;
                        }
                        50% {
                            background-position: 100% 50%;
                        }
                    }
                    @keyframes glow-pulse-text {
                        0%, 100% {
                            filter: drop-shadow(0 0 10px rgba(74, 222, 128, 0.7))
                                    drop-shadow(0 0 20px rgba(16, 185, 129, 0.5))
                                    drop-shadow(0 0 40px rgba(16, 185, 129, 0.2));
                        }
                        50% {
                            filter: drop-shadow(0 0 15px rgba(134, 239, 172, 0.9))
                                    drop-shadow(0 0 30px rgba(52, 211, 153, 0.6))
                                    drop-shadow(0 0 60px rgba(34, 197, 94, 0.3));
                        }
                    }

                    /* Tagline - elegant italics */
                    .tagline {
                        font-family: 'Fraunces', Georgia, serif;
                        font-size: 1.35rem;
                        font-weight: 400;
                        font-style: italic;
                        font-variation-settings: "SOFT" 50, "WONK" 0;
                        color: rgba(187, 247, 208, 0.95);
                        transform: translateY(20px);
                        opacity: 0;
                        transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
                        text-shadow:
                            0 2px 4px rgba(0, 0, 0, 0.3),
                            0 4px 12px rgba(0, 0, 0, 0.2);
                        letter-spacing: 0.03em;
                    }
                    .tagline.tagline-visible {
                        transform: translateY(0);
                        opacity: 1;
                    }
                `}</style>
            </div>
        );
    }

    // Cinematic CSS animation with 3D text
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden splash-container">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#021a13] via-[#064e3b] to-[#022c22] animate-gradient-shift" />

            {/* Floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="particle"
                        style={{
                            '--delay': `${i * 0.3}s`,
                            '--x-start': `${Math.random() * 100}%`,
                            '--x-end': `${Math.random() * 100}%`,
                            '--size': `${4 + Math.random() * 8}px`,
                            '--duration': `${3 + Math.random() * 4}s`,
                        } as React.CSSProperties}
                    />
                ))}
            </div>

            {/* Glowing orbs */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="orb orb-1" />
                <div className="orb orb-2" />
                <div className="orb orb-3" />
            </div>

            {/* Main content */}
            <div className="relative z-10 text-center px-4" style={{ perspective: '1000px' }}>
                {/* Logo with 3D pop effect */}
                <div
                    className={`mx-auto mb-8 logo-container ${phase >= 1 ? 'logo-visible' : ''}`}
                >
                    <div className="logo-inner">
                        <span className="text-6xl">🥗</span>
                    </div>
                    <div className="logo-glow" />
                </div>

                {/* 3D Animated Title */}
                <h1 className="title-container mb-4" style={{ perspective: '800px' }}>
                    {LETTERS.map((letter, i) => (
                        <span
                            key={i}
                            className={`letter-3d ${lettersVisible[i] ? 'letter-visible' : ''}`}
                            data-letter={letter === ' ' ? '\u00A0' : letter}
                            style={{
                                '--letter-index': i,
                                '--wave-delay': `${i * 0.1}s`,
                            } as React.CSSProperties}
                        >
                            {/* Shadow layers for 3D depth */}
                            <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                            <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                            <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                            <span className="letter-shadow" aria-hidden="true">{letter === ' ' ? '\u00A0' : letter}</span>
                            {/* Main gradient letter */}
                            <span className="letter-main">{letter === ' ' ? '\u00A0' : letter}</span>
                        </span>
                    ))}
                </h1>

                {/* Tagline with fade and slide */}
                <p
                    className={`tagline ${phase >= 3 ? 'tagline-visible' : ''}`}
                >
                    Track freshness. Reduce waste.
                </p>

                {/* Animated loading dots */}
                <div className={`loading-dots ${phase >= 3 ? 'dots-visible' : ''}`}>
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="dot" style={{ '--dot-index': i } as React.CSSProperties} />
                    ))}
                </div>
            </div>

            {/* Fade out overlay */}
            <div className={`absolute inset-0 bg-[#021a13] transition-opacity duration-700 pointer-events-none ${phase >= 4 ? 'opacity-100' : 'opacity-0'}`} />

            <style>{`
                /* Gradient animation */
                @keyframes gradient-shift {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
                .animate-gradient-shift {
                    background-size: 200% 200%;
                    animation: gradient-shift 8s ease infinite;
                }

                /* Floating particles */
                .particle {
                    position: absolute;
                    width: var(--size);
                    height: var(--size);
                    background: radial-gradient(circle, rgba(134, 239, 172, 0.8) 0%, transparent 70%);
                    border-radius: 50%;
                    left: var(--x-start);
                    bottom: -20px;
                    animation: float-particle var(--duration) ease-in-out var(--delay) infinite;
                }
                @keyframes float-particle {
                    0% {
                        transform: translateY(0) translateX(0) scale(0);
                        opacity: 0;
                    }
                    10% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    90% {
                        opacity: 0.6;
                    }
                    100% {
                        transform: translateY(-100vh) translateX(calc(var(--x-end) - var(--x-start))) scale(0.5);
                        opacity: 0;
                    }
                }

                /* Glowing orbs */
                .orb {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(60px);
                    opacity: 0.4;
                    animation: orb-pulse 4s ease-in-out infinite;
                }
                .orb-1 {
                    width: 300px;
                    height: 300px;
                    background: linear-gradient(135deg, #22c55e, #10b981);
                    top: -100px;
                    left: -100px;
                    animation-delay: 0s;
                }
                .orb-2 {
                    width: 250px;
                    height: 250px;
                    background: linear-gradient(135deg, #34d399, #059669);
                    bottom: -50px;
                    right: -80px;
                    animation-delay: 1.5s;
                }
                .orb-3 {
                    width: 200px;
                    height: 200px;
                    background: linear-gradient(135deg, #6ee7b7, #14b8a6);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    animation-delay: 3s;
                }
                @keyframes orb-pulse {
                    0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.3; }
                    50% { transform: scale(1.2) translate(10px, -10px); opacity: 0.5; }
                }

                /* Logo animation */
                .logo-container {
                    position: relative;
                    width: 120px;
                    height: 120px;
                    transform: scale(0) rotateX(-90deg);
                    transform-style: preserve-3d;
                    transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .logo-container.logo-visible {
                    transform: scale(1) rotateX(0deg);
                }
                .logo-inner {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(145deg, #ffffff, #e8f5e9);
                    border-radius: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow:
                        0 4px 6px rgba(0, 0, 0, 0.1),
                        0 10px 20px rgba(0, 0, 0, 0.15),
                        0 20px 40px rgba(0, 0, 0, 0.2),
                        inset 0 -4px 8px rgba(0, 0, 0, 0.05),
                        inset 0 4px 8px rgba(255, 255, 255, 0.8);
                    transform-style: preserve-3d;
                    animation: logo-float 3s ease-in-out infinite;
                }
                .logo-glow {
                    position: absolute;
                    inset: -20px;
                    background: radial-gradient(circle, rgba(74, 222, 128, 0.4) 0%, transparent 70%);
                    border-radius: 50%;
                    animation: glow-pulse 2s ease-in-out infinite;
                }
                @keyframes logo-float {
                    0%, 100% { transform: translateY(0) rotateY(0deg); }
                    50% { transform: translateY(-8px) rotateY(5deg); }
                }
                @keyframes glow-pulse {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }

                /* 3D Letter animation - Premium Fraunces typography */
                .title-container {
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 0;
                    font-family: 'Fraunces', Georgia, serif;
                    font-optical-sizing: auto;
                    letter-spacing: -0.02em;
                }
                .letter-3d {
                    display: inline-block;
                    font-size: clamp(2.5rem, 10vw, 4rem);
                    font-weight: 600;
                    font-style: normal;
                    font-variation-settings: "SOFT" 100, "WONK" 1;
                    position: relative;
                    transform: rotateX(-90deg) translateY(20px);
                    opacity: 0;
                    transform-style: preserve-3d;
                }

                /* Stacked shadow layers for 3D depth - deeper shadows */
                .letter-shadow {
                    position: absolute;
                    left: 0;
                    top: 0;
                    color: rgba(0, 40, 20, 0.5);
                    -webkit-text-stroke: 0;
                }
                .letter-shadow:nth-child(1) {
                    transform: translate(2px, 2px);
                    color: rgba(0, 40, 20, 0.4);
                }
                .letter-shadow:nth-child(2) {
                    transform: translate(4px, 4px);
                    color: rgba(0, 40, 20, 0.3);
                }
                .letter-shadow:nth-child(3) {
                    transform: translate(6px, 6px);
                    color: rgba(0, 40, 20, 0.2);
                }
                .letter-shadow:nth-child(4) {
                    transform: translate(8px, 8px);
                    color: rgba(0, 40, 20, 0.15);
                    filter: blur(4px);
                }

                /* Main gradient letter on top - richer gradient */
                .letter-main {
                    position: relative;
                    background: linear-gradient(
                        160deg,
                        #bbf7d0 0%,
                        #4ade80 20%,
                        #22c55e 40%,
                        #16a34a 60%,
                        #4ade80 80%,
                        #86efac 100%
                    );
                    background-size: 300% 300%;
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    display: inline-block;
                }

                .letter-3d.letter-visible {
                    animation:
                        letter-flip 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                        letter-wave 2.5s ease-in-out 0.7s var(--wave-delay) infinite;
                }
                .letter-3d.letter-visible .letter-main {
                    animation: color-shift 4s ease-in-out infinite, glow-pulse-text 2.5s ease-in-out infinite;
                }

                @keyframes letter-flip {
                    0% {
                        transform: rotateX(-90deg) translateY(30px) scale(0.3);
                        opacity: 0;
                    }
                    50% {
                        transform: rotateX(15deg) translateY(-8px) scale(1.15);
                        opacity: 1;
                    }
                    70% {
                        transform: rotateX(-5deg) translateY(2px) scale(1.02);
                    }
                    100% {
                        transform: rotateX(0deg) translateY(0) scale(1);
                        opacity: 1;
                    }
                }
                @keyframes letter-wave {
                    0%, 100% {
                        transform: translateY(0) rotateZ(0deg) scale(1);
                    }
                    25% {
                        transform: translateY(-8px) rotateZ(-1deg) scale(1.02);
                    }
                    75% {
                        transform: translateY(4px) rotateZ(0.5deg) scale(0.99);
                    }
                }
                @keyframes color-shift {
                    0%, 100% {
                        background-position: 0% 50%;
                    }
                    50% {
                        background-position: 100% 50%;
                    }
                }
                @keyframes glow-pulse-text {
                    0%, 100% {
                        filter: drop-shadow(0 0 10px rgba(74, 222, 128, 0.7))
                                drop-shadow(0 0 20px rgba(16, 185, 129, 0.5))
                                drop-shadow(0 0 40px rgba(16, 185, 129, 0.2));
                    }
                    50% {
                        filter: drop-shadow(0 0 15px rgba(134, 239, 172, 0.9))
                                drop-shadow(0 0 30px rgba(52, 211, 153, 0.6))
                                drop-shadow(0 0 60px rgba(34, 197, 94, 0.3));
                    }
                }

                /* Tagline - elegant italics */
                .tagline {
                    font-family: 'Fraunces', Georgia, serif;
                    font-size: 1.35rem;
                    font-weight: 400;
                    font-style: italic;
                    font-variation-settings: "SOFT" 50, "WONK" 0;
                    color: rgba(187, 247, 208, 0.95);
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
                    text-shadow:
                        0 2px 4px rgba(0, 0, 0, 0.3),
                        0 4px 12px rgba(0, 0, 0, 0.2);
                    letter-spacing: 0.03em;
                }
                .tagline.tagline-visible {
                    transform: translateY(0);
                    opacity: 1;
                }

                /* Loading dots */
                .loading-dots {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin-top: 2rem;
                    opacity: 0;
                    transition: opacity 0.4s ease;
                }
                .loading-dots.dots-visible {
                    opacity: 1;
                }
                .dot {
                    width: 10px;
                    height: 10px;
                    background: linear-gradient(135deg, #4ade80, #22c55e);
                    border-radius: 50%;
                    animation: dot-bounce 1.4s ease-in-out calc(var(--dot-index) * 0.16s) infinite;
                    box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
                }
                @keyframes dot-bounce {
                    0%, 80%, 100% {
                        transform: scale(0.8) translateY(0);
                        opacity: 0.5;
                    }
                    40% {
                        transform: scale(1.2) translateY(-12px);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
