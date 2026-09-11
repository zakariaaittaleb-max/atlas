/**
 * ATLAS — le DAS sur lequel l'équipe travaille, partagé par tous les écrans.
 *
 * ── POURQUOI UNE PORTÉE GLOBALE ────────────────────────────────────────────
 * Les écrans empilaient auparavant tous les domaines les uns sous les autres.
 * À un DAS c'était invisible ; à trois, l'équipe faisait défiler une page de
 * six mètres et perdait de vue lequel elle était en train de piloter — quand
 * elle ne saisissait pas un prix sur le mauvais.
 *
 * Le pilotage se fait donc DOMAINE PAR DOMAINE : on choisit un DAS, on le
 * renseigne sur tous les volets, puis on passe au suivant. Ce module porte ce
 * choix, et il vaut pour toutes les fenêtres à la fois.
 *
 * ── POURQUOI UN COOKIE, ET NON `localStorage` ──────────────────────────────
 * Le serveur doit connaître le DAS actif AU MOMENT DU RENDU. Avec
 * `localStorage`, la page s'afficherait d'abord sur le premier domaine puis
 * basculerait après hydratation : un clignotement à chaque navigation, et
 * l'impression que l'application a oublié le choix. Le cookie est lu côté
 * serveur, donc la première image est déjà la bonne.
 *
 * Aucune donnée sensible n'y transite : c'est un identifiant de DAS que
 * l'équipe possède déjà, et le serveur le revalide contre son portefeuille
 * réel à chaque lecture — un cookie forgé ne donne accès à rien.
 *
 * Module client-safe : ni `server-only`, ni logique d'accès.
 */

export const DAS_COOKIE = 'atlas.das';

/** Un an : le choix doit survivre à la séance, pas à l'année scolaire. */
export const DAS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface DasOption {
  dasId: string;
  /** Ce qu'on affiche : la marque de l'équipe, ou le nom du secteur à défaut. */
  name: string;
  /** Le nom du secteur, toujours. Une marque ne remplace pas le métier. */
  activityName: string;
  /** La marque telle qu'elle est en base : `null` si l'équipe n'en a pas donné. */
  brandName: string | null;
  sectorKey: string;
  /** `listed_for_sale` : encore piloté, mais en vente. L'écran doit le dire. */
  status: 'active' | 'listed_for_sale';
  /** Tour d'entrée au portefeuille. 0 = reçu à la dotation. */
  launchedRound: number;
  /** Entré par acquisition ou par rachat, et non par la dotation initiale. */
  acquired: boolean;
}

export interface DasScope {
  das: DasOption[];
  /** Toujours un DAS du portefeuille, ou `null` si le portefeuille est vide. */
  activeDasId: string | null;
}

/**
 * Le DAS retenu parmi ceux du portefeuille.
 *
 * Un identifiant qui n'y figure plus — DAS cédé, cookie d'une autre session —
 * retombe sur le premier domaine plutôt que de laisser l'écran vide.
 */
export function resolveActiveDas(das: DasOption[], wanted: string | null | undefined): string | null {
  if (das.length === 0) return null;
  return das.some((d) => d.dasId === wanted) ? wanted! : das[0].dasId;
}
