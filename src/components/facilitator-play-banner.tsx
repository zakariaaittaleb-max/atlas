'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type PlayResult = { ok: true } | { ok: false; error: string };

/**
 * Bandeau permanent tant que le facilitateur joue dans un groupe.
 *
 * Il ne disparaît jamais tout seul : l'animateur qui a oublié qu'il est entré
 * dans une équipe verrouillerait un tour depuis l'écran d'un participant sans
 * comprendre pourquoi les commandes ont disparu.
 *
 * Les actions arrivent en props, comme pour la bannière d'impersonation : les
 * importer ici ferait entrer `lib/dal` dans le graphe d'un composant client.
 */
export function FacilitatorPlayBanner({
  sessionId,
  teamName,
  visible,
  leaveAction,
  setVisibilityAction,
}: {
  sessionId: string;
  teamName: string;
  visible: boolean;
  leaveAction: () => Promise<PlayResult>;
  setVisibilityAction: (input: { visible: boolean }) => Promise<PlayResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-(--accent) px-4 py-2 text-sm font-medium text-white">
      <span>
        Vous jouez dans <strong>{teamName}</strong> — vos saisies comptent pour cette équipe.
      </span>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await setVisibilityAction({ visible: !visible });
          })
        }
        disabled={pending}
        className="rounded-md bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-50"
      >
        {visible ? 'Passer en discret' : 'Me rendre visible'}
      </button>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            const result = await leaveAction();
            if (result.ok) router.push(`/facilitateur/${sessionId}`);
          })
        }
        disabled={pending}
        className="rounded-md bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-50"
      >
        {pending ? 'Retour…' : "Revenir à l'animation"}
      </button>
    </div>
  );
}
