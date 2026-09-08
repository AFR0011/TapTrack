from pathlib import Path

# 1) Backup error assertion: keep the explicit product wording now shown to users.
path = Path('src/exports/backupService.test.ts')
text = path.read_text()
text = text.replace(
    "'device-only versus account-wide restore behavior is selected'",
    "'Choose whether to restore the synced account or only this device'",
)
path.write_text(text)

# 2) Binding test client now understands the account ledger-version marker.
path = Path('src/sync/syncBinding.test.ts')
text = path.read_text()
start = text.index('function createClient(')
end = text.index("\n\ndescribe('device ledger sync binding'", start)
new_create_client = r'''function createClient(options?: {
  userId?: string | null;
  nonEmptyTable?: string;
  failedTable?: string;
}) {
  const userId = options?.userId === undefined ? 'user-1' : options.userId;
  let ledgerVersion = {
    revision: 1,
    generation: '123e4567-e89b-42d3-a456-426614174000',
    updated_at: '2026-09-08T06:00:00.000Z',
  };

  const from = vi.fn((tableName: string) => {
    if (tableName === 'ledger_versions') {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: ledgerVersion, error: null })),
        insert: vi.fn(async () => {
          ledgerVersion = {
            revision: 1,
            generation: '123e4567-e89b-42d3-a456-426614174000',
            updated_at: '2026-09-08T06:00:00.000Z',
          };
          return { error: null };
        }),
      };
      return chain;
    }

    const response = () => ({
      data: options?.nonEmptyTable === tableName ? [{ id: 'remote-row' }] : [],
      error: options?.failedTable === tableName ? { message: 'read failed' } : null,
    });
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      limit: vi.fn(async () => response()),
    };
    return chain;
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    from,
  };
}'''
text = text[:start] + new_create_client + text[end:]
text = text.replace(
    'expect(client.from).toHaveBeenCalledTimes(REMOTE_FINANCE_TABLES.length);',
    'expect(client.from).toHaveBeenCalledTimes(REMOTE_FINANCE_TABLES.length + 1);',
)
path.write_text(text)

# 3) Durable sync tests keep their scope by mocking only ledger version lookup,
# while network assertions move from direct Supabase writes to the protected route.
path = Path('src/sync/syncService.test.ts')
text = path.read_text()
marker = "vi.mock('@/sync/syncBinding', () => ({\n  getSyncAccess: vi.fn(),\n  requireLinkedSyncAccess: vi.fn(),\n}));\n"
insert = marker + "\nvi.mock('@/sync/ledgerVersion', () => ({\n  ensureCloudLedgerVersion: vi.fn(async () => ({\n    revision: 1,\n    generation: '123e4567-e89b-42d3-a456-426614174000',\n    updatedAt: '2026-09-08T06:00:00.000Z',\n  })),\n  bindingMatchesLedgerVersion: vi.fn(() => true),\n}));\n"
if marker not in text:
    raise SystemExit('syncService ledgerVersion mock marker missing')
text = text.replace(marker, insert, 1)

old_return = """  return {
    upsert,
    update,
    auth: {
"""
new_return = """  const syncOperation = vi.fn(async (body: Record<string, unknown>) => {
    if (body.operation === 'delete') {
      if (options.updateError) {
        return new Response(JSON.stringify({ error: options.updateError.message }), { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (options.upsert) {
      const result = await options.upsert(String(body.table ?? ''), body.record);
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error.message }), { status: 503 });
      }
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  return {
    upsert,
    update,
    syncOperation,
    auth: {
"""
if old_return not in text:
    raise SystemExit('syncService createClient return marker missing')
text = text.replace(old_return, new_return, 1)

old_authorize = """function authorize(client = createClientMock()) {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue({
    client: client as never,
    userId: 'user-1',
    binding: {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-05-18T00:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: '123e4567-e89b-42d3-a456-426614174000',
    },
  });
  return client;
}
"""
new_authorize = """function authorize(client = createClientMock()) {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue({
    client: client as never,
    userId: 'user-1',
    binding: {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-05-18T00:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: '123e4567-e89b-42d3-a456-426614174000',
    },
  });
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return client.syncOperation(body);
  }));
  return client;
}
"""
if old_authorize not in text:
    raise SystemExit('syncService authorize marker missing')
