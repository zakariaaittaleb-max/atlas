/**
 * Égalité structurelle des valeurs de saisie.
 *
 * Sert à répondre à une seule question : « ce bloc a-t-il changé depuis
 * l'ouverture du tour ? » — celle qui décide si « Réinitialiser » a quelque
 * chose à défaire.
 *
 * La comparaison est volontairement naïve : les charges utiles des écrans sont
 * des objets JSON plats de quelques champs, sans date, sans `Map`, sans cycle.
 * Une bibliothèque d'égalité profonde serait de la dépendance sans contrepartie.
 *
 * Les tableaux sont comparés DANS L'ORDRE. C'est voulu pour les segments servis
 * et les listes de contrats : l'ordre y est celui des choix de l'équipe, et
 * l'écran le restitue tel quel.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;

  return ka.every((k) =>
    Object.prototype.hasOwnProperty.call(b, k) &&
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
