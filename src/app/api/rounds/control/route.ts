/**
 * Contrôle du tour — réservé au facilitateur.
 *
 * Trois actions, qui correspondent aux trois seuls gestes qu'il pose en salle :
 *
 *   • `open`     ouvre le tour suivant (T0 → T1, puis T1 → T2…). Le facilitateur
 *                décide quand la salle est prête ; le chronomètre n'est
 *                qu'indicatif et ne déclenche jamais rien.
 *   • `lock`     fige TOUTES les équipes du pool dans une transaction unique,
 *                sans résoudre. Utile pour reprendre la main sans lancer le
 *                calcul.
 *   • `complete` clôt la session, entre le 3e et le 10e tour.
 *
 * Le facilitateur peut ajouter un tour à tout moment jusqu'à `max_rounds` :
 * la partie ne se termine jamais d'elle-même.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/dal';
import { buildScorecards, persistScorecards } from '@/lib/server/scorecard-loader';
import { createAdminClient } from '@/lib/supabase/server';

const ControlRequest = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(['open', 'lock', 'complete']),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const parsed = ControlRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const { sessionId, action } = parsed.data;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, facilitator_id, status, current_round')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.facilitator_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const rpc = {
    open: 'atlas_open_next_round',
    lock: 'atlas_lock_round',
    complete: 'atlas_complete_session',
  }[action];

  const { data, error } = await admin.rpc(rpc, { p_session_id: sessionId });

  if (error) {
    // Les fonctions lèvent des messages explicites (« le tour ne peut être
    // verrouillé que depuis l'état round_active »). On les remonte tels quels :
    // le facilitateur doit comprendre ce qu'il vient de tenter.
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  // Le Balanced Scorecard se calcule À LA CLÔTURE, une seule fois : il ne
  // pilote pas les tours, il les relit. Ses scores sont RELATIFS au pool, ce
  // qui n'a de sens qu'une fois la partie jouée entièrement.
  let scorecards = 0;
  if (action === 'complete') {
    try {
      const cards = await buildScorecards(admin, sessionId);
      await persistScorecards(admin, cards, Number(session.current_round ?? 0));
      scorecards = cards.length;
    } catch (scoreError) {
      // La session est close quoi qu'il arrive : un scorecard manquant se
      // recalcule, une clôture bloquée immobilise la salle.
      return NextResponse.json({
        ok: true, action, result: data,
        warning: `Session close, mais le tableau de bord n'a pas pu être calculé : ${
          scoreError instanceof Error ? scoreError.message : 'erreur inconnue'
        }`,
      });
    }
  }

  const { data: after } = await admin
    .from('game_sessions')
    .select('status, current_round')
    .eq('id', sessionId)
    .maybeSingle();

  return NextResponse.json({ ok: true, action, result: data, session: after, scorecards });
}
