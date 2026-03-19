/**
 * AnimatedBackground - Refined atmospheric background
 *
 * Design Philosophy: "Botanical Precision"
 * - Subtle gradient orbs for depth
 * - Noise texture for organic feel
 * - Grid pattern for systematic precision
 * - No floating elements (removed emojis for cleaner aesthetic)
 */

export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            {/* Gradient orbs - refined positioning */}
            <div
                className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30 animate-pulse"
                style={{
                    background: 'radial-gradient(circle, rgba(74, 222, 128, 0.15) 0%, transparent 70%)',
                    animationDuration: '4s',
                }}
            />
            <div
                className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full blur-3xl opacity-20 animate-pulse"
                style={{
                    background: 'radial-gradient(circle, rgba(20, 184, 166, 0.12) 0%, transparent 70%)',
                    animationDuration: '5s',
                    animationDelay: '1s',
                }}
            />
            <div
                className="absolute top-1/3 right-0 w-64 h-64 rounded-full blur-2xl opacity-15 animate-pulse"
                style={{
                    background: 'radial-gradient(circle, rgba(132, 204, 22, 0.1) 0%, transparent 70%)',
                    animationDuration: '6s',
                    animationDelay: '2s',
                }}
            />

            {/* Subtle vignette overlay */}
            <div
                className="absolute inset-0 opacity-40"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 0%, var(--bg-primary) 100%)',
                }}
            />

            {/* Noise texture overlay for organic feel */}
            <div
                className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] mix-blend-overlay"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Grid pattern overlay - systematic precision */}
            <div
                className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, currentColor 1px, transparent 1px),
                        linear-gradient(to bottom, currentColor 1px, transparent 1px)
                    `,
                    backgroundSize: '48px 48px',
                }}
            />

            {/* Subtle horizontal lines - adds depth */}
            <div
                className="absolute inset-0 opacity-[0.01] dark:opacity-[0.02]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, currentColor, currentColor 1px, transparent 1px, transparent 120px)',
                }}
            />
        </div>
    );
}
