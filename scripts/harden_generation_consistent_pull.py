from pathlib import Path

# Make pull generation-consistent: fetch first, verify the account generation,
# then apply. Recheck after local application to catch a restore racing the
# narrow verify/apply window.
path = Path('src/sync/syncService.ts')
text = path.read_text()
old = r'''export async function pullUpdates(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  const pending = new Set(
    (await database.syncOutbox.toArray()).map((item) => getOutboxId(item.tableName, item.recordId))
  );

  for (const tableName of CANONICAL_TABLE_NAMES) {
    const remoteTable = DEXIE_TO_SUPABASE[tableName];
    const { data, error } = await access.client
      .from(remoteTable)
      .select('*')
      .eq('user_id', access.userId);

    if (error) {
      throw new Error(`Cloud pull failed for ${remoteTable}: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`Cloud pull returned an invalid response for ${remoteTable}.`);
    }

    const localTable = getDexieTable(database, tableName);
    for (const raw of data as SupabaseRow[]) {
      if (typeof raw.id !== 'string' || raw.id.length === 0) continue;
      if (pending.has(getOutboxId(tableName, raw.id))) continue;

      if (raw.deleted_at) {
        await localTable.delete(raw.id);
      } else {
        await localTable.put(deserializeFromSupabase(raw));
      }
    }
  }

  await rebuildDerivedBalances(database);
  setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
}
'''
new = r'''export async function pullUpdates(database: TapTrackDatabase = db): Promise<void> {
  const access = await requireLinkedSyncAccess(database);
  if (!access) return;

  // Establish the generation this pull belongs to before reading any canonical
  // table. This also stamps legacy revision-1 bindings or adopts an already
  // changed generation before a partial read can be applied locally.
  const startVersion = await ensurePushLedgerVersion(access, database);
  if (!startVersion) return;

  const pending = new Set(
    (await database.syncOutbox.toArray()).map((item) => getOutboxId(item.tableName, item.recordId))
  );
  const pulled = new Map<SyncedDexieTableName, SupabaseRow[]>();

  // Fetch every table before mutating IndexedDB. If an account restore commits
  // during these sequential reads, the post-read generation check below rejects
  // the mixed snapshot and adopts one fresh canonical cloud snapshot instead.
  for (const tableName of CANONICAL_TABLE_NAMES) {
    const remoteTable = DEXIE_TO_SUPABASE[tableName];
    const { data, error } = await access.client
      .from(remoteTable)
      .select('*')
      .eq('user_id', access.userId);

    if (error) {
      throw new Error(`Cloud pull failed for ${remoteTable}: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`Cloud pull returned an invalid response for ${remoteTable}.`);
    }
    pulled.set(tableName, data as SupabaseRow[]);
  }

  const afterReadVersion = await ensureCloudLedgerVersion(access.client, access.userId);
  if (!sameLedgerVersion(startVersion, afterReadVersion)) {
    await adoptChangedLedgerGeneration(access, database, afterReadVersion);
    setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
    return;
  }

  for (const tableName of CANONICAL_TABLE_NAMES) {
    const localTable = getDexieTable(database, tableName);
    for (const raw of pulled.get(tableName) ?? []) {
      if (typeof raw.id !== 'string' || raw.id.length === 0) continue;
      if (pending.has(getOutboxId(tableName, raw.id))) continue;

      if (raw.deleted_at) {
        await localTable.delete(raw.id);
      } else {
        await localTable.put(deserializeFromSupabase(raw));
      }
    }
  }

  // A restore can still win the tiny interval between the post-read check and
  // local application. Detect that before rebuilding balances or reporting a
  // completed pull; adoption replaces the just-applied stale snapshot.
  const afterApplyVersion = await ensureCloudLedgerVersion(access.client, access.userId);
  if (!sameLedgerVersion(startVersion, afterApplyVersion)) {
    await adoptChangedLedgerGeneration(access, database, afterApplyVersion);
    setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
    return;
  }

  await rebuildDerivedBalances(database);
  setStatusTimestamp(LAST_SYNC_PREFIX, access.userId);
}

function sameLedgerVersion(a: CloudLedgerVersion, b: CloudLedgerVersion): boolean {
  return a.revision === b.revision && a.generation === b.generation;
}
'''
if old not in text:
    raise SystemExit('pullUpdates block not found')
