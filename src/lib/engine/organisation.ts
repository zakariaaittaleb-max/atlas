/**
 * ATLAS — alignement organisationnel.
 *
 * Traduit les décisions de STRUCTURE en axes notables. C'est la réponse à une
 * faiblesse du modèle initial : une équipe pouvait déclarer une différenciation
 * et l'organiser comme une usine low-cost sans que rien ne le relève.
 *
 * ── CE QUI EST NOTÉ, ET CE QUI NE L'EST PAS ────────────────────────────────
 *
 * Vision et mission restent en TEXTE LIBRE et ne sont jamais notées. Un score
 * tiré de mots-clés serait arbitraire, et les étudiants le sentiraient — on
 * apprendrait à écrire pour la machine, pas à penser. Elles servent le
 * débriefing et figurent dans l'audit.
 *
 * Sont notées les décisions STRUCTURÉES qui traduisent ces énoncés :
 *   • les trois axes stratégiques retenus,
 *   • l'indicateur que chaque direction se donne,
 *   • la répartition du budget entre directions,
 *   • les postes déclarés clés,
 *   • le niveau de délégation,
 *   • la profondeur hiérarchique.
 *
 * Les AFFINITÉS ne sont pas codées en dur ici : elles viennent du catalogue en
 * base, transmises par l'instantané. Le facilitateur peut donc les retoucher
 * entre deux promotions sans redéploiement — cohérent avec `engine_parameters`.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { clamp100, mean } from './math';
import type { GenericStrategy } from './types';

/** Affinité 0–100 d'un élément de catalogue avec chaque stratégie générique. */
export type Affinity = Record<GenericStrategy, number>;

export interface OrgSnapshot {
  structureType: 'fonctionnelle' | 'divisionnelle' | 'matricielle' | 'processus';
  delegationLevel: number;
  /** Axes retenus, du plus prioritaire au moins prioritaire. */
  strategicAxes: { key: string; priority: number; affinity: Affinity }[];
  /** Un indicateur par direction renseignée. */
  directionKpis: { directionKey: string; kpiKey: string; affinity: Affinity }[];
  /** Budget par direction, en dirhams. */
  directionBudgets: { directionKey: string; budgetMad: number }[];
  positions: {
    directionKey: string;
    hierarchyLevel: number;
    headcount: number;
    isKeyPosition: boolean;
  }[];
}

/**
 * Profil budgétaire cible, en part du budget total de fonctionnement du DAS.
 *
 * C'est la traduction chiffrée d'une évidence stratégique : une domination par
 * les coûts met son argent en production et en achats ; une différenciation le
 * met en R&D et en commercial. Une équipe qui déclare l'une et finance l'autre
 * est incohérente, et c'est exactement ce que l'axe mesure.
 */
export const BUDGET_TARGETS: Record<GenericStrategy, Record<string, number>> = {
  domination_couts: {
    direction_generale: 0.02, technique: 0.04, production: 0.32, achats: 0.18,
    qualite: 0.06, commercial: 0.12, si: 0.12, finance: 0.08, rh: 0.06,
  },
  differenciation: {
    direction_generale: 0.02, technique: 0.24, production: 0.14, achats: 0.06,
    qualite: 0.14, commercial: 0.22, si: 0.05, finance: 0.03, rh: 0.10,
  },
  focus_couts: {
    direction_generale: 0.02, technique: 0.03, production: 0.30, achats: 0.20,
    qualite: 0.07, commercial: 0.14, si: 0.10, finance: 0.08, rh: 0.06,
  },
  focus_differenciation: {
    direction_generale: 0.02, technique: 0.26, production: 0.12, achats: 0.06,
    qualite: 0.16, commercial: 0.20, si: 0.04, finance: 0.02, rh: 0.12,
  },
};

/**
 * Nombre de postes clés au-delà duquel « clé » ne veut plus rien dire.
 * Tout déclarer prioritaire, c'est ne rien prioriser.
 */
export const KEY_POSITION_SWEET_SPOT = 3;
export const KEY_POSITION_CEILING = 6;

/**
 * Cohérence des axes stratégiques retenus, pondérée par le rang.
 *
 * Le premier axe pèse 3, le deuxième 2, le troisième 1 : « choisir trois
 * priorités » n'est un arbitrage que si l'ordre compte.
 */
