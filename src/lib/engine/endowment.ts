/**
 * ATLAS — dotation initiale (T0).
 *
 * Implémente `docs/03-referentiel-das.md` §7.
 *
 * Deux règles gouvernent ce module :
 *
 * 1. **Strictement identique pour toutes les équipes d'un même pool.** Aucune
 *    modulation, y compris par le facilitateur. Si les écarts de fin de partie
 *    doivent enseigner quelque chose, ils doivent provenir entièrement des
 *    décisions prises en salle — sinon l'équipe perdante dispose de l'argument
 *    imparable (« on était moins bien dotés ») et le débriefing est ruiné.
 *
 * 2. **Dérivée du marché, jamais absolue.** La dotation se calcule à partir du
 *    marché du DAS et du nombre d'équipes du pool. Une version antérieure
 *    fixait 45 M DH et 12 % de part de marché en dur : à trois équipes, chacune
 *    subissait 70 % de rupture d'approvisionnement dès le premier tour, et un
 *    DAS de 22 Md était doté comme un DAS de 190 Md.
 */

import { param, type EngineParams } from './params';
import type { DasParameters } from './types';

export interface Endowment {
  capacityUnits: number;
  /** Volume cumulé de départ : l'origine de la courbe d'expérience. */
  cumulativeVolumeUnits: number;
  expectedRevenueMad: number;
  treasuryMad: number;
  equityMad: number;
  debtMad: number;
  workingCapitalMad: number;
  headcount: number;
  avgSalaryMad: number;
  quality: number;
  notoriety: number;
  climatSocial: number;
  iaScore: number;
  expertShare: number;
}

export function computeEndowment(
  das: DasParameters,
  marketSizeMad: number,
  poolTeamCount: number,
  params: EngineParams,
): Endowment {
  const teams = Math.max(poolTeamCount, 1);
  const marketVolume =
    das.referenceUnitPriceMad > 0 ? marketSizeMad / das.referenceUnitPriceMad : 0;

  // Une part équitable du marché, légèrement rabotée : la capacité doit être
  // rare dès le premier tour pour que l'investissement soit un vrai arbitrage,
  // sans provoquer une rupture massive dont personne n'est responsable.
  const capacityUnits =
    (marketVolume / teams) * param(params, 'endowment.capacity_share_of_fair_split');

  const expectedRevenueMad = capacityUnits * das.referenceUnitPriceMad;

  const treasuryMad =
    expectedRevenueMad * (param(params, 'endowment.treasury_months_of_revenue') / 12);
  const equityMad = expectedRevenueMad * param(params, 'endowment.equity_ratio_of_revenue');
  const debtMad = equityMad * param(params, 'endowment.debt_ratio_of_equity');

  // Le BFR de départ doit être COHÉRENT avec le chiffre d'affaires de départ.
  // Le laisser à zéro ferait apparaître au tour 1 un besoin de financement
  // fictif, imputé à des décisions que personne n'a prises.
  const workingCapitalMad = expectedRevenueMad * (das.workingCapitalDays / 360);

  const headcount = das.capacityFromHeadcount
    ? Math.round(capacityUnits / (das.headcountProductivity ?? 1))
    : Math.round(capacityUnits / param(params, 'endowment.units_per_head'));

  return {
    capacityUnits,
    cumulativeVolumeUnits: capacityUnits,
    expectedRevenueMad,
    treasuryMad,
    equityMad,
    debtMad,
    workingCapitalMad,
    headcount: Math.max(headcount, 1),
    avgSalaryMad: param(params, 'endowment.avg_salary_mad'),
    quality: param(params, 'endowment.quality'),
    notoriety: param(params, 'endowment.notoriety'),
    climatSocial: param(params, 'endowment.climat_social'),
    iaScore: param(params, 'alignment.initial_ia'),
    expertShare: param(params, 'endowment.expert_share'),
  };
}
