/**
 * ATLAS — canaux amont et aval : pouvoir de négociation, couverture.
 *
 * Implémente `docs/02-economie.md` §5 et §6. C'est ici que vivent les forces de
 * Porter avec des dents : le fournisseur qui vous tient, le distributeur qui
 * prend la marge, et la seule contre-mesure — la marque, ou son propre réseau.
 */

import { clamp, clamp01, clamp100 } from './math';
import { param, type EngineParams } from './params';
import type {
  DistributionResult,
  DistributorOffer,
  ProcurementResult,
  SupplierOffer,
} from './types';

// ===========================================================================
// Amont — fournisseurs (doc 02 §5)
// ===========================================================================

export interface ProcurementLine {
  supplier: SupplierOffer;
  committedVolume: number;
}

/**
 * Pouvoir de négociation amont.
 *
 * Trois leviers : peser dans le carnet du fournisseur, pouvoir en sortir, et
 * ne pas être captif. Concentrer ses achats maximise le premier et détruit le
 * deuxième — il n'y a pas de réponse universelle, seulement une réponse
 * cohérente avec la stratégie déclarée.
 */
export function upstreamBargainingPower(
  committedVolume: number,
  supplierCapacity: number,
  alternativesCount: number,
  switchingCost: number,
  params: EngineParams,
): number {
  const base = param(params, 'procurement.power_base');
  const volumeWeight = param(params, 'procurement.power_volume_weight');
  const volumePivot = param(params, 'procurement.power_volume_pivot');
  const altWeight = param(params, 'procurement.power_alternatives_weight');
  const altPivot = param(params, 'procurement.power_alternatives_pivot');
  const switchWeight = param(params, 'procurement.power_switching_weight');
  // Un écosystème plus dur affaiblit l'équipe d'autant. La molette agit ici et
  // non sur les acteurs eux-mêmes : ce sont les mêmes fournisseurs, c'est le
  // rapport de force qui change.
  const ecosystem = Math.max(param(params, 'ecosystem.power_multiplier'), 0.1);

  const bookShare = supplierCapacity > 0 ? committedVolume / supplierCapacity : 0;

  return clamp100(
    (1 / ecosystem) *
    (base +
      volumeWeight * Math.min(bookShare / volumePivot, 1) +
      altWeight * Math.min(alternativesCount / altPivot, 1) -
      switchWeight * (clamp100(switchingCost) / 100)),
  );
}

/**
 * Rupture d'approvisionnement.
 *
 * Le tirage est déterministe pour une graine donnée : une résolution doit
 * pouvoir être rejouée à l'identique devant les étudiants.
 */
export function supplyDisruption(
  reliability: number,
  rng: () => number,
  params: EngineParams,
): number {
  const scale = param(params, 'procurement.disruption_scale');
  const base = 1 - clamp100(reliability) / 100;
  // Sans facteur d'échelle, un fournisseur à 45 % de fiabilité amputait
  // jusqu'à 83 % de la capacité en un seul tour : le signal était juste, son
  // amplitude caricaturale.
  return clamp01(base * (0.5 + rng()) * scale);
}

