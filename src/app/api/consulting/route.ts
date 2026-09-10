/**
 * Cabinet de conseil — commande d'une étude.
 *
 * Le prix n'achète pas l'ACCÈS à l'information, il achète sa PRÉCISION
 * (doc 00 §6). Trois paliers : la note express livre des estimations à ±25 %,
 * des bandes au lieu de valeurs, et OMET les signaux faibles ; l'étude
 * approfondie livre la vérité à ±3 %.
 *
 * Tout est calculé ici, côté serveur : le bruit doit être déterministe et
 * incontrôlable par l'équipe, et les valeurs vraies ne doivent jamais traverser
 * la frontière réseau.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  STUDY_BASE_PRICES,
  STUDY_TIERS,
  studyPrice,
  tierProfile,
  type StudyTier,
} from '@/lib/engine/consulting';
import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { fulfilStudy } from '@/lib/server/consulting-fulfil';
import { engineParamsFrom } from '@/lib/server/divest';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Études qui portent sur une CIBLE nommée, et non sur un domaine.
 *
 * Sans cette contrainte, une due diligence sans cible était acceptée, facturée,
 * et produisait un livrable sur un acteur inexistant — sept champs bruités
 * calculés à partir de zéro. L'équipe payait 660 000 DH pour des chiffres qui
 * ne décrivaient rien, et rien ne le lui disait.
 */
const TARGET_REQUIRED = new Set(['due_diligence']);

/** Études qui portent sur un DOMAINE : sans lui, il n'y a rien à analyser. */
const DAS_REQUIRED = new Set([
  'pestel_sectoriel', 'concurrentielle', 'panel_conso',
  'benchmark_fourn', 'benchmark_distri',
]);

const OrderRequest = z.object({
  studyKey: z.enum(Object.keys(STUDY_BASE_PRICES) as [string, ...string[]]),
  tier: z.enum(STUDY_TIERS),
  dasId: z.string().uuid().nullable().optional(),
  targetActorId: z.string().uuid().nullable().optional(),
}).refine((o) => !TARGET_REQUIRED.has(o.studyKey) || Boolean(o.targetActorId), {
  message: 'Cette étude porte sur une cible : précisez laquelle.',
  path: ['targetActorId'],
}).refine((o) => !DAS_REQUIRED.has(o.studyKey) || Boolean(o.dasId), {
  message: 'Cette étude porte sur un domaine : précisez lequel.',
  path: ['dasId'],
});

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const parsed = OrderRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Le message du schéma plutôt qu'un « requête invalide » générique : une
    // étude refusée doit dire ce qui lui manque.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
      { status: 400 },
    );
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : le cabinet n’accepte plus de mission.' },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const { studyKey, tier } = parsed.data;

  // Le catalogue est réglé par le facilitateur. Une étude qu'il a retirée ne
  // doit pas être commandable en devinant sa clé.
  const modules = await loadEnabledModules(team.sessionId);
  if (!isOn(modules, `cabinet.${studyKey}`)) {
    return NextResponse.json(
      { error: 'Cette étude n’est pas au catalogue de cette session.' },
      { status: 403 },
    );
  }
  const dasId = parsed.data.dasId ?? null;
  const targetActorId = parsed.data.targetActorId ?? null;

  const admin = createAdminClient();
  const { data: paramRows } = await admin
    .from('engine_parameters').select('key, value').eq('session_id', team.sessionId);
  const params = engineParamsFrom(paramRows as { key: string; value: number }[] | null);

  const price = studyPrice(STUDY_BASE_PRICES[studyKey], tier as StudyTier, params);
  // La marge inscrite sur la commande doit être celle que le moteur applique.
  // Elle était lue sur la constante alors que la divulgation lit le PARAMÈTRE
  // de session : une étude payée au palier standard s'archivait à ±5 % et
  // livrait des chiffres à ±10 %. Le cabinet mentait sur sa propre précision.
  const errorMargin = tierProfile(tier as StudyTier, params).errorMargin;

  // Racheter la même étude au même palier est SANS EFFET et sans surcoût : le
  // bruit étant déterministe, les chiffres seraient identiques. La contrainte
  // `unique nulls not distinct` de la table transforme la commande en mise à
  // jour de la même ligne — l'équipe ne peut pas payer deux fois pour rien, ni
  // multiplier les tirages pour moyenner l'erreur.

  let deliverable;
  try {
    deliverable = await fulfilStudy({
      admin, params,
      sessionId: team.sessionId, teamId: team.teamId, roundNumber,
      studyKey, tier: tier as StudyTier, dasId, targetActorId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Mission impossible à exécuter.' },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from('consulting_orders')
    .upsert(
      {
        team_id: team.teamId,
        round_number: roundNumber,
        study_key: studyKey,
        tier,
        das_id: dasId,
        target_actor_id: targetActorId,
        price_paid_mad: price,
        error_margin: errorMargin,
        payload: deliverable,
        ordered_by: team.userId,
      },
      { onConflict: 'team_id,round_number,study_key,tier,das_id,target_actor_id' },
    )
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: `Commande refusée : ${error.message}` }, { status: 500 });
  }

  // Le coût est décaissé à la résolution : `load-snapshot` somme les commandes
  // du tour et les porte au compte de résultat. Rien n'est débité ici, pour que
  // la trésorerie ne bouge qu'au moment où le moteur la recalcule.
  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber, decision_type: 'commande_etude',
    payload: { studyKey, tier, dasId, targetActorId, priceMad: price },
    decided_by: team.userId,
  });

  return NextResponse.json({ orderId: data.id, priceMad: price, errorMargin });
}
