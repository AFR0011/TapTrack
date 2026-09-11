import { db, ensureDatabaseSeeded, type RavelDatabase } from '@/database';
import { DEFAULT_SETTINGS_ID } from '@/defaultData';
import { flushSyncQueueBestEffort, queueRecordForSync } from '@/sync/syncService';
import type { Settings } from '@/types';

export type SettingsPreferenceUpdates = Partial<
  Pick<
    Settings,
    | 'lastUsedMethod'
    | 'aiCategorizationEnabled'
    | 'aiAutoCategorizationEnabled'
    | 'aiRecommendNewCategoriesEnabled'
    | 'darkModeEnabled'
  >
>;

/**
 * Updates user preferences and their durable sync intent in one IndexedDB commit.
 * Setup/account ownership fields are intentionally not exposed here.
 */
export async function updateSettingsPreferences(
  updates: SettingsPreferenceUpdates,
  database: RavelDatabase = db
): Promise<Settings> {
  await ensureDatabaseSeeded(database);

  const now = new Date().toISOString();
  let nextSettings: Settings | null = null;

  await database.transaction(
    'rw',
    [database.settings, database.syncOutbox],
    async () => {
      const existing = await database.settings.get(DEFAULT_SETTINGS_ID);
      if (!existing) throw new Error('Settings are not available.');

      const next: Settings = {
        ...existing,
        ...updates,
        id: DEFAULT_SETTINGS_ID,
        updatedAt: now,
      };
      await database.settings.put(next);
      await queueRecordForSync(
        'settings',
        next as unknown as Record<string, unknown>,
        database
      );
      nextSettings = next;
    }
  );

  if (!nextSettings) throw new Error('Settings were not updated.');
  void flushSyncQueueBestEffort(database);
  return nextSettings;
}
