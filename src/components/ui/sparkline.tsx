/**
 * Ligne de tendance d'une carte d'indicateur.
 *
 * Aucun axe : elle ne sert qu'à dire « ça monte, ça descend, ça stagne » d'un
 * coup d'œil. La valeur exacte est juste au-dessus, et le tableau complet dans
 * la vue Analyste. Le point final est dessiné en HTML pour rester rond quelle
 * que soit la largeur de la carte.
 */
export function Sparkline({
  values,
  className = '',
  label,
}: {
  values: number[];
  className?: string;
  label: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  // 2 unités de marge haute et basse : le trait de 2 px ne se coupe pas au bord.
  const y = (v: number) => 30 - ((v - min) / span) * 28;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L100,32 L0,32 Z`;
  const last = values[values.length - 1];

  return (
    <div className={`relative h-8 w-full ${className}`} role="img" aria-label={label}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={area} fill="var(--accent)" fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--accent) ring-2 ring-(--surface)"
        style={{ left: '100%', top: `${(y(last) / 32) * 100}%` }}
      />
    </div>
  );
}