path.write_text(text.replace(old, new, 1))

# Extend the two-device fake cloud with a controlled account restore that occurs
# immediately after one table snapshot is read.
path = Path('src/sync/multiDeviceSync.test.ts')
text = path.read_text()
text = text.replace(
    "  let rotateBeforeNextOperation = false;\n",
    "  let rotateBeforeNextOperation = false;\n  let restoreAfterReadTable: string | null = null;\n  let restoreAfterRead: (() => void) | null = null;\n",
    1,
)
old_select = r'''        select: vi.fn(() =>
          createFilteredChain(async (filters) => ({
            data: [...getTable(tableName).values()]
              .filter((row) => matches(row, filters))
              .map((row) => ({ ...row })),
            error: null,
          }))
        ),
'''
new_select = r'''        select: vi.fn(() =>
          createFilteredChain(async (filters) => {
            const data = [...getTable(tableName).values()]
              .filter((row) => matches(row, filters))
              .map((row) => ({ ...row }));
            if (restoreAfterReadTable === tableName) {
              restoreAfterReadTable = null;
              rotateGeneration();
              const applyRestore = restoreAfterRead;
              restoreAfterRead = null;
              applyRestore?.();
            }
            return { data, error: null };
          })
        ),
'''
if old_select not in text:
    raise SystemExit('multiDevice canonical select block not found')
text = text.replace(old_select, new_select, 1)
old_return = r'''    rotateBeforeOperation() {
      rotateBeforeNextOperation = true;
    },
    getVersion() {
'''
new_return = r'''    rotateBeforeOperation() {
      rotateBeforeNextOperation = true;
    },
    restoreAfterReading(tableName: string, applyRestore: () => void) {
      restoreAfterReadTable = tableName;
      restoreAfterRead = applyRestore;
    },
    put(tableName: string, id: string, row: RemoteRow, userId = 'user-1') {
      getTable(tableName).set(`${userId}:${id}`, {
        ...(getTable(tableName).get(`${userId}:${id}`) ?? {}),
        ...row,
        user_id: userId,
        id,
      });
    },
    getVersion() {
'''
if old_return not in text:
    raise SystemExit('multiDevice remote return marker not found')
text = text.replace(old_return, new_return, 1)

insert_point = text.rindex("\n});")
new_test = r'''

  it('rejects a mixed canonical pull when an account restore commits between table reads', async () => {
    const original: Transaction = {
      id: 'tx-mid-pull-restore',
      type: 'expense',
      amount: 20,
      currency: 'TRY',
      title: 'Before account restore',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-08',
      occurredAt: '2026-09-08T06:10:00.000Z',
      createdAt: '2026-09-08T06:10:00.000Z',
      updatedAt: '2026-09-08T06:10:00.000Z',
    };

    await deviceA.transactions.put(original);
    await pushRecord('transactions', original as unknown as RemoteRow, deviceA);
    await pullUpdates(deviceB);
    expect((await deviceB.transactions.get(original.id))?.title).toBe('Before account restore');

    remote.restoreAfterReading('transactions', () => {
      remote.put('transactions', original.id, {
        ...remote.read('transactions', original.id),
        title: 'Restored canonical title',
        updated_at: '2026-09-08T06:30:00.000Z',
        deleted_at: null,
      });
    });

    await pullUpdates(deviceB);

    expect((await deviceB.transactions.get(original.id))?.title).toBe('Restored canonical title');
    const version = remote.getVersion();
    await expect(deviceB.deviceMetadata.get('ledger-binding')).resolves.toMatchObject({
      cloudRevision: version.revision,
      cloudGeneration: version.generation,
    });
  });'''
text = text[:insert_point] + new_test + text[insert_point:]
path.write_text(text)
