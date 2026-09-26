import 'server-only';

/**
 * ATLAS — opérations conclues EN COURS de tour.
 *
 * Cessions et acquisitions se dénouaient à la résolution. Elles se concluent
 * désormais au moment où l'équipe tranche : le vendeur accepte une offre,
 * l'acquéreur fait une offre ferme à une entreprise non joueuse. Les écritures
 * — changement de mains, état hérité, trésoreries — se font en une transaction
 * (`atlas_settle_listing`, `atlas_settle_acquisition`, migration 0050).
 *
 * Ce module porte ce qui se calcule AVANT l'écriture, avec les règles mêmes du
 * moteur : le prix de réserve d'une cible et ce qu'une opération transfère.
 */

import { resolveTransfer } from '@/lib/engine/finance';
import type { EngineParams } from '@/lib/engine/params';
import type { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const score = (v: number) => Math.min(Math.max(v, 0), 100);

/** Ce qu'il faut savoir d'une cible pour la valoriser — jamais montré à l'équipe. */
export interface TargetTerms {
  actorType: string;
  dasId: string;
  revenueMad: number;
  capacityUnits: number;
  marketSizeMad: number;
  financialHealth: number;
  divestAppetite: number;
  qualityContribution: number;
  valuationMultiple: number;
}

export async function loadTargetTerms(
  admin: AdminClient,
  sessionId: string,
  targetActorId: string,
  roundNumber: number,
): Promise<TargetTerms | null> {
  const { data: actor } = await admin
    .from('ecosystem_actors').select('id, session_id, das_id, actor_type')
    .eq('id', targetActorId).maybeSingle();
  if (!actor || actor.session_id !== sessionId) return null;

  const dasId = String(actor.das_id);
  const [{ data: round }, { data: das }, { data: summary }] = await Promise.all([
    // Le dernier état connu : un acteur n'a pas forcément une ligne par tour.
    admin.from('ecosystem_actor_rounds').select('*')
      .eq('actor_id', targetActorId).lte('round_number', roundNumber)
      .order('round_number', { ascending: false }).limit(1).maybeSingle(),
    admin.from('strategic_units').select('valuation_multiple, base_market_size_mad')
      .eq('id', dasId).maybeSingle(),
    admin.from('pool_round_summary').select('market_size_mad')
      .eq('das_id', dasId).eq('round_number', roundNumber - 1).limit(1).maybeSingle(),
  ]);

  return {
    actorType: String(actor.actor_type),
    dasId,
    revenueMad: num(round?.revenue_mad),
    capacityUnits: num(round?.capacity_units),
    marketSizeMad: num(summary?.market_size_mad, num(das?.base_market_size_mad)),
    financialHealth: num(round?.financial_health, 60),
    divestAppetite: num(round?.divest_appetite, 30),
    qualityContribution: num(round?.quality_contribution, 55),
    valuationMultiple: num(das?.valuation_multiple, 5),
  };
}

/**
 * Prix de réserve : la valorisation par les revenus, escomptée d'autant plus
 * que la cible est pressée de vendre. Un maillon de filière ne se valorise pas
 * comme l'industriel qu'il sert : un distributeur est peu capitalistique, un
 * fournisseur se situe entre les deux.
 */
export function reservePriceMad(terms: TargetTerms): number {
  const typeFactor =
    terms.actorType === 'distributeur' ? 0.65 : terms.actorType === 'fournisseur' ? 0.80 : 1;
  return terms.revenueMad * terms.valuationMultiple * typeFactor * 0.35
    * (1 - (terms.divestAppetite / 100) * 0.35);
}

export interface AcquisitionOutcome {
  reserveMad: number;
  valueLossPct: number;
  shareAcquired: number;
  revenueAcquired: number;
  capacityAcquired: number;
  notorietyAcquired: number;
  qualityAcquired: number;
}

/**
 * Ce qu'une acquisition transfère, avec la règle du moteur. Une intégration de
 * filière ne transfère ni part ni capacité : le maillon servait déjà l'équipe,
 * il change seulement de propriétaire.
 */
export function acquisitionOutcome(
  terms: TargetTerms,
  offerMad: number,
  integrationBudgetMad: number,
  params: EngineParams,
): AcquisitionOutcome {
  const share = terms.marketSizeMad > 0 ? terms.revenueMad / terms.marketSizeMad : 0;
  const notoriety = score(terms.financialHealth * 0.8 + 20);
  const quality = score(terms.qualityContribution);
  const outcome = resolveTransfer(offerMad, integrationBudgetMad, share, notoriety, params);
  const keep = 1 - outcome.valueLossPct;
  const integration = terms.actorType !== 'cible_acquisition';

  return {
    reserveMad: reservePriceMad(terms),
    valueLossPct: outcome.valueLossPct,
    shareAcquired: integration ? 0 : outcome.marketShareTransferred,
    revenueAcquired: integration ? 0 : terms.revenueMad * keep,
    capacityAcquired: integration ? 0 : terms.capacityUnits * keep,
    notorietyAcquired: integration ? 0 : outcome.notorietyTransferred,
    qualityAcquired: integration ? 0 : quality * (1 - outcome.valueLossPct * 0.5),
  };
}

const DEAL_ERRORS: Record<string, string> = {
  annonce_introuvable: 'Annonce introuvable.',
  annonce_close: 'Cette annonce n’est plus ouverte : le domaine a déjà été cédé ou retiré.',
  offre_introuvable: 'Cette offre n’est plus valable : elle a été retirée ou remplacée.',
  offre_modifiee: 'L’offre a changé entre-temps. Relisez-la avant de conclure.',
  acheteur_liquide: 'L’équipe acheteuse est en liquidation : elle ne peut plus racheter.',
  acheteur_deja_present: 'L’équipe acheteuse exploite déjà ce domaine.',
  cible_introuvable: 'Cible introuvable.',
  cible_deja_rachetee: 'Cette entreprise a déjà été rachetée.',
  cible_fermee: 'Cette cible n’est pas ouverte à l’acquisition.',
  offre_deja_faite: 'Vous avez déjà fait une offre sur cette cible ce tour-ci.',
};

/** Traduit le code levé par une transaction en message lisible. */
export function dealErrorMessage(message: string): string {
  const code = Object.keys(DEAL_ERRORS).find((key) => message.includes(key));
  return code ? DEAL_ERRORS[code] : `Opération refusée : ${message}`;
}

/** Solde des opérations conclues ce tour, par équipe : encaissé moins décaissé. */
export function sumDealCash(rows: { amount_mad: unknown }[] | null): number {
  return (rows ?? []).reduce((acc, r) => acc + num(r.amount_mad), 0);
}
