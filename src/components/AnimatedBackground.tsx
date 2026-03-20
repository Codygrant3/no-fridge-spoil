/**
 * AnimatedBackground — Apple-style ambient depth
 *
 * Deep emerald gradient base with soft floating light orbs
 * and subtle noise for organic texture. Minimal and refined.
 */

export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            {/* Base gradient — deep emerald to near-black */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at 30% 20%, rgba(6, 78, 59, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(4, 120, 87, 0.2) 0%, transparent 50%), var(--bg-primary)',
                }}
            />

            {/* Floating light orb — top right */}
            <div
                className="absolute -top-24 -right-24 w-80 h-80 rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(52, 211, 153, 0.08) 0%, transparent 70%)',
                    filter: 'blur(60px)',
                    animation: 'orb-drift 12s ease-in-out infinite',
                }}
            />

            {/* Floating light orb — bottom left */}
            <div
                className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 70%)',
                    filter: 'blur(80px)',
                    animation: 'orb-drift 16s ease-in-out 4s infinite reverse',
                }}
            />

            {/* Center ambient glow */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
                style={{
                    background: 'radial-gradient(circle, rgba(6, 95, 70, 0.1) 0%, transparent 60%)',
                    filter: 'blur(100px)',
                }}
            />

            {/* Subtle vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 40%, var(--bg-primary) 100%)',
                }}
            />

            {/* Noise texture — very subtle grain */}
            <div
                className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
            />

            <style>{`
                @keyframes orb-drift {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(20px, -15px) scale(1.05); }
                    66% { transform: translate(-10px, 10px) scale(0.95); }
                }
            `}</style>
        </div>
    );
}
