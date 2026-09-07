import { rebuildDerivedBalances } from '@/balances/ledgerService';
import type { TapTrackDatabase } from '@/database';
import type { BalanceCheckpoint, Currency, Method } from '@/types';

/** Test-only helper: establishes an authoritative opening balance before fixture activity. */
export async function seedOpeningBalance(
  database: TapTrackDatabase,
  balanceId: string,
  amount: number,
  effectiveAt = '2025-12-31T00:00:00.000Z'
): Promise<void> {
  const [currency, method] = balanceId.split('-') as [Currency, Method];
  const date = effectiveAt.slice(0, 10);
  const checkpoint: BalanceCheckpoint = {
    id: `test-opening-${balanceId}`,
    balanceId,
    currency,
    method,
    kind: 'opening',
    observedAmount: amount,
    deltaAmount: amount,
    date,
    effectiveAt,
    month: date.slice(0, 7),
    createdAt: effectiveAt,
    updatedAt: effectiveAt,
  };

  await database.balanceCheckpoints.put(checkpoint);
  await rebuildDerivedBalances(database, effectiveAt);
}
