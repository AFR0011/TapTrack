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
      setError('Email confirmation could not be completed. Please try the confirmation link again or sign in.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Cloud accounts are not configured. Continue with the local ledger.');
      setLoading(false);
      return;
    }

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-primary">TapTrack</h1>
          <p className="mt-1 text-sm text-muted">Personal finance tracker</p>
        </div>

        <Button type="button" fullWidth onClick={() => router.replace('/app')}>
          Continue with local ledger
        </Button>
        <p className="mt-2 text-xs text-muted">
          Local data belongs to this browser profile. An account is optional and is used only for
          explicitly linked cloud sync.
        </p>

        {!providerConfigured ? (
          <p className="mt-5 rounded-lg border border-subtle bg-surface-muted p-3 text-sm text-muted">
            Cloud accounts are not configured on this installation.
          </p>
        ) : registered ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success bg-success-muted p-4 text-sm font-medium text-success">
              Account created. Check your email to confirm the address, then sign in.
            </div>
            <Button
              type="button"
              fullWidth
              onClick={() => {
                setRegistered(false);
                setMode('signin');
              }}
            >
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 mb-5 flex rounded-lg border border-subtle bg-surface-muted p-1">
              {(['signin', 'register'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError('');
                  }}
                  className={cn(
                    'min-h-11 flex-1 rounded-md text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    mode === m ? 'bg-accent text-white' : 'text-muted hover:text-secondary'
                  )}
                >
                  {m === 'signin' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field
                id="email"
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                disabled={loading}
              />
              {error ? (
                <p role="alert" className="rounded-lg border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
              <Button type="submit" fullWidth loading={loading} disabled={loading || !email || !password}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
