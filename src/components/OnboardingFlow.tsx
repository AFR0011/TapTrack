'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { getSignedInEmail } from '@/lib/auth';
import { markOnboardingComplete } from '@/onboarding/onboardingState';
import { completeInitialSetup } from '@/setup/setupService';
import {
  adoptCloudLedger,
  inspectCloudAdoption,
  linkEmptyCloudLedger,
  mergeLocalLedgerIntoCloud,
} from '@/sync/syncAdoption';
import type { Currency, Method } from '@/types';

const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
type Step = 'welcome' | 'balances' | 'defaults' | 'ready' | 'conflict';
type Balances = Record<Currency, Record<Method, string>>;

const INITIAL_BALANCES: Balances = {
  TRY: { card: '', cash: '' },
  USD: { card: '', cash: '' },
  EUR: { card: '', cash: '' },
};

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [selectedCurrencies, setSelectedCurrencies] = useState<Currency[]>(['TRY']);
  const [balances, setBalances] = useState<Balances>(INITIAL_BALANCES);
  const [defaultMethod, setDefaultMethod] = useState<Method>('card');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getSignedInEmail().then((email) => {
      if (!active) return;
      setAccountEmail(email);
      setAccountChecked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const stepNumber = step === 'balances' ? 1 : step === 'defaults' ? 2 : step === 'ready' ? 3 : 0;
  const selectedSummary = useMemo(
    () => selectedCurrencies.join(' · '),
    [selectedCurrencies]
  );

  const toggleCurrency = (currency: Currency) => {
    if (currency === 'TRY') return;
    setSelectedCurrencies((current) =>
      current.includes(currency)
        ? current.filter((item) => item !== currency)
        : [...current, currency]
    );
  };

  const updateBalance = (currency: Currency, method: Method, value: string) => {
    setBalances((current) => ({
      ...current,
      [currency]: { ...current[currency], [method]: value },
    }));
  };

  const useExistingAccount = async () => {
    if (!accountChecked) return;
    if (!accountEmail) {
      router.push('/login');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const plan = await inspectCloudAdoption();
      if (plan.state === 'cloud-only' || (plan.state === 'already-linked' && plan.remoteHasData)) {
        await adoptCloudLedger();
        markOnboardingComplete();
        toast.success('Your TapTrack ledger is ready.');
        router.replace('/app');
        router.refresh();
        return;
      }
      if (plan.state === 'merge-choice') {
        setStep('conflict');
        return;
      }

      setStep('balances');
      toast.info('This account is ready for a new TapTrack ledger.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your TapTrack account could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (choice: 'cloud' | 'merge') => {
    setBusy(true);
    setError('');
    try {
      if (choice === 'cloud') await adoptCloudLedger();
      else await mergeLocalLedgerIntoCloud();
      markOnboardingComplete();
      toast.success(choice === 'cloud' ? 'Cloud ledger loaded.' : 'Ledgers merged.');
      router.replace('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TapTrack could not finish linking this device.');
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async () => {
    setBusy(true);
    setError('');
    try {
      await completeInitialSetup({
        balances: {
          TRY: {
            card: parseAmount(balances.TRY.card),
            cash: parseAmount(balances.TRY.cash),
          },
          USD: selectedCurrencies.includes('USD')
            ? { card: parseAmount(balances.USD.card), cash: parseAmount(balances.USD.cash) }
            : { card: 0, cash: 0 },
          EUR: selectedCurrencies.includes('EUR')
            ? { card: parseAmount(balances.EUR.card), cash: parseAmount(balances.EUR.cash) }
            : { card: 0, cash: 0 },
        },
        monthlyBudget: parseAmount(monthlyBudget),
        defaultMethod,
      });

      if (accountEmail) {
        try {
          const plan = await inspectCloudAdoption();
          if (plan.state === 'remote-empty') await linkEmptyCloudLedger();
        } catch {
          // Local setup is complete even if a cloud ledger changed during setup.
          // Settings will present the explicit reconciliation choice rather than
          // silently merging or replacing finance data here.
        }
      }

      markOnboardingComplete();
      toast.success('TapTrack is ready.');
      router.replace('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TapTrack could not finish setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-black text-white shadow-sm">
              T
            </div>
            <span className="text-base font-bold tracking-tight text-primary">TapTrack</span>
          </div>
          {stepNumber > 0 ? (
            <div className="flex items-center gap-1.5" aria-label={`Setup step ${stepNumber} of 3`}>
              {[1, 2, 3].map((number) => (
                <span
                  key={number}
                  className={`h-1.5 rounded-full transition-all ${
                    number === stepNumber ? 'w-7 bg-accent' : number < stepNumber ? 'w-4 bg-accent/50' : 'w-4 bg-surface-raised'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 items-center py-8 sm:py-12">
          <div className="w-full">
            {step === 'welcome' ? (
              <WelcomeStep
                accountEmail={accountEmail}
                accountChecked={accountChecked}
                busy={busy}
                onStart={() => setStep('balances')}
                onExisting={() => void useExistingAccount()}
              />
            ) : step === 'balances' ? (
              <BalancesStep
                selectedCurrencies={selectedCurrencies}
                balances={balances}
                onToggleCurrency={toggleCurrency}
                onBalanceChange={updateBalance}
                onBack={() => setStep('welcome')}
                onContinue={() => setStep('defaults')}
              />
            ) : step === 'defaults' ? (
              <DefaultsStep
                defaultMethod={defaultMethod}
                monthlyBudget={monthlyBudget}
                onMethodChange={setDefaultMethod}
                onBudgetChange={setMonthlyBudget}
                onBack={() => setStep('balances')}
                onContinue={() => setStep('ready')}
              />
            ) : step === 'ready' ? (
              <ReadyStep
                currencies={selectedSummary}
                defaultMethod={defaultMethod}
                budget={monthlyBudget}
                busy={busy}
                onBack={() => setStep('defaults')}
                onFinish={() => void finishSetup()}
              />
            ) : (
              <ConflictStep
                busy={busy}
                onUseCloud={() => void resolveConflict('cloud')}
                onMerge={() => void resolveConflict('merge')}
              />
            )}

            {error ? (
              <p
                role="alert"
                className="mx-auto mt-5 max-w-xl rounded-xl border border-danger bg-danger-muted px-4 py-3 text-sm font-medium text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({
  accountEmail,
  accountChecked,
  busy,
  onStart,
  onExisting,
}: {
  accountEmail: string | null;
  accountChecked: boolean;
  busy: boolean;
  onStart: () => void;
  onExisting: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto mb-7 grid h-24 w-24 place-items-center rounded-[2rem] bg-accent-muted ring-1 ring-accent/20">
        <svg className="h-12 w-12 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M4 18V9m5 9V5m5 13v-7m5 7V3" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-accent">Welcome to TapTrack</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
        Track money without slowing down.
      </h1>
      <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-3 text-xs font-semibold text-secondary sm:text-sm">
        <MiniFeature label="Log in seconds" />
        <MiniFeature label="Works offline" />
        <MiniFeature label="Sync when you want" />
      </div>
      <div className="mx-auto mt-9 grid max-w-sm gap-2.5">
        <Button type="button" fullWidth size="lg" onClick={onStart} disabled={busy}>
          Get started
        </Button>
        <Button type="button" fullWidth size="lg" variant="ghost" onClick={onExisting} loading={busy} disabled={!accountChecked || busy}>
          {accountEmail ? 'Continue with my account' : 'I already use TapTrack'}
        </Button>
      </div>
    </div>
  );
}

function BalancesStep({
  selectedCurrencies,
  balances,
  onToggleCurrency,
  onBalanceChange,
  onBack,
  onContinue,
}: {
  selectedCurrencies: Currency[];
  balances: Balances;
  onToggleCurrency: (currency: Currency) => void;
  onBalanceChange: (currency: Currency, method: Method, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-accent">Your money</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">What do you use?</h1>
      <div className="mt-6 flex flex-wrap gap-2">
        {CURRENCIES.map((currency) => {
          const selected = selectedCurrencies.includes(currency);
          return (
            <button
              key={currency}
              type="button"
              onClick={() => onToggleCurrency(currency)}
              aria-pressed={selected}
              className={`min-h-11 rounded-full border px-5 text-sm font-semibold transition-colors ${
                selected ? 'border-accent bg-accent text-white' : 'border-subtle bg-surface text-secondary hover:border-accent/40'
              } ${currency === 'TRY' ? 'cursor-default' : ''}`}
            >
              {currency} {selected ? '✓' : ''}
            </button>
          );
        })}
      </div>

      <div className="mt-7 space-y-4">
        {selectedCurrencies.map((currency) => (
          <Card key={currency} padding="sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-primary">{currency}</h2>
              <span className="text-xs font-medium text-muted">Right now</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="Card"
                inputMode="decimal"
                value={balances[currency].card}
                onChange={(event) => onBalanceChange(currency, 'card', event.target.value)}
                placeholder="0"
                autoComplete="off"
              />
              <Field
                label="Cash"
                inputMode="decimal"
                value={balances[currency].cash}
                onChange={(event) => onBalanceChange(currency, 'cash', event.target.value)}
                placeholder="0"
                autoComplete="off"
              />
            </div>
          </Card>
        ))}
      </div>

      <StepActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function DefaultsStep({
  defaultMethod,
  monthlyBudget,
  onMethodChange,
  onBudgetChange,
  onBack,
  onContinue,
}: {
  defaultMethod: Method;
  monthlyBudget: string;
  onMethodChange: (method: Method) => void;
  onBudgetChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-accent">Your defaults</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Make daily logging faster.</h1>

      <Card className="mt-7" padding="sm">
        <p className="text-sm font-medium text-secondary">Usually pay with</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['card', 'cash'] as Method[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => onMethodChange(method)}
              aria-pressed={defaultMethod === method}
              className={`min-h-12 rounded-xl border px-4 text-sm font-semibold capitalize transition-colors ${
                defaultMethod === method
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-subtle bg-surface text-secondary'
              }`}
            >
              {method}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4" padding="sm">
        <Field
          label="Monthly spending target"
          inputMode="decimal"
          value={monthlyBudget}
          onChange={(event) => onBudgetChange(event.target.value)}
          placeholder="Optional"
          autoComplete="off"
        />
        <p className="mt-2 text-xs font-medium text-muted">TRY · You can change this anytime.</p>
      </Card>

      <StepActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function ReadyStep({
  currencies,
  defaultMethod,
  budget,
  busy,
  onBack,
  onFinish,
}: {
  currencies: string;
  defaultMethod: Method;
  budget: string;
  busy: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-success-muted text-2xl text-success">✓</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-primary">You're ready.</h1>
      <p className="mt-3 text-sm text-muted">Your first transaction can take less time than this screen did.</p>

      <div className="mx-auto mt-7 max-w-sm rounded-2xl border border-subtle bg-surface p-4 text-left shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted">Try typing</p>
            <p className="mt-1 text-lg font-semibold text-primary">250 coffee</p>
          </div>
          <span className="rounded-full bg-accent-muted px-3 py-1 text-xs font-semibold text-accent">Food</span>
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-sm flex-wrap justify-center gap-2 text-xs font-medium text-muted">
        <span>{currencies}</span><span>·</span><span className="capitalize">{defaultMethod}</span>
        {budget.trim() ? <><span>·</span><span>{budget} TRY target</span></> : null}
      </div>

      <div className="mx-auto mt-8 grid max-w-sm gap-2.5">
        <Button type="button" fullWidth size="lg" onClick={onFinish} loading={busy} disabled={busy}>
          Open TapTrack
        </Button>
        <Button type="button" fullWidth variant="ghost" onClick={onBack} disabled={busy}>Back</Button>
      </div>
    </div>
  );
}

function ConflictStep({
  busy,
  onUseCloud,
  onMerge,
}: {
  busy: boolean;
  onUseCloud: () => void;
  onMerge: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-accent">Choose your ledger</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">This device and your account both have data.</h1>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Card padding="sm">
          <h2 className="text-base font-semibold text-primary">Use cloud data</h2>
          <p className="mt-2 text-sm text-muted">Replace this device's local ledger with the account copy.</p>
          <Button type="button" variant="secondary" fullWidth className="mt-5" onClick={onUseCloud} disabled={busy}>Use cloud</Button>
        </Card>
        <Card padding="sm">
          <h2 className="text-base font-semibold text-primary">Merge this device</h2>
          <p className="mt-2 text-sm text-muted">Keep both ledgers and reconcile them into the account.</p>
          <Button type="button" fullWidth className="mt-5" onClick={onMerge} loading={busy} disabled={busy}>Merge</Button>
        </Card>
      </div>
    </div>
  );
}

function MiniFeature({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-subtle bg-surface px-2 py-3 shadow-sm">
      <span className="mx-auto mb-2 block h-1.5 w-1.5 rounded-full bg-accent" />
      {label}
    </div>
  );
}

function StepActions({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
      <Button type="button" onClick={onContinue}>Continue</Button>
    </div>
  );
}

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
