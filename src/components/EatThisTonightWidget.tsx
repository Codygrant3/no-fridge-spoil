import { useState, useEffect } from 'react';
import { Loader2, Clock, ChefHat, Flame, ChevronRight } from 'lucide-react';
import type { InventoryItem } from '../types';
import type { Recipe } from '../services/recipeService';
import { generateRecipes } from '../services/recipeService';

interface EatThisTonightProps {
    expiringItems: InventoryItem[];
    onCookNow: (recipe: Recipe) => void;
}

export function EatThisTonightWidget({ expiringItems, onCookNow }: EatThisTonightProps) {
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchQuickRecipe() {
            if (expiringItems.length === 0) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const recipes = await generateRecipes(expiringItems);

                if (recipes.length === 0) {
                    setError('No recipes found');
                    setLoading(false);
                    return;
                }

                // Prefer quick recipes (<30 mins total time)
                const quickRecipe = recipes.find(r => {
                    const prepMins = parseInt(r.prepTime);
                    const cookMins = parseInt(r.cookTime);
                    return (prepMins + cookMins) < 30;
                });

                setRecipe(quickRecipe || recipes[0]);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch recipe:', err);
                setError('Failed to load recipe');
                setLoading(false);
            }
        }

        fetchQuickRecipe();
    }, [expiringItems]);

    if (expiringItems.length === 0) return null;

    // Loading state
    if (loading) {
        return (
            <div className="glass-card-elevated rounded-3xl p-5 glow-amber animate-fade-in">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <ChefHat className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                            Eat This Tonight
                        </h2>
                        <p className="text-xs text-amber-400 font-medium">AI Recipe Suggestion</p>
                    </div>
                </div>
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    <span className="ml-3 text-[var(--text-secondary)] text-sm">Finding perfect recipe...</span>
                </div>
            </div>
        );
    }

    if (error || !recipe) {
        return null;
    }

    const totalTime = parseInt(recipe.prepTime) + parseInt(recipe.cookTime);
    const usedItemsText = recipe.usedIngredients.slice(0, 3).join(' • ');

    return (
        <div className="glass-card-elevated rounded-3xl overflow-hidden glow-amber animate-scale-in">
            {/* Header */}
            <div className="p-5 pb-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <ChefHat className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                            Eat This Tonight
                        </h2>
                        <p className="text-xs text-amber-400 font-medium">Save these expiring items</p>
                    </div>
                    <span className="status-badge status-warning">
                        <Flame className="w-3 h-3 inline mr-1" />
                        Urgent
                    </span>
                </div>

                {/* Recipe Info */}
                <h3 className="font-semibold text-[var(--text-primary)] text-lg mb-2">
                    {recipe.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-4">
                    {recipe.description}
                </p>

                {/* Meta info */}
                <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span className="font-mono">{totalTime} min</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                    <span className="capitalize">{recipe.difficulty}</span>
                </div>
            </div>

            {/* Ingredients used banner */}
            <div className="px-5 py-3 bg-amber-500/10 border-t border-b border-amber-500/20">
                <p className="text-sm">
                    <span className="text-amber-400 font-medium">Uses: </span>
                    <span className="text-[var(--text-secondary)]">
                        {usedItemsText}
                        {recipe.usedIngredients.length > 3 && ` +${recipe.usedIngredients.length - 3} more`}
                    </span>
                </p>
            </div>

            {/* CTA Button */}
            <button
                onClick={() => onCookNow(recipe)}
                className="w-full p-4 flex items-center justify-center gap-2 font-semibold text-amber-400 hover:bg-amber-500/10 transition-colors group"
            >
                <span>Start Cooking</span>
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
        </div>
    );
}
