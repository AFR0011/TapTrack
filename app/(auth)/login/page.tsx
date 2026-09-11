'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { cn, focusVisibleRing } from '@/lib/cn';
import { createSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'signin' | 'register' | 'forgot' | 'reset';

const MIN_PASSWORD_LENGTH = 8;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const providerConfigured = isSupabaseConfigured();

  useEffect(() => {
    const authState = new URLSearchParams(window.location.search).get('auth');
    if (authState === 'confirmation-failed') {
      queueMicrotask(() => {
        setError('That email link could not be confirmed. Request a new link or sign in again.');
      });
    } else if (authState === 'reset') {
      queueMicrotask(() => {
        setMode('reset');
        setError('');
      });
    }
  }, []);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setPassword('');
    setShowPassword(false);
    setRecoverySent(false);
    setPasswordUpdated(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Accounts are unavailable right now. You can continue without an account.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/login?auth=reset')}`;
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        if (recoveryError) {
          setError(formatAuthError(recoveryError.message, 'recovery'));
        } else {
          setRecoverySent(true);
        }
        return;
      }

      if (mode === 'reset') {
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`);
          return;
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          setError(formatAuthError(updateError.message, 'reset'));
        } else {
          setPasswordUpdated(true);
          setPassword('');
        }
        return;
      }

      if (mode === 'register') {
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpError) {
          setError(formatAuthError(signUpError.message, 'register'));
        } else if (data.session) {
          router.replace('/app');
          router.refresh();
        } else {
          setRegistered(true);
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(formatAuthError(signInError.message, 'signin'));
      } else {
        router.replace('/app');
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === 'register'
      ? 'Create your account.'
      : mode === 'forgot'
        ? 'Reset your password.'
        : mode === 'reset'
          ? 'Choose a new password.'
          : 'Welcome back.';
  const description =
    mode === 'register'
      ? 'Sync, Smart Categories, and Quick Capture.'
      : mode === 'forgot'
        ? 'We’ll send a secure reset link to your email.'
        : mode === 'reset'
          ? 'Set a new password for your TapTrack account.'
          : 'Pick up where you left off.';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-action-primary text-lg font-black text-white shadow-sm">
            T
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary">{heading}</h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>

        <Card className="overflow-hidden">
          {!providerConfigured ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-subtle bg-surface-muted p-3 text-sm text-muted">
                Accounts are unavailable right now. Your data on this device still works normally.
              </p>
              <Button type="button" fullWidth onClick={() => router.replace('/app')}>
                Continue without an account
              </Button>
            </div>
          ) : registered ? (
            <SuccessPanel
              title="Check your inbox."
              description={`Confirm ${email}, then come back to sign in.`}
              actionLabel="Back to sign in"
              onAction={() => {
                setRegistered(false);
                changeMode('signin');
              }}
            />
          ) : recoverySent ? (
            <SuccessPanel
              title="Check your inbox."
              description={`If ${email} belongs to an account, a password reset link is on its way.`}
              actionLabel="Back to sign in"
              onAction={() => changeMode('signin')}
            />
          ) : passwordUpdated ? (
            <SuccessPanel
              title="Password updated."
              description="Your new password is ready. You can continue to TapTrack now."
              actionLabel="Continue to TapTrack"
              onAction={() => {
                router.replace('/app');
                router.refresh();
              }}
            />
          ) : (
            <>
              {mode === 'signin' || mode === 'register' ? (
                <div className="mb-5 flex rounded-xl border border-subtle bg-surface-muted p-1">
                  {(['signin', 'register'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={mode === item}
                      onClick={() => changeMode(item)}
                      className={cn(
                        'min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors',
                        focusVisibleRing,
                        mode === item
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-muted hover:text-secondary'
                      )}
                    >
                      {item === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                  ))}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
                {mode !== 'reset' ? (
                  <Field
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError('');
                    }}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    disabled={loading}
                  />
                ) : null}

                {mode !== 'forgot' ? (
                  <div>
                    <div className="relative">
                      <Field
                        id="password"
                        label={mode === 'reset' ? 'New password' : 'Password'}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError('');
                        }}
                        placeholder={mode === 'register' || mode === 'reset' ? 'At least 8 characters' : '••••••••'}
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        disabled={loading}
                        className="pr-20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className={cn(
                          'absolute bottom-0 right-1 flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-secondary hover:text-primary',
                          focusVisibleRing
                        )}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {mode === 'signin' ? (
                      <button
                        type="button"
                        onClick={() => changeMode('forgot')}
                        className={cn(
                          'mt-2 min-h-11 rounded-lg px-1 text-sm font-semibold text-accent hover:underline',
                          focusVisibleRing
                        )}
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger bg-danger-muted px-3 py-2 text-sm font-medium text-danger"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={loading}
                  disabled={
                    loading ||
                    (mode !== 'reset' && !email.trim()) ||
                    ((mode === 'register' || mode === 'reset') && password.length < MIN_PASSWORD_LENGTH) ||
                    (mode === 'signin' && !password)
                  }
                >
                  {mode === 'register'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : mode === 'reset'
                        ? 'Save new password'
                        : 'Sign in'}
                </Button>
              </form>

              {mode === 'forgot' || mode === 'reset' ? (
                <Button
                  type="button"
                  fullWidth
                  variant="ghost"
                  className="mt-3"
                  onClick={() => changeMode('signin')}
                >
                  Back to sign in
                </Button>
              ) : (
                <>
                  <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted">
                    <span className="h-px flex-1 bg-subtle" />
                    or
                    <span className="h-px flex-1 bg-subtle" />
                  </div>
                  <Button
                    type="button"
                    fullWidth
                    variant="ghost"
                    onClick={() => router.replace('/app')}
                  >
                    Continue without an account
                  </Button>
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function SuccessPanel({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-muted text-xl text-success">
        ✓
      </div>
      <h2 className="mt-4 text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <Button type="button" fullWidth className="mt-6" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

function formatAuthError(
  message: string,
  context: 'signin' | 'register' | 'recovery' | 'reset'
): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return 'That email and password combination did not work.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email before signing in.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account already exists for this email. Sign in instead.';
  }
  if (normalized.includes('password') && normalized.includes('least')) {
    return 'Use a stronger password with at least 8 characters.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many attempts were made recently. Try again a little later.';
  }
  if (
    context === 'reset' &&
    (normalized.includes('expired') || normalized.includes('invalid'))
  ) {
    return 'This reset link is no longer valid. Request a new password reset link.';
  }
  if (context === 'recovery') {
    return 'The reset email could not be sent right now. Try again later.';
  }
  if (context === 'register') {
    return 'The account could not be created right now. Check the details and try again.';
  }
  if (context === 'reset') {
    return 'The password could not be updated. Request a new reset link and try again.';
  }
  return 'Sign in could not be completed. Check your details and try again.';
}