export function resolveProcurement(
  lines: ProcurementLine[],
  alternativesCount: number,
  rng: () => number,
  params: EngineParams,
): { results: ProcurementResult[]; priceIndex: number; inputQuality: number; disruption: number } {
  if (lines.length === 0) {
    // Aucun fournisseur sélectionné : approvisionnement au prix spot, sans
    // remise, avec une qualité d'intrants médiocre. Ne rien décider est aussi
    // une décision, et elle a un coût.
    return { results: [], priceIndex: 1.1, inputQuality: 45, disruption: 0.1 };
  }

  const maxDiscount = param(params, 'procurement.max_discount');
  const totalVolume = lines.reduce((acc, l) => acc + l.committedVolume, 0);

  const ownedCapture = param(params, 'procurement.owned_margin_captured');
  const ownedReliabilityFloor = param(params, 'procurement.owned_reliability_floor');

  const results: ProcurementResult[] = lines.map((line) => {
    // ── Fournisseur INTÉGRÉ ────────────────────────────────────────────────
    //
    // On ne négocie pas contre soi-même : le pouvoir de négociation n'a plus
    // d'objet, et ce qu'on capte n'est pas une remise mais la MARGE que le
    // fournisseur prenait — structurellement plus qu'une remise de volume.
    // La fiabilité passe sous plancher : un maillon intégré ne rompt plus pour
    // désaccord commercial, mais le risque industriel demeure. On ne l'annule
    // jamais, sinon intégrer serait un gain sans contrepartie.
    if (line.supplier.ownedByTeam) {
      // Ce qu'on capte est amputé de ce que l'intégration a raté : un
      // fournisseur racheté sans budget reste une entreprise qu'on ne sait pas
      // faire tourner, et sa marge ne revient qu'en partie.
      const quality = clamp01(line.supplier.integrationQuality ?? 1);
      const captured = ownedCapture * quality;
      return {
        actorId: line.supplier.actorId,
        bargainingPower: 100,
        discountObtained: captured,
        effectivePriceIndex: line.supplier.priceIndex * (1 - captured),
        supplyDisruption: supplyDisruption(
          Math.max(
            line.supplier.reliability,
            // Le plancher de fiabilité ne s'atteint que si l'intégration a
            // été menée : sinon les équipes partent et les procédures divergent.
            line.supplier.reliability
              + (ownedReliabilityFloor - line.supplier.reliability) * quality,
          ),
          rng, params),
      };
    }

    const power = upstreamBargainingPower(
      line.committedVolume,
      line.supplier.capacityUnits,
      alternativesCount,
      line.supplier.switchingCost,
      params,
    );
    const discount = maxDiscount * (power / 100);
    return {
      actorId: line.supplier.actorId,
      bargainingPower: power,
      discountObtained: discount,
      effectivePriceIndex: line.supplier.priceIndex * (1 - discount),
      supplyDisruption: supplyDisruption(line.supplier.reliability, rng, params),
    };
  });

  if (totalVolume <= 0) {
    return { results, priceIndex: 1.1, inputQuality: 45, disruption: 0.1 };
  }

  const weight = (i: number) => lines[i].committedVolume / totalVolume;

  const priceIndex = results.reduce((acc, r, i) => acc + weight(i) * r.effectivePriceIndex, 0);
  const inputQuality = lines.reduce(
    (acc, l, i) => acc + weight(i) * clamp100(l.supplier.qualityContribution),
    0,
  );
  const disruption = results.reduce((acc, r, i) => acc + weight(i) * r.supplyDisruption, 0);

  return { results, priceIndex, inputQuality, disruption: clamp01(disruption) };
}

// ===========================================================================
// Aval — distributeurs (doc 02 §6)
// ===========================================================================

export interface DistributionLine {
  distributor: DistributorOffer;
  volumeShare: number;
}

/**
 * Pouvoir de négociation aval.
 *
 * La notoriété est le levier principal : une marque que le client réclame se
 * négocie. Le réseau propre est le second — avoir une alternative crédible
 * change le rapport de force sur tout le reste du canal.
 */
export function downstreamBargainingPower(
  notoriety: number,
  volumeShareWithDistributor: number,
  channelControl: number,
  distributorStrength: number,
  params: EngineParams,
): number {
  const base = param(params, 'distribution.power_base');
  const notorietyWeight = param(params, 'distribution.power_notoriety_weight');
  const volumeWeight = param(params, 'distribution.power_volume_weight');
  const volumePivot = param(params, 'distribution.power_volume_pivot');
  const channelWeight = param(params, 'distribution.power_channel_weight');
  const strengthWeight = param(params, 'distribution.power_strength_weight');
  const ecosystem = Math.max(param(params, 'ecosystem.power_multiplier'), 0.1);

  return clamp100(
    (1 / ecosystem) *
    (base +
      notorietyWeight * (clamp100(notoriety) / 100) +
      volumeWeight * Math.min(volumeShareWithDistributor / volumePivot, 1) +
      channelWeight * (clamp100(channelControl) / 100) -
      strengthWeight * (clamp100(distributorStrength) / 100)),
  );
}

