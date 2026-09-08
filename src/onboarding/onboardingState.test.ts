import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_VERSION,
  dismissFeatureTip,
  hasCompletedCurrentOnboarding,
  markOnboardingComplete,
  shouldShowFeatureTip,
} from './onboardingState';

describe('onboardingState', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  it('tracks onboarding completion separately from finance settings', () => {
    expect(hasCompletedCurrentOnboarding()).toBe(false);
    markOnboardingComplete();
    expect(hasCompletedCurrentOnboarding()).toBe(true);
    expect(ONBOARDING_VERSION).toBeGreaterThan(0);
  });

  it('persists feature-tip dismissal per device', () => {
    expect(shouldShowFeatureTip('quick-add')).toBe(true);
    dismissFeatureTip('quick-add');
    expect(shouldShowFeatureTip('quick-add')).toBe(false);
    expect(shouldShowFeatureTip('smart-categories')).toBe(true);
  });
});