export function strategicAxisFit(org: OrgSnapshot, declared: GenericStrategy): number {
  if (org.strategicAxes.length === 0) return 0;

  const weightOf = (priority: number) => Math.max(4 - priority, 1);
  const totalWeight = org.strategicAxes.reduce((acc, a) => acc + weightOf(a.priority), 0);

  return clamp100(
    org.strategicAxes.reduce(
      (acc, a) => acc + weightOf(a.priority) * a.affinity[declared],
      0,
    ) / totalWeight,
  );
}

/**
 * Cohérence des indicateurs choisis.
 *
 * Choisir un KPI, c'est décider de ce qu'on va optimiser — donc de ce qu'on va
 * sacrifier. Un directeur de production suivi sur le coût unitaire et un autre
 * suivi sur le taux de rebut ne prendront pas les mêmes décisions.
 */
export function kpiFit(org: OrgSnapshot, declared: GenericStrategy): number {
  if (org.directionKpis.length === 0) return 0;
  return clamp100(mean(org.directionKpis.map((k) => k.affinity[declared])));
}

/**
 * Cohérence de la répartition budgétaire avec le profil de la stratégie.
 *
 * Mesurée par la distance L1 entre la répartition observée et la cible. Deux
 * distributions totalement disjointes sont à distance 2 ; on ramène donc sur
 * 0–100 en divisant par 2.
 */
export function budgetFit(org: OrgSnapshot, declared: GenericStrategy): number {
  const total = org.directionBudgets.reduce((acc, b) => acc + b.budgetMad, 0);
  // Aucun budget réparti : l'équipe n'a pas fait l'exercice. On ne peut pas
  // conclure à la cohérence, et on ne peut pas non plus l'inventer.
  if (total <= 0) return 0;

  const target = BUDGET_TARGETS[declared];
  const observed = new Map(org.directionBudgets.map((b) => [b.directionKey, b.budgetMad / total]));

  const directions = new Set([...Object.keys(target), ...observed.keys()]);
  const distance = [...directions].reduce(
    (acc, key) => acc + Math.abs((observed.get(key) ?? 0) - (target[key] ?? 0)),
    0,
  );

  return clamp100(100 * (1 - distance / 2));
}

/**
 * Cohérence des postes déclarés clés.
 *
 * Deux choses sont mesurées ensemble : les directions choisies servent-elles la
 * stratégie, et la sélection est-elle assez resserrée pour vouloir dire quelque
 * chose ? Déclarer huit postes clés sur dix revient à n'en déclarer aucun.
 */
export function keyRolesFit(
  org: OrgSnapshot,
  declared: GenericStrategy,
  directionAffinity: Record<string, Affinity>,
): number {
  const keyPositions = org.positions.filter((p) => p.isKeyPosition);
  if (keyPositions.length === 0) return 0;

  const affinityScore = mean(
    keyPositions.map((p) => directionAffinity[p.directionKey]?.[declared] ?? 50),
  );

  // Pénalité de dispersion : nulle jusqu'à trois postes clés, croissante ensuite.
  const excess = Math.max(keyPositions.length - KEY_POSITION_SWEET_SPOT, 0);
  const dispersionFactor = Math.max(
    1 - excess / (KEY_POSITION_CEILING - KEY_POSITION_SWEET_SPOT + 1),
    0.4,
  );

  return clamp100(affinityScore * dispersionFactor);
}

/**
 * Profondeur hiérarchique observée, normalisée sur 0–100.
 *
 * 0 = organisation plate (deux niveaux), 100 = pyramidale (quatre niveaux
 * pleinement peuplés). Ni l'un ni l'autre n'est bon dans l'absolu : une
 * domination par les coûts a besoin de contrôle et de standardisation, une
 * niche haut de gamme a besoin que le terrain décide vite.
 */
export function hierarchyDepth(org: OrgSnapshot): number {
  if (org.positions.length === 0) return 50;

  const levels = new Set(org.positions.map((p) => p.hierarchyLevel));
  const deepest = Math.max(...levels);
  // La profondeur compte, mais aussi le remplissage : quatre niveaux dont un
  // seul poste au dernier n'est pas une pyramide.
  const coverage = levels.size / 4;

  return clamp100(((deepest - 1) / 3) * 100 * (0.6 + 0.4 * coverage));
}

