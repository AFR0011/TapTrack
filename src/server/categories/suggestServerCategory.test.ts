import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCategories } from '@/defaultData';
import { consumeAICategorizationQuota } from '@/server/categories/aiQuota';
import { categorizeWithAI } from '@/server/categories/categorizeWithAI';
import { suggestServerCategory } from './suggestServerCategory';

vi.mock('@/server/categories/aiQuota', () => ({
  consumeAICategorizationQuota: vi.fn(),
}));

vi.mock('@/server/categories/categorizeWithAI', () => ({
  categorizeWithAI: vi.fn(),
}));

const quotaMock = vi.mocked(consumeAICategorizationQuota);
const aiMock = vi.mocked(categorizeWithAI);

describe('suggestServerCategory', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('GROQ_API_KEY', 'test-provider-key');
    quotaMock.mockReset();
    aiMock.mockReset();
  });

  it('uses local categorization when AI is disabled', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');

    await expect(
      suggestServerCategory({
        userId: 'user-1',
        title: 'ChatGPT subscription',
        type: 'expense',
        categories,
        aiEnabled: false,
      })
    ).resolves.toMatchObject({
      categoryId: 'cat-subscriptions',
      source: 'local',
      aiUnavailable: false,
    });
    expect(quotaMock).not.toHaveBeenCalled();
  });

  it('uses a valid hosted AI suggestion when quota allows it', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    quotaMock.mockResolvedValue('allowed');
    aiMock.mockResolvedValue({ categoryId: 'cat-subscriptions', unavailable: false });

    await expect(
      suggestServerCategory({
        userId: 'user-1',
        title: 'software plan',
        type: 'expense',
        categories,
        aiEnabled: true,
      })
    ).resolves.toMatchObject({
      categoryId: 'cat-subscriptions',
      source: 'ai',
      aiUnavailable: false,
    });
  });

  it('falls back locally when AI is unavailable or invalid', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    quotaMock.mockResolvedValue('allowed');
    aiMock.mockResolvedValue({ categoryId: 'cat-income', unavailable: false });

    await expect(
      suggestServerCategory({
        userId: 'user-1',
        title: 'coffee',
        type: 'expense',
        categories,
        aiEnabled: true,
      })
    ).resolves.toMatchObject({
      categoryId: 'cat-food',
      source: 'local',
    });

    quotaMock.mockResolvedValue('unavailable');
    await expect(
      suggestServerCategory({
        userId: 'user-1',
        title: 'coffee',
        type: 'expense',
        categories,
        aiEnabled: true,
      })
    ).resolves.toMatchObject({
      categoryId: 'cat-food',
      source: 'local',
      aiUnavailable: true,
    });
  });
});
