import { findCategoryForTransaction } from '@/defaultData';
import { consumeAICategorizationQuota } from '@/server/categories/aiQuota';
import { categorizeWithAI } from '@/server/categories/categorizeWithAI';
import type { Category, TransactionType } from '@/types';

export type ServerCategorySource = 'local' | 'ai';

export type ServerCategoryResolution = {
  categoryId: string;
  source: ServerCategorySource;
  aiUnavailable: boolean;
};

export async function suggestServerCategory({
  userId,
  title,
  type,
  categories,
  aiEnabled,
}: {
  userId: string;
  title: string;
  type: TransactionType;
  categories: Category[];
  aiEnabled: boolean;
}): Promise<ServerCategoryResolution | null> {
  const typedCategories = categories.filter((category) => category.type === type);
  const localCategory = findCategoryForTransaction(categories, type, title) ?? typedCategories[0];
  if (!localCategory) return null;

  if (!aiEnabled || !process.env.GROQ_API_KEY) {
    return {
      categoryId: localCategory.id,
      source: 'local',
      aiUnavailable: Boolean(aiEnabled && !process.env.GROQ_API_KEY),
    };
  }

  const quota = await consumeAICategorizationQuota(userId);
  if (quota !== 'allowed') {
    return {
      categoryId: localCategory.id,
      source: 'local',
      aiUnavailable: quota === 'unavailable',
    };
  }

  const ai = await categorizeWithAI({
    title,
    transactionType: type,
    categories: typedCategories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
    })),
    recommendNewCategories: false,
  });
  const aiCategory =
    ai.kind === 'existing'
      ? typedCategories.find((category) => category.id === ai.categoryId)
      : undefined;

  if (aiCategory) {
    return {
      categoryId: aiCategory.id,
      source: 'ai',
      aiUnavailable: false,
    };
  }

  return {
    categoryId: localCategory.id,
    source: 'local',
    aiUnavailable: ai.unavailable,
  };
}