/**
 * Taux d'engagement chez un distributeur : atteint-on son volume minimal ?
 *
 * C'est ce qui rend `minimum_volume` opérant. Une grande surface nationale
 * exige des volumes qu'une petite équipe ne peut pas fournir : elle n'accède
 * donc pas à sa couverture, quelle que soit sa bonne volonté. C'est la leçon
 * de Porter sur le pouvoir de l'acheteur, rendue concrète.
 */
export function channelEngagement(
  committedVolume: number,
  minimumVolume: number,
): number {
  if (minimumVolume <= 0) return 1;
  return clamp01(committedVolume / minimumVolume);
}

/**
 * Couverture totale : union des couvertures, jamais leur somme.
 * Deux distributeurs qui couvrent 50 % chacun ne couvrent pas 100 % du marché,
 * parce qu'ils se recoupent.
 *
 * La contribution d'un canal dépend de l'ATTEINTE DE SON VOLUME MINIMAL, et non
 * de la part de volume qu'on lui confie. Une version antérieure pondérait par
 * la part de volume, ce qui produisait un effet pervers : répartir 50/50 entre
 * deux réseaux couvrant 65 % chacun donnait 54 % de couverture, soit MOINS que
 * de tout confier à un seul. Multiplier ses canaux doit élargir sa portée.
 */
export function totalCoverage(
  lines: DistributionLine[],
  ownNetworkCoverage: number,
  expectedVolume: number,
): number {
  const complement = lines.reduce((acc, l) => {
    const engagement = channelEngagement(
      expectedVolume * clamp01(l.volumeShare),
      // Une filiale n'impose pas de volume minimal à sa maison mère : le seuil
      // était l'arme d'un tiers en position de force, et ce tiers n'existe plus.
      l.distributor.ownedByTeam ? 0 : l.distributor.minimumVolume,
    );
    return acc * (1 - clamp01(l.distributor.coveragePct) * engagement);
  }, 1 - clamp01(ownNetworkCoverage));

  return clamp01(1 - complement);
}

/** Couverture bâtie par le réseau propre : lente, coûteuse, structurante. */
export function ownNetworkCoverage(
  cumulativeNetworkCapexMad: number,
  params: EngineParams,
): number {
  const perMad = param(params, 'distribution.own_network_coverage_per_mad');
  return clamp01(cumulativeNetworkCapexMad * perMad);
}

