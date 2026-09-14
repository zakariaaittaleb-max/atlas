'use client';

import { CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/** Même fuseau au rendu serveur et à l'hydratation : l'heure ne peut pas diverger. */
const CLOCK = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca',
});

export function SubmitRound({
  submittedAt, missingCount, decisionsOpen,
}: {
  submittedAt: string | null;
  missingCount: number;
  decisionsOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(action: 'submit' | 'withdraw') {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/rounds/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).catch(() => null);
      if (!res) {
        setError('Le réseau est indisponible. Réessayez dans un instant.');
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Action refusée.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        {submittedAt ? (
          <p className="flex items-center gap-2 text-lg font-semibold text-(--positive)">
            <CircleCheck aria-hidden className="h-5 w-5" />
            Tour soumis à {CLOCK.format(new Date(submittedAt))}
          </p>
        ) : (
          <p className="text-lg font-semibold text-(--heading)">
            {decisionsOpen ? 'Tour pas encore soumis' : 'Tour non soumis'}
          </p>
        )}
        <p className="mt-1 max-w-2xl text-sm text-(--foreground-muted)">
          {!decisionsOpen
            ? 'Le tour est verrouillé : le moteur prend les décisions telles qu’elles sont enregistrées.'
            : submittedAt
              ? 'Le facilitateur voit que vous avez fini. Vos décisions restent modifiables jusqu’au verrouillage.'
              : missingCount > 0
                ? 'Complétez les décisions listées ci-dessous, puis soumettez.'
                : 'Relisez vos décisions, puis soumettez : le facilitateur saura que votre équipe a fini de débattre.'}
        </p>
        {error ? <p role="alert" className="mt-2 text-sm font-medium text-(--negative)">{error}</p> : null}
      </div>

      {decisionsOpen ? (
        submittedAt ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => send('withdraw')}
            className="min-h-11 rounded-lg border border-(--border) bg-(--surface) px-5 text-sm font-medium enabled:hover:border-(--accent) disabled:opacity-40"
          >
            {pending ? 'Retrait…' : 'Retirer la soumission'}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || missingCount > 0}
            onClick={() => send('submit')}
            className="min-h-11 rounded-lg bg-(--accent) px-6 font-medium text-(--on-accent) transition-colors enabled:hover:bg-(--accent-hover) disabled:opacity-40"
          >
            {missingCount > 0
              ? `${missingCount} décision${missingCount > 1 ? 's' : ''} manquante${missingCount > 1 ? 's' : ''}`
              : pending ? 'Soumission…' : 'Soumettre le tour'}
          </button>
        )
      ) : null}
    </div>
  );
}
