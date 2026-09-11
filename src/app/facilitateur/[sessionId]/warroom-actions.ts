"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';

import { logAdminAction } from '@/lib/admin-audit';
import { getFacilitatorContext } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

export type WarRoomActionResult = { ok: true } | { ok: false; error: string };

/**
 * L'arbitrage du facilitateur sur la réponse d'une équipe à une carte.
 *
 * Le curseur va de −100 % à +200 % : l'événement a été évité, subi comme
 * annoncé, ou il a frappé jusqu'à trois fois plus fort. C'est un JUGEMENT
 * HUMAIN, porté par quelqu'un qui a le plan de l'équipe sous les yeux — la
 * version précédente le remplaçait par une table de correspondance, où
 * « absorber » valait toujours 75 % d'atténuation quoi que l'équipe ait
 * réellement prévu de faire.
 *
 * Écrit par la clé de service, après vérification que l'appelant anime bien
 * CETTE session : `shock_responses` n'est lisible que par l'équipe qui la
 * possède, et un facilitateur n'en est pas membre.
 */
export async function setShockImpactAction(input: {
  sessionId: string;
  shockId: string;
  teamId: string;
  impactPct: number;
}): Promise<WarRoomActionResult> {
  const context = await getFacilitatorContext(input.sessionId);
  if (!context) return { ok: false, error: 'Accès refusé.' };

  const impactPct = Math.min(Math.max(Number(input.impactPct) || 0, -100), 200);
  const admin = createAdminClient();

  // La carte ET l'équipe doivent appartenir à cette session : sans ce contrôle,
  // un identifiant emprunté ferait arbitrer l'atelier d'un collègue.
  const [{ data: shock }, { data: team }] = await Promise.all([
    admin.from('market_shocks').select('id, session_id').eq('id', input.shockId).maybeSingle(),
    admin.from('teams').select('id, session_id').eq('id', input.teamId).maybeSingle(),
  ]);

  if (!shock || shock.session_id !== input.sessionId) {
    return { ok: false, error: 'Carte introuvable dans cette session.' };
  }
  if (!team || team.session_id !== input.sessionId) {
    return { ok: false, error: 'Équipe introuvable dans cette session.' };
  }

  const { error } = await admin
    .from('shock_responses')
    .update({
      impact_pct: impactPct,
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.userId,
    })
    .eq('shock_id', input.shockId)
    .eq('team_id', input.teamId);

  if (error) return { ok: false, error: `Arbitrage refusé : ${error.message}` };

  await logAdminAction(context.userId, 'warroom_arbitrage', 'team', input.teamId, {
    sessionId: input.sessionId,
    shockId: input.shockId,
    impactPct,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
