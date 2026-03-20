import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';

export function CameraTips() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Show tips on first visit
        const hasSeenTips = localStorage.getItem('hasSeenCameraTips');
        if (!hasSeenTips) {
            setIsVisible(true);
        }
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('hasSeenCameraTips', 'true');
    };

    if (!isVisible) return null;

    return (
        <div className="absolute top-4 left-4 right-4 z-50 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-3xl p-4 shadow-2xl animate-slide-down">
            <div className="flex items-start gap-3">
                <Lightbulb className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h3 className="font-bold text-lg mb-2">Camera Tips 📸</h3>
                    <ul className="text-sm space-y-1 leading-relaxed">
                        <li>✓ Take photo in good lighting</li>
                        <li>✓ Hold steady and focus</li>
                        <li>✓ Make expiration date fill ~30–50% of frame</li>
                        <li>✓ Avoid glare and shadows</li>
                    </ul>
                </div>
                <button
                    onClick={handleDismiss}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                    aria-label="Dismiss tips"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
