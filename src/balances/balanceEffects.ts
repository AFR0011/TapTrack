import type { Currency, Method, TransactionDraft } from '@/types';
import { getBalanceId } from '@/defaultData';

export function getTransactionBalanceDelta(transaction: Pick<TransactionDraft, 'type' | 'amount'>) {
  return transaction.type === 'expense' ? -transaction.amount : transaction.amount;
}

export function getInsufficientBalanceMessage(currency: Currency, method: Method) {
  return `Not enough ${currency} ${method} balance. Adjust balance or choose another method.`;
}

export { getBalanceId };
