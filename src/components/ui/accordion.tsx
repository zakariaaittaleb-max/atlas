import { ChevronDown } from 'lucide-react';

/**
 * Section repliable : un titre, une statistique de synthèse, le détail dessous.
 *
 * Fermée par défaut : la statistique du titre suffit souvent à décider s'il
 * faut ouvrir. Bâtie sur `<details>` — clavier, lecteur d'écran et absence de
 * JavaScript fonctionnent sans rien ajouter.
 */
export function Accordion({
  title,
  summary,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** La statistique qui résume le contenu, lisible sans ouvrir. */
  summary?: React.ReactNode;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="accordion group rounded-xl border border-(--border) bg-(--surface) [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 rounded-xl px-5 py-4 transition-colors duration-150 hover:bg-(--surface-muted)">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-(--heading)">{title}</span>
          {hint ? (
            <span className="mt-0.5 block max-w-3xl text-sm text-(--foreground-muted)">{hint}</span>
          ) : null}
        </span>
        {summary ? (
          <span className="tabular shrink-0 text-right font-mono text-sm font-medium text-(--foreground)">
            {summary}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-(--foreground-muted) transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="accordion-body border-t border-(--border) px-5 py-5">{children}</div>
    </details>
  );
}
