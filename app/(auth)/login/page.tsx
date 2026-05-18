'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';

type Mode = 'signin' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createSupabaseBrowserClient();

    if (mode === 'register') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-xl font-bold text-transparent">
            TapTrack
          </h1>
          <p className="mt-1 text-sm text-slate-500">Personal finance tracker</p>
        </div>

        {registered ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Account created! You can now sign in with your email and password.
            </div>
            <button
              onClick={() => { setRegistered(false); setMode('signin'); }}
              className="w-full rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-600"
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            {/* Tab switcher */}
            <div className="mb-5 flex rounded-lg border border-slate-200 p-1">
              {(['signin', 'register'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(''); }}
                  className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-all ${
                    mode === m
                      ? 'bg-slate-950 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-950'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100/50 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100/50 disabled:opacity-60"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : (mode === 'signin' ? 'Sign in' : 'Create account')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
