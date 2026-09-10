'use client';

/**
 * Le rendu d'un livrable de cabinet.
 *
 * Jusqu'ici un livrable ne se lisait qu'en téléchargeant un classeur : une
 * équipe qui venait d'acheter une étude devait sortir du jeu pour la consulter,
 * puis revenir décider de mémoire. Ce composant l'affiche là où la décision se
 * prend.
 *
 * ── L'HONNÊTETÉ DU CHIFFRE EST PORTÉE PAR L'AFFICHAGE ──────────────────────
 * Le cabinet vend des ESTIMATIONS, et le moteur les bruite délibérément selon
 * le palier payé. Afficher « 412 M DH » sans dire « ±15 % » transformerait une
 * estimation en vérité, ce qui est exactement l'erreur que la simulation veut
 * faire commettre puis débriefer — mais elle doit être commise en connaissance
 * de cause, pas par défaut d'affichage.
 *
 * Quatre régimes, et chacun dit ce qu'il vaut : `exact` (sans bruit),
 * `estimate` (valeur ± marge), `band` (une fourchette qualitative, tout ce que
 * paie un palier bon marché) et `withheld` (non couvert, avec la raison).
 */

import { formatMadCompact, formatScore, formatUnits } from '@/lib/format';
import type { FieldDisclosure } from '@/lib/consulting-types';

export function DisclosureList({ fields }: { fields: FieldDisclosure[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-(--foreground-muted)">
        Ce livrable ne contient aucun champ exploitable.
      </p>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key}>
          <dt className="text-xs text-(--foreground-muted)">{field.label}</dt>
          <dd className="tabular text-sm">
            <Value field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Value({ field }: { field: FieldDisclosure }) {
  if (field.mode === 'withheld') {
    return (
      <span className="text-(--foreground-muted)">
        non couvert
        <span className="ml-1 text-xs">— {field.reason}</span>
      </span>
    );
  }

  if (field.mode === 'band') {
    return (
      <>
        <strong>{field.band}</strong>
        <span className="ml-2 text-xs text-(--foreground-muted)">
          {show(field.lower, field.unit)} à {show(field.upper, field.unit)}
        </span>
      </>
    );
  }

  if (field.mode === 'estimate') {
    return (
      <>
        <strong>{show(field.value, field.unit)}</strong>
        <span className="ml-2 text-xs text-(--foreground-muted)">
          ±{Math.round(field.errorMargin * 100)} %
        </span>
      </>
    );
  }

  return <strong>{show(field.value, field.unit)}</strong>;
}

/**
 * Un chiffre divulgué, lisible.
 *
 * Le bruit du cabinet produit des décimales sur des grandeurs qui n'en ont
 * pas : « 57601,5 » salariés, « 829206947,2 » unités de capacité. Au-delà du
 * millier on compte donc en entiers groupés ; en dessous, la décimale porte
 * l'information — un score de 32,1 n'est pas un score de 32.
 */
function show(value: number, unit: string | undefined): string {
  if (unit === 'DH') return formatMadCompact(value);
  if (unit === '%') return `${formatScore(value, 1)} %`;
  if (Math.abs(value) >= 1000) return formatUnits(Math.round(value));
  return formatScore(value, 1);
}
