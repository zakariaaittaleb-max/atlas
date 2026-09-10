/**
 * Réponse d'une équipe à une carte de crise (War Room).
 *
 * Quatre postures, du renoncement à la contre-attaque. **Ignorer est une
 * réponse légitime** : c'est aussi un arbitrage, et l'écran ne doit pas le
 * présenter comme un oubli.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { engineParamsFrom } from '@/lib/server/divest';
import { createAdminClient } from '@/lib/supabase/server';

const Request = z.object({
  shockId: z.string().uuid(),
  response: z.enum(['ignorer', 'attenuer', 'absorber', 'retourner']),
});

/** Coût de la réponse, en part du chiffre d'affaires du tour précédent. */
const COST_KEYS: Record<string, string | null> = {
  ignorer: null,
  attenuer: 'pestel.response_attenuate_cost_pct',
  absorber: 'pestel.response_absorb_cost_pct',
  retourner: 'pestel.response_reverse_cost_pct',
};

const EFFECT_KEYS: Record<string, string | null> = {
  ignorer: null,
  attenuer: 'pestel.response_attenuate_effect',
  absorber: 'pestel.response_absorb_effect',
  retourner: 'pestel.response_reverse_effect',
};

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const parsed = Request.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : la War Room est close.' },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const admin = createAdminClient();

  const modules = await loadEnabledModules(team.sessionId);
  if (!isOn(modules, 'warroom.events')) {
    return NextResponse.json(
      { error: 'La War Room n’est pas ouverte sur cette session.' },
      { status: 403 },
    );
  }

  // Le choc doit appartenir à la session de l'équipe et être déjà survenu.
  const { data: shock } = await admin
    .from('market_shocks')
    .select('id, session_id, round_number')
    .eq('id', parsed.data.shockId)
    .maybeSingle();

  if (!shock || shock.session_id !== team.sessionId || Number(shock.round_number) > roundNumber) {
    return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 });
  }

  const [{ data: paramRows }, { data: pnl }] = await Promise.all([
    admin.from('engine_parameters').select('key, value').eq('session_id', team.sessionId),
    admin.from('pnl_statements').select('revenue_mad')
      .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
  ]);

  const params = engineParamsFrom(paramRows as { key: string; value: number }[] | null);
  const revenue = Number(pnl?.revenue_mad ?? 0);

  const costKey = COST_KEYS[parsed.data.response];
  const effectKey = EFFECT_KEYS[parsed.data.response];

  const { error } = await admin.from('shock_responses').upsert(
    {
      shock_id: parsed.data.shockId,
      team_id: team.teamId,
      round_number: roundNumber,
      response: parsed.data.response,
      // Le coût est proportionnel au chiffre d'affaires : répondre à une crise
      // coûte à proportion de ce qu'on a à protéger.
      cost_mad: costKey ? revenue * (params[costKey] ?? 0) : 0,
      effectiveness: effectKey ? (params[effectKey] ?? 0) : 0,
    },
    { onConflict: 'shock_id,team_id' },
  );

  if (error) {
    return NextResponse.json({ error: `Réponse refusée : ${error.message}` }, { status: 500 });
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber, decision_type: 'reponse_crise',
    payload: { shockId: parsed.data.shockId, response: parsed.data.response },
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true });
}
