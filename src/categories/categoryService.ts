import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';
import type { Category, TransactionType } from '@/types';

export type CustomCategoryInput = {
  name: string;
  type: TransactionType;
  color?: string;
  icon?: string;
};

/** Creates a custom category and durable sync intent in the same IndexedDB commit. */
export async function createCustomCategory(
  input: CustomCategoryInput,
  database: RavelDatabase = db
): Promise<Category> {
  await ensureDatabaseSeeded(database);

  const name = input.name.trim();
  if (!name) throw new Error('Category name is required.');

  const now = new Date().toISOString();
  const category: Category = {
    id: `cat-${crypto.randomUUID()}`,
    name,
    type: input.type,
    color: input.color,
    icon: input.icon,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };

  await database.transaction(
    'rw',
    [database.categories, database.syncOutbox],
    async () => {
      await database.categories.add(category);
      await queueRecordForSync(
        'categories',
        category as unknown as Record<string, unknown>,
        database
      );
    }
  );

  void flushSyncQueueBestEffort(database);
  return category;
}
