import { RavelMark } from './RavelMark';

const balances = [
  { code: 'TRY', amount: '₺42,680', detail: 'Card + cash', tone: 'bg-brand-olive' },
  { code: 'USD', amount: '$1,420', detail: 'Card + cash', tone: 'bg-brand-copper' },
  { code: 'EUR', amount: '€860', detail: 'Cash', tone: 'bg-brand-plum' },
] as const;

const transactions = [
  { title: 'Migros groceries', meta: 'Groceries · Card', amount: '−₺1,240', badge: 'Smart category' },
  { title: 'Freelance invoice', meta: 'Income · USD card', amount: '+$850', badge: null },
  { title: 'Metro', meta: 'Transport · Card', amount: '−₺35', badge: null },
] as const;

export function RavelProductPreview() {
  return (
    <div
      data-marketing-preview="ravel-ledger"
      className="relative overflow-hidden rounded-[2rem] border border-subtle bg-surface p-3 shadow-[var(--shadow-overlay)] sm:p-4"
      aria-label="Illustrative Ravel ledger preview using synthetic data"
    >
      <div className="flex items-center justify-between gap-4 border-b border-subtle px-2 pb-3 sm:px-3">
        <div className="flex items-center gap-2.5">
          <RavelMark className="h-8 w-8" />
          <div>
            <p className="font-display text-lg font-semibold leading-none">Ravel</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Personal ledger</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          Local first
        </div>
      </div>

      <div className="grid gap-3 p-2 pt-4 sm:p-3 sm:pt-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[1.5rem] bg-brand-espresso p-5 text-brand-bone">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-bone/70">Balances</p>
          <h3 className="font-display mt-2 text-3xl leading-none">Where you stand</h3>
          <div className="mt-5 space-y-2.5">
            {balances.map((balance) => (
              <div key={balance.code} className="flex items-center justify-between gap-3 rounded-xl bg-white/7 px-3 py-3 ring-1 ring-white/10">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${balance.tone}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{balance.code}</p>
                    <p className="mt-0.5 truncate text-[11px] text-brand-bone/65">{balance.detail}</p>
                  </div>
                </div>
                <p className="font-display text-lg tabular-nums">{balance.amount}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3">
          <section className="rounded-[1.5rem] bg-background p-4 ring-1 ring-subtle/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Quick Add</p>
                <p className="font-display mt-1 text-xl">Record it before you forget it.</p>
              </div>
              <span className="rounded-full bg-accent-muted px-2 py-1 text-[10px] font-semibold text-accent">⌘ K</span>
            </div>
            <div className="mt-4 flex min-h-12 items-center rounded-xl border border-subtle bg-surface px-3 text-sm text-secondary shadow-sm">
              Migros groceries · 1240 TRY · card
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-muted">
              <span>Groceries suggested</span>
              <span>Save immediately</span>
            </div>
          </section>

          <section className="rounded-[1.5rem] bg-background p-4 ring-1 ring-subtle/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Recent activity</p>
                <p className="font-display mt-1 text-xl">One record across places.</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Today</span>
            </div>
            <div className="mt-3 divide-y divide-subtle">
              {transactions.map((transaction) => (
                <div key={transaction.title} className="flex items-center justify-between gap-3 py-2.5 first:pt-1">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-primary">{transaction.title}</p>
                      {transaction.badge ? (
                        <span className="rounded-full bg-ai-muted px-1.5 py-0.5 text-[9px] font-semibold text-ai-text">{transaction.badge}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-muted">{transaction.meta}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-primary">{transaction.amount}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <p className="px-3 pb-2 pt-1 text-[10px] font-medium text-muted">
        Illustrative interface · synthetic balances and transactions
      </p>
    </div>
  );
}
