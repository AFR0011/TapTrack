import Link from 'next/link';
import { BRAND } from '@/brand';
import { RavelMark } from '@/components/brand/RavelMark';
import { RavelProductPreview } from '@/components/brand/RavelProductPreview';

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

      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14">
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            Personal finance for fragmented money
          </p>
          <h1 className="font-display max-w-4xl text-5xl font-medium leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            {BRAND.hero}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-secondary sm:text-xl">
            Ravel keeps cash, cards, currencies, transfers, and everyday spending in one dependable ledger.
            It is fast to capture, useful offline, and built for people whose financial life refuses to fit inside one bank app.
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

        <div className="relative mx-auto w-full max-w-3xl">
          <div className="absolute -left-8 top-12 hidden h-44 w-44 rounded-full bg-brand-copper/10 blur-3xl sm:block" />
          <div className="absolute -right-8 bottom-8 hidden h-52 w-52 rounded-full bg-brand-plum/10 blur-3xl sm:block" />
          <div className="relative">
            <RavelProductPreview />
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
            <p className="mt-5 max-w-2xl text-base leading-7 text-secondary">
              Ravel is for the awkward middle ground conventional finance apps handle badly: several currencies,
              cash beside cards, money moving between places, and connectivity that cannot be assumed.
            </p>
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
            Ravel keeps transfers, currency exchanges, reconciliations, income, and everyday spending distinct so the record reflects what actually happened.
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
