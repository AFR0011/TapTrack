import { NextResponse } from 'next/server';
import { normalizeCurrencyCode, type CurrencyOption } from '@/currencies/currencyCatalog';

type UnknownRecord = Record<string, unknown>;

export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await fetch('https://api.frankfurter.dev/v2/currencies', {
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Currency catalog is temporarily unavailable.' }, { status: 503 });
    }

    const raw = (await upstream.json()) as unknown;
    const rows: UnknownRecord[] = Array.isArray(raw)
      ? raw.filter(isRecord)
      : isRecord(raw)
        ? Object.entries(raw).map(([code, value]) =>
            isRecord(value) ? { code, ...value } : { code, name: String(value) }
          )
        : [];

    const currencies = rows
      .map(normalizeCurrencyRow)
      .filter((value): value is CurrencyOption => Boolean(value))
      .sort((a, b) => a.code.localeCompare(b.code));

    if (currencies.length === 0) {
      return NextResponse.json({ error: 'Currency catalog returned no active currencies.' }, { status: 503 });
    }

    return NextResponse.json(
      { currencies },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  } catch {
    return NextResponse.json({ error: 'Currency catalog is temporarily unavailable.' }, { status: 503 });
  }
}

function normalizeCurrencyRow(row: UnknownRecord): CurrencyOption | null {
  const code = normalizeCurrencyCode(row.iso_code ?? row.isoCode ?? row.code ?? row.currency);
  if (!code) return null;

  const nameValue = row.name ?? row.currency_name ?? row.currencyName ?? code;
  const name = typeof nameValue === 'string' && nameValue.trim() ? nameValue.trim() : code;
  const symbolValue = row.symbol;
  const symbol = typeof symbolValue === 'string' && symbolValue.trim() ? symbolValue.trim() : undefined;

  return { code, name, symbol };
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
