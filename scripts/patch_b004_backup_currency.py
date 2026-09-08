from pathlib import Path

service_path = Path('src/exports/backupService.ts')
test_path = Path('src/exports/backupService.test.ts')
service = service_path.read_text()
tests = test_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {text.count(old)}')
    return text.replace(old, new, 1)

service = replace_once(
    service,
    """  const expectedBalanceIds = getExpectedBalanceIds();
  const actualBalanceIds = new Set(data.balances.map((balance) => balance.id));
""",
    """  const expectedBalanceIds = getLegacyExpectedBalanceIds();
  const actualBalanceIds = new Set(data.balances.map((balance) => balance.id));
""",
    'legacy expected balance IDs',
)

service = replace_once(
    service,
    """  if (
    data.balances.length !== expectedBalanceIds.size ||
    [...expectedBalanceIds].some((id) => !actualBalanceIds.has(id))
  ) {
    throw new BackupValidationError(
      'Legacy backup must contain exactly one saved balance for every supported currency and payment method.'
    );
  }

  return data;
""",
    """  if (
    data.balances.length !== expectedBalanceIds.size ||
    [...expectedBalanceIds].some((id) => !actualBalanceIds.has(id))
  ) {
    throw new BackupValidationError(
      'Legacy backup must contain exactly one saved balance for every supported currency and payment method.'
    );
  }
  assertLegacyCurrencyCompatibility(data);

  return data;
""",
    'legacy compatibility validation',
)

old_relationships = """  const expectedBalanceIds = getExpectedBalanceIds();
  const openingBalanceIds = new Set<string>();
  for (const checkpoint of data.balanceCheckpoints) {
    if (!expectedBalanceIds.has(checkpoint.balanceId)) {
      throw new BackupValidationError(
        `Checkpoint ${checkpoint.id} references unsupported balance ${checkpoint.balanceId}.`
      );
    }
    if (checkpoint.kind === 'opening') openingBalanceIds.add(checkpoint.balanceId);
  }

  if (data.settings[0].setupCompleted) {
    const missingOpenings = [...expectedBalanceIds].filter((id) => !openingBalanceIds.has(id));
    if (missingOpenings.length > 0) {
      throw new BackupValidationError(
        `Completed backup is missing opening checkpoints for: ${missingOpenings.join(', ')}.`
      );
    }
  }
"""
new_relationships = """  const openingBalanceIds = new Set<string>();
  const activeCurrencies = new Set<Currency>();
  for (const checkpoint of data.balanceCheckpoints) {
    if (checkpoint.kind === 'opening') {
      openingBalanceIds.add(checkpoint.balanceId);
      activeCurrencies.add(checkpoint.currency);
    }
  }

  const expectedBalanceIds = getExpectedBalanceIdsForCurrencies(activeCurrencies);
  for (const checkpoint of data.balanceCheckpoints) {
    if (!expectedBalanceIds.has(checkpoint.balanceId)) {
      throw new BackupValidationError(
        `Checkpoint ${checkpoint.id} references a balance without an opening checkpoint: ${checkpoint.balanceId}.`
      );
    }
  }

  const settings = data.settings[0];
  if (settings.setupCompleted) {
    if (activeCurrencies.size === 0) {
      throw new BackupValidationError('Completed backup must contain at least one active currency.');
    }
    if (!activeCurrencies.has(settings.defaultCurrency)) {
      throw new BackupValidationError(
        `Default currency ${settings.defaultCurrency} is missing opening checkpoints.`
      );
    }

    const missingOpenings = [...expectedBalanceIds]
      .filter((id) => !openingBalanceIds.has(id))
      .sort();
    if (missingOpenings.length > 0) {
      throw new BackupValidationError(
        `Completed backup is missing opening checkpoints for: ${missingOpenings.join(', ')}.`
      );
    }

    const inactiveReferencedCurrencies = [...collectReferencedCurrencies(data)]
      .filter((currency) => !activeCurrencies.has(currency))
      .sort();
    if (inactiveReferencedCurrencies.length > 0) {
      throw new BackupValidationError(
        `Completed backup references currencies without opening checkpoints: ${inactiveReferencedCurrencies.join(', ')}.`
      );
    }
  }
"""
service = replace_once(service, old_relationships, new_relationships, 'canonical relationship currency invariants')