/**
 * Effet des plateformes mutualisées sur la synergie du portefeuille.
 *
 * Une plateforme partagée entre deux DAS PROCHES produit des économies ; entre
 * deux métiers étrangers, elle produit surtout de la coordination. Le rendement
 * suit donc la proximité sectorielle, et devient NÉGATIF en dessous d'un seuil.
 */
export function platformSynergy(
  platforms: { dasIds: string[]; investmentMad: number }[],
  sectorOf: (dasId: string) => string,
  proximity: (a: string, b: string) => number,
): { effectiveness: number; totalInvestmentMad: number } {
  if (platforms.length === 0) return { effectiveness: 0, totalInvestmentMad: 0 };

  const totalInvestmentMad = platforms.reduce((acc, p) => acc + p.investmentMad, 0);

  const scores = platforms.map((platform) => {
    // Proximité moyenne entre toutes les paires de DAS servis.
    const pairs: number[] = [];
    for (let i = 0; i < platform.dasIds.length; i += 1) {
      for (let j = i + 1; j < platform.dasIds.length; j += 1) {
        pairs.push(proximity(sectorOf(platform.dasIds[i]), sectorOf(platform.dasIds[j])));
      }
    }
    if (pairs.length === 0) return 0;

    const averageProximity = mean(pairs);
    // En dessous de 40 de proximité, mutualiser coûte plus qu'il ne rapporte :
    // c'est la bureaucratie du conglomérat, rendue mesurable.
    return (averageProximity - 40) / 60;
  });

  return { effectiveness: mean(scores), totalInvestmentMad };
}

/**
 * Les six axes d'organisation, prêts à entrer dans le vecteur d'alignement.
 *
 * Sans conception organisationnelle, l'équipe n'a simplement pas fait
 * l'exercice. On note alors **zéro** sur les quatre axes de cohérence — on ne
 * peut pas inventer un alignement sur une décision non prise — mais on retombe
 * sur une valeur **neutre** pour la délégation et la profondeur : ne rien
 * décider revient à hériter d'une organisation moyenne, pas absurde.
 */
export function organisationalAxes(
  org: OrgSnapshot | null,
  declared: GenericStrategy,
  directionAffinity: Record<string, Affinity>,
): {
  org_delegation: number;
  org_layers: number;
  axis_fit: number;
  kpi_fit: number;
  budget_fit: number;
  key_roles_fit: number;
} {
  if (!org) {
    return {
      org_delegation: 50,
      org_layers: 50,
      axis_fit: 0,
      kpi_fit: 0,
      budget_fit: 0,
      key_roles_fit: 0,
    };
  }

  return {
    org_delegation: clamp100(org.delegationLevel),
    org_layers: hierarchyDepth(org),
    axis_fit: strategicAxisFit(org, declared),
    kpi_fit: kpiFit(org, declared),
    budget_fit: budgetFit(org, declared),
    key_roles_fit: keyRolesFit(org, declared, directionAffinity),
  };
}

/**
 * Affinité d'une DIRECTION avec chaque stratégie, dérivée de ses indicateurs.
 *
 * Plutôt que de maintenir une seconde table d'affinités, on agrège celle des
 * KPI que la direction peut se donner : une direction dont tous les indicateurs
 * servent la domination par les coûts EST une direction de domination par les
 * coûts. Une seule source de vérité, donc pas de dérive possible entre les deux.
 */
export function directionAffinityFromKpis(
  kpis: { directionKey: string; affinity: Affinity }[],
): Record<string, Affinity> {
  const grouped = new Map<string, Affinity[]>();
  for (const kpi of kpis) {
    grouped.set(kpi.directionKey, [...(grouped.get(kpi.directionKey) ?? []), kpi.affinity]);
  }

  const strategies: GenericStrategy[] = [
    'domination_couts', 'differenciation', 'focus_couts', 'focus_differenciation',
  ];

  return Object.fromEntries(
    [...grouped.entries()].map(([direction, list]) => [
      direction,
      Object.fromEntries(
        strategies.map((s) => [s, mean(list.map((a) => a[s]))]),
      ) as Affinity,
    ]),
  );
}
