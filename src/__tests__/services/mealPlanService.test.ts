import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type DbMealPlan } from '../../db/database';
import { addMissingToShoppingList, getCurrentWeekStart } from '../../services/mealPlanService';
import { formatDate } from '../../utils/dateUtils';

function localDate(year: number, monthIndex: number, day: number, hours: number, minutes = 0): Date {
  return new Date(year, monthIndex, day, hours, minutes, 0, 0);
}

describe('getCurrentWeekStart', () => {
  it('maps a local Sunday evening to that week\'s Monday via formatDate, not UTC ISO', () => {
    const sundayEvening = localDate(2026, 7, 16, 22, 30);
    expect(sundayEvening.getDay()).toBe(0);

    const localMonday = new Date(sundayEvening);
    localMonday.setDate(sundayEvening.getDate() - 6);

    const localMondayDate = formatDate(localMonday);
    const isoUtcMonday = localMonday.toISOString().split('T')[0];

    expect(getCurrentWeekStart(sundayEvening)).toBe(localMondayDate);
    expect(getCurrentWeekStart(sundayEvening)).not.toBe(sundayEvening.toISOString().split('T')[0]);
    if (isoUtcMonday !== localMondayDate) {
      expect(getCurrentWeekStart(sundayEvening)).not.toBe(isoUtcMonday);
    }
  });

  it('returns the same local Monday for a Monday morning', () => {
    const mondayMorning = localDate(2026, 7, 17, 8);
    expect(mondayMorning.getDay()).toBe(1);
    expect(getCurrentWeekStart(mondayMorning)).toBe(formatDate(mondayMorning));
  });
});

describe('addMissingToShoppingList', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.shoppingList.clear();
    await db.mealPlans.clear();
  });

  afterEach(async () => {
    await db.items.clear();
    await db.shoppingList.clear();
    await db.mealPlans.clear();
  });

  it('skips ingredient names already on the active household shopping list', async () => {
    await db.shoppingList.add({
      id: 'shop-milk',
      name: 'Milk',
      quantity: 1,
      addedAt: '2026-08-16T12:00:00.000Z',
      isChecked: false,
      isDeleted: 0,
    });

    const plan: DbMealPlan = {
      id: 'plan-1',
      weekStartDate: '2026-08-10',
      createdAt: '2026-08-10T12:00:00.000Z',
      isDeleted: 0,
      meals: [
        {
          day: 0,
          slot: 'dinner',
          recipeName: 'Omelette',
          ingredients: ['milk', 'eggs'],
        },
      ],
    };

    const added = await addMissingToShoppingList(plan);
    const list = await db.shoppingList.toArray();
    const names = list.map(item => item.name.toLowerCase()).sort();

    expect(added).toBe(1);
    expect(names).toEqual(['eggs', 'milk']);
    expect(list.filter(item => item.name.toLowerCase() === 'milk')).toHaveLength(1);
  });
});
