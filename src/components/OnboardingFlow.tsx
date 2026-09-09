'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { SelectField } from '@/components/ui/SelectField';
import { fetchCurrencyCatalog, type CurrencyOption } from '@/currencies/currencyCatalog';
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

type Step = 'welcome' | 'balances' | 'defaults' | 'ready' | 'conflict';
type BalancePair = Record<Method, string>;
type Balances = Record<string, BalancePair>;

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [catalog, setCatalog] = useState<CurrencyOption[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<Currency>('TRY');
  const [selectedCurrencies, setSelectedCurrencies] = useState<Currency[]>(['TRY']);
  const [currencyToAdd, setCurrencyToAdd] = useState('');
  const [balances, setBalances] = useState<Balances>({ TRY: { card: '', cash: '' } });
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
    const controller = new AbortController();
    void fetchCurrencyCatalog(controller.signal).then((items) => {
      if (active) setCatalog(items);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const stepNumber = step === 'balances' ? 1 : step === 'defaults' ? 2 : step === 'ready' ? 3 : 0;
  const selectedSummary = useMemo(() => selectedCurrencies.join(' · '), [selectedCurrencies]);
  const availableToAdd = useMemo(
    () => catalog.filter((item) => !selectedCurrencies.includes(item.code)),
    [catalog, selectedCurrencies]
  );

  const ensureBalancePair = (currency: Currency) => {
    setBalances((current) => current[currency]
      ? current
      : { ...current, [currency]: { card: '', cash: '' } });
  };

  const changeDefaultCurrency = (currency: Currency) => {
    setDefaultCurrency(currency);
    ensureBalancePair(currency);
    setSelectedCurrencies((current) => current.includes(currency) ? current : [currency, ...current]);
  };

  const addCurrency = () => {
    if (!currencyToAdd) return;
    ensureBalancePair(currencyToAdd);
    setSelectedCurrencies((current) => current.includes(currencyToAdd) ? current : [...current, currencyToAdd]);
    setCurrencyToAdd('');
  };

  const removeCurrency = (currency: Currency) => {
    if (currency === defaultCurrency) return;
    setSelectedCurrencies((current) => current.filter((item) => item !== currency));
  };

  const updateBalance = (currency: Currency, method: Method, value: string) => {
    setBalances((current) => ({
      ...current,
      [currency]: { ...(current[currency] ?? { card: '', cash: '' }), [method]: value },
    }));
  };

  const handleExistingAccount = async () => {
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
      const selectedBalances = Object.fromEntries(
        selectedCurrencies.map((currency) => [
          currency,
          {
            card: parseAmount(balances[currency]?.card ?? ''),
            cash: parseAmount(balances[currency]?.cash ?? ''),
          },
        ])
      );
      await completeInitialSetup({
        balances: selectedBalances,
        monthlyBudget: parseAmount(monthlyBudget),
        defaultMethod,
        defaultCurrency,
      });

      if (accountEmail) {
        try {
          const plan = await inspectCloudAdoption();
          if (plan.state === 'remote-empty') await linkEmptyCloudLedger();
        } catch {
          // Local setup remains authoritative; Settings can reconcile an account race explicitly.
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-black text-white shadow-sm">T</div>
            <span className="text-base font-bold tracking-tight text-primary">TapTrack</span>
          </div>
          {stepNumber > 0 ? (
            <div className="flex items-center gap-1.5" aria-label={`Setup step ${stepNumber} of 3`}>
              {[1, 2, 3].map((number) => (
                <span key={number} className={`h-1.5 rounded-full transition-all ${
                  number === stepNumber ? 'w-7 bg-accent' : number < stepNumber ? 'w-4 bg-accent/50' : 'w-4 bg-surface-raised'
                }`} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 items-center py-8 sm:py-12">
          <div className="w-full">
            {step === 'welcome' ? (
              <WelcomeStep accountEmail={accountEmail} accountChecked={accountChecked} busy={busy} onStart={() => setStep('balances')} onExisting={() => void handleExistingAccount()} />
            ) : step === 'balances' ? (
              <BalancesStep
                catalog={catalog}
                defaultCurrency={defaultCurrency}
                selectedCurrencies={selectedCurrencies}
                availableToAdd={availableToAdd}
                currencyToAdd={currencyToAdd}
                balances={balances}
                onDefaultChange={changeDefaultCurrency}
                onCurrencyToAddChange={setCurrencyToAdd}
                onAddCurrency={addCurrency}
                onRemoveCurrency={removeCurrency}
                onBalanceChange={updateBalance}
                onBack={() => setStep('welcome')}
                onContinue={() => setStep('defaults')}
              />
            ) : step === 'defaults' ? (
              <DefaultsStep defaultCurrency={defaultCurrency} defaultMethod={defaultMethod} monthlyBudget={monthlyBudget} onMethodChange={setDefaultMethod} onBudgetChange={setMonthlyBudget} onBack={() => setStep('balances')} onContinue={() => setStep('ready')} />
            ) : step === 'ready' ? (
              <ReadyStep currencies={selectedSummary} defaultCurrency={defaultCurrency} defaultMethod={defaultMethod} budget={monthlyBudget} busy={busy} onBack={() => setStep('defaults')} onFinish={() => void finishSetup()} />
            ) : (
              <ConflictStep busy={busy} onUseCloud={() => void resolveConflict('cloud')} onMerge={() => void resolveConflict('merge')} />
            )}

            {error ? <p role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-danger bg-danger-muted px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ accountEmail, accountChecked, busy, onStart, onExisting }: { accountEmail: string | null; accountChecked: boolean; busy: boolean; onStart: () => void; onExisting: () => void }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto mb-7 grid h-24 w-24 place-items-center rounded-[2rem] bg-accent-muted ring-1 ring-accent/20">
        <svg className="h-12 w-12 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 18V9m5 9V5m5 13v-7m5 7V3" strokeLinecap="round" /></svg>
      </div>
      <p className="text-sm font-semibold text-accent">Welcome to TapTrack</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-primary sm:text-5xl">Track money without slowing down.</h1>
      <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-3 text-xs font-semibold text-secondary sm:text-sm">
        {['Log in seconds', 'Works offline', 'Sync when you want'].map((label) => <div key={label} className="rounded-xl bg-surface-muted px-2 py-3">{label}</div>)}
      </div>
      <div className="mx-auto mt-9 grid max-w-sm gap-2.5">
        <Button type="button" fullWidth size="lg" onClick={onStart} disabled={busy}>Get started</Button>
        <Button type="button" fullWidth size="lg" variant="ghost" onClick={onExisting} loading={busy} disabled={!accountChecked || busy}>{accountEmail ? 'Continue with my account' : 'I already use TapTrack'}</Button>
      </div>
    </div>
  );
}

function BalancesStep({ catalog, defaultCurrency, selectedCurrencies, availableToAdd, currencyToAdd, balances, onDefaultChange, onCurrencyToAddChange, onAddCurrency, onRemoveCurrency, onBalanceChange, onBack, onContinue }: {
  catalog: CurrencyOption[]; defaultCurrency: Currency; selectedCurrencies: Currency[]; availableToAdd: CurrencyOption[]; currencyToAdd: string; balances: Balances;
  onDefaultChange: (currency: Currency) => void; onCurrencyToAddChange: (currency: string) => void; onAddCurrency: () => void; onRemoveCurrency: (currency: Currency) => void;
  onBalanceChange: (currency: Currency, method: Method, value: string) => void; onBack: () => void; onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-accent">Your money</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Choose the currencies you use.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Your main currency is used for new entries and at-a-glance summaries. You can add more anytime.</p>

      <Card className="mt-7" padding="sm">
        <SelectField
          label="Main currency"
          value={defaultCurrency}
          onChange={(event) => onDefaultChange(event.target.value)}
          options={(catalog.length ? catalog : [{ code: 'TRY', name: 'Turkish Lira' }]).map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))}
        />
        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
          <SelectField
            label="Add another currency"
            value={currencyToAdd}
            onChange={(event) => onCurrencyToAddChange(event.target.value)}
            options={[{ value: '', label: 'Choose currency' }, ...availableToAdd.map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))]}
          />
          <Button type="button" variant="secondary" onClick={onAddCurrency} disabled={!currencyToAdd}>Add</Button>
        </div>
      </Card>

      <div className="mt-5 space-y-4">
        {selectedCurrencies.map((currency) => (
          <Card key={currency} padding="sm">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold text-primary">{currency}</h2><p className="text-xs font-medium text-muted">Balance right now</p></div>
              {currency !== defaultCurrency ? <button type="button" onClick={() => onRemoveCurrency(currency)} className="min-h-11 px-2 text-xs font-semibold text-muted hover:text-danger">Remove</button> : <span className="rounded-full bg-accent-muted px-2 py-1 text-xs font-semibold text-accent">Main</span>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Card" inputMode="decimal" value={balances[currency]?.card ?? ''} onChange={(event) => onBalanceChange(currency, 'card', event.target.value)} placeholder="0" autoComplete="off" />
              <Field label="Cash" inputMode="decimal" value={balances[currency]?.cash ?? ''} onChange={(event) => onBalanceChange(currency, 'cash', event.target.value)} placeholder="0" autoComplete="off" />
            </div>
          </Card>
        ))}
      </div>
      <StepActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function DefaultsStep({ defaultCurrency, defaultMethod, monthlyBudget, onMethodChange, onBudgetChange, onBack, onContinue }: { defaultCurrency: Currency; defaultMethod: Method; monthlyBudget: string; onMethodChange: (method: Method) => void; onBudgetChange: (value: string) => void; onBack: () => void; onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-semibold text-accent">Your defaults</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Make daily logging faster.</h1>
      <Card className="mt-7" padding="sm">
        <p className="text-sm font-medium text-secondary">Usually pay with</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['card', 'cash'] as Method[]).map((method) => <button key={method} type="button" onClick={() => onMethodChange(method)} aria-pressed={defaultMethod === method} className={`min-h-12 rounded-xl border px-4 text-sm font-semibold capitalize ${defaultMethod === method ? 'border-accent bg-accent-muted text-accent' : 'border-subtle bg-surface text-secondary'}`}>{method}</button>)}
        </div>
      </Card>
      <Card className="mt-4" padding="sm">
        <Field label="Monthly spending target" inputMode="decimal" value={monthlyBudget} onChange={(event) => onBudgetChange(event.target.value)} placeholder="Optional" autoComplete="off" />
        <p className="mt-2 text-xs font-medium text-muted">{defaultCurrency} · You can change this anytime.</p>
      </Card>
      <StepActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function ReadyStep({ currencies, defaultCurrency, defaultMethod, budget, busy, onBack, onFinish }: { currencies: string; defaultCurrency: Currency; defaultMethod: Method; budget: string; busy: boolean; onBack: () => void; onFinish: () => void }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="text-sm font-semibold text-accent">Ready</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-primary">You’re ready.</h1>
      <div className="mx-auto mt-7 max-w-sm rounded-2xl border border-subtle bg-surface p-5 text-left shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">Coffee</p><p className="mt-1 text-xs font-medium text-muted">Food · {defaultMethod}</p></div><p className="text-lg font-bold text-primary">250 {defaultCurrency}</p></div>
      </div>
      <div className="mt-5 text-sm text-muted"><p>Main: <strong className="text-secondary">{defaultCurrency}</strong></p><p className="mt-1">Currencies: {currencies}</p>{budget ? <p className="mt-1">Monthly target: {budget} {defaultCurrency}</p> : null}</div>
      <div className="mx-auto mt-8 grid max-w-sm gap-2.5"><Button type="button" size="lg" fullWidth onClick={onFinish} loading={busy} disabled={busy}>Open TapTrack</Button><Button type="button" size="lg" fullWidth variant="ghost" onClick={onBack} disabled={busy}>Back</Button></div>
    </div>
  );
}

function ConflictStep({ busy, onUseCloud, onMerge }: { busy: boolean; onUseCloud: () => void; onMerge: () => void }) {
  return (
    <div className="mx-auto max-w-xl"><p className="text-sm font-semibold text-accent">Choose your ledger</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">This device and your account both have data.</h1><div className="mt-7 grid gap-3 sm:grid-cols-2"><Card padding="sm"><h2 className="font-semibold text-primary">Use cloud data</h2><p className="mt-2 text-sm text-muted">Replace this device’s local ledger with the account ledger.</p><Button type="button" fullWidth className="mt-5" onClick={onUseCloud} loading={busy} disabled={busy}>Use cloud data</Button></Card><Card padding="sm"><h2 className="font-semibold text-primary">Merge this device</h2><p className="mt-2 text-sm text-muted">Keep both ledgers and merge records into the account.</p><Button type="button" fullWidth variant="secondary" className="mt-5" onClick={onMerge} disabled={busy}>Merge</Button></Card></div></div>
  );
}

function StepActions({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return <div className="mt-7 flex items-center justify-between gap-3"><Button type="button" variant="ghost" onClick={onBack}>Back</Button><Button type="button" onClick={onContinue}>Continue</Button></div>;
}

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
