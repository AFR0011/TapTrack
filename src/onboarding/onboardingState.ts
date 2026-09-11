export const ONBOARDING_VERSION = 1;

const ONBOARDING_KEY = 'ravel:onboarding-version';
const LEGACY_ONBOARDING_KEY = 'taptrack:onboarding-version';
const TIP_PREFIX = 'ravel:tip:';
const LEGACY_TIP_PREFIX = 'taptrack:tip:';

export type FeatureTipKey = 'quick-add' | 'smart-categories' | 'quick-capture' | 'command-entry';

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_KEY, String(ONBOARDING_VERSION));
}

export function hasCompletedCurrentOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  const current = Number(window.localStorage.getItem(ONBOARDING_KEY) ?? 0);
  if (current >= ONBOARDING_VERSION) return true;
  const legacy = Number(window.localStorage.getItem(LEGACY_ONBOARDING_KEY) ?? 0);
  if (legacy >= ONBOARDING_VERSION) {
    window.localStorage.setItem(ONBOARDING_KEY, String(legacy));
    return true;
  }
  return false;
}

export function shouldShowFeatureTip(key: FeatureTipKey): boolean {
  if (typeof window === 'undefined') return false;
  const currentKey = `${TIP_PREFIX}${key}`;
  if (window.localStorage.getItem(currentKey) === 'dismissed') return false;
  const legacyKey = `${LEGACY_TIP_PREFIX}${key}`;
  if (window.localStorage.getItem(legacyKey) === 'dismissed') {
    window.localStorage.setItem(currentKey, 'dismissed');
    return false;
  }
  return true;
}

export function dismissFeatureTip(key: FeatureTipKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${TIP_PREFIX}${key}`, 'dismissed');
}
