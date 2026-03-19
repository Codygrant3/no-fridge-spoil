import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, Search, Clock, SlidersHorizontal, CalendarDays } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { CookMode } from '../components/CookMode';
import type { Recipe } from '../services/recipeService';

interface RecipesProps {
    onNavigateToPlanner?: () => void;
}

// Extended recipe type for local use with match info
interface RecipeWithMatch extends Recipe {
    percentage: number;
    matched: string[];
    missing: number;
}

// Sample recipe data with ingredients
const SAMPLE_RECIPES: Recipe[] = [
    {
        title: 'Zucchini Pasta',
        description: 'Light and healthy spiralized zucchini with creamy sauce',
        prepTime: '10 mins',
        cookTime: '12 mins',
        difficulty: 'Easy',
        ingredients: ['zucchini', 'cream', 'parmesan', 'garlic'],
        instructions: ['Spiralize zucchini', 'Sauté garlic in olive oil', 'Add cream and parmesan', 'Toss with zucchini'],
        usedIngredients: ['zucchini', 'cream'],
    },
    {
        title: 'Veggie Stir Fry',
        description: 'Quick and colorful vegetable stir fry',
        prepTime: '10 mins',
        cookTime: '15 mins',
        difficulty: 'Easy',
        ingredients: ['bell pepper', 'broccoli', 'soy sauce', 'garlic'],
        instructions: ['Chop vegetables', 'Heat oil in wok', 'Stir fry vegetables', 'Add soy sauce'],
        usedIngredients: ['bell pepper', 'broccoli'],
    },
    {
        title: 'Chicken Avocado Salad',
        description: 'High protein salad with creamy avocado',
        prepTime: '15 mins',
        cookTime: '20 mins',
        difficulty: 'Easy',
        ingredients: ['chicken breast', 'avocado', 'lettuce', 'tomato', 'olive oil'],
        instructions: ['Grill chicken breast', 'Slice avocado', 'Assemble salad', 'Drizzle with olive oil'],
        usedIngredients: ['chicken breast', 'avocado'],
    },
    {
        title: 'Wild Mushroom Risotto',
        description: 'Creamy Italian risotto with wild mushrooms',
        prepTime: '10 mins',
        cookTime: '35 mins',
        difficulty: 'Medium',
        ingredients: ['arborio rice', 'mushrooms', 'parmesan', 'white wine', 'broth'],
        instructions: ['Sauté mushrooms', 'Toast rice', 'Add wine and broth gradually', 'Finish with parmesan'],
        usedIngredients: ['mushrooms', 'parmesan'],
    },
    {
        title: 'Honey Glazed Salmon',
        description: 'Sweet and savory glazed salmon fillet',
        prepTime: '10 mins',
        cookTime: '18 mins',
        difficulty: 'Easy',
        ingredients: ['salmon', 'honey', 'soy sauce', 'garlic', 'ginger'],
        instructions: ['Mix glaze ingredients', 'Coat salmon', 'Bake at 400°F', 'Broil for glaze'],
        usedIngredients: ['salmon'],
    },
    {
        title: 'Street Style Beef Tacos',
        description: 'Authentic Mexican street tacos',
        prepTime: '10 mins',
        cookTime: '15 mins',
        difficulty: 'Easy',
        ingredients: ['beef', 'corn tortillas', 'onion', 'cilantro', 'lime'],
        instructions: ['Season and cook beef', 'Warm tortillas', 'Assemble tacos', 'Top with onion and cilantro'],
        usedIngredients: ['beef'],
    },
];

