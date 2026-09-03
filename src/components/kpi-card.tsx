import type { Delta } from '@/lib/format';

/**
 * Carte d'indicateur.
 *
 * Règle de conception imposée (doc 00 §8) : **chaque KPI affiche sa variation
 * par rapport au tour précédent, jamais une valeur brute isolée.** Une
 * trésorerie de 38 M DH ne dit rien ; « 38 M DH, ↓ −7 M » dit tout.
 *
 * La direction est portée par une flèche ET un signe en plus de la couleur :
 * l'information ne doit jamais reposer sur la seule teinte, y compris sur un
 * vidéoprojecteur qui délave les contrastes.
 */
export function KpiCard({
  label,
  value,
  delta,
  hint,
  /** Pour un indicateur où la baisse est une bonne nouvelle (coût, pression). */
  invertPolarity = false,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  hint?: string;
  invertPolarity?: boolean;
}) {
  const favourable =
    delta && delta.direction !== 'flat'
      ? invertPolarity
        ? delta.direction === 'down'
        : delta.direction === 'up'
      : null;

  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <p className="text-sm font-medium text-(--foreground-muted)">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</p>

      {delta ? (
        <p
          className="tabular mt-2 text-sm font-medium"
          style={{
            color:
              favourable === null
                ? 'var(--foreground-muted)'
                : favourable
                  ? 'var(--positive)'
                  : 'var(--negative)',
          }}
        >
          {delta.label}
          <span className="ml-1.5 font-normal text-(--foreground-muted)">vs tour précédent</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-(--foreground-muted)">Premier tour — pas de comparaison</p>
      )}

      {hint ? <p className="mt-3 text-sm text-(--foreground-muted)">{hint}</p> : null}
    </div>
  );
}
