import Link from 'next/link';
import { BRAND } from '@/brand';
import { RavelMark } from '@/components/brand/RavelMark';

const pillars = [
  {
    eyebrow: 'Fast capture',
    title: 'Record it before you forget it.',
    body: 'Quick Add, keyboard-first command entry, recurring transactions, and shortcuts keep the common path short.',
  },
  {
    eyebrow: 'One ledger',
    title: 'Cash, cards, and currencies together.',
    body: 'Keep one dependable record even when your money is spread across methods, currencies, accounts, and places.',
  },
  {
    eyebrow: 'Local first',
    title: 'Your ledger works without the cloud.',
    body: 'Ordinary finance capture stays available offline. Account sync is optional rather than a prerequisite for using your own records.',
  },
  {
    eyebrow: 'Smart, not autonomous',
    title: 'Automation helps. You decide.',
    body: 'Smart Categories can suggest and organize, while your own choices remain authoritative.',
  },
] as const;

const sampleCurrencies = [
  { code: 'TRY', amount: '₺42,680', note: 'Cash + card' },
  { code: 'USD', amount: '$1,420', note: 'Card + cash' },
  { code: 'EUR', amount: '€860', note: 'Cash' },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-primary">
      <header className="border-b border-subtle/80 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <RavelMark className="h-10 w-10" />
            <div>
              <div className="font-display text-2xl font-semibold leading-none tracking-tight">{BRAND.name}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                Part of {BRAND.parent} · {BRAND.module}
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-2" aria-label="Primary">
            <Link
              href="/login"
              className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-secondary transition-colors hover:bg-surface-muted hover:text-primary sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center rounded-full bg-action-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover"
            >
              Open Ravel
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            A quieter personal ledger
          </p>
          <h1 className="font-display max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            {BRAND.hero}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-secondary sm:text-xl">
            One personal ledger for cash, cards, currencies, transfers and everyday spending. Fast to capture,
            useful offline, and designed to keep the record under your control.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex min-h-12 items-center rounded-full bg-action-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover"
            >
              Open Ravel
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center rounded-full border border-subtle bg-surface px-6 text-sm font-semibold text-primary transition-colors hover:bg-surface-muted"
            >
              See how it works
            </a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            <span>Local first</span>
            <span>Multi-currency</span>
            <span>Offline capable</span>
            <span>Optional sync</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -left-10 top-12 hidden h-40 w-40 rounded-full bg-brand-copper/10 blur-3xl sm:block" />
          <div className="absolute -right-8 bottom-8 hidden h-48 w-48 rounded-full bg-brand-plum/10 blur-3xl sm:block" />
          <div className="relative overflow-hidden rounded-[2rem] border border-subtle bg-surface p-4 shadow-[var(--shadow-overlay)] sm:p-6">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Balances</p>
                <p className="font-display mt-1 text-2xl">Where you stand</p>
              </div>
              <RavelMark className="h-9 w-9" title="Ravel ledger" />
            </div>

            <div className="rounded-3xl bg-brand-espresso p-6 text-brand-bone">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-bone/65">Your ledger</p>
              <p className="font-display mt-3 text-4xl tracking-tight">Three currencies. One record.</p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-brand-bone/70">
                See each currency clearly without pretending unlike money is directly interchangeable.
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              {sampleCurrencies.map((currency, index) => (
                <div
                  key={currency.code}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-subtle bg-background/70 px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        index === 0 ? 'bg-brand-olive' : index === 1 ? 'bg-brand-copper' : 'bg-brand-plum'
                      }`}
                    />
                    <div>
                      <p className="font-semibold">{currency.code}</p>
                      <p className="mt-0.5 text-xs text-muted">{currency.note}</p>
                    </div>
                  </div>
                  <p className="font-display text-xl tabular-nums">{currency.amount}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-subtle bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">Built for real financial lives</p>
            <h2 className="font-display mt-4 text-4xl leading-tight tracking-tight sm:text-5xl">
              Record in seconds. Keep the whole picture.
            </h2>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-subtle bg-subtle md:grid-cols-2">
            {pillars.map((pillar) => (
              <article key={pillar.title} className="bg-background p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{pillar.eyebrow}</p>
                <h3 className="font-display mt-3 text-2xl leading-tight">{pillar.title}</h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-secondary">{pillar.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
        <div className="rounded-[2rem] bg-brand-espresso p-7 text-brand-bone sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-copper-bright">Ledger, not guesswork</p>
          <h2 className="font-display mt-4 text-4xl leading-tight">Moving money isn’t spending money.</h2>
          <p className="mt-5 max-w-xl leading-7 text-brand-bone/72">
            Ravel keeps transfers, currency exchanges, reconciliations and everyday transactions distinct so the record reflects what actually happened.
          </p>
        </div>
        <div className="rounded-[2rem] border border-subtle bg-surface p-7 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Control by default</p>
          <h2 className="font-display mt-4 text-4xl leading-tight">Helpful when you want it. Quiet when you don’t.</h2>
          <p className="mt-5 max-w-xl leading-7 text-secondary">
            Local storage is the ordinary working boundary. Sync and Smart Categories are optional additions, while backups and the underlying ledger stay understandable and user-controlled.
          </p>
        </div>
      </section>

      <section className="border-t border-subtle bg-brand-espresso text-brand-bone">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <RavelMark className="h-9 w-9" />
              <span className="font-display text-2xl">{BRAND.name}</span>
            </div>
            <h2 className="font-display mt-7 max-w-2xl text-4xl leading-tight sm:text-5xl">{BRAND.promise}</h2>
            <p className="mt-4 text-sm text-brand-bone/65">{BRAND.tagline}</p>
          </div>
          <Link
            href="/app"
            className="inline-flex min-h-12 w-fit items-center rounded-full bg-brand-copper-bright px-6 text-sm font-semibold text-brand-espresso transition-opacity hover:opacity-90"
          >
            Open Ravel
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-brand-espresso text-brand-bone/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>{BRAND.name} · {BRAND.module} module</span>
          <span>Part of {BRAND.parent}</span>
        </div>
      </footer>
    </main>
  );
}