for old, new, label in [
    ("currency: requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`),", "currency: requireCurrencyCode(row.currency, `${label}.currency`),", 'transaction currency'),
    ("const currency = requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`);", "const currency = requireCurrencyCode(row.currency, `${label}.currency`);", 'balance currency'),
    ("const currency = requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`);", "const currency = requireCurrencyCode(row.currency, `${label}.currency`);", 'checkpoint currency'),
    ("currency: requireOneOf(row.currency, SUPPORTED_CURRENCIES, `${label}.currency`),", "currency: requireCurrencyCode(row.currency, `${label}.currency`),", 'recurring currency'),
    ("fromCurrency: requireOneOf(row.fromCurrency, SUPPORTED_CURRENCIES, `${label}.fromCurrency`),", "fromCurrency: requireCurrencyCode(row.fromCurrency, `${label}.fromCurrency`),", 'conversion from currency'),
    ("toCurrency: requireOneOf(row.toCurrency, SUPPORTED_CURRENCIES, `${label}.toCurrency`),", "toCurrency: requireCurrencyCode(row.toCurrency, `${label}.toCurrency`),", 'conversion to currency'),
]:
    service = replace_once(service, old, new, label)

service = replace_once(
    service,
    """function validateMonthlyBudget(value: unknown, label: string): MonthlyBudget {
  const row = requireObject(value, label);
  if (row.currency !== 'TRY') throw new BackupValidationError(`${label}.currency must be TRY.`);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    totalBudget: requireNonNegativeMoney(row.totalBudget, `${label}.totalBudget`),
    rolloverFromPreviousMonth: requireFiniteNumber(
      row.rolloverFromPreviousMonth,
      `${label}.rolloverFromPreviousMonth`
    ),
    currency: 'TRY',
""",
    """function validateMonthlyBudget(value: unknown, label: string): MonthlyBudget {
  const row = requireObject(value, label);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    totalBudget: requireNonNegativeMoney(row.totalBudget, `${label}.totalBudget`),
    rolloverFromPreviousMonth: requireFiniteNumber(
      row.rolloverFromPreviousMonth,
      `${label}.rolloverFromPreviousMonth`
    ),
    currency: requireCurrencyCode(row.currency, `${label}.currency`),
""",
    'monthly budget currency',
)

service = replace_once(
    service,
    """function validateCategoryBudget(value: unknown, label: string): CategoryBudget {
  const row = requireObject(value, label);
  if (row.currency !== 'TRY') throw new BackupValidationError(`${label}.currency must be TRY.`);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    categoryId: requireId(row.categoryId, `${label}.categoryId`),
    amount: requireNonNegativeMoney(row.amount, `${label}.amount`),
    currency: 'TRY',
""",
    """function validateCategoryBudget(value: unknown, label: string): CategoryBudget {
  const row = requireObject(value, label);
  return {
    id: requireId(row.id, `${label}.id`),
    month: requireMonth(row.month, `${label}.month`),
    categoryId: requireId(row.categoryId, `${label}.categoryId`),
    amount: requireNonNegativeMoney(row.amount, `${label}.amount`),
    currency: requireCurrencyCode(row.currency, `${label}.currency`),
""",
    'category budget currency',
)

service = replace_once(
    service,
    """function validateSettings(value: unknown, label: string): Settings {
  const row = requireObject(value, label);
  if (row.defaultCurrency !== 'TRY') {
    throw new BackupValidationError(`${label}.defaultCurrency must be TRY.`);
  }
  return {
    id: requireId(row.id, `${label}.id`),
    defaultCurrency: 'TRY',
""",
    """function validateSettings(value: unknown, label: string): Settings {
  const row = requireObject(value, label);
  return {
    id: requireId(row.id, `${label}.id`),
    defaultCurrency: requireCurrencyCode(row.defaultCurrency, `${label}.defaultCurrency`),
""",
    'settings default currency',
)