text = text.replace(old_authorize, new_authorize, 1)
text = text.replace(
    "afterEach(async () => {\n  vi.clearAllMocks();",
    "afterEach(async () => {\n  vi.unstubAllGlobals();\n  vi.clearAllMocks();",
    1,
)
old_delete_assert = """    expect(client.update).toHaveBeenCalledTimes(1);
    expect(client.update.mock.calls[0]?.[0]).toBe('transactions');
    expect(client.update.mock.calls[0]?.[1]).toMatchObject({
      deleted_at: expect.any(String),
    });
"""
new_delete_assert = """    expect(client.syncOperation).toHaveBeenCalledTimes(1);
    expect(client.syncOperation.mock.calls[0]?.[0]).toMatchObject({
      table: 'transactions',
      operation: 'delete',
      recordId: 'tx-1',
    });
"""
if old_delete_assert not in text:
    raise SystemExit('syncService delete assertion marker missing')
text = text.replace(old_delete_assert, new_delete_assert, 1)
path.write_text(text)

# 4) Multi-device test backend now behaves like the protected server route and
# exposes a real ledger generation that can rotate under offline clients.
path = Path('src/sync/multiDeviceSync.test.ts')
text = path.read_text()
start = text.index('function createFilteredChain')
end = text.index("\n\ndescribe('two-device canonical ledger convergence'", start)
new_helpers = r'''function createFilteredChain<T>(resolveValue: (filters: Filters) => T | Promise<T>) {
  const filters: Filters = {};
  const chain = {
    eq: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    is: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    then: (
      resolve: (result: T) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(resolveValue(filters)).then(resolve, reject),
  };
  return chain;
}

const INITIAL_GENERATION = '123e4567-e89b-42d3-a456-426614174000';
const ROTATED_GENERATION = '223e4567-e89b-42d3-a456-426614174000';

function createSharedRemoteClient() {
  const tables = new Map<string, Map<string, RemoteRow>>();
  let revision = 1;
  let generation = INITIAL_GENERATION;
  let rotateBeforeNextOperation = false;

  const getTable = (tableName: string) => {
    let table = tables.get(tableName);
    if (!table) {
      table = new Map<string, RemoteRow>();
      tables.set(tableName, table);
    }
    return table;
  };

  const getKey = (row: RemoteRow) => `${String(row.user_id)}:${String(row.id)}`;
  const matches = (row: RemoteRow, filters: Filters) =>
    Object.entries(filters).every(([field, value]) => row[field] === value);

  const rotateGeneration = () => {
    revision += 1;
    generation = ROTATED_GENERATION;
  };

  const client = {
    from: vi.fn((tableName: string) => {
      if (tableName === 'ledger_versions') {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: {
              revision,
              generation,
              updated_at: '2026-09-08T06:00:00.000Z',
            },
            error: null,
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
        return chain;
      }

      return {
        select: vi.fn(() =>
          createFilteredChain(async (filters) => ({
            data: [...getTable(tableName).values()]
              .filter((row) => matches(row, filters))
              .map((row) => ({ ...row })),
            error: null,
          }))
        ),
      };
    }),
  };

  const handleSyncRequest = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (rotateBeforeNextOperation) {
      rotateBeforeNextOperation = false;
      rotateGeneration();
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      revision?: number;
      generation?: string;
      table?: string;
      operation?: string;
      recordId?: string;
      record?: RemoteRow | null;
    };

    if (body.revision !== revision || body.generation !== generation) {
      return new Response(JSON.stringify({ revision, generation }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!body.table || !body.recordId) {
      return new Response(JSON.stringify({ error: 'invalid request' }), { status: 400 });
    }

    const table = getTable(body.table);
    const key = `user-1:${body.recordId}`;
    if (body.operation === 'delete') {
      table.set(key, {
        ...(table.get(key) ?? { user_id: 'user-1', id: body.recordId }),
        deleted_at: '2026-09-08T06:30:00.000Z',
        updated_at: '2026-09-08T06:30:00.000Z',
      });
    } else if (body.operation === 'upsert' && body.record) {
      table.set(key, { ...(table.get(key) ?? {}), ...body.record, deleted_at: null });
    } else {
      return new Response(JSON.stringify({ error: 'invalid operation' }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    client,
    handleSyncRequest,
    rotateGeneration,
    rotateBeforeOperation() {
      rotateBeforeNextOperation = true;
    },
    getVersion() {
      return { revision, generation };
    },
    read(tableName: string, id: string, userId = 'user-1') {
      return getTable(tableName).get(`${userId}:${id}`);
    },
  };
}

function authorize(client: ReturnType<typeof createSharedRemoteClient>['client']) {
  vi.mocked(requireLinkedSyncAccess).mockImplementation(async (database: TapTrackDatabase) => {
    const binding = await database.deviceMetadata.get('ledger-binding');
    if (!binding) return null;
    return {
      client: client as never,
      userId: 'user-1',
      binding,
    };
  });
}

function goOfflineForSync() {
  vi.mocked(requireLinkedSyncAccess).mockResolvedValue(null);
}'''
text = text[:start] + new_helpers + text[end:]

