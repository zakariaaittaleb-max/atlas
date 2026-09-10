/**
 * Couleurs de groupe.
 *
 * Une couleur par équipe, stable d'un écran à l'autre : la même dans la barre
 * de présence d'un participant, dans le tableau du facilitateur et sur le
 * projecteur. Elle est attribuée par RANG de l'équipe dans sa session (ordre
 * alphabétique), jamais par identifiant — deux sessions se ressemblent ainsi,
 * et un facilitateur qui anime deux ateliers ne réapprend pas un code couleurs.
 *
 * Chaque couleur porte un NOM. Le reste de l'application s'interdit déjà de
 * faire porter une information par la seule couleur (voir la pastille d'état
 * dans `team-nav.tsx`) : sur un vidéoprojecteur délavé, comme pour un daltonien,
 * « Équipe Atlas · ocre » reste lisible là où une gommette jaune ne l'est plus.
 */

export interface TeamColor {
  /** Valeur CSS, utilisable telle quelle en `style={{ color }}`. */
  hex: string;
  /** Nom français de la teinte, à afficher à côté de la pastille. */
  label: string;
}

/**
 * Huit teintes de luminance moyenne : elles tiennent sur le fond clair comme
 * sur le fond sombre sans avoir à décliner deux palettes. Elles sont espacées
 * en teinte ET en clarté, pour rester distinguables en deutéranopie.
 */
const PALETTE: readonly TeamColor[] = [
  { hex: '#1d4e6b', label: 'bleu' },
  { hex: '#a3572b', label: 'terre cuite' },
  { hex: '#1a6b3c', label: 'vert' },
  { hex: '#6b3f8a', label: 'violet' },
  { hex: '#b58a00', label: 'ocre' },
  { hex: '#7a1f3d', label: 'grenat' },
  { hex: '#2b7d86', label: 'sarcelle' },
  { hex: '#4a5a24', label: 'olive' },
];

export const TEAM_COLOR_COUNT = PALETTE.length;

/** Couleur d'une équipe d'après son rang dans la session (0 = première). */
export function teamColor(rank: number): TeamColor {
  // Au-delà de huit équipes la palette recycle ses teintes : mieux vaut deux
  // groupes de la même couleur, distingués par leur nom, qu'une neuvième teinte
  // trop proche d'une autre pour être fiable en salle.
  const index = ((rank % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[index];
}

/**
 * Attribue une couleur à chaque équipe d'une session, par ordre alphabétique
 * de nom. Les appelants passent la liste telle qu'ils l'ont — l'ordre de la
 * requête ne doit pas décider de la couleur, sans quoi elle changerait au gré
 * des tris de chaque écran.
 */
export function assignTeamColors<T extends { id: string; name: string }>(
  teams: readonly T[],
): (T & { color: TeamColor })[] {
  const ranks = new Map(
    [...teams]
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((team, rank) => [team.id, rank]),
  );

  return teams.map((team) => ({ ...team, color: teamColor(ranks.get(team.id) ?? 0) }));
}