export function resolveDistribution(
  lines: DistributionLine[],
  notoriety: number,
  cumulativeNetworkCapexMad: number,
  /**
   * Volume attendu, servant à évaluer si les volumes minimaux des canaux sont
   * atteints. On prend celui du tour précédent (à défaut, la capacité) : le
   * volume de ce tour dépend de la couverture, qui dépend de cet engagement —
   * la boucle doit être coupée quelque part, et un distributeur négocie
   * effectivement sur les volumes constatés.
   */
  expectedVolume: number,
  params: EngineParams,
): {
  results: DistributionResult[];
  coverage: number;
  avgMarginPct: number;
  serviceLevel: number;
  channelControl: number;
} {
  const maxReduction = param(params, 'distribution.max_margin_reduction');
  const ownCoverage = ownNetworkCoverage(cumulativeNetworkCapexMad, params);

  // Un distributeur RACHETÉ n'est plus un tiers : son volume rejoint le réseau
  // propre. C'est par ce seul point que l'intégration aval remonte jusqu'à
  // l'axe `channel_control` du domaine et à l'intégration verticale du groupe
  // — aucun calcul séparé, donc aucune divergence possible entre les deux.
  const thirdPartyShare = lines.reduce(
    (acc, l) => acc + (l.distributor.ownedByTeam ? 0 : clamp01(l.volumeShare)), 0);
  const channelControl = clamp100((1 - clamp01(thirdPartyShare)) * 100);

  const ownedOperating = param(params, 'distribution.owned_operating_margin_pct');

  const results: DistributionResult[] = lines.map((line) => {
    // Un distributeur racheté ne PRÉLÈVE plus de marge — mais il coûte à faire
    // tourner : entrepôts, camions, forces de vente. Ramener la ligne à zéro
    // ferait de l'intégration un gain sans contrepartie, ce qu'elle n'est
    // jamais. Le pouvoir de négociation n'a plus d'objet : on ne négocie pas
    // avec sa propre filiale.
    if (line.distributor.ownedByTeam) {
      // Une intégration ratée laisse un réseau qui coûte presque autant qu'un
      // tiers : on interpole entre la marge exigée d'avant et le seul coût
      // d'exploitation.
      const quality = clamp01(line.distributor.integrationQuality ?? 1);
      const marge = line.distributor.requiredMarginPct
        + (ownedOperating - line.distributor.requiredMarginPct) * quality;
      return {
        actorId: line.distributor.actorId,
        bargainingPower: 100,
        effectiveMarginPct: clamp01(marge),
        coverageContributed: clamp01(line.distributor.coveragePct) * channelEngagement(
          expectedVolume * clamp01(line.volumeShare),
          // Une filiale n'impose pas de volume minimal à sa maison mère.
          0,
        ),
      };
    }

    const power = downstreamBargainingPower(
      notoriety,
      line.volumeShare,
      channelControl,
      line.distributor.negotiatingStrength,
      params,
    );
    const engagement = channelEngagement(
      expectedVolume * clamp01(line.volumeShare),
      line.distributor.minimumVolume,
    );
    return {
      actorId: line.distributor.actorId,
      bargainingPower: power,
      effectiveMarginPct: clamp01(
        line.distributor.requiredMarginPct * (1 - maxReduction * (power / 100)),
      ),
      coverageContributed: clamp01(line.distributor.coveragePct) * engagement,
    };
  });

  const coverage = totalCoverage(lines, ownCoverage, expectedVolume);

  // La marge moyenne est pondérée par le volume ; le réseau propre ne cède
  // aucune marge, ce qui fait mécaniquement baisser la moyenne.
  const avgMarginPct = results.reduce(
    (acc, r, i) => acc + clamp01(lines[i].volumeShare) * r.effectiveMarginPct,
    0,
  );

  const serviceLevel =
    thirdPartyShare > 0
      ? lines.reduce(
          (acc, l) =>
            acc +
            (l.distributor.ownedByTeam
              ? 0
              : (clamp01(l.volumeShare) / thirdPartyShare) * clamp100(l.distributor.serviceLevel)),
          0,
        ) *
          clamp01(thirdPartyShare) +
        // Le réseau propre sert mieux que la moyenne : c'est sa raison d'être.
        85 * (1 - clamp01(thirdPartyShare))
      : 85;

  return { results, coverage, avgMarginPct, serviceLevel: clamp100(serviceLevel), channelControl };
}

/**
 * Plafond de part de marché : on ne vend pas là où on n'est pas distribué.
 * La marge de dépassement (`coverage_headroom`) représente le bouche-à-oreille
 * et les ventes indirectes.
 */
export function coverageCappedShare(
  rawShare: number,
  coverage: number,
  params: EngineParams,
): number {
  const headroom = param(params, 'distribution.coverage_headroom');
  return Math.min(clamp01(rawShare), clamp(coverage * headroom, 0, 1));
}
