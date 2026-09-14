/**
 * ATLAS — répartir la trésorerie du Groupe entre ses domaines, en parts.
 *
 * ── CE QUE LE MOTEUR CONNAÎT ───────────────────────────────────────────────
 * Des TRANSFERTS signés par domaine, de somme nulle : ce que l'un reçoit, un
 * autre le cède. Saisis en dirhams, ils ne disaient rien de la part de chaque
 * domaine dans ce que le Groupe possède — « 1,2 Md » est une aumône ou une
 * saignée selon la trésorerie et la taille du domaine.
 *
 * ── CE QUE L'ÉCRAN MONTRE ──────────────────────────────────────────────────
 * Une RÉPARTITION de la trésorerie d'ouverture, en pourcentage, à partir d'une
 * référence : chaque domaine au prorata de son chiffre d'affaires. S'écarter
 * de la référence, c'est transférer :
 *
 *     transfert = (part choisie − part de référence) × trésorerie d'ouverture
 *
 * Les parts somment à 100 % des deux côtés, donc les transferts à zéro — la
 * règle du moteur tient par construction, sans qu'aucun solde ne soit à
 * corriger. Module client-safe, sans état.
 */

/** Parts de référence : au prorata des poids connus, à parts égales sinon. */
export function referenceShares(weights: (number | null)[]): number[] {
  if (weights.length === 0) return [];
  const clean = weights.map((w) => (w !== null && Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((acc, w) => acc + w, 0);
  if (total <= 0) return clean.map(() => 1 / clean.length);
  return clean.map((w) => w / total);
}

/** Les parts qu'induisent des transferts déjà saisis. */
export function sharesFromTransfers(reference: number[], transfers: number[], baseMad: number): number[] {
  if (baseMad <= 0) return [...reference];
  return reference.map((r, i) => clamp01(r + (transfers[i] ?? 0) / baseMad));
}

/**
 * Porte la part d'un domaine à `target`, les autres absorbant l'écart au
 * prorata de leur part : un domaine qu'on n'a pas touché garde son rang
 * relatif, et le total reste à 100 %.
 */
export function moveShare(shares: number[], index: number, target: number): number[] {
  if (shares.length <= 1) return shares.map(() => 1);
  const next = clamp01(target);
  const delta = next - shares[index];
  const others = shares.reduce((acc, s, i) => (i === index ? acc : acc + s), 0);

  const moved = shares.map((s, i) => {
    if (i === index) return next;
    if (others <= 0) return Math.max(-delta / (shares.length - 1), 0);
    return Math.max(s - delta * (s / others), 0);
  });

  // Garde-fou d'arrondi flottant : le total revient exactement à 1.
  const total = moved.reduce((acc, s) => acc + s, 0);
  return total > 0 ? moved.map((s) => s / total) : moved;
}

/**
 * Les transferts en dirhams, arrondis à l'unité, de somme EXACTEMENT nulle :
 * le résidu d'arrondi est porté par le mouvement le plus important, où il est
 * imperceptible.
 */
export function transfersFromShares(reference: number[], shares: number[], baseMad: number): number[] {
  const amounts = shares.map((s, i) => Math.round((s - (reference[i] ?? 0)) * baseMad));
  const residual = amounts.reduce((acc, a) => acc + a, 0);
  if (residual !== 0 && amounts.length > 0) {
    let largest = 0;
    amounts.forEach((a, i) => {
      if (Math.abs(a) > Math.abs(amounts[largest])) largest = i;
    });
    amounts[largest] -= residual;
  }
  return amounts.map((a) => (Object.is(a, -0) ? 0 : a));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
