import { Skeleton } from '@/components/ui/Skeleton';

export type RouteLoadingKind =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'reports'
  | 'balances'
  | 'conversions'
  | 'recurring'
  | 'settings'
  | 'add';

const ROUTE_LABELS: Record<RouteLoadingKind, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  budgets: 'Budgets',
  reports: 'Reports',
  balances: 'Balances',
  conversions: 'Transfers & exchanges',
  recurring: 'Recurring',
  settings: 'Settings',
  add: 'Add transaction',
};

export function resolveRouteLoadingKind(pathname: string): RouteLoadingKind {
  if (pathname.startsWith('/app/add')) return 'add';
  if (pathname.startsWith('/app/transactions')) return 'transactions';
  if (pathname.startsWith('/app/budgets')) return 'budgets';
  if (pathname.startsWith('/app/reports')) return 'reports';
  if (pathname.startsWith('/app/balances')) return 'balances';
  if (pathname.startsWith('/app/conversions')) return 'conversions';
  if (pathname.startsWith('/app/recurring')) return 'recurring';
  if (pathname.startsWith('/app/settings')) return 'settings';
  return 'dashboard';
}

export function resolveRouteContentWidth(pathname: string) {
  if (pathname.startsWith('/app/add')) return 'max-w-2xl';
  if (
    pathname === '/app' ||
    pathname.startsWith('/app/transactions') ||
    pathname.startsWith('/app/budgets') ||
    pathname.startsWith('/app/reports')
  ) {
    return 'max-w-7xl';
  }
  return 'max-w-6xl';
}

export default function RouteLoadingFrame({ kind }: { kind: RouteLoadingKind }) {
  return (
    <section
      data-route-skeleton={kind}
      aria-busy="true"
      aria-label={`Loading ${ROUTE_LABELS[kind]}`}
    >
      <span className="sr-only">Loading {ROUTE_LABELS[kind]}…</span>
      {kind === 'dashboard' ? <DashboardFrame /> : null}
      {kind === 'transactions' ? <TransactionsFrame /> : null}
      {kind === 'budgets' ? <BudgetsFrame /> : null}
      {kind === 'reports' ? <ReportsFrame /> : null}
      {kind === 'balances' ? <BalancesFrame /> : null}
      {kind === 'conversions' ? <ConversionsFrame /> : null}
      {kind === 'recurring' ? <RecurringFrame /> : null}
      {kind === 'settings' ? <SettingsFrame /> : null}
      {kind === 'add' ? <AddFrame /> : null}
    </section>
  );
}

function DashboardFrame() {
  return (
    <div className="space-y-6">
      <PageTitleFrame eyebrow />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] lg:items-start lg:gap-7">
        <div className="min-w-0 space-y-6">
          <HeroCardFrame />
          <SectionFrame action rows={4} />
        </div>
        <div className="min-w-0 space-y-6">
          <SectionFrame action rows={3} compact />
          <section>
            <SectionHeadingFrame action />
            <div className="rounded-[1.55rem] bg-surface p-3 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1">
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-11 rounded-xl" />
                <Skeleton className="h-11 rounded-xl" />
              </div>
              <div className="px-1 pb-2 pt-5">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-8 w-36 max-w-[70%]" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="mt-5 h-24 w-full rounded-2xl" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function TransactionsFrame() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <PageTitleFrame eyebrow bare />
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-11 w-11 rounded-xl sm:w-24" />
            <Skeleton className="h-11 w-11 rounded-xl sm:w-24" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-36 rounded-xl" />
          <Skeleton className="h-3 w-20" />
        </div>
      </header>
      <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
        <LedgerRows count={7} />
      </div>
    </div>
  );
}

function BudgetsFrame() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageTitleFrame eyebrow bare />
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <div className="min-w-0"><HeroCardFrame /></div>
        <div className="min-w-0">
          <SectionHeadingFrame action />
          <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none">
            <BudgetRows count={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame action description />
      <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(140px,180px)] md:items-end">
          <div className="flex gap-2">
            <Skeleton className="h-11 w-20 rounded-xl" />
            <Skeleton className="h-11 w-20 rounded-xl" />
            <Skeleton className="h-11 w-20 rounded-xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <Skeleton className="mt-4 h-3 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-subtle bg-surface p-1">
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricFrame />
        <MetricFrame />
        <MetricFrame />
      </div>
      <div className="rounded-2xl border border-subtle bg-surface p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-5 h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function BalancesFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame description />
      <section>
        <SectionHeadingFrame />
        <div className="grid gap-4 md:grid-cols-2">
          <BalanceCardFrame />
          <BalanceCardFrame />
        </div>
      </section>
    </div>
  );
}

function ConversionsFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame description />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <FormCardFrame />
        <OutcomeCardFrame />
      </div>
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        <div className="border-b border-subtle px-5 py-4"><Skeleton className="h-5 w-32" /></div>
        <LedgerRows count={4} icon={false} />
      </div>
    </div>
  );
}

function RecurringFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame action description />
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface">
        <LedgerRows count={5} />
      </div>
    </div>
  );
}

function SettingsFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame />
      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
        <div className="rounded-2xl border border-subtle bg-surface p-2">
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2">
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-24 max-w-full" />
                  <Skeleton className="mt-2 h-3 w-36 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-subtle bg-surface p-5">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="mt-5 h-12 w-full max-w-md rounded-xl" />
            <div className="mt-5 space-y-4 rounded-xl border border-subtle bg-surface-muted p-4">
              <SettingsRowFrame />
              <div className="h-px bg-border" />
              <SettingsRowFrame description />
            </div>
          </div>
          <div className="rounded-2xl border border-subtle bg-surface p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-4 h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AddFrame() {
  return (
    <div className="space-y-5">
      <PageTitleFrame description />
      <div className="rounded-2xl border border-subtle bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldFrame />
          <FieldFrame />
          <FieldFrame />
          <FieldFrame />
        </div>
        <div className="mt-4"><FieldFrame wide /></div>
        <Skeleton className="mt-5 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

function PageTitleFrame({
  eyebrow = false,
  action = false,
  description = false,
  bare = false,
}: {
  eyebrow?: boolean;
  action?: boolean;
  description?: boolean;
  bare?: boolean;
}) {
  const body = (
    <div className="min-w-0">
      {eyebrow ? <Skeleton className="h-3 w-16" /> : null}
      <Skeleton className={`${eyebrow ? 'mt-2' : ''} h-8 w-40 max-w-[58vw] rounded-xl`} />
      {description ? <Skeleton className="mt-2 h-4 w-72 max-w-[70vw]" /> : null}
    </div>
  );
  if (bare) return body;
  return (
    <header className="flex items-start justify-between gap-3">
      {body}
      {action ? <Skeleton className="h-11 w-28 shrink-0 rounded-xl" /> : null}
    </header>
  );
}

function HeroCardFrame() {
  return (
    <div className="min-h-[14.25rem] rounded-[1.75rem] bg-surface p-5 shadow-[0_12px_38px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-11 w-48 max-w-[72%] rounded-xl" />
          <Skeleton className="mt-3 h-4 w-40 max-w-[62%]" />
        </div>
        <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
      </div>
      <Skeleton className="mt-7 h-2 w-full rounded-full" />
      <div className="mt-5 grid grid-cols-2 gap-5 border-t border-subtle pt-4">
        <MetricLineFrame />
        <MetricLineFrame />
      </div>
    </div>
  );
}

function SectionFrame({ action = false, rows = 4, compact = false }: { action?: boolean; rows?: number; compact?: boolean }) {
  return (
    <section>
      <SectionHeadingFrame action={action} />
      <div className={`overflow-hidden ${compact ? 'rounded-[1.4rem]' : 'rounded-[1.5rem]'} bg-surface shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-subtle/70 dark:shadow-none`}>
        <LedgerRows count={rows} />
      </div>
    </section>
  );
}

function SectionHeadingFrame({ action = false }: { action?: boolean }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-6 w-32 max-w-[45vw]" />
      </div>
      {action ? <Skeleton className="h-11 w-24 shrink-0 rounded-xl" /> : null}
    </div>
  );
}

function LedgerRows({ count, icon = true }: { count: number; icon?: boolean }) {
  return (
    <div className="divide-y divide-subtle">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          {icon ? <Skeleton className="h-9 w-9 shrink-0 rounded-2xl" /> : null}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32 max-w-[75%]" />
            <Skeleton className="mt-2 h-3 w-44 max-w-[90%]" />
          </div>
          <div className="shrink-0 text-right">
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="ml-auto mt-2 h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-subtle">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-28 max-w-full" />
                <Skeleton className="mt-2 h-3 w-40 max-w-full" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricFrame() {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-8 w-28" />
    </div>
  );
}

function MetricLineFrame() {
  return (
    <div>
      <Skeleton className="h-3 w-14" />
      <Skeleton className="mt-2 h-6 w-24 max-w-full" />
    </div>
  );
}

function BalanceCardFrame() {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-3 h-8 w-36 max-w-full" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <div className="mt-5 space-y-3 rounded-xl border border-subtle bg-surface-muted p-3">
        <SettingsRowFrame />
        <SettingsRowFrame />
      </div>
    </div>
  );
}

function FormCardFrame() {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
      <Skeleton className="h-5 w-36" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-subtle bg-surface-muted p-3">
          <FieldFrame />
          <div className="mt-3 grid grid-cols-2 gap-2"><FieldFrame /><FieldFrame /></div>
        </div>
        <div className="rounded-xl border border-subtle bg-surface-muted p-3">
          <FieldFrame />
          <div className="mt-3 grid grid-cols-2 gap-2"><FieldFrame /><FieldFrame /></div>
        </div>
      </div>
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      <Skeleton className="mt-4 h-12 w-full rounded-xl" />
    </div>
  );
}

function OutcomeCardFrame() {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-6 space-y-5">
        <SettingsRowFrame description />
        <Skeleton className="h-px w-full rounded-none" />
        <SettingsRowFrame description />
      </div>
    </div>
  );
}

function SettingsRowFrame({ description = false }: { description?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-28 max-w-full" />
        {description ? <Skeleton className="mt-2 h-3 w-48 max-w-full" /> : null}
      </div>
      <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
    </div>
  );
}

function FieldFrame({ wide = false }: { wide?: boolean }) {
  return (
    <div className="min-w-0">
      <Skeleton className="h-3 w-16" />
      <Skeleton className={`mt-2 h-12 ${wide ? 'w-full' : 'w-full'} rounded-xl`} />
    </div>
  );
}
