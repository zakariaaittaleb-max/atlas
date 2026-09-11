/**
 * ATLAS — agrégation de l'écran de révélation.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * La révélation lisait `pool_reveal` — une ligne par ÉQUIPE ET PAR DOMAINE —
 * en la traitant comme une ligne par équipe. Un groupe présent sur trois
 * domaines apparaissait donc trois fois dans la même barre et dans le même
 * tableau, avec trois parts différentes, et la somme des tranches atteignait
 * 200 % : la barre débordait, les dernières tranches étaient rognées, et
 * React recevait trois enfants de même clé.
 *
 * Une part de marché n'a de sens que DANS un domaine — c'est là que la
 * répartition à somme nulle se joue. Le poids d'un groupe, lui, se mesure
 * autrement : en chiffre d'affaires, tous domaines confondus. Ce module
 * calcule les deux, séparément, et c'est tout ce qu'il fait.
 */

/** Ligne de `pool_reveal`, réduite à ce que l'agrégation utilise. */
export interface ShareInput {
  teamId: string;
  dasId: string;
  roundNumber: number;
  marketSharePct: number;
  revenueMad: number;
}

/** Ligne de `pool_round_summary`. */
export interface DasSummary {
  dasId: string;
  roundNumber: number;
  marketSizeMad: number;
  unservedShare: number;
  installedShare: number;
}

export interface GroupWeight {
  teamId: string;
  revenueMad: number;
  /** Part du chiffre d'affaires cumulé des groupes du pool. */
  weight: number;
  previousWeight: number;
  /** Nombre de domaines où le groupe a réalisé du chiffre d'affaires. */
  dasCount: number;
}

export interface TeamShare {
  teamId: string;
  share: number;
  previousShare: number;
}

export interface DasComposition {
  dasId: string;
  marketSizeMad: number;
  teams: TeamShare[];
  installedShare: number;
  previousInstalledShare: number;
  unservedShare: number;
  previousUnservedShare: number;
  /**
   * Somme des tranches. Vaut 1 quand la comptabilité du marché est complète ;
   * s'en écarter signale une donnée d'un tour résolu par une version
   * antérieure du moteur, et l'écran doit le dire plutôt que d'empiler des
   * tranches qui ne ferment pas.
   */
  total: number;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

/**
 * Poids des groupes, en pourcentage du chiffre d'affaires cumulé du pool.
 *
 * La base ne compte QUE les groupes : les entreprises installées hors jeu ne
 * publient pas leur chiffre d'affaires, et l'inclure ferait passer ce poids
 * pour une part de marché — ce qu'il n'est pas.
 */
export function groupWeights(rows: ShareInput[], roundNumber: number): GroupWeight[] {
  const weightsAt = (round: number) => {
    const atRound = rows.filter((r) => r.roundNumber === round);
    const total = sum(atRound.map((r) => Math.max(r.revenueMad, 0)));
    const byTeam = new Map<string, number>();
    for (const row of atRound) {
      byTeam.set(row.teamId, (byTeam.get(row.teamId) ?? 0) + Math.max(row.revenueMad, 0));
    }
    return { byTeam, total };
  };

  const current = weightsAt(roundNumber);
  const previous = weightsAt(roundNumber - 1);

  return [...current.byTeam.entries()]
    .map(([teamId, revenueMad]) => ({
      teamId,
      revenueMad,
      weight: current.total > 0 ? revenueMad / current.total : 0,
      // Un groupe absent du tour précédent part de son poids actuel : mieux
      // vaut une tranche immobile qu'une tranche qui surgit de zéro et fait
      // croire à une conquête.
      previousWeight:
        previous.total > 0 && previous.byTeam.has(teamId)
          ? (previous.byTeam.get(teamId) ?? 0) / previous.total
          : current.total > 0
            ? revenueMad / current.total
            : 0,
      dasCount: rows.filter(
        (r) => r.teamId === teamId && r.roundNumber === roundNumber && r.revenueMad > 0,
      ).length,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Composition d'un domaine : les équipes, les installés, le non servi.
 *
 * Au premier tour joué il n'y a pas d'avant. Les équipes partent alors d'un
 * partage ÉGAL de la portion qu'elles se disputent — et non d'un tiers du
 * marché entier, qui ferait déborder la barre de ce que les installés
 * prélèvent pendant toute l'animation.
 */
export function dasComposition(
  dasId: string,
  rows: ShareInput[],
  summaries: DasSummary[],
  roundNumber: number,
): DasComposition {
  const summaryAt = (round: number) =>
    summaries.find((s) => s.dasId === dasId && s.roundNumber === round);

  const current = summaryAt(roundNumber);
  const previous = summaryAt(roundNumber - 1);

  const installedShare = current?.installedShare ?? 0;
  const unservedShare = current?.unservedShare ?? 0;

  const here = rows.filter((r) => r.dasId === dasId);
  const atRound = here.filter((r) => r.roundNumber === roundNumber);
  const before = new Map(
    here.filter((r) => r.roundNumber === roundNumber - 1).map((r) => [r.teamId, r.marketSharePct]),
  );

  const contested = Math.max(1 - installedShare - unservedShare, 0);
  const equalSplit = atRound.length > 0 ? contested / atRound.length : 0;

  const teams: TeamShare[] = atRound
    .map((row) => ({
      teamId: row.teamId,
      share: row.marketSharePct,
      previousShare: before.get(row.teamId) ?? equalSplit,
    }))
    .sort((a, b) => b.share - a.share);

  return {
    dasId,
    marketSizeMad: current?.marketSizeMad ?? 0,
    teams,
    installedShare,
    unservedShare,
    // Les trois tranches partent du tour précédent : interpoler une partition
    // de 1 vers une autre donne une partition de 1 à chaque image, donc une
    // barre qui reste pleine pendant toute l'animation. Faute de tour
    // précédent, elles ne bougent pas.
    previousInstalledShare: previous?.installedShare ?? installedShare,
    previousUnservedShare: previous?.unservedShare ?? unservedShare,
    total: sum(teams.map((t) => t.share)) + installedShare + unservedShare,
  };
}

/** Les domaines du pool, du plus gros marché au plus petit. */
export function dasOrder(rows: ShareInput[], summaries: DasSummary[], roundNumber: number): string[] {
  const ids = [...new Set(rows.filter((r) => r.roundNumber === roundNumber).map((r) => r.dasId))];
  const sizeOf = (dasId: string) =>
    summaries.find((s) => s.dasId === dasId && s.roundNumber === roundNumber)?.marketSizeMad ?? 0;
  return ids.sort((a, b) => sizeOf(b) - sizeOf(a) || a.localeCompare(b));
}

/**
 * Rang de palette d'une équipe, stable d'un domaine à l'autre et d'un tour au
 * suivant : la couleur suit le groupe, jamais son classement ni sa présence
 * dans tel domaine.
 */
export function colorIndexByTeam(rows: ShareInput[]): Map<string, number> {
  const ids = [...new Set(rows.map((r) => r.teamId))].sort((a, b) => a.localeCompare(b));
  return new Map(ids.map((id, index) => [id, index]));
}
