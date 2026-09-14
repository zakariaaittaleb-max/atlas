import { dasColor } from '@/lib/das-color';

/** La puce de couleur d'un DAS, à poser devant son nom partout où il apparaît. */
export function DasDot({ seed, className = '' }: { seed: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={{ background: dasColor(seed).dot }}
    />
  );
}