export function Recipes({ onNavigateToPlanner }: RecipesProps = {}) {
    const { items } = useInventory();
    const [activeFilter, setActiveFilter] = useState<'all' | 'fridge'>('all');
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [showFilters, setShowFilters] = useState(false);

    // Get inventory item names
    const inventoryNames = useMemo(() => {
        return items.map(item => item.name.toLowerCase());
    }, [items]);

    // Check if ingredient is expiring soon - memoized with useCallback
    const isExpiringSoon = useCallback((ingredientName: string): boolean => {
        const item = items.find(i => i.name.toLowerCase().includes(ingredientName.toLowerCase()));
        if (!item) return false;
        const days = Math.ceil((new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 3;
    }, [items]);

    // Calculate match percentage - memoized with useCallback
    const calculateMatch = useCallback((recipe: Recipe): { percentage: number; matched: string[]; missing: number } => {
        const matched = recipe.ingredients.filter(ing =>
            inventoryNames.some(name => name.includes(ing.toLowerCase()) || ing.toLowerCase().includes(name))
        );
        const percentage = Math.round((matched.length / recipe.ingredients.length) * 100);
        return { percentage, matched, missing: recipe.ingredients.length - matched.length };
    }, [inventoryNames]);

    // Recipes with expiring ingredients
    const expiringRecipes = useMemo((): RecipeWithMatch[] => {
        return SAMPLE_RECIPES
            .filter(recipe => recipe.ingredients.some(ing => isExpiringSoon(ing)))
            .map(recipe => ({ ...recipe, ...calculateMatch(recipe) }))
            .sort((a, b) => b.percentage - a.percentage);
    }, [isExpiringSoon, calculateMatch]);

    // All recipes with match info
    const allRecipes = useMemo((): RecipeWithMatch[] => {
        return SAMPLE_RECIPES
            .map(recipe => ({ ...recipe, ...calculateMatch(recipe) }))
            .sort((a, b) => b.percentage - a.percentage);
    }, [calculateMatch]);

    // Filtered recipes based on active filter
    const displayRecipes = activeFilter === 'fridge'
        ? allRecipes.filter(r => r.percentage >= 50)
        : allRecipes;

    // Get cook time as number for display
    const getCookMinutes = (cookTime: string): number => {
        const match = cookTime.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    };

    if (selectedRecipe) {
        return <CookMode recipe={selectedRecipe} items={items} onClose={() => setSelectedRecipe(null)} />;
    }

    return (
        <div className="min-h-full bg-[#0a1f0f] flex flex-col pb-24">
            {/* Header */}
            <header className="flex items-center justify-between p-4 pt-12">
                <button className="w-10 h-10 rounded-full flex items-center justify-center">
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <h1 className="text-white text-lg font-semibold">Recipe Suggestions</h1>
                <button className="w-10 h-10 rounded-full flex items-center justify-center">
                    <Search className="w-5 h-5 text-white" />
                </button>
            </header>

            <div className="px-4">
                {/* Filter Tabs */}
                <div className="flex bg-[#1a2f1f] rounded-full p-1 mb-6">
                    <button
                        onClick={() => setActiveFilter('all')}
                        className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${activeFilter === 'all'
                                ? 'bg-green-500 text-white'
                                : 'text-gray-400'
                            }`}
                    >
                        All Recipes
                    </button>
                    <button
                        onClick={() => setActiveFilter('fridge')}
                        className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${activeFilter === 'fridge'
                                ? 'bg-green-500 text-white'
                                : 'text-gray-400'
                            }`}
                    >
                        In My Fridge
                    </button>
                </div>

                {/* Meal Planner Banner */}
                {onNavigateToPlanner && (
                    <button
                        onClick={onNavigateToPlanner}
                        className="w-full mb-6 p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/40 rounded-2xl flex items-center gap-4 hover:from-purple-500/30 hover:to-blue-500/30 transition-all"
                    >
                        <div className="w-12 h-12 rounded-xl bg-purple-500/30 flex items-center justify-center shrink-0">
                            <CalendarDays className="w-6 h-6 text-purple-300" />
                        </div>
                        <div className="text-left flex-1">
                            <h3 className="text-white font-bold text-sm">Weekly Meal Planner</h3>
                            <p className="text-purple-300/80 text-xs mt-0.5">Plan meals &amp; auto-generate shopping lists</p>
                        </div>
                        <ChevronLeft className="w-5 h-5 text-purple-300 rotate-180" />
                    </button>
                )}

                {/* Use it up! Section (Expiring Soon) */}
                {expiringRecipes.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white text-xl font-bold">Use it up!</h2>
                            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-bold rounded-full uppercase">
                                Expiring Soon
                            </span>
                        </div>

                        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2">
                            {expiringRecipes.slice(0, 3).map((recipe, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedRecipe(recipe)}
                                    className="min-w-[200px] bg-[#1a2f1f] rounded-2xl overflow-hidden border border-green-900/30"
                                >
                                    {/* Image Placeholder */}
                                    <div className="h-28 bg-gradient-to-br from-gray-700 to-gray-800 relative">
                                        <span className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-lg">
                                            {recipe.percentage}% Match
                                        </span>
                                    </div>
                                    <div className="p-3">
                                        <h3 className="text-white font-semibold text-left">{recipe.title}</h3>
                                        <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {getCookMinutes(recipe.cookTime)} MINS • USE: {recipe.matched.slice(0, 2).join(', ').toUpperCase()}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Recommended for You */}
                <section>
                    <h2 className="text-white text-xl font-bold mb-4">Recommended for You</h2>

                    <div className="grid grid-cols-2 gap-3">
                        {displayRecipes.map((recipe, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedRecipe(recipe)}
                                className="bg-[#1a2f1f] rounded-2xl overflow-hidden border border-green-900/30 text-left"
                            >
                                {/* Image Placeholder */}
                                <div className="h-28 bg-gradient-to-br from-gray-700 to-gray-800 relative">
                                    {recipe.percentage >= 50 ? (
                                        <span className="absolute top-2 left-2 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-lg">
                                            {recipe.percentage}% Match
                                        </span>
                                    ) : recipe.missing > 0 && (
                                        <span className="absolute top-2 left-2 px-2 py-1 bg-gray-700 text-white text-xs font-bold rounded-lg">
                                            Missing {recipe.missing} items
                                        </span>
                                    )}
                                </div>
                                <div className="p-3">
                                    <h3 className="text-white font-semibold">{recipe.title}</h3>
                                    <p className="text-green-400 text-xs mt-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {getCookMinutes(recipe.cookTime)} MINS • {recipe.difficulty.toUpperCase()}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            {/* Floating Filters Button */}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 bg-[#1a2f1f] border border-green-900/50 rounded-full flex items-center gap-2 shadow-lg"
            >
                <SlidersHorizontal className="w-4 h-4 text-white" />
                <span className="text-white font-medium">Filters</span>
            </button>
        </div>
    );
}
