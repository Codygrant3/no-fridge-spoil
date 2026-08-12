import { useMemo, useState } from 'react';
import {
    CalendarDots,
    CaretDown,
    CaretLeft,
    CaretRight,
    CheckCircle,
    Clock,
    CookingPot,
    MagnifyingGlass,
} from '@phosphor-icons/react';
import { CookMode } from '../components/CookMode';
import { useInventory } from '../context/InventoryContext';
import {
    getRecipeRecommendations,
    type RecipeDietaryTag,
    type RecipeMealType,
    type RecipeRecommendation,
} from '../services/recipeService';

interface RecipesProps {
    onBack?: () => void;
    onNavigateToPlanner?: () => void;
}

type RecipeView = 'recommended' | 'ready' | 'catalogue';

const MEAL_OPTIONS: Array<{ value: RecipeMealType | 'all'; label: string }> = [
    { value: 'all', label: 'All meals' },
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snacks' },
];

const DIET_OPTIONS: Array<{ value: RecipeDietaryTag | 'all'; label: string }> = [
    { value: 'all', label: 'Any diet' },
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'vegan', label: 'Vegan' },
    { value: 'gluten-free', label: 'Gluten-free' },
    { value: 'dairy-free', label: 'Dairy-free' },
];

function recipeAvailabilityLabel(recipe: RecipeRecommendation): string {
    if (recipe.match.canMakeNow) return 'Ready to cook';
    if (recipe.match.matchedInventoryItems.length > 0) return recipe.match.coverage + '% on hand';
    return recipe.match.missingIngredients.length + ' missing';
}

function RecipeImage({ recipe }: { recipe: RecipeRecommendation }) {
    if (recipe.image) {
        return <img src={recipe.image} alt={recipe.imageAlt ?? recipe.title} loading="lazy" decoding="async" />;
    }

    return (
        <span className="recipe-image-fallback" aria-label={recipe.cuisine + ' recipe'}>
            <CookingPot size={30} weight="duotone" aria-hidden="true" />
            <small>{recipe.cuisine}</small>
        </span>
    );
}