service = replace_once(
    service,
    """function requireMonth(value: unknown, label: string): string {
  const month = requireString(value, label, 7);
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BackupValidationError(`${label} must use YYYY-MM.`);
  }
  return month;
}

function requireOneOf<const T extends readonly string[]>(
""",
    """function requireMonth(value: unknown, label: string): string {
  const month = requireString(value, label, 7);
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BackupValidationError(`${label} must use YYYY-MM.`);
  }
  return month;
}

function requireCurrencyCode(value: unknown, label: string): Currency {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new BackupValidationError(`${label} must be an uppercase three-letter currency code.`);
  }
  return value;
}

function requireOneOf<const T extends readonly string[]>(
""",
    'currency code validator',
)

service = replace_once(
    service,
    """function getExpectedBalanceIds(): Set<string> {
  return new Set(
    SUPPORTED_CURRENCIES.flatMap((currency) =>
      SUPPORTED_METHODS.map((method) => getBalanceId(currency, method))
    )
  );
}
""",
    """function getExpectedBalanceIdsForCurrencies(currencies: Iterable<Currency>): Set<string> {
  const ids = new Set<string>();
  for (const currency of currencies) {
    for (const method of SUPPORTED_METHODS) ids.add(getBalanceId(currency, method));
  }
  return ids;
}

function getLegacyExpectedBalanceIds(): Set<string> {
  return getExpectedBalanceIdsForCurrencies(SUPPORTED_CURRENCIES);
}

function isLegacyCurrency(currency: string): boolean {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

function assertLegacyCurrencyCompatibility(data: LegacyBackupData): void {
  const currencies = new Set<string>();
  for (const transaction of data.transactions) currencies.add(transaction.currency);
  for (const balance of data.balances) currencies.add(balance.currency);
  for (const budget of data.monthlyBudgets) currencies.add(budget.currency);
  for (const budget of data.categoryBudgets) currencies.add(budget.currency);
  for (const recurring of data.recurringTransactions) currencies.add(recurring.currency);
  for (const conversion of data.conversions) {
    currencies.add(conversion.fromCurrency);
    currencies.add(conversion.toCurrency);
  }

  if ([...currencies].some((currency) => !isLegacyCurrency(currency))) {
    throw new BackupValidationError('Legacy backup contains a currency unsupported by the legacy format.');
  }
  if (data.settings.some((settings) => settings.defaultCurrency !== 'TRY')) {
    throw new BackupValidationError('Legacy backup default currency must be TRY.');
  }
  if (data.monthlyBudgets.some((budget) => budget.currency !== 'TRY')) {
    throw new BackupValidationError('Legacy backup monthly budgets must use TRY.');
  }
  if (data.categoryBudgets.some((budget) => budget.currency !== 'TRY')) {
    throw new BackupValidationError('Legacy backup category budgets must use TRY.');
  }
}

function collectReferencedCurrencies(data: CanonicalBackupData): Set<Currency> {
  const currencies = new Set<Currency>([data.settings[0].defaultCurrency]);
  for (const transaction of data.transactions) currencies.add(transaction.currency);
  for (const budget of data.monthlyBudgets) currencies.add(budget.currency);
  for (const budget of data.categoryBudgets) currencies.add(budget.currency);
  for (const recurring of data.recurringTransactions) currencies.add(recurring.currency);
  for (const conversion of data.conversions) {
    currencies.add(conversion.fromCurrency);
    currencies.add(conversion.toCurrency);
  }
  return currencies;
}
""",
    'balance/currency relationship helpers',
)

