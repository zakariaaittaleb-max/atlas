import 'server-only';

/**
 * ATLAS — marché de cession de DAS.
 *
 * Implémente `docs/00-specification.md` §7. C'est la porte de sortie qui évite
 * qu'une équipe en difficulté passe deux heures à regarder les autres jouer :
 * elle peut céder un DAS pour se refaire une trésorerie, ou se recentrer.
 *
 * Deux canaux simultanés :
 *   • un acheteur NON JOUEUR, dont l'offre est calculée par le moteur et reste
 *     PRIVÉE au vendeur — c'est un plancher de liquidité, structurellement
 *     inférieur à ce qu'un concurrent rationnel proposerait ;
 *   • des offres d'équipes du pool, scellées entre elles : chacune ne voit
 *     qu'une fiche limitée et ignore l'offre NPC comme celles des autres.
 *
 * Le vendeur voit les montants et CONCLUT quand il le décide, en cours de tour
 * (migration 0050) : prendre tout de suite la liquidité certaine du NPC, ou
 * attendre une meilleure offre qui peut ne jamais venir. C'est là qu'est
 * l'arbitrage. Une annonce sans preneur expire à la résolution.
 */

import { dasBaseValuation, npcOffer } from '@/lib/engine/finance';
import { makeRng, seedFrom } from '@/lib/engine/math';
import { buildParams, type EngineParams } from '@/lib/engine/params';
import type { TreasuryStatus } from '@/lib/engine/types';

import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Fiche publique présentée aux concurrents.
 *
 * Chaque champ retenu répond à la même question : un acheteur en a-t-il besoin
 * pour former une offre, sans que cela revienne à lui offrir le renseignement
 * que le cabinet vend ? Les indicateurs qualitatifs sont donnés en BANDES —
 * « qualité élevée » se constate sur un marché, « qualité 73,4 » s'achète.
 */
export interface PublicSnapshot {
  dasName: string;
  segments: string[];
  marketSharePct: number;
  /** Bande de ±10 % : le CA exact reste au vendeur. */
  revenueBandMinMad: number;
  revenueBandMaxMad: number;
  capacityUnits: number;
  headcount: number;
  qualityBand: string;
  notorietyBand: string;
  roundsHeld: number;
}

const BANDS = ['faible', 'moyen', 'élevé'] as const;

function band(value: number): string {
  if (value < 100 / 3) return BANDS[0];
  if (value < 200 / 3) return BANDS[1];
  return BANDS[2];
}

export interface ListingComputation {
  npcOfferMad: number;
  baseValuationMad: number;
  publicSnapshot: PublicSnapshot;
}

/**
 * Calcule l'offre de l'acheteur non joueur et la fiche publique d'un DAS.
 *
 * Tout se fait ici, côté serveur : le prix d'une cession ne doit jamais être
 * calculable dans le navigateur du vendeur, ni a fortiori dans celui d'un
 * concurrent.
 */
export async function computeListing(
  admin: AdminClient,
  params: EngineParams,
  sessionId: string,
  teamId: string,
  dasId: string,
  roundNumber: number,
): Promise<ListingComputation> {
  const previousRound = roundNumber - 1;

  const [{ data: metric }, { data: unit }, { data: das }, { data: state }, { data: hr }, { data: decision }] =
    await Promise.all([
      admin.from('team_das_round_metrics').select('*')
        .eq('team_id', teamId).eq('das_id', dasId).eq('round_number', previousRound).maybeSingle(),
      admin.from('team_units').select('launched_round, status')
        .eq('team_id', teamId).eq('das_id', dasId).maybeSingle(),
      admin.from('strategic_units').select('name, valuation_multiple, unit_capacity_cost_mad, growth_rate_min, growth_rate_max')
        .eq('id', dasId).maybeSingle(),
      admin.from('team_round_state').select('treasury_status, headcount')
        .eq('team_id', teamId).eq('round_number', previousRound).maybeSingle(),
      admin.from('hr_metrics').select('headcount_start')
        .eq('team_id', teamId).eq('round_number', roundNumber).maybeSingle(),
      admin.from('das_decisions').select('served_segments')
        .eq('team_id', teamId).eq('das_id', dasId).eq('round_number', previousRound).maybeSingle(),
    ]);

  if (!unit || unit.status !== 'active') {
    throw new Error('Ce DAS ne fait pas partie de votre portefeuille actif.');
  }
  if (!metric) {
    throw new Error(
      'Un DAS ne peut être mis en vente qu’après un tour résolu : sans résultats, il n’a pas de valeur constatable.',
    );
  }

  const ebitda = Number(metric.ebitda_mad ?? 0);
  const capacity = Number(metric.capacity_units ?? 0);
  const marketShare = Number(metric.market_share_pct ?? 0);
  const marketSize = Number(metric.market_size_mad ?? 0);
  const revenue = Number(metric.revenue_mad ?? 0);

  const growth =
    (Number(das?.growth_rate_min ?? 0) + Number(das?.growth_rate_max ?? 0)) / 2;

  const baseValuationMad = dasBaseValuation(
    ebitda,
    Number(das?.valuation_multiple ?? 5),
    growth,
    capacity,
    // Valeur résiduelle des actifs : 40 % du coût de capacité neuf.
    Number(das?.unit_capacity_cost_mad ?? 220) * 0.4,
    marketShare,
    marketSize * 0.1,
  );

  // Graine stable : rejouer le tour redonne exactement la même offre. Le
  // vendeur ne peut pas « retirer et relister » pour obtenir un meilleur tirage.
  const rng = makeRng(seedFrom(sessionId, roundNumber, teamId, dasId, 'npc'));
  const npcOfferMad = npcOffer(
    baseValuationMad,
    (state?.treasury_status as TreasuryStatus) ?? 'sain',
    rng,
    params,
  );

  const publicSnapshot: PublicSnapshot = {
    dasName: String(das?.name ?? 'DAS'),
    segments: (decision?.served_segments as string[]) ?? [],
    marketSharePct: marketShare,
    revenueBandMinMad: revenue * 0.9,
    revenueBandMaxMad: revenue * 1.1,
    capacityUnits: capacity,
    headcount: Number(hr?.headcount_start ?? state?.headcount ?? 0),
    qualityBand: band(Number(metric.perceived_quality ?? 50)),
    notorietyBand: band(Number(metric.notoriety ?? 50)),
    roundsHeld: Math.max(roundNumber - Number(unit.launched_round ?? 0), 0),
  };

  return { npcOfferMad, baseValuationMad, publicSnapshot };
}

export function engineParamsFrom(rows: { key: string; value: number }[] | null): EngineParams {
  return buildParams(Object.fromEntries((rows ?? []).map((r) => [r.key, Number(r.value)])));
}
