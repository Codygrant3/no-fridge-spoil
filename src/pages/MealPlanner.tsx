import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { DbMealPlan, MealSlot } from '../db/database';
import { useInventory } from '../context/InventoryContext';
import {
    getOrCreateWeekPlan,
    addMealToSlot,
    removeMealFromSlot,
    addMissingToShoppingList,
    suggestRecipesForSlot,
    getMissingIngredients,
    DAY_LABELS,
    MEAL_SLOTS,
} from '../services/mealPlanService';
import type { Recipe } from '../services/recipeService';
import {
    ChevronLeft,
    Plus,
    X,
    ShoppingCart,
    Sparkles,
    Loader2,
    UtensilsCrossed,
} from 'lucide-react';

interface MealPlannerProps {
    onBack: () => void;
}

export function MealPlanner({ onBack }: MealPlannerProps) {
    const { items } = useInventory();
    const [plan, setPlan] = useState<DbMealPlan | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<{ day: number; slot: MealSlot['slot'] } | null>(null);
    const [suggestedRecipes, setSuggestedRecipes] = useState<Recipe[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [missingCount, setMissingCount] = useState(0);
    const [addedToList, setAddedToList] = useState<number | null>(null);

    // Load current week plan
    useEffect(() => {
        getOrCreateWeekPlan().then(setPlan);
    }, []);

    // Live query for real-time plan updates
    const livePlan = useLiveQuery(
        () => plan ? db.mealPlans.get(plan.id) : undefined,
        [plan?.id],
    );

    // Update missing ingredients count when plan changes
    useEffect(() => {
        if (livePlan) {
            getMissingIngredients(livePlan).then(m => setMissingCount(m.length));
        }
    }, [livePlan]);

    const activePlan = livePlan || plan;

    const getMealForSlot = (day: number, slot: MealSlot['slot']): MealSlot | undefined => {
        return activePlan?.meals.find(m => m.day === day && m.slot === slot);
    };

    const handleSlotClick = async (day: number, slot: MealSlot['slot']) => {
        const existing = getMealForSlot(day, slot);
        if (existing) {
            // Remove meal
            if (activePlan) {
                await removeMealFromSlot(activePlan.id, day, slot);
            }
        } else {
            // Open recipe picker
            setSelectedSlot({ day, slot });
            setSuggestedRecipes([]);
        }
    };

    const handleGenerateRecipes = async () => {
        setIsGenerating(true);
        try {
            const recipes = await suggestRecipesForSlot(items);
            setSuggestedRecipes(recipes);
        } catch (error) {
            console.error('Failed to generate recipes:', error);
        }
        setIsGenerating(false);
    };

    const handleSelectRecipe = async (recipe: Recipe) => {
        if (!activePlan || !selectedSlot) return;
        await addMealToSlot(
            activePlan.id,
            selectedSlot.day,
            selectedSlot.slot,
            recipe.title,
            recipe.ingredients,
        );
        setSelectedSlot(null);
        setSuggestedRecipes([]);
    };

    const handleAddManualMeal = async (name: string) => {
        if (!activePlan || !selectedSlot) return;
        await addMealToSlot(
            activePlan.id,
            selectedSlot.day,
            selectedSlot.slot,
            name,
            [],
        );
        setSelectedSlot(null);
    };

    const handleAddToShoppingList = async () => {
        if (!activePlan) return;
        const count = await addMissingToShoppingList(activePlan);
        setAddedToList(count);
        setTimeout(() => setAddedToList(null), 3000);
    };

    const slotEmoji: Record<MealSlot['slot'], string> = {
        breakfast: '🌅',
        lunch: '☀️',
        dinner: '🌙',
        snack: '🍎',
    };

    return (
        <div className="min-h-full bg-[var(--bg-primary)] text-white pb-32">
            {/* Header */}
            <header className="flex items-center justify-between p-4 pt-12">
                <button
                    onClick={onBack}
                    className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">Meal Planner</h1>
                <button
                    onClick={handleAddToShoppingList}
                    className="relative p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                    title="Add missing ingredients to shopping list"
                >
                    <ShoppingCart className="w-5 h-5" />
                    {missingCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                            {missingCount}
                        </span>
                    )}
                </button>
            </header>

            {/* Added to list feedback */}
            {addedToList !== null && (
                <div className="px-4 pb-3">
                    <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 text-center text-green-300 text-sm font-medium">
                        Added {addedToList} item{addedToList !== 1 ? 's' : ''} to shopping list!
                    </div>
                </div>
            )}

            {/* Week Grid */}
            <div className="px-4 space-y-3">
                {DAY_LABELS.map((dayLabel, dayIndex) => (
                    <div key={dayLabel} className="bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[var(--border-color)] inventory-card">
                        <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
                            {dayLabel}
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                            {MEAL_SLOTS.map(slot => {
                                const meal = getMealForSlot(dayIndex, slot);
                                return (
                                    <button
                                        key={slot}
                                        onClick={() => handleSlotClick(dayIndex, slot)}
                                        className={`flex flex-col items-center p-2 rounded-xl text-center transition-all min-h-[70px] ${
                                            meal
                                                ? 'bg-[var(--accent-color)]/20 border border-[var(--accent-color)]/40'
                                                : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--accent-color)]/50'
                                        }`}
                                    >
                                        <span className="text-lg">{slotEmoji[slot]}</span>
                                        {meal ? (
                                            <span className="text-[10px] text-white font-medium mt-1 leading-tight line-clamp-2">
                                                {meal.recipeName}
                                            </span>
                                        ) : (
                                            <Plus className="w-3.5 h-3.5 text-[var(--text-muted)] mt-1" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Recipe Picker Modal */}
            {selectedSlot && (
                <div
                    className="fixed inset-0 bg-black/70 flex items-end justify-center z-50"
                    onClick={() => { setSelectedSlot(null); setSuggestedRecipes([]); }}
                >
                    <div
                        className="bg-[var(--bg-secondary)] w-full max-w-md rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto border-t border-[var(--border-color)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold">
                                {slotEmoji[selectedSlot.slot]} {selectedSlot.slot.charAt(0).toUpperCase() + selectedSlot.slot.slice(1)} — {DAY_LABELS[selectedSlot.day]}
                            </h3>
                            <button
                                onClick={() => { setSelectedSlot(null); setSuggestedRecipes([]); }}
                                className="p-2 hover:bg-white/10 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* AI Suggest Button */}
                        <button
                            onClick={handleGenerateRecipes}
                            disabled={isGenerating}
                            className="w-full py-3 bg-purple-500/20 border border-purple-500/40 rounded-xl text-purple-300 font-semibold flex items-center justify-center gap-2 mb-4 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                        >
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                            ) : (
                                <><Sparkles className="w-4 h-4" /> Suggest Recipes Using Expiring Items</>
                            )}
                        </button>

                        {/* Suggested Recipes */}
                        {suggestedRecipes.length > 0 && (
                            <div className="space-y-3 mb-4">
                                {suggestedRecipes.map((recipe, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSelectRecipe(recipe)}
                                        className="w-full text-left p-4 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)]/50 transition-all"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <UtensilsCrossed className="w-4 h-4 text-[var(--accent-color)]" />
                                            <span className="font-bold text-sm">{recipe.title}</span>
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] mb-2">{recipe.description}</p>
                                        <div className="flex gap-2 text-[10px] text-[var(--text-muted)]">
                                            <span>⏱ {recipe.prepTime} + {recipe.cookTime}</span>
                                            <span>· {recipe.difficulty}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Quick Add Manual */}
                        <div className="border-t border-[var(--border-color)] pt-4">
                            <p className="text-xs text-[var(--text-muted)] mb-2 font-semibold uppercase tracking-wide">Or add manually</p>
                            <QuickAddMeal onAdd={handleAddManualMeal} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function QuickAddMeal({ onAdd }: { onAdd: (name: string) => void }) {
    const [name, setName] = useState('');

    return (
        <div className="flex gap-2">
            <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Chicken Stir Fry"
                className="flex-1 px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none text-sm"
                onKeyDown={e => {
                    if (e.key === 'Enter' && name.trim()) {
                        onAdd(name.trim());
                        setName('');
                    }
                }}
            />
            <button
                onClick={() => {
                    if (name.trim()) {
                        onAdd(name.trim());
                        setName('');
                    }
                }}
                disabled={!name.trim()}
                className="px-4 py-3 bg-[var(--accent-color)] rounded-xl text-white font-semibold disabled:opacity-50"
            >
                Add
            </button>
        </div>
    );
}
