import 'server-only';

/**
 * ATLAS — la règle de RECONDUCTION des décisions, en un seul endroit.
 *
 * ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 * Les décisions se reconduisent : une équipe qui ne rouvre pas un écran garde
 * ce qu'elle avait arrêté à l'exercice précédent. C'est le comportement d'une
 * entreprise réelle, et c'est ce que l'interface promet — « Valider à nouveau
 * écrase par les valeurs affichées », « reconduit sciemment les choix de
 * l'exercice précédent ».
 *
 * Cette règle vivait DEUX FOIS, dans deux modules qui ne se parlaient pas :
 *
 *   • `decision-context.ts` — ce que l'équipe VOIT. Il retenait la dernière
 *     décision au plus tard au tour demandé, et retombait sur les défauts du
 *     domaine faute de mieux ;
 *   • `load-snapshot.ts` — ce que le moteur CALCULE. Il ne lisait que le tour
 *     courant et retombait sur des valeurs neutres codées en dur : domination
 *     par les coûts, prix au marché, AUCUN segment servi, budgets à zéro.
 *
 * L'écran montrait donc à l'équipe ses choix reconduits, et le moteur en
 * résolvait d'autres. Une équipe qui relisait sa stratégie, la jugeait bonne et
 * n'y touchait pas était calculée sur une stratégie qu'elle n'avait jamais
 * déclarée — et rien, ni à l'écran ni au débriefing, ne pouvait le révéler.
 *
 * Le défaut est resté invisible longtemps parce qu'une liste de segments vide
 * valait « marché entier » par un repli silencieux. Elle ferme désormais
 * l'accès au marché, ce qui rend l'écart visible — mais la bonne correction
 * n'est pas de rétablir le repli : c'est de ne plus avoir deux règles.
 */

type Row = Record<string, unknown>;

const roundOf = (row: Row): number => {
  const v = row.round_number;
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
};

/**
 * La ligne EN VIGUEUR à un tour donné : la plus récente au plus tard à ce tour.
 *
 * `null` quand l'équipe n'a jamais rien saisi — l'appelant décide alors du
 * défaut, qui dépend du domaine.
 */
export function latestAtMost<T extends Row>(rows: T[] | null | undefined, round: number): T | null {
  const eligible = (rows ?? []).filter((r) => roundOf(r) <= round);
  if (eligible.length === 0) return null;
  return eligible.reduce((acc, r) => (roundOf(r) > roundOf(acc) ? r : acc));
}

/**
 * Segments servis, jamais vides.
 *
 * Trois cas mènent à une liste vide, et aucun ne veut dire « je renonce au
 * marché » : une équipe qui n'a jamais ouvert l'écran, un domaine acquis dont
 * les clés héritées n'existent plus au catalogue, une saisie corrompue. On
 * retombe sur le premier segment du catalogue — le même défaut que
 * `dasDecisionDefaults` applique côté interface.
 */
export function servedSegmentsOrDefault(
  declared: readonly string[] | null | undefined,
  catalogueKeys: readonly string[],
): string[] {
  // On ne garde que les clés que le catalogue reconnaît : un segment supprimé
  // entre deux promotions ne doit pas ouvrir un marché qui n'existe plus.
  const known = (declared ?? []).filter((k) => catalogueKeys.includes(k));
  if (known.length > 0) return known;
  return catalogueKeys.slice(0, 1);
}

/**
 * Colonnes RH qui décrivent un GESTE du tour : elles ne se reconduisent jamais.
 *
 * Reconduire un recrutement, c'est recruter deux fois ; reconduire une
 * fermeture de site, c'est infliger le même choc de climat chaque tour. Le
 * bilan de compétences est une prestation commandée pour un exercice.
 */
const HR_GESTURES: Readonly<Record<string, number | string | boolean>> = {
  hire_operateurs: 0,
  hire_techniciens: 0,
  hire_experts: 0,
  hire_cadres: 0,
  layoffs: 0,
  internal_transfers_in: 0,
  restructuring: 'aucune',
  order_skills_audit: false,
};

/**
 * La décision RH EN VIGUEUR d'un domaine à un tour.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * Les décisions RH n'étaient lues qu'au tour courant, à l'écran comme dans le
 * moteur. Une équipe qui ne rouvrait pas l'écran d'organisation voyait son
 * salaire revenir à 5 800 DH et son budget de formation à zéro — et le moteur
 * résolvait bel et bien une formation nulle. « Ne rien changer » coûtait donc
 * la politique sociale de l'exercice précédent.
 *
 * Saisie ce tour : la ligne telle quelle. Sinon : les NIVEAUX de la dernière
 * décision connue — salaire, formation, orientation, demandes de financement —
 * et aucun geste. `null` quand le domaine n'a jamais rien saisi.
 *
 * `rows` doit être filtré à une équipe et un domaine.
 */
export function reconductHrDecision<T extends Row>(
  rows: T[] | null | undefined,
  round: number,
): Row | null {
  const latest = latestAtMost(rows, round);
  if (!latest) return null;
  if (roundOf(latest) === round) return latest;
  return { ...latest, ...HR_GESTURES, round_number: round };
}
