import { db, type RavelDatabase } from '@/database';
import { getBalanceId } from '@/defaultData';
import { formatLocalDate } from '@/dates';
import { findSameDayOrderingCheckpoint } from '@/balances/reconciliationService';
import type { BalanceCheckpoint, TransactionDraft } from '@/types';

export type TransactionOrderingRequirement = {
  index: number;
  checkpoint: BalanceCheckpoint;
};

/**
 * Finds historical transaction drafts whose selected date shares a reconciliation
 * checkpoint for the exact balance bucket they affect. Current-day drafts are
 * intentionally excluded because transaction creation gives them an exact
 * occurredAt timestamp automatically.
 */
export async function findHistoricalTransactionOrderingRequirements(
  drafts: TransactionDraft[],
  database: RavelDatabase = db,
  nowDate = new Date()
): Promise<TransactionOrderingRequirement[]> {
  const today = formatLocalDate(nowDate);
  const requirements: TransactionOrderingRequirement[] = [];

  for (const [index, draft] of drafts.entries()) {
    if (draft.occurredAt || draft.date >= today) continue;

    const checkpoint = await findSameDayOrderingCheckpoint(
      draft.date,
      [getBalanceId(draft.currency, draft.method)],
      database
    );
    if (checkpoint) requirements.push({ index, checkpoint });
  }

  return requirements;
}
