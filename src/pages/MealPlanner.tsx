import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    Apple,
    ChevronLeft,
    Clock3,
    Loader2,
    Moon,
    Plus,
    ShoppingCart,
    Sparkles,
    Sun,
    Sunrise,
    UtensilsCrossed,
    X,
} from 'lucide-react';
import { db } from '../db/database';
import type { DbMealPlan, MealSlot } from '../db/database';
import { useInventory } from '../context/InventoryContext';
import {
    DAY_LABELS,
    MEAL_SLOTS,
    addMealToSlot,
    addMissingToShoppingList,
    getMissingIngredients,
    getOrCreateWeekPlan,
    removeMealFromSlot,
    suggestRecipesForSlot,
} from '../services/mealPlanService';
import type { RecipeRecommendation } from '../services/recipeService';
import { useModalFocus } from '../hooks/useModalFocus';

interface MealPlannerProps {
    onBack: () => void;
}

const SLOT_DETAILS: Record<MealSlot['slot'], { label: string; icon: typeof Sunrise }> = {
    breakfast: { label: 'Breakfast', icon: Sunrise },
    lunch: { label: 'Lunch', icon: Sun },
    dinner: { label: 'Dinner', icon: Moon },
    snack: { label: 'Snack', icon: Apple },
};

export function MealPlanner({ onBack }: MealPlannerProps) {
    const { items } = useInventory();
    const [plan, setPlan] = useState<DbMealPlan | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<{ day: number; slot: MealSlot['slot'] } | null>(null);
    const [suggestedRecipes, setSuggestedRecipes] = useState<RecipeRecommendation[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [missingCount, setMissingCount] = useState(0);
    const [addedToList, setAddedToList] = useState<number | null>(null);
    const mealPickerRef = useRef<HTMLElement>(null);
    const mealPickerCloseRef = useRef<HTMLButtonElement>(null);

    const closeMealPicker = useCallback(() => {
        setSelectedSlot(null);
        setSuggestedRecipes([]);
    }, []);

    useModalFocus(Boolean(selectedSlot), mealPickerRef, closeMealPicker, mealPickerCloseRef);

    useEffect(() => {
        void getOrCreateWeekPlan().then(setPlan);
    }, []);

    const livePlan = useLiveQuery(
        () => plan ? db.mealPlans.get(plan.id) : undefined,
        [plan?.id],
    );

    useEffect(() => {
        if (livePlan) {
            void getMissingIngredients(livePlan).then(missing => setMissingCount(missing.length));
        }
    }, [livePlan]);

    useEffect(() => {
        if (addedToList === null) return;
        const timeout = window.setTimeout(() => setAddedToList(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [addedToList]);

    const activePlan = livePlan || plan;
    const mealCount = activePlan?.meals.length ?? 0;

    const getMealForSlot = (day: number, slot: MealSlot['slot']): MealSlot | undefined =>
        activePlan?.meals.find(meal => meal.day === day && meal.slot === slot);

    const handleSlotClick = async (day: number, slot: MealSlot['slot']) => {
        const existing = getMealForSlot(day, slot);
        if (existing && activePlan) {
            await removeMealFromSlot(activePlan.id, day, slot);
            return;
        }

        setSelectedSlot({ day, slot });
        setSuggestedRecipes([]);
    };

    const handleGenerateRecipes = async () => {
        setIsGenerating(true);
        try {
            setSuggestedRecipes(await suggestRecipesForSlot(items, selectedSlot?.slot));
        } catch (error) {
            console.error('Failed to generate recipes:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSelectRecipe = async (recipe: RecipeRecommendation) => {
        if (!activePlan || !selectedSlot) return;
        await addMealToSlot(
            activePlan.id,
            selectedSlot.day,
            selectedSlot.slot,
            recipe.title,
            recipe.ingredientDetails
                .filter(ingredient => !ingredient.pantryStaple && !ingredient.optional)
                .map(ingredient => (ingredient.amount + ' ' + ingredient.name).trim()),
        );
        closeMealPicker();
    };

    const handleAddManualMeal = async (name: string) => {
        if (!activePlan || !selectedSlot) return;
        await addMealToSlot(activePlan.id, selectedSlot.day, selectedSlot.slot, name, []);
        setSelectedSlot(null);
    };

    const handleAddToShoppingList = async () => {
        if (!activePlan) return;
        const count = await addMissingToShoppingList(activePlan);
        setAddedToList(count);
    };

    return (
        <div className="market-subpage market-planner-page">
            <header className="market-subpage-header">
                <button type="button" onClick={onBack} className="market-icon-button" aria-label="Back to recipes">
                    <ChevronLeft aria-hidden="true" />
                </button>
                <div>
                    <p className="market-kicker">This week</p>
                    <h1>Meal planner</h1>
                </div>
                <button
                    type="button"
                    onClick={handleAddToShoppingList}
                    className="market-icon-button market-planner-cart"
                    aria-label={`Add ${missingCount} missing ingredients to shopping list`}
                >
                    <ShoppingCart aria-hidden="true" />
                    {missingCount > 0 && <span>{missingCount}</span>}
                </button>
            </header>

            <section className="market-planner-intro">
                <p>Build a calmer week around what is already fresh.</p>
                <strong>{mealCount} meal{mealCount === 1 ? '' : 's'} planned</strong>
            </section>

            {addedToList !== null && (
                <div className="market-notice market-notice-success" role="status">
                    Added {addedToList} item{addedToList !== 1 ? 's' : ''} to your shopping list.
                </div>
            )}

            <main className="market-planner-days">
                {DAY_LABELS.map((dayLabel, dayIndex) => (
                    <section key={dayLabel} className="market-planner-day">
                        <div className="market-planner-day-heading">
                            <h2>{dayLabel}</h2>
                            <span>{MEAL_SLOTS.filter(slot => getMealForSlot(dayIndex, slot)).length}/4</span>
                        </div>
                        <div className="market-planner-grid">
                            {MEAL_SLOTS.map(slot => {
                                const meal = getMealForSlot(dayIndex, slot);
                                const SlotIcon = SLOT_DETAILS[slot].icon;
                                return (
                                    <button
                                        type="button"
                                        key={slot}
                                        onClick={() => void handleSlotClick(dayIndex, slot)}
                                        className={`market-meal-slot${meal ? ' is-filled' : ''}`}
                                        aria-label={meal ? `Remove ${meal.recipeName} from ${dayLabel} ${slot}` : `Add ${slot} for ${dayLabel}`}
                                    >
                                        <SlotIcon aria-hidden="true" />
                                        <span>{meal?.recipeName || SLOT_DETAILS[slot].label}</span>
                                        {!meal && <Plus aria-hidden="true" className="market-slot-plus" />}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </main>

            {selectedSlot && (
                <div
                    className="market-sheet-backdrop"
                    role="presentation"
                    onClick={closeMealPicker}
                >
                    <section ref={mealPickerRef} tabIndex={-1} className="market-sheet market-recipe-picker" role="dialog" aria-modal="true" aria-labelledby="meal-picker-title" onClick={event => event.stopPropagation()}>
                        <div className="market-sheet-handle" />
                        <div className="market-sheet-heading">
                            <div>
                                <p className="market-kicker">{DAY_LABELS[selectedSlot.day]}</p>
                                <h2 id="meal-picker-title">Add {SLOT_DETAILS[selectedSlot.slot].label.toLowerCase()}</h2>
                            </div>
                            <button
                                ref={mealPickerCloseRef}
                                type="button"
                                onClick={closeMealPicker}
                                className="market-icon-button"
                                aria-label="Close meal picker"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => void handleGenerateRecipes()}
                            disabled={isGenerating}
                            className="market-primary-command market-suggest-command"
                        >
                            {isGenerating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                            {isGenerating ? 'Finding good matches...' : 'Suggest recipes from my fridge'}
                        </button>

                        {suggestedRecipes.length > 0 && (
                            <div className="market-suggested-recipes">
                                {suggestedRecipes.map(recipe => (
                                    <button
                                        type="button"
                                        key={recipe.title}
                                        onClick={() => void handleSelectRecipe(recipe)}
                                        className="market-suggested-recipe"
                                    >
                                        <UtensilsCrossed aria-hidden="true" />
                                        <span>
                                            <strong>{recipe.title}</strong>
                                            <small>{recipe.description}</small>
                                            <em><Clock3 aria-hidden="true" /> {recipe.prepTime} + {recipe.cookTime} · {recipe.difficulty}</em>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="market-manual-meal">
                            <p>Or add a meal manually</p>
                            <QuickAddMeal onAdd={handleAddManualMeal} />
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

function QuickAddMeal({ onAdd }: { onAdd: (name: string) => void }) {
    const [name, setName] = useState('');

    const submit = () => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        onAdd(trimmedName);
        setName('');
    };

    return (
        <div className="market-inline-form">
            <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Chicken stir fry"
                onKeyDown={event => {
                    if (event.key === 'Enter') submit();
                }}
            />
            <button type="button" onClick={submit} disabled={!name.trim()}>Add</button>
        </div>
    );
}
