import type { Balance, Category, Currency, Method, Settings, TransactionType } from '@/types';
import { DEFAULT_CURRENCY, SUPPORTED_METHODS } from '@/types';

export const DEFAULT_SETTINGS_ID = 'default';

type CategoryTemplate = Omit<Category, 'createdAt' | 'updatedAt'>;

const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplate[] = [
  { id: 'cat-food', name: 'Food', icon: 'utensils', color: '#16a34a', isDefault: true, type: 'expense' },
  { id: 'cat-rent', name: 'Rent', icon: 'home', color: '#2563eb', isDefault: true, type: 'expense' },
  { id: 'cat-subscriptions', name: 'Subscriptions', icon: 'repeat', color: '#7c3aed', isDefault: true, type: 'expense' },
  { id: 'cat-fun', name: 'Fun', icon: 'ticket', color: '#db2777', isDefault: true, type: 'expense' },
  { id: 'cat-other', name: 'Other', icon: 'circle', color: '#64748b', isDefault: true, type: 'expense' },
  { id: 'cat-income', name: 'Income', icon: 'arrow-down', color: '#059669', isDefault: true, type: 'income' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ['coffee', 'cafe', 'café', 'breakfast', 'lunch', 'dinner', 'meal', 'food', 'restaurant', 'market', 'grocery', 'groceries'],
  Rent: ['rent', 'landlord'],
  Subscriptions: ['subscription', 'spotify', 'netflix', 'youtube', 'chatgpt', 'icloud', 'adobe', 'github'],
  Fun: ['game', 'gaming', 'cinema', 'movie', 'concert', 'ticket'],
};

export function createDefaultCategories(now = new Date().toISOString()): Category[] {
  return DEFAULT_CATEGORY_TEMPLATES.map((category) => ({ ...category, createdAt: now, updatedAt: now }));
}

export function createInitialBalances(
  now = new Date().toISOString(),
  currencies: Currency[] = [DEFAULT_CURRENCY]
): Balance[] {
  return [...new Set(currencies)].flatMap((currency) =>
    SUPPORTED_METHODS.map((method) => ({
      id: getBalanceId(currency, method),
      currency,
      method,
      amount: 0,
      updatedAt: now,
    }))
  );
}

export function createDefaultSettings(now = new Date().toISOString()): Settings {
  return {
    id: DEFAULT_SETTINGS_ID,
    defaultCurrency: DEFAULT_CURRENCY,
    activeCurrencies: [DEFAULT_CURRENCY],
    lastUsedMethod: 'card',
    setupCompleted: false,
    aiCategorizationEnabled: false,
    darkModeEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function getBalanceId(currency: Currency, method: Method) {
  return `${currency}-${method}`;
}

export function findCategoryForTransaction(categories: Category[], type: TransactionType, title: string) {
  const typedCategories = categories.filter((category) => category.type === type);
  if (type === 'income') return typedCategories.find((category) => category.name === 'Income') ?? typedCategories[0];

  const normalizedTitle = title.toLowerCase();
  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalizedTitle.includes(keyword))) {
      const category = typedCategories.find((item) => item.name === categoryName);
      if (category) return category;
    }
  }

  return typedCategories.find((category) => category.name === 'Other') ??
    typedCategories.find((category) => category.isDefault) ?? typedCategories[0];
}
