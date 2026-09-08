'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  dismissFeatureTip,
  shouldShowFeatureTip,
  type FeatureTipKey,
} from '@/onboarding/onboardingState';

export function FeatureCoachmark({
  tipKey,
  eyebrow,
  title,
  description,
}: {
  tipKey: FeatureTipKey;
  eyebrow?: string;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (shouldShowFeatureTip(tipKey)) setOpen(true);
    });
  }, [tipKey]);

  if (!open) return null;

  const dismiss = () => {
    dismissFeatureTip(tipKey);
    setOpen(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-[60] mx-auto max-w-md md:bottom-6 md:right-6 md:left-auto md:mx-0 md:w-[24rem]">
      <div
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="rounded-2xl border border-subtle bg-surface p-4 shadow-[var(--shadow-overlay)] ring-1 ring-accent/10"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-muted text-accent" aria-hidden="true">
            ✦
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="text-xs font-semibold text-accent">{eyebrow}</p> : null}
            <h2 className="mt-0.5 text-base font-semibold text-primary">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
            <div className="mt-3 flex justify-end">
              <Button type="button" size="sm" onClick={dismiss}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
