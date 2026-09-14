'use client';

import { useRouter } from 'next/navigation';

import { ONBOARDING_COOKIE, ONBOARDING_COOKIE_MAX_AGE } from '@/lib/onboarding';

/** Masquer le parcours sur cet appareil, ou le faire revenir. */
export function OnboardingToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();

  function toggle() {
    document.cookie = hidden
      ? `${ONBOARDING_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${ONBOARDING_COOKIE}=masque; path=/; max-age=${ONBOARDING_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  }

  return hidden ? (
    <button type="button" onClick={toggle} className="font-medium text-(--accent-text) underline underline-offset-4">
      Afficher le parcours de prise en main
    </button>
  ) : (
    <button
      type="button"
      onClick={toggle}
      className="min-h-9 rounded-lg px-3 text-sm font-medium text-(--foreground-muted) transition-colors hover:bg-(--surface-muted) hover:text-(--foreground)"
    >
      Masquer le parcours
    </button>
  );
}
