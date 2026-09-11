import { afterEach, describe, expect, it, vi } from 'vitest';
import { TapTrackDatabase } from '@/database';
import type { Category, Transaction } from '@/types';
import { reconcileSavedTransactionCategoryWithAI } from './lateCategorization';

const databases: TapTrackDatabase[] = [];
const now = '2026-09-11T14:00:00.000Z';
const categories: Category[] = [
  {
    id: 'cat-other',
    name: 'Other',
    type: 'expense',
    icon: 'circle',
    color: '#64748b',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-groceries',
    name: 'Groceries',
    type: 'expense',
    icon: 'cart',
    color: '#16a34a',
    createdAt: now,
    updatedAt: now,
  },
];

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 125,
    currency: 'TRY',
    title: 'Migros groceries',
    categoryId: 'cat-other',
    method: 'card',
    date: '2026-09-11',
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function makeDatabase() {
  const database = new TapTrackDatabase(`TapTrack-late-ai-${crypto.randomUUID()}`);
  databases.push(database);
  await database.categories.bulkPut(categories);
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('reconcileSavedTransactionCategoryWithAI', () => {
  it('updates the just-saved transaction when a strong AI category arrives later', async () => {
    const database = await makeDatabase();
    const created = transaction();
    await database.transactions.put(created);
    const update = vi.fn().mockResolvedValue({ ...created, categoryId: 'cat-groceries' });
    const fetchSuggestion = vi.fn().mockResolvedValue({
      kind: 'existing',
      categoryId: 'cat-groceries',
      newCategory: null,
      confidence: 0.96,
      status: 'suggested',
    });

    await expect(
      reconcileSavedTransactionCategoryWithAI(created, categories, database, {
        fetchSuggestion,
        update,
      })
    ).resolves.toBe(true);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      created.id,
      expect.objectContaining({
        title: created.title,
        categoryId: 'cat-groceries',
        occurredAt: created.occurredAt,
      }),
      database
    );
  });

  it('does not overwrite a transaction that changed after it was saved', async () => {
    const database = await makeDatabase();
    const created = transaction();
    await database.transactions.put({
      ...created,
      categoryId: 'cat-groceries',
      updatedAt: '2026-09-11T14:00:01.000Z',
    });
    const update = vi.fn();

    await expect(
      reconcileSavedTransactionCategoryWithAI(created, categories, database, {
        fetchSuggestion: vi.fn().mockResolvedValue({
          kind: 'existing',
          categoryId: 'cat-groceries',
          newCategory: null,
          confidence: 0.96,
          status: 'suggested',
        }),
        update,
      })
    ).resolves.toBe(false);

    expect(update).not.toHaveBeenCalled();
  });

  it('does nothing when AI has no accepted existing-category suggestion', async () => {
    const database = await makeDatabase();
    const created = transaction();
    await database.transactions.put(created);
    const update = vi.fn();

    await expect(
      reconcileSavedTransactionCategoryWithAI(created, categories, database, {
        fetchSuggestion: vi.fn().mockResolvedValue({
          kind: 'none',
          categoryId: null,
          newCategory: null,
          confidence: null,
          status: 'none',
        }),
        update,
      })
    ).resolves.toBe(false);

    expect(update).not.toHaveBeenCalled();
  });
});
