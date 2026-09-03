import 'server-only';

/**
 * ATLAS — contrats amont et aval hérités de l'exercice precedent.
 *
 * ── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 * Une equipe ne cree pas son entreprise : elle en prend les commandes apres
 * deux exercices clos. Une entreprise qui a vendu pendant deux ans a
 * necessairement des fournisseurs et des distributeurs. Demarrer a zero
 * contrat n'etait pas une simplification, c'etait une incoherence : la
 * premiere annee, l'equipe produisait sans acheter et vendait sans reseau.
 *
 * ── LE CHOIX EST DELIBEREMENT IMPARFAIT ────────────────────────────────────
 * La position heritee n'est pas optimale, et c'est le propos. Le predecesseur
 * a fait des choix defendables mais dates :
 *
 *   • un fournisseur regional fiable en principal, double d'un discounter —
 *     la configuration classique d'une PME industrielle marocaine : de la
 *     securite, et une soupape de prix. Le champion qualite n'est pas
 *     reference : montee en gamme jamais engagee.
 *   • un grossiste regional et un reseau de proximite en aval — environ 52 %
 *     de couverture. Ni la grande surface (dont le volume minimal est hors de
 *     portee au depart), ni la plateforme e-commerce.
 *
 * L'equipe herite donc d'un diagnostic a faire, pas d'un optimum a conserver.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** Repartition amont heritee, par archetype de fournisseur. Somme = 1. */
export const INHERITED_SUPPLY_MIX: Record<string, number> = {
  regional_fiable: 0.7,
  discounter: 0.3,
};

/** Repartition aval heritee, par archetype de distributeur. Somme <= 1. */
export const INHERITED_CHANNEL_MIX: Record<string, number> = {
  grossiste_regional: 0.6,
  reseau_proximite: 0.4,
};

export interface InheritedContracts {
  procurement: { supplierId: string; committedVolume: number }[];
  distribution: { distributorId: string; volumeShare: number }[];
}

/**
 * Construit les contrats herites a partir des acteurs reellement crees.
 *
 * `actorIdByArchetype` ne contient que les acteurs du DAS de depart. Un
 * archetype absent est ignore sans bruit : le mix est renormalise sur ce qui
 * existe, de sorte qu'un ecosysteme reduit ne produise jamais une equipe sans
 * fournisseur — ce que ce module a precisement pour but d'empecher.
 */
export function buildInheritedContracts(
  actorIdByArchetype: { suppliers: Map<string, string>; distributors: Map<string, string> },
  volumeUnits: number,
): InheritedContracts {
  const procurement = distribute(
    INHERITED_SUPPLY_MIX,
    actorIdByArchetype.suppliers,
  ).map(([supplierId, share]) => ({
    supplierId,
    committedVolume: Number((volumeUnits * share).toFixed(2)),
  }));

  const distribution = distribute(
    INHERITED_CHANNEL_MIX,
    actorIdByArchetype.distributors,
  ).map(([distributorId, share]) => ({
    distributorId,
    volumeShare: Number(share.toFixed(4)),
  }));

  return { procurement, distribution };
}

/**
 * Renormalise un mix sur les archetypes effectivement presents.
 *
 * Sans cette renormalisation, un ecosysteme ampute laisserait l'equipe avec
 * 70 % de son volume approvisionne et 30 % dans le vide — une rupture que
 * personne n'a decidee.
 */
function distribute(
  mix: Record<string, number>,
  available: Map<string, string>,
): [string, number][] {
  const present = Object.entries(mix).filter(([archetype]) => available.has(archetype));
  const total = present.reduce((acc, [, share]) => acc + share, 0);
  if (total <= 0) return [];

  return present.map(([archetype, share]) => [available.get(archetype)!, share / total]);
}
