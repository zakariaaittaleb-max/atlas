/**
 * ATLAS — Balanced Scorecard de fin de session.
 *
 * Implémente `docs/02-economie.md` §6.12. Quatre axes, calculés UNE FOIS à la
 * clôture : le tableau de bord prospectif ne pilote pas les tours, il les
 * relit. C'est un instrument de débriefing, pas un score de jeu.
 *
 * ── UN CHOIX À ASSUMER : LES SCORES SONT RELATIFS AU POOL ──────────────────
 *
 * Chaque axe est normalisé par rapport aux autres équipes de la ligue, pas
 * contre un barème absolu. C'est délibéré et cohérent avec le reste : le jeu
 * est à somme nulle, « bien gérer » n'a de sens que par comparaison avec ceux
 * qui se disputaient le même marché.
 *
 * Conséquence assumée : une équipe correcte dans un pool fort obtient un score
 * modeste. La normalisation part de 20 et non de 0 — le dernier d'une ligue
 * serrée n'a pas démérité, et un zéro affiché au débriefing ferait taire une
 * équipe qu'on veut faire parler.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { clamp100, mean } from './math';

export interface TeamHistory {
  teamId: string;
  /** Trésorerie de clôture au dernier tour. */
  finalTreasuryMad: number;
  cumulativeRevenueMad: number;
  cumulativeNetIncomeMad: number;
  equityMad: number;
  /** Part de marché moyenne, tous DAS et tous tours confondus. */
  averageMarketShare: number;
  finalNotoriety: number;
  finalPerceivedQuality: number;
  initialQuality: number;
  finalQuality: number;
  averageIaScore: number;
  finalSacScore: number;
  averageStockoutRate: number;
  finalClimatSocial: number;
  /** Budget de R&D cumulé rapporté au chiffre d'affaires cumulé. */
  rdIntensity: number;
  /** Une équipe liquidée est notée, mais son sort est signalé à part. */
  isLiquidated: boolean;
}

export interface ScorecardAxis {
  key: 'financial' | 'client' | 'process' | 'learning';
  label: string;
  score: number;
  /** Les composantes, pour que le débriefing puisse remonter au « pourquoi ». */
  components: { label: string; value: number; normalized: number }[];
}

export interface Scorecard {
  teamId: string;
  financialScore: number;
  clientScore: number;
  processScore: number;
  learningScore: number;
  globalScore: number;
  axes: ScorecardAxis[];
}

/** Plancher de normalisation : le dernier d'une ligue serrée n'a pas démérité. */
const FLOOR = 20;

/**
 * Normalise une valeur par rapport à la distribution du pool.
 *
 * Si toutes les équipes sont à égalité, chacune obtient 60 — ni sanction ni
 * récompense pour une caractéristique qui n'a pas discriminé.
 */
function normalizeAgainstPool(value: number, all: number[], higherIsBetter = true): number {
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max - min < 1e-9) return 60;

  const ratio = (value - min) / (max - min);
  const oriented = higherIsBetter ? ratio : 1 - ratio;
  return clamp100(FLOOR + (100 - FLOOR) * oriented);
}

export function computeScorecards(histories: TeamHistory[]): Scorecard[] {
  if (histories.length === 0) return [];

  const column = (pick: (h: TeamHistory) => number) => histories.map(pick);

  // Rentabilité des capitaux : le résultat cumulé rapporté aux fonds propres.
  const roi = (h: TeamHistory) => (h.equityMad > 0 ? h.cumulativeNetIncomeMad / h.equityMad : 0);
  // Progression de la qualité : ce que l'équipe a APPRIS à faire, pas son niveau.
  const qualityGain = (h: TeamHistory) => h.finalQuality - h.initialQuality;

  const columns = {
    treasury: column((h) => h.finalTreasuryMad),
    revenue: column((h) => h.cumulativeRevenueMad),
    roi: column(roi),
    share: column((h) => h.averageMarketShare),
    notoriety: column((h) => h.finalNotoriety),
    perceived: column((h) => h.finalPerceivedQuality),
    ia: column((h) => h.averageIaScore),
    sac: column((h) => h.finalSacScore),
    stockout: column((h) => h.averageStockoutRate),
    climate: column((h) => h.finalClimatSocial),
    qualityGain: column(qualityGain),
    rd: column((h) => h.rdIntensity),
  };

  return histories.map((h) => {
    const axes: ScorecardAxis[] = [
      {
        key: 'financial',
        label: 'Financier',
        score: 0,
        components: [
          { label: 'Trésorerie finale', value: h.finalTreasuryMad,
            normalized: normalizeAgainstPool(h.finalTreasuryMad, columns.treasury) },
          { label: 'Chiffre d’affaires cumulé', value: h.cumulativeRevenueMad,
            normalized: normalizeAgainstPool(h.cumulativeRevenueMad, columns.revenue) },
          { label: 'Rentabilité des capitaux', value: roi(h),
            normalized: normalizeAgainstPool(roi(h), columns.roi) },
        ],
      },
      {
        key: 'client',
        label: 'Client & marché',
        score: 0,
        components: [
          { label: 'Part de marché moyenne', value: h.averageMarketShare,
            normalized: normalizeAgainstPool(h.averageMarketShare, columns.share) },
          { label: 'Notoriété finale', value: h.finalNotoriety,
            normalized: normalizeAgainstPool(h.finalNotoriety, columns.notoriety) },
          { label: 'Qualité perçue finale', value: h.finalPerceivedQuality,
            normalized: normalizeAgainstPool(h.finalPerceivedQuality, columns.perceived) },
        ],
      },
      {
        key: 'process',
        label: 'Processus internes',
        score: 0,
        components: [
          { label: 'Alignement stratégique moyen', value: h.averageIaScore,
            normalized: normalizeAgainstPool(h.averageIaScore, columns.ia) },
          { label: 'Cohérence organisationnelle', value: h.finalSacScore,
            normalized: normalizeAgainstPool(h.finalSacScore, columns.sac) },
          // Servir ce qu'on a vendu est une qualité de processus : moins de
          // rupture vaut mieux, d'où l'orientation inversée.
          { label: 'Fiabilité de service', value: h.averageStockoutRate,
            normalized: normalizeAgainstPool(h.averageStockoutRate, columns.stockout, false) },
        ],
      },
      {
        key: 'learning',
        label: 'Apprentissage & croissance',
        score: 0,
        components: [
          { label: 'Climat social final', value: h.finalClimatSocial,
            normalized: normalizeAgainstPool(h.finalClimatSocial, columns.climate) },
          { label: 'Progression de la qualité', value: qualityGain(h),
            normalized: normalizeAgainstPool(qualityGain(h), columns.qualityGain) },
          { label: 'Intensité de R&D', value: h.rdIntensity,
            normalized: normalizeAgainstPool(h.rdIntensity, columns.rd) },
        ],
      },
    ];

    for (const axis of axes) {
      axis.score = mean(axis.components.map((c) => c.normalized));
    }

    const [financial, client, process, learning] = axes.map((a) => a.score);

    return {
      teamId: h.teamId,
      financialScore: financial,
      clientScore: client,
      processScore: process,
      learningScore: learning,
      // Les quatre axes pèsent à égalité : c'est tout le propos du tableau de
      // bord prospectif. Pondérer le financier reviendrait à retomber dans ce
      // qu'il sert précisément à corriger.
      globalScore: mean([financial, client, process, learning]),
      axes,
    };
  });
}
