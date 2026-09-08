export const ONBOARDING_VERSION = 1;

const ONBOARDING_KEY = 'taptrack:onboarding-version';
const TIP_PREFIX = 'taptrack:tip:';

export type FeatureTipKey = 'quick-add' | 'smart-categories' | 'quick-capture' | 'command-entry';

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_KEY, String(ONBOARDING_VERSION));
}

export function hasCompletedCurrentOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  return Number(window.localStorage.getItem(ONBOARDING_KEY) ?? 0) >= ONBOARDING_VERSION;
}

export function shouldShowFeatureTip(key: FeatureTipKey): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(`${TIP_PREFIX}${key}`) !== 'dismissed';
}

export function dismissFeatureTip(key: FeatureTipKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${TIP_PREFIX}${key}`, 'dismissed');
}
