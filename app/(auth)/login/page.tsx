'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'signin' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const providerConfigured = isSupabaseConfigured();

  useEffect(() => {
    const authState = new URLSearchParams(window.location.search).get('auth');
    if (authState === 'confirmation-failed') {
      queueMicrotask(() => {
        setError('Email confirmation failed. Open the confirmation link again or sign in.');
      });
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Accounts are unavailable right now.');
      setLoading(false);
      return;
    }

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else if (data.session) {
        router.replace('/app');
        router.refresh();
      } else {
        setRegistered(true);
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
      } else {
        router.replace('/app');
        router.refresh();
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent text-lg font-black text-white shadow-sm">T</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary">
            {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {mode === 'signin' ? 'Pick up where you left off.' : 'Sync, Smart Categories, and Quick Capture.'}
          </p>
        </div>

        <Card className="overflow-hidden">
          {!providerConfigured ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-subtle bg-surface-muted p-3 text-sm text-muted">Accounts are unavailable on this installation.</p>
              <Button type="button" fullWidth onClick={() => router.replace('/app')}>Continue locally</Button>
            </div>
          ) : registered ? (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-muted text-xl text-success">✓</div>
              <h2 className="mt-4 text-xl font-semibold text-primary">Check your inbox.</h2>
              <p className="mt-2 text-sm text-muted">Confirm {email}, then come back to sign in.</p>
              <Button
                type="button"
                fullWidth
                className="mt-6"
                onClick={() => {
                  setRegistered(false);
                  setMode('signin');
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-5 flex rounded-xl border border-subtle bg-surface-muted p-1">
                {(['signin', 'register'] as Mode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setError('');
                    }}
                    className={cn(
                      'min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      mode === item ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-secondary'
                    )}
                  >
                    {item === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="grid gap-4">
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                />
                <Field
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  disabled={loading}
                />
                {error ? (
                  <p role="alert" className="rounded-xl border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">{error}</p>
                ) : null}
                <Button type="submit" fullWidth size="lg" loading={loading} disabled={loading || !email || !password}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
                <span className="h-px flex-1 bg-subtle" />
                or
                <span className="h-px flex-1 bg-subtle" />
              </div>
              <Button type="button" fullWidth variant="ghost" onClick={() => router.replace('/app')}>
                Continue without an account
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
