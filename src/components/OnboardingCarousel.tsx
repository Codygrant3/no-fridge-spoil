import { useState, useEffect } from 'react';

const steps = [
    {
        image: '/onboarding/step1.png',
        title: 'Shop for Groceries',
        description: 'Pick up your favorite foods at the store',
    },
    {
        image: '/onboarding/step2.png',
        title: 'Head Home',
        description: 'Load up and bring your groceries home',
    },
    {
        image: '/onboarding/step3.png',
        title: 'Scan & Store',
        description: 'Scan expiration dates as you stock up!',
    },
];

interface OnboardingCarouselProps {
    onStartClick?: () => void;
}

export function OnboardingCarousel({ onStartClick }: OnboardingCarouselProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsTransitioning(true);
            setTimeout(() => {
                setCurrentStep((prev) => (prev + 1) % steps.length);
                setIsTransitioning(false);
            }, 300);
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    const step = steps[currentStep];

    return (
        <div className="flex flex-col items-center justify-center py-8 px-4">
            {/* Image Container */}
            <div className="relative w-64 h-64 mb-6">
                <img
                    src={step.image}
                    alt={step.title}
                    className={`
            w-full h-full object-contain rounded-2xl
            transition-all duration-300 ease-in-out
            ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
          `}
                />
            </div>

            {/* Text Content */}
            <div
                className={`
          text-center transition-all duration-300 ease-in-out
          ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
        `}
            >
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                    {step.title}
                </h3>
                <p className="text-[var(--text-secondary)] text-sm">
                    {step.description}
                </p>
            </div>

            {/* Progress Dots */}
            <div className="flex gap-2 mt-6">
                {steps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            setIsTransitioning(true);
                            setTimeout(() => {
                                setCurrentStep(index);
                                setIsTransitioning(false);
                            }, 150);
                        }}
                        className={`
              w-2 h-2 rounded-full transition-all duration-300
              ${currentStep === index
                                ? 'bg-green-500 w-6'
                                : 'bg-gray-400 hover:bg-gray-300'}
            `}
                        aria-label={`Go to step ${index + 1}`}
                    />
                ))}
            </div>

            {/* Call to Action */}
            <button
                onClick={onStartClick}
                className="mt-8 text-[var(--text-secondary)] text-sm animate-pulse hover:text-[var(--accent-color)] transition-colors focus:outline-none"
            >
                Tap the <span className="font-semibold text-green-500">Scan</span> tab to get started!
            </button>
        </div>
    );
}
