/**
 * Actions du facilitateur — ce qu'il pose comme gestes en salle.
 *
 *   `trigger_shock` déclencher une carte PESTEL sur un DAS. C'est LUI qui
 *                   décide du moment : rien ne survient tout seul par défaut,
 *                   parce qu'un choc doit tomber quand la salle est prête à le
 *                   discuter, pas quand un tirage l'a décidé.
 *   `gift_study`    offrir une étude à une équipe en difficulté. Levier
 *                   pédagogique : on ne laisse pas une équipe décrocher faute
 *                   d'information.
 *   `extend`        prolonger le tour (repousse le repère indicatif).
 *
 * Toutes vérifient que l'appelant anime bien CETTE session.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  STUDY_BASE_PRICES, STUDY_TIERS, TIER_PROFILES, type StudyTier,
} from '@/lib/engine/consulting';
import {
  dialsFor, paramOverrides, type DifficultyDials,
} from '@/lib/engine/difficulty';
import { describeLevers, sanitiseLevers } from '@/lib/engine/shocks';
import { getUser } from '@/lib/dal';
import { fulfilStudy } from '@/lib/server/consulting-fulfil';
import { engineParamsFrom } from '@/lib/server/divest';
import { createAdminClient } from '@/lib/supabase/server';

const Request = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('trigger_shock'),
    sessionId: z.string().uuid(),
    cardKey: z.string().min(1),
    dasId: z.string().uuid(),
    /** Points de part de marché redistribués, 0 à 15. */
    redistributionPts: z.number().min(0).max(15).default(0),
    beneficiaryTeamIds: z.array(z.string().uuid()).default([]),
  }),
  z.object({
    action: z.literal('gift_study'),
    sessionId: z.string().uuid(),
    teamId: z.string().uuid(),
    studyKey: z.enum(Object.keys(STUDY_BASE_PRICES) as [string, ...string[]]),
    tier: z.enum(STUDY_TIERS),
    dasId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal('extend'),
    sessionId: z.string().uuid(),
    minutes: z.number().int().min(1).max(120),
  }),
  z.object({
    // Niveau de difficulté. Verrouillé dès la première résolution : le changer
    // en cours de partie casserait la comparabilité entre tours, qui est tout
    // l'intérêt d'une simulation multi-tours.
    action: z.literal('set_difficulty'),
    sessionId: z.string().uuid(),
    level: z.enum(['decouverte', 'standard', 'exigeant', 'sur_mesure']),
    dials: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    // La RÉSERVE mise sur le marché : quels domaines les équipes peuvent-elles
    // acquérir, et à partir de quand. Le facilitateur ouvre la diversification
    // au moment pédagogique qu'il choisit — avant, une équipe pouvait fuir son
    // métier historique au tour 1 plutôt que de le régler.
    action: z.literal('set_market'),
    sessionId: z.string().uuid(),
    dasId: z.string().uuid(),
    open: z.boolean(),
  }),
  z.object({
    action: z.literal('set_visual_style'),
    sessionId: z.string().uuid(),
    style: z.enum(['corporate', 'ludique']),
  }),
  z.object({
    // Carte de crise ou d'opportunité composée par le facilitateur.
    action: z.literal('create_shock_card'),
    sessionId: z.string().uuid(),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(600).default(''),
    nature: z.enum(['opportunite', 'menace']),
    pestelDimension: z.enum([
      'politique', 'economique', 'socioculturel', 'technologique', 'ecologique', 'legal',
    ]),
    targetSectors: z.array(z.string()).max(12).default([]),
    durationRounds: z.number().int().min(0).max(6).default(0),
    sourceReference: z.string().trim().max(160).default(''),
    effects: z.record(z.string(), z.number()),
  }),
]);

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const parsed = Request.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const body = parsed.data;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, facilitator_id, current_round, round_soft_deadline')
    .eq('id', body.sessionId)
    .maybeSingle();

  if (!session || session.facilitator_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const roundNumber = Number(session.current_round ?? 0);

  if (body.action === 'set_market') {
    // On n'ouvre que les cibles de CE domaine et de CETTE session : le garde
    // ci-dessus a vérifié que l'appelant en est le facilitateur, et rien ne
    // doit permettre d'atteindre la session d'un collègue par un `dasId`
    // emprunté.
    const { error } = await admin
      .from('ecosystem_actors')
      .update({ market_open: body.open })
      .eq('session_id', body.sessionId)
      .eq('das_id', body.dasId)
      .eq('actor_type', 'cible_acquisition');

    if (error) {
      return NextResponse.json(
        { error: `Ouverture du marché impossible : ${error.message}` },
        { status: 500 },
      );
    }

    // Pas de trace dans `decisions_log` : cette table porte un `team_id` NOT
    // NULL, et un geste de facilitateur n'appartient à aucune équipe. Lui en
    // inventer une fausserait le journal des décisions du débriefing.
    return NextResponse.json({ ok: true, dasId: body.dasId, open: body.open });
  }

  if (body.action === 'set_difficulty') {
    // Le verrou n'est pas une politesse : une fois qu'un tour est résolu, les
    // scores des tours suivants ne seraient plus comparables aux précédents.
    const { data: locked } = await admin
      .from('game_sessions')
      .select('difficulty_locked')
      .eq('id', body.sessionId)
      .maybeSingle();

    if (locked?.difficulty_locked) {
      return NextResponse.json(
        {
          error:
            'Le niveau est verrouillé depuis la première résolution. Le changer maintenant rendrait les tours incomparables entre eux.',
        },
        { status: 409 },
      );
    }

    const dials = dialsFor(body.level, (body.dials ?? {}) as Partial<DifficultyDials>);
    const overrides = paramOverrides(dials);

    const { error } = await admin
      .from('game_sessions')
      .update({ difficulty: body.level, difficulty_dials: dials })
      .eq('id', body.sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Les molettes se traduisent en paramètres moteur : la difficulté emprunte
    // le mécanisme de calibrage qui existait déjà, elle n'en crée pas un second.
    await admin
      .from('engine_parameters')
      .upsert(
        Object.entries(overrides).map(([key, value]) => ({
          session_id: body.sessionId, key, value,
        })),
        { onConflict: 'session_id,key' },
      );

    return NextResponse.json({ ok: true, level: body.level, dials, overrides });
  }

  if (body.action === 'set_visual_style') {
    const { error } = await admin
      .from('game_sessions')
      .update({ visual_style: body.style })
      .eq('id', body.sessionId);
    if (error) {
      return NextResponse.json({ error: `Style non appliqué : ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'create_shock_card') {
    const effects = sanitiseLevers(body.effects);
    const posed = Object.entries(effects).filter(([, v]) => v !== 0);

    if (posed.length === 0) {
      return NextResponse.json(
        { error: "Cette carte ne produit aucun effet : renseignez au moins un levier." },
        { status: 400 },
      );
    }

    const key = `sur_mesure_${Date.now().toString(36)}`;
    const { error } = await admin.from('shock_cards').insert({
      key,
      session_id: body.sessionId,
      created_by: user.id,
      pestel_dimension: body.pestelDimension,
      name: body.name,
      description: body.description,
      nature: body.nature,
      target_sectors: body.targetSectors,
      effects: Object.fromEntries(posed),
      duration_rounds: body.durationRounds,
      source_reference: body.sourceReference || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true, key, effects: Object.fromEntries(posed), summary: describeLevers(effects),
    });
  }

  if (body.action === 'extend') {
    const base = session.round_soft_deadline
      ? new Date(session.round_soft_deadline as string)
      : new Date();
    const next = new Date(Math.max(base.getTime(), Date.now()) + body.minutes * 60_000);
    await admin.from('game_sessions')
      .update({ round_soft_deadline: next.toISOString() }).eq('id', body.sessionId);
    return NextResponse.json({ ok: true, deadline: next.toISOString() });
  }

  if (body.action === 'trigger_shock') {
    const { data: card } = await admin
      .from('shock_cards').select('*').eq('key', body.cardKey).maybeSingle();

    // Une carte composée appartient à sa session : la clé d'une autre partie
    // ne doit rien déclencher ici.
    if (!card || (card.session_id && String(card.session_id) !== body.sessionId)) {
      return NextResponse.json({ error: 'Carte inconnue.' }, { status: 404 });
    }

    // Les effets sont COPIÉS depuis la carte, pas référencés : une carte
    // modifiée entre deux sessions ne doit pas réécrire l'histoire d'une partie
    // déjà jouée.
    const effects = {
      ...(card.effects as Record<string, unknown>),
      beneficiary_team_ids: body.beneficiaryTeamIds,
    };

    const { data, error } = await admin
      .from('market_shocks')
      .insert({
        session_id: body.sessionId,
        card_key: body.cardKey,
        das_id: body.dasId,
        round_number: roundNumber,
        triggered_by: 'facilitator',
        effects,
        // `duration_rounds = 0` signifie « permanent » dans le catalogue : on le
        // traduit par une durée longue plutôt que par un cas particulier partout.
        rounds_remaining: Number(card.duration_rounds) === 0 ? 99 : Number(card.duration_rounds),
        share_redistribution_pts: body.redistributionPts,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: `Déclenchement refusé : ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, shockId: data.id });
  }

  // gift_study
  const { data: paramRows } = await admin
    .from('engine_parameters').select('key, value').eq('session_id', body.sessionId);
  const params = engineParamsFrom(paramRows as { key: string; value: number }[] | null);

  let deliverable;
  try {
    deliverable = await fulfilStudy({
      admin, params,
      sessionId: body.sessionId, teamId: body.teamId, roundNumber,
      studyKey: body.studyKey, tier: body.tier as StudyTier,
      dasId: body.dasId ?? null, targetActorId: null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Étude impossible à produire.' },
      { status: 409 },
    );
  }

  const { error } = await admin.from('consulting_orders').upsert(
    {
      team_id: body.teamId,
      round_number: roundNumber,
      study_key: body.studyKey,
      tier: body.tier,
      das_id: body.dasId ?? null,
      target_actor_id: null,
      // Offerte : prix nul, pour que le compte de résultat de l'équipe ne soit
      // pas grevé par un geste pédagogique du formateur.
      price_paid_mad: 0,
      error_margin: TIER_PROFILES[body.tier as StudyTier].errorMargin,
      gifted_by_facilitator: true,
      payload: deliverable,
      ordered_by: user.id,
    },
    { onConflict: 'team_id,round_number,study_key,tier,das_id,target_actor_id' },
  );

  if (error) {
    return NextResponse.json({ error: `Envoi refusé : ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
