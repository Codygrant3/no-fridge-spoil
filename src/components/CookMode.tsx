import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Mic, RefreshCw, HelpCircle } from 'lucide-react';
import type { Recipe } from '../services/recipeService';
import { VoiceService, type VoiceCommand } from '../services/voiceService';
import type { InventoryItem } from '../types';
import { getSubstitutions, enrichWithInventory, type IngredientSubstitution } from '../services/substitutionService';
import { CookTimer, type CookTimerHandle } from './CookTimer';

interface CookModeProps {
    recipe: Recipe;
    items: InventoryItem[];
    onClose: () => void;
}

// Example pro tips for each step
const getProTip = (stepIndex: number): string | null => {
    const tips = [
        "Pro tip: Let ingredients reach room temperature for even cooking.",
        "Pro tip: Adding a pinch of salt now will help draw out moisture and speed up the caramelization process.",
        "Pro tip: Don't crowd the pan - work in batches for best results.",
        "Pro tip: Taste as you go and adjust seasoning gradually.",
        "Pro tip: Let the dish rest for a few minutes before serving.",
    ];
    return tips[stepIndex % tips.length] || null;
};

// Ingredient icons mapping
const getIngredientIcon = (ingredient: string): string => {
    const lower = ingredient.toLowerCase();
    if (lower.includes('butter')) return '🧈';
    if (lower.includes('onion')) return '🧅';
    if (lower.includes('garlic')) return '🧄';
    if (lower.includes('wine')) return '🍷';
    if (lower.includes('rice')) return '🍚';
    if (lower.includes('cheese')) return '🧀';
    if (lower.includes('chicken')) return '🍗';
    if (lower.includes('salt') || lower.includes('pepper')) return '🧂';
    if (lower.includes('oil')) return '🫒';
    if (lower.includes('tomato')) return '🍅';
    return '🥄';
};