old_before = """    await ensureDatabaseSeeded(deviceA);
    await ensureDatabaseSeeded(deviceB);
    remote = createSharedRemoteClient();
    authorize(remote.client);
"""
new_before = """    await ensureDatabaseSeeded(deviceA);
    await ensureDatabaseSeeded(deviceB);
    const initialBinding = {
      id: 'ledger-binding',
      syncOwnerUserId: 'user-1',
      linkedAt: '2026-09-08T06:00:00.000Z',
      cloudRevision: 1,
      cloudGeneration: INITIAL_GENERATION,
    };
    await deviceA.deviceMetadata.put(initialBinding);
    await deviceB.deviceMetadata.put(initialBinding);
    remote = createSharedRemoteClient();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      remote.handleSyncRequest(input, init)
    ));
    authorize(remote.client);
"""
if old_before not in text:
    raise SystemExit('multiDevice beforeEach marker missing')
text = text.replace(old_before, new_before, 1)
text = text.replace(
    "afterEach(async () => {\n    vi.clearAllMocks();",
    "afterEach(async () => {\n    vi.unstubAllGlobals();\n    vi.clearAllMocks();",
    1,
)

insert_point = text.rindex("\n});")
new_tests = r'''

  it('discards an offline stale outbox and adopts cloud after an account restore generation changes', async () => {
    const transaction: Transaction = {
      id: 'tx-generation',
      type: 'expense',
      amount: 10,
      currency: 'TRY',
      title: 'Cloud canonical title',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-08',
      occurredAt: '2026-09-08T06:10:00.000Z',
      createdAt: '2026-09-08T06:10:00.000Z',
      updatedAt: '2026-09-08T06:10:00.000Z',
    };

    await deviceA.transactions.put(transaction);
    await pushRecord('transactions', transaction as unknown as RemoteRow, deviceA);
    await pullUpdates(deviceB);

    goOfflineForSync();
    const staleEdit = {
      ...transaction,
      title: 'Offline stale edit',
      updatedAt: '2026-09-08T06:20:00.000Z',
    };
    await deviceB.transactions.put(staleEdit);
    await pushRecord('transactions', staleEdit as unknown as RemoteRow, deviceB);
    expect(await deviceB.syncOutbox.get('transactions:tx-generation')).toBeDefined();

    remote.rotateGeneration();
    authorize(remote.client);
    await processRetryQueue(deviceB);

    expect(await deviceB.syncOutbox.get('transactions:tx-generation')).toBeUndefined();
    expect((await deviceB.transactions.get('tx-generation'))?.title).toBe('Cloud canonical title');
    expect(remote.read('transactions', 'tx-generation')?.title).toBe('Cloud canonical title');
    await expect(deviceB.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
  });

  it('rejects a stale write when generation rotates after precheck but before the protected server operation', async () => {
    const transaction: Transaction = {
      id: 'tx-generation-race',
      type: 'expense',
      amount: 15,
      currency: 'TRY',
      title: 'Cloud before race',
      categoryId: 'cat-food',
      method: 'card',
      date: '2026-09-08',
      occurredAt: '2026-09-08T06:10:00.000Z',
      createdAt: '2026-09-08T06:10:00.000Z',
      updatedAt: '2026-09-08T06:10:00.000Z',
    };

    await deviceA.transactions.put(transaction);
    await pushRecord('transactions', transaction as unknown as RemoteRow, deviceA);

    goOfflineForSync();
    const staleEdit = {
      ...transaction,
      title: 'Stale race edit',
      updatedAt: '2026-09-08T06:25:00.000Z',
    };
    await deviceA.transactions.put(staleEdit);
    await pushRecord('transactions', staleEdit as unknown as RemoteRow, deviceA);
    expect(await deviceA.syncOutbox.get('transactions:tx-generation-race')).toBeDefined();

    authorize(remote.client);
    remote.rotateBeforeOperation();
    await processRetryQueue(deviceA);

    expect(await deviceA.syncOutbox.get('transactions:tx-generation-race')).toBeUndefined();
    expect((await deviceA.transactions.get('tx-generation-race'))?.title).toBe('Cloud before race');
    expect(remote.read('transactions', 'tx-generation-race')?.title).toBe('Cloud before race');
    await expect(deviceA.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
  });'''
text = text[:insert_point] + new_tests + text[insert_point:]
path.write_text(text)
