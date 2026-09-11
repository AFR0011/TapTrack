import { getCurrencyFractionDigits } from '@/currencies/currencyCatalog';
import type { Currency } from '@/types';

export function formatMoney(amount: number, currency: Currency | 'TRY' = 'TRY') {
  const fractionDigits = getCurrencyFractionDigits(currency);
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${currency}`;
}

function parseStrictDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAmountInput(value: string) {
  const parsed = parseStrictDecimal(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

export function parseNonNegativeAmountInput(value: string): number | null {
  const parsed = parseStrictDecimal(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