export function Recipes({ onBack, onNavigateToPlanner }: RecipesProps = {}) {
    const { items } = useInventory();
    const [activeView, setActiveView] = useState<RecipeView>('recommended');
    const [dietaryTag, setDietaryTag] = useState<RecipeDietaryTag | 'all'>('all');
    const [mealType, setMealType] = useState<RecipeMealType | 'all'>('all');
    const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecommendation | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [search, setSearch] = useState('');

    const allRecipes = useMemo(() => getRecipeRecommendations(items, {
        dietaryTag: dietaryTag === 'all' ? undefined : dietaryTag,
        mealType: mealType === 'all' ? undefined : mealType,
        query: search,
    }), [dietaryTag, items, mealType, search]);

    const readyCount = useMemo(
        () => allRecipes.filter(recipe => recipe.match.canMakeNow).length,
        [allRecipes],
    );

    const useItUpRecipes = useMemo(() => allRecipes.filter(recipe => (
        recipe.match.expiringIngredients.length > 0
    )).slice(0, 3), [allRecipes]);

    const displayRecipes = useMemo(() => {
        if (activeView === 'ready') {
            return allRecipes.filter(recipe => recipe.match.canMakeNow);
        }
        if (activeView === 'recommended' && items.length > 0) {
            return allRecipes.filter(recipe => recipe.match.matchedInventoryItems.length > 0);
        }
        return allRecipes;
    }, [activeView, allRecipes, items.length]);

    if (selectedRecipe) {
        return <CookMode recipe={selectedRecipe} items={items} onClose={() => setSelectedRecipe(null)} />;
    }

    const sectionTitle = activeView === 'ready'
        ? 'Ready to cook'
        : activeView === 'catalogue'
            ? 'Recipe catalogue'
            : 'Recommended for you';

    return (
        <div className="editorial-page recipes-page">
            <header className="recipe-header">
                <button type="button" className="market-icon-button editorial-header-action" onClick={onBack} aria-label="Back to home">
                    <CaretLeft size={22} weight="bold" />
                </button>
                <div>
                    <p className="editorial-kicker">Cook what you have</p>
                    <h1>Recipes</h1>
                </div>
                <button
                    type="button"
                    className="market-icon-button editorial-header-action"
                    onClick={() => setShowSearch(value => !value)}
                    aria-label="Search recipes"
                    aria-expanded={showSearch}
                >
                    <MagnifyingGlass size={21} />
                </button>
            </header>

            {showSearch && (
                <div className="recipe-search-row">
                    <MagnifyingGlass size={18} aria-hidden="true" />
                    <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Search recipes or ingredients"
                        aria-label="Search recipes or ingredients"
                        autoFocus
                    />
                </div>
            )}

            <div className="recipe-filter-control" role="group" aria-label="Recipe view">
                <button type="button" className={activeView === 'recommended' ? 'is-active' : ''} onClick={() => setActiveView('recommended')}>For you</button>
                <button type="button" className={activeView === 'ready' ? 'is-active' : ''} onClick={() => setActiveView('ready')}>Make now</button>
                <button type="button" className={activeView === 'catalogue' ? 'is-active' : ''} onClick={() => setActiveView('catalogue')}>Catalogue</button>
            </div>

            <div className="recipe-selectors" aria-label="Recipe filters">
                <label>
                    <span>Meal</span>
                    <select value={mealType} onChange={event => setMealType(event.target.value as RecipeMealType | 'all')}>
                        {MEAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <CaretDown size={14} weight="bold" aria-hidden="true" />
                </label>
                <label>
                    <span>Preference</span>
                    <select value={dietaryTag} onChange={event => setDietaryTag(event.target.value as RecipeDietaryTag | 'all')}>
                        {DIET_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <CaretDown size={14} weight="bold" aria-hidden="true" />
                </label>
            </div>

            {items.length > 0 && (
                <div className="recipe-readiness-summary" role="status">
                    <CheckCircle size={22} weight="fill" aria-hidden="true" />
                    <span>
                        <strong>{readyCount} ready now</strong>
                        <small>from {items.length} inventoried item{items.length === 1 ? '' : 's'}</small>
                    </span>
                </div>
            )}

            {onNavigateToPlanner && (
                <button type="button" className="recipe-planner-band" onClick={onNavigateToPlanner}>
                    <CalendarDots size={25} weight="duotone" />
                    <span><strong>Weekly meal planner</strong><small>Plan meals and build your list</small></span>
                    <CaretRight size={19} weight="bold" />
                </button>
            )}

            {useItUpRecipes.length > 0 && activeView !== 'catalogue' && (
                <section className="editorial-section" aria-labelledby="use-it-up-heading">
                    <div className="editorial-section-heading">
                        <h2 id="use-it-up-heading">Use it up</h2>
                        <span>Expiring soon</span>
                    </div>
                    <div className="recipe-featured-rail">
                        {useItUpRecipes.map(recipe => (
                            <button key={recipe.id} type="button" className="recipe-featured-card" onClick={() => setSelectedRecipe(recipe)}>
                                <span className="recipe-featured-image"><RecipeImage recipe={recipe} /></span>
                                <span className="recipe-match">{recipe.match.score}% fit</span>
                                <span className="recipe-card-copy">
                                    <strong>{recipe.title}</strong>
                                    <small><Clock size={13} /> {recipe.prepMinutes + recipe.cookMinutes} min</small>
                                    <em>{recipe.match.reasons[0]}</em>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section className="editorial-section" aria-labelledby="recommended-heading">
                <div className="editorial-section-heading">
                    <h2 id="recommended-heading">{sectionTitle}</h2>
                    <span>{displayRecipes.length} recipes</span>
                </div>

                {displayRecipes.length > 0 ? (
                    <div className="recipe-grid">
                        {displayRecipes.map(recipe => (
                            <button key={recipe.id} type="button" className="recipe-card" onClick={() => setSelectedRecipe(recipe)}>
                                <span className="recipe-card-image">
                                    <RecipeImage recipe={recipe} />
                                    <span className={'recipe-availability' + (recipe.match.canMakeNow ? ' is-match' : '')}>
                                        {recipeAvailabilityLabel(recipe)}
                                    </span>
                                </span>
                                <span className="recipe-card-copy">
                                    <strong>{recipe.title}</strong>
                                    <small><Clock size={13} /> {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.difficulty}</small>
                                    <em>{recipe.match.reasons[0]}</em>
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="recipe-empty-state">
                        <CookingPot size={28} weight="duotone" aria-hidden="true" />
                        <div>
                            <h3>No recipes match these filters</h3>
                            <p>Try another meal, preference, or catalogue view.</p>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
