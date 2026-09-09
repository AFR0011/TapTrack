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

  it('uses the neutral expense fallback when AI is disabled', async () => {
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
      categoryId: 'cat-other',
      source: 'local',
      aiUnavailable: false,
    });
    expect(quotaMock).not.toHaveBeenCalled();
  });

  it('uses a strong hosted AI existing-category fit when quota allows it', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    quotaMock.mockResolvedValue('allowed');
    aiMock.mockResolvedValue({
      existing: { categoryId: 'cat-subscriptions', fit: 0.9 },
      newCategory: null,
      unavailable: false,
    });

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

  it('ignores low-fit AI matches and falls back to Other', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
    quotaMock.mockResolvedValue('allowed');
    aiMock.mockResolvedValue({
      existing: { categoryId: 'cat-fun', fit: 0.52 },
      newCategory: null,
      unavailable: false,
    });

    await expect(
      suggestServerCategory({
        userId: 'user-1',
        title: 'plane tickets',
        type: 'expense',
        categories,
        aiEnabled: true,
      })
    ).resolves.toMatchObject({
      categoryId: 'cat-other',
      source: 'local',
      aiUnavailable: false,
    });
  });

  it('falls back neutrally when AI quota infrastructure is unavailable', async () => {
    const categories = createDefaultCategories('2026-09-08T00:00:00.000Z');
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
      categoryId: 'cat-other',
      source: 'local',
      aiUnavailable: true,
    });
  });
});