# Add dynamic-currency backup tests before the cloud-linked restore test.
insert_before = """  it('blocks restore on a cloud-linked ledger until restore scope is explicitly decided', async () => {
"""
new_tests = """  it('round-trips a completed canonical ledger with a dynamic currency', async () => {
    await completeInitialSetup(
      {
        balances: { GBP: { cash: 500, card: 0 } },
        monthlyBudget: 1_500,
        defaultMethod: 'cash',
        defaultCurrency: 'GBP',
        month: '2026-05',
      },
      database,
      new Date('2026-05-01T09:00:00.000Z')
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 120,
        currency: 'GBP',
        title: 'train',
        categoryId: 'cat-other',
        method: 'cash',
        date: '2026-05-05',
      },
      database,
      new Date('2026-05-05T12:00:00.000Z'),
      'gbp-train'
    );

    const backup = await exportBackupJSON(database, new Date('2026-05-07T00:00:00.000Z'));
    await database.transactions.clear();
    await database.balanceCheckpoints.clear();
    await database.balances.clear();

    const result = await restoreBackupJSON(backup, database, {
      now: new Date('2026-05-08T00:00:00.000Z'),
    });

    expect(result.source).toBe('v2');
    expect((await database.settings.get('default'))?.defaultCurrency).toBe('GBP');
    expect((await getBalance('GBP', 'cash'))?.amount).toBe(380);
    expect((await database.monthlyBudgets.get('2026-05'))?.currency).toBe('GBP');
  });

  it.each(['GB', 'gbp', 'USDT'])('rejects malformed canonical currency code %s', async (currency) => {
    await completeInitialSetup(
      {
        balances: { GBP: { cash: 500, card: 0 } },
        monthlyBudget: 1_500,
        defaultMethod: 'cash',
        defaultCurrency: 'GBP',
        month: '2026-05',
      },
      database,
      new Date('2026-05-01T09:00:00.000Z')
    );
    await createTransaction(
      {
        type: 'expense',
        amount: 10,
        currency: 'GBP',
        title: 'test',
        categoryId: 'cat-other',
        method: 'cash',
        date: '2026-05-05',
      },
      database,
      new Date('2026-05-05T12:00:00.000Z'),
      'bad-currency-source'
    );
    const parsed = JSON.parse(await exportBackupJSON(database));
    parsed.transactions[0].currency = currency;

    await expect(restoreBackupJSON(JSON.stringify(parsed), database)).rejects.toThrow(
      'uppercase three-letter currency code'
    );
  });

  it('requires both payment-method opening checkpoints for each dynamic active currency', async () => {
    await completeInitialSetup(
      {
        balances: { GBP: { cash: 500, card: 0 } },
        monthlyBudget: 1_500,
        defaultMethod: 'cash',
        defaultCurrency: 'GBP',
        month: '2026-05',
      },
      database,
      new Date('2026-05-01T09:00:00.000Z')
    );
    const parsed = JSON.parse(await exportBackupJSON(database));
    parsed.balanceCheckpoints = parsed.balanceCheckpoints.filter(
      (checkpoint: { balanceId: string }) => checkpoint.balanceId !== 'GBP-card'
    );

    await expect(restoreBackupJSON(JSON.stringify(parsed), database)).rejects.toThrow(
      'Completed backup is missing opening checkpoints for: GBP-card.'
    );
  });

"""
tests = replace_once(tests, insert_before, new_tests + insert_before, 'dynamic backup tests')

# Add a legacy-format dynamic-currency rejection after the malformed legacy snapshot test.
legacy_anchor = """  it('rejects a malformed legacy balance snapshot instead of guessing a baseline', async () => {
"""
legacy_test = """  it('keeps legacy backups restricted to their original currency model', async () => {
    await setupLedger();
    const legacyBackup = {
      transactions: await database.transactions.toArray(),
      balances: await database.balances.toArray(),
      categories: await database.categories.toArray(),
      monthlyBudgets: await database.monthlyBudgets.toArray(),
      categoryBudgets: await database.categoryBudgets.toArray(),
      recurringTransactions: await database.recurringTransactions.toArray(),
      conversions: await database.conversions.toArray(),
      settings: (await database.settings.toArray()).map((settings) => ({
        ...settings,
        defaultCurrency: 'GBP',
      })),
    };

    await expect(restoreBackupJSON(JSON.stringify(legacyBackup), database)).rejects.toThrow(
      'Legacy backup default currency must be TRY.'
    );
  });

"""
tests = replace_once(tests, legacy_anchor, legacy_test + legacy_anchor, 'legacy currency compatibility test')

service_path.write_text(service)
test_path.write_text(tests)
