'use client';

/**
 * Le marché de cession, en direct.
 *
 * Une cession ou une acquisition se conclut en cours de tour : quand une autre
 * équipe agit — annonce, offre, domaine qui change de mains, cible rachetée —
 * l'écran se recharge de lui-même, sans que personne ait à rafraîchir la page.
 *
 * L'événement reçu n'est qu'un signal (migration 0051) : les données sont
 * relues par le chemin normal, à travers les mêmes politiques d'accès. Les
 * saisies en cours ne sont pas perdues : `router.refresh()` conserve l'état
 * des composants.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { createClient } from '@/lib/supabase/client';

/** Plusieurs écritures d'une même opération arrivent en rafale : une seule relecture. */
const SETTLE_MS = 400;

export function MarketSync({ sessionId, teamId }: { sessionId: string; teamId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`atlas-market-${sessionId}-${teamId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'atlas', table: 'market_events', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          // Sa propre action a déjà rechargé l'écran qui l'a déclenchée.
          if ((payload.new as { actor_team_id?: string | null })?.actor_team_id === teamId) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), SETTLE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, teamId, router]);

  return null;
}
