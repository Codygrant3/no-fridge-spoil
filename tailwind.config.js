/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Custom Font Families
            fontFamily: {
                display: ['Fraunces', 'Georgia', 'serif'],
                body: ['DM Sans', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            // Extended Color Palette
            colors: {
                // Botanical greens
                moss: {
                    deep: '#1a3329',
                    DEFAULT: '#2d5a45',
                    light: '#4a7c5f',
                },
                sage: {
                    soft: '#94a89a',
                    DEFAULT: '#7d9183',
                    dark: '#5a6b5f',
                },
                cream: {
                    warm: '#faf8f5',
                    DEFAULT: '#f5f2ed',
                    dark: '#e8e4dc',
                },
                earth: {
                    brown: '#5c4033',
                    DEFAULT: '#8b6f4e',
                    light: '#a89078',
                },
                // Status colors (semantic)
                fresh: {
                    DEFAULT: '#4ade80',
                    dark: '#22c55e',
                    glow: 'rgba(74, 222, 128, 0.3)',
                },
                urgent: {
                    DEFAULT: '#ef4444',
                    dark: '#dc2626',
                    glow: 'rgba(239, 68, 68, 0.3)',
                },
                warning: {
                    DEFAULT: '#f59e0b',
                    dark: '#d97706',
                    glow: 'rgba(245, 158, 11, 0.3)',
                },
                // Surface colors
                surface: {
                    primary: 'var(--bg-primary)',
                    secondary: 'var(--bg-secondary)',
                    tertiary: 'var(--bg-tertiary)',
                    glass: 'rgba(20, 27, 45, 0.7)',
                },
            },
            // Animation timing functions
            transitionTimingFunction: {
                'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'smooth-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
                'smooth-in': 'cubic-bezier(0.55, 0, 1, 0.45)',
            },
            // Custom animations
            animation: {
                'reveal-up': 'reveal-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                'fill-bar': 'fill-bar 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'urgent-pulse': 'urgent-pulse 3s ease-in-out infinite',
                'fade-in': 'fade-in 0.3s ease-out forwards',
                'scale-in': 'scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
            },
            keyframes: {
                'reveal-up': {
                    '0%': { opacity: '0', transform: 'translateY(24px) scale(0.96)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                'fill-bar': {
                    '0%': { width: '0%' },
                    '100%': { width: 'var(--bar-width, 100%)' },
                },
                'urgent-pulse': {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
                    '50%': { boxShadow: '0 0 20px 4px rgba(239, 68, 68, 0.3)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.9)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(16px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'glow-pulse': {
                    '0%, 100%': { opacity: '0.5' },
                    '50%': { opacity: '1' },
                },
            },
            // Box shadows
            boxShadow: {
                'card': '0 8px 24px rgba(0, 0, 0, 0.4)',
                'card-hover': '0 12px 32px rgba(0, 0, 0, 0.5)',
                'card-glass': '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                'glow-green': '0 0 20px rgba(74, 222, 128, 0.3)',
                'glow-red': '0 0 20px rgba(239, 68, 68, 0.3)',
                'glow-amber': '0 0 20px rgba(245, 158, 11, 0.3)',
                'nav': '0 -4px 24px rgba(0, 0, 0, 0.3)',
                'fab': '0 4px 16px rgba(74, 222, 128, 0.4)',
            },
            // Backdrop blur
            backdropBlur: {
                'glass': '12px',
                'nav': '16px',
            },
            // Border radius
            borderRadius: {
                '4xl': '2rem',
            },
        },
    },
    plugins: [],
}