export function CookMode({ recipe, items, onClose }: CookModeProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
    const [isListening, setIsListening] = useState(false);
    const timerRef = useRef<CookTimerHandle>(null);
    const [voiceService, setVoiceService] = useState<VoiceService | null>(null);
    const [voiceStatus, setVoiceStatus] = useState<string>('');
    const [selectedIngredient, setSelectedIngredient] = useState<string | null>(null);
    const [substitution, setSubstitution] = useState<IngredientSubstitution | null>(null);
    const [showVoiceHelp, setShowVoiceHelp] = useState(false);

    const totalSteps = recipe.instructions.length;
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === totalSteps - 1;
    const progress = ((currentStep + 1) / totalSteps) * 100;

    // Ref to always hold the latest voice command handler (avoids stale closures)
    const handleVoiceCommandRef = useRef<(command: VoiceCommand, parameters?: Record<string, string | number>) => void>(() => {});

    // Initialize VoiceService
    useEffect(() => {
        const service = new VoiceService({
            onTranscript: (text) => {
                setVoiceStatus(`"${text}"`);
            },
            onResponse: (response) => {
                handleVoiceCommandRef.current(response.command, response.parameters);
                setVoiceStatus(response.spokenResponse);
            },
            onListeningChange: setIsListening,
            onError: (error) => {
                console.error('Voice error:', error);
                setVoiceStatus('Voice not available');
            },
            useGoogleTTS: true, // Enable Google TTS for better quality
            autoReadSteps: true, // Auto-read steps when advancing
        });
        setVoiceService(service);

        return () => {
            service.destroy();
        };
    }, []);

    // Handle voice commands
    const handleVoiceCommand = useCallback((command: VoiceCommand, parameters?: Record<string, string | number>) => {
        const timer = timerRef.current;
        const resetTimer = () => { timer?.setSeconds(5 * 60); timer?.pause(); };

        switch (command) {
            case 'next_step':
                if (!isLastStep) {
                    const nextStepIdx = currentStep + 1;
                    setCurrentStep(nextStepIdx);
                    resetTimer();
                    setTimeout(() => {
                        voiceService?.speak(recipe.instructions[nextStepIdx]);
                    }, 500);
                }
                break;
            case 'previous_step':
                if (!isFirstStep) {
                    const prevStepIdx = currentStep - 1;
                    setCurrentStep(prevStepIdx);
                    resetTimer();
                    setTimeout(() => {
                        voiceService?.speak(recipe.instructions[prevStepIdx]);
                    }, 500);
                }
                break;
            case 'start_timer':
                timer?.start();
                voiceService?.speak('Timer started');
                break;
            case 'pause_timer':
                timer?.pause();
                voiceService?.speak('Timer paused');
                break;
            case 'set_timer':
                if (parameters?.minutes) {
                    const minutes = Number(parameters.minutes);
                    timer?.setSeconds(minutes * 60);
                    timer?.start();
                    voiceService?.speak(`Timer set for ${minutes} minutes`);
                }
                break;
            case 'check_timer': {
                const secs = timer?.getSeconds() ?? 0;
                const mins = Math.floor(secs / 60);
                const rem = secs % 60;
                voiceService?.speak(`${mins} minutes and ${rem} seconds remaining`);
                break;
            }
            case 'next_ingredient': {
                const nextIdx = recipe.ingredients.findIndex((_, idx) => !checkedIngredients.has(idx));
                if (nextIdx >= 0) {
                    voiceService?.speak(`Next ingredient: ${recipe.ingredients[nextIdx]}`);
                } else {
                    voiceService?.speak('All ingredients are checked off');
                }
                break;
            }
            case 'skip_to_step':
                if (parameters?.stepNumber) {
                    const stepNum = Number(parameters.stepNumber) - 1;
                    if (stepNum >= 0 && stepNum < totalSteps) {
                        setCurrentStep(stepNum);
                        resetTimer();
                        setTimeout(() => {
                            voiceService?.speak(recipe.instructions[stepNum]);
                        }, 500);
                    }
                }
                break;
            case 'what_temperature': {
                const tempMatch = recipe.instructions[currentStep].match(/(\d+)\s*°?[FC]/i);
                if (tempMatch) {
                    voiceService?.speak(`The temperature is ${tempMatch[0]}`);
                } else {
                    voiceService?.speak("I don't see a temperature mentioned in this step");
                }
                break;
            }
            case 'repeat':
                voiceService?.speak(recipe.instructions[currentStep]);
                break;
            default:
                break;
        }
    }, [isLastStep, isFirstStep, currentStep, recipe.instructions, recipe.ingredients, voiceService, checkedIngredients, totalSteps]);

    // Keep ref in sync with latest handler
    handleVoiceCommandRef.current = handleVoiceCommand;

    const toggleIngredient = (index: number) => {
        const newChecked = new Set(checkedIngredients);
        if (newChecked.has(index)) {
            newChecked.delete(index);
        } else {
            newChecked.add(index);
        }
        setCheckedIngredients(newChecked);
    };

    const handleSubstitutionClick = (ingredient: string) => {
        const sub = getSubstitutions(ingredient);
        if (sub) {
            setSelectedIngredient(ingredient);
            setSubstitution(enrichWithInventory(sub, items));
        }
    };

    const nextStep = useCallback(() => {
        if (!isLastStep) {
            setCurrentStep(prev => prev + 1);
            timerRef.current?.setSeconds(5 * 60);
            timerRef.current?.pause();
        }
    }, [isLastStep]);

    const prevStep = useCallback(() => {
        if (!isFirstStep) {
            setCurrentStep(prev => prev - 1);
            timerRef.current?.setSeconds(5 * 60);
            timerRef.current?.pause();
        }
    }, [isFirstStep]);

    // Toggle listening state
    const toggleListening = () => {
        if (voiceService) {
            if (isListening) {
                voiceService.stopListening();
            } else {
                voiceService.startListening();
            }
        }
    };

    const proTip = getProTip(currentStep);

    return (
        <div className="fixed inset-0 bg-[var(--bg-primary)] z-50 flex flex-col">
            {/* Header */}
            <header className="shrink-0">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        onClick={onClose}
                        className="p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] inventory-card"
                        aria-label="Exit Cook Mode"
                    >
                        <X className="w-6 h-6 text-white" />
                    </button>
                    <div className="text-center">
                        <p className="text-[var(--accent-color)] text-xs font-bold tracking-wider">NOW COOKING</p>
                        <h1 className="text-white font-bold text-lg">{recipe.title}</h1>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowVoiceHelp(!showVoiceHelp)}
                            className="p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] inventory-card"
                            aria-label="Voice commands help"
                        >
                            <HelpCircle className="w-6 h-6 text-white" />
                        </button>
                        <button
                            onClick={toggleListening}
                            className={`p-2 rounded-lg transition-all border inventory-card ${isListening ? 'bg-[var(--accent-color)] text-white animate-pulse border-[var(--accent-color)] glow-green' : 'bg-[var(--bg-secondary)] text-white hover:bg-[var(--bg-tertiary)] border-[var(--border-color)]'
                                }`}
                            aria-label="Voice commands"
                        >
                            <Mic className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="px-4 pb-3">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
                        <span className="font-semibold">STEP {currentStep + 1} OF {totalSteps}</span>
                        <span className="text-[var(--accent-color)] font-bold">{Math.round(progress)}% COMPLETE</span>
                    </div>
                    <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[var(--accent-color)] rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Ingredients Sidebar */}
                <div className="w-20 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] py-4 flex flex-col items-center overflow-y-auto shrink-0">
                    <p className="text-xs text-[var(--text-muted)] mb-4 font-bold tracking-wide">PREP</p>
                    {recipe.ingredients.slice(0, 5).map((ingredient, index) => (
                        <div key={index} className="relative mb-3">
                            <button
                                onClick={() => toggleIngredient(index)}
                                className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all inventory-card ${checkedIngredients.has(index)
                                    ? 'bg-green-500/20 border-2 border-[var(--accent-color)] glow-green'
                                    : 'bg-[var(--bg-tertiary)] border-2 border-transparent hover:border-[var(--border-color)]'
                                    }`}
                            >
                                {checkedIngredients.has(index) ? (
                                    <Check className="w-5 h-5 text-[var(--accent-color)]" />
                                ) : (
                                    <span className="text-2xl">{getIngredientIcon(ingredient)}</span>
                                )}
                            </button>

                            {/* SUBSTITUTION BUTTON */}
                            {getSubstitutions(ingredient) && (
                                <button
                                    onClick={() => handleSubstitutionClick(ingredient)}
                                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center shadow-lg inventory-card border border-blue-400"
                                    title={`Find substitute for ${ingredient}`}
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
                    {/* Circular Timer — isolated component to avoid full re-renders */}
                    <CookTimer ref={timerRef} voiceService={voiceService} />

                    {/* Current Instruction */}
                    <div className="text-center max-w-md">
                        <h2 className="text-2xl font-bold text-white mb-4 leading-relaxed">
                            {recipe.instructions[currentStep]}
                        </h2>
                    </div>

                    {/* Pro Tip */}
                    {proTip && (
                        <div className="mt-6 bg-green-900/20 border border-[var(--accent-color)]/30 rounded-xl p-5 max-w-md inventory-card">
                            <div className="flex items-start gap-3">
                                <span className="text-3xl">💡</span>
                                <p className="text-[var(--accent-color)] text-sm font-medium leading-relaxed">{proTip}</p>
                            </div>
                        </div>
                    )}

                    {/* Voice Status / Listening Indicator */}
                    {(isListening || voiceStatus) && (
                        <div className="mt-6 flex items-center gap-2 text-[var(--accent-color)] bg-[var(--bg-secondary)] px-4 py-2 rounded-full border border-[var(--border-color)] inventory-card">
                            {isListening && (
                                <span className="w-2 h-2 bg-[var(--accent-color)] rounded-full animate-pulse" />
                            )}
                            <span className="text-sm font-bold tracking-wide">
                                {isListening ? 'LISTENING FOR "NEXT"' : voiceStatus}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-color)] p-4 flex items-center gap-3 shrink-0">
                <button
                    onClick={prevStep}
                    disabled={isFirstStep}
                    className={`flex items-center gap-2 px-6 py-4 rounded-xl font-bold transition-all inventory-card ${isFirstStep
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-color)]'
                        : 'bg-[var(--bg-tertiary)] text-white hover:bg-[var(--bg-primary)] border border-[var(--border-color)]'
                        }`}
                >
                    <ChevronLeft className="w-5 h-5" />
                    PREVIOUS
                </button>

                <button
                    onClick={isLastStep ? onClose : nextStep}
                    className="flex-1 flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold bg-[var(--accent-color)] text-white hover:bg-green-600 transition-all action-button glow-green"
                >
                    {isLastStep ? (
                        <>
                            <Check className="w-6 h-6" />
                            DONE COOKING!
                        </>
                    ) : (
                        <>
                            NEXT STEP
                            <ChevronRight className="w-6 h-6" />
                        </>
                    )}
                </button>
            </div>

            {/* Voice Commands Help Modal */}
            {showVoiceHelp && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
                    <div className="bg-[var(--bg-primary)] w-full rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto border-t border-[var(--border-color)]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-white text-2xl font-bold flex items-center gap-2">
                                <Mic className="w-6 h-6 text-[var(--accent-color)]" />
                                Voice Commands
                            </h3>
                            <button
                                onClick={() => setShowVoiceHelp(false)}
                                className="text-[var(--text-secondary)] hover:text-white p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] inventory-card">
                                <h4 className="text-[var(--accent-color)] font-bold text-sm mb-2">NAVIGATION</h4>
                                <ul className="text-[var(--text-primary)] text-sm space-y-1">
                                    <li>• "Next" or "Next step" - Go to next step</li>
                                    <li>• "Previous" or "Go back" - Previous step</li>
                                    <li>• "Go to step 3" - Jump to specific step</li>
                                    <li>• "Repeat" - Hear current step again</li>
                                </ul>
                            </div>

                            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] inventory-card">
                                <h4 className="text-[var(--accent-color)] font-bold text-sm mb-2">TIMER</h4>
                                <ul className="text-[var(--text-primary)] text-sm space-y-1">
                                    <li>• "Start timer" - Begin countdown</li>
                                    <li>• "Pause timer" - Pause countdown</li>
                                    <li>• "Set timer for 10 minutes" - Custom time</li>
                                    <li>• "How much time left?" - Check timer</li>
                                </ul>
                            </div>

                            <div className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] inventory-card">
                                <h4 className="text-[var(--accent-color)] font-bold text-sm mb-2">INGREDIENTS</h4>
                                <ul className="text-[var(--text-primary)] text-sm space-y-1">
                                    <li>• "Next ingredient" - What's next in prep</li>
                                    <li>• "What temperature?" - Check oven temp</li>
                                </ul>
                            </div>
                        </div>

                        <div className="p-4 bg-green-900/20 border border-[var(--accent-color)]/30 rounded-xl inventory-card">
                            <p className="text-[var(--accent-color)] text-sm">
                                💡 <strong className="font-bold">Tip:</strong> Press and hold the microphone button while speaking for best results. The app uses Google's AI to understand natural language!
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Substitution Modal */}
            {substitution && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
                    <div className="bg-[var(--bg-primary)] w-full rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto border-t border-[var(--border-color)]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-white text-2xl font-bold">
                                Substitute for {selectedIngredient}
                            </h3>
                            <button
                                onClick={() => setSubstitution(null)}
                                className="text-[var(--text-secondary)] hover:text-white p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Alternatives List */}
                        <div className="space-y-4 mb-6">
                            {substitution.alternatives.map((alt, i) => (
                                <div
                                    key={i}
                                    className={`p-5 rounded-xl border transition-all inventory-card ${
                                        alt.inInventory
                                            ? 'bg-green-900/20 border-[var(--accent-color)]/50 glow-green'
                                            : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <h4 className="text-white font-bold text-lg">{alt.name}</h4>
                                        {alt.inInventory && (
                                            <span className="px-3 py-1 bg-[var(--accent-color)] text-white text-xs rounded-full font-bold">
                                                In Fridge
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[var(--accent-color)] text-sm mb-2 font-semibold">
                                        Ratio: {alt.ratio}
                                    </p>
                                    <p className="text-[var(--text-secondary)] text-sm mb-1">
                                        Flavor: {alt.flavorImpact}
                                    </p>
                                    {alt.textureImpact && (
                                        <p className="text-[var(--text-secondary)] text-sm mb-1">
                                            Texture: {alt.textureImpact}
                                        </p>
                                    )}
                                    <p className="text-[var(--text-primary)] text-sm mt-2">
                                        {alt.notes}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Pro Tip */}
                        <div className="p-5 bg-blue-900/20 border border-blue-500/30 rounded-xl inventory-card">
                            <p className="text-blue-400 text-sm font-medium">
                                💡 <strong className="font-bold">Pro Tip:</strong> {substitution.proTip}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
