'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { InfoHint } from './info-hint';

/**
 * Section repliable : un titre, une statistique de synthèse, le détail dessous.
 *
 * Fermée par défaut : la statistique du titre suffit souvent à décider s'il
 * faut ouvrir. L'explication du titre est rangée derrière un « + », qui
 * s'ouvre sans replier ni déplier la section.
 *
 * Tout l'en-tête se clique ; au clavier, c'est le bouton du titre qui porte
 * `aria-expanded`. Le contenu fermé reste dans le DOM (masqué) : l'impression
 * le déplie, et un champ en cours de saisie ne perd pas son état.
 *
 * ── S'OUVRIR SUR UN LIEN ───────────────────────────────────────────────────
 * Un lien vers `#ancre` — celle de la section, ou d'un champ qu'elle contient —
 * ouvre la section, fait défiler jusqu'à la cible et la surligne un instant.
 * Sans cela, « Régler ce levier » menait vers un champ replié, donc invisible.
 */
export function Accordion({
  title,
  summary,
  hint,
  defaultOpen = false,
  anchor,
  children,
}: {
  title: string;
  /** La statistique qui résume le contenu, lisible sans ouvrir. */
  summary?: React.ReactNode;
  /** Explication du titre, affichée sous le « + ». Texte en ligne uniquement. */
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  /** Identifiant de la section, pour y mener par un lien. */
  anchor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    function reveal() {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash || !root.current) return;
      const target =
        hash === anchor ? root.current : root.current.querySelector<HTMLElement>(`#${CSS.escape(hash)}`);
      if (!target) return;

      setOpen(true);
      // Le temps que la section se déplie : on ne fait pas défiler vers un
      // élément encore masqué.
      window.setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.remove('flash-target');
        void target.offsetWidth;
        target.classList.add('flash-target');
      }, 60);
    }

    const frame = window.requestAnimationFrame(reveal);
    window.addEventListener('hashchange', reveal);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', reveal);
    };
  }, [anchor]);

  return (
    <section ref={root} id={anchor} className="accordion rounded-xl border border-(--border) bg-(--surface)">
      <div
        onClick={() => setOpen((value) => !value)}
        className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-(--surface-muted) ${
          open ? 'rounded-t-xl' : 'rounded-xl'
        }`}
      >
        <h3 className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
            className="text-left text-base font-semibold text-(--heading)"
          >
            {title}
          </button>
          {hint ? <InfoHint label={title}>{hint}</InfoHint> : null}
        </h3>
        {summary ? (
          <span className="tabular shrink-0 text-right font-mono text-sm font-medium text-(--foreground)">
            {summary}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={`h-5 w-5 shrink-0 text-(--foreground-muted) transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </div>
      <div
        id={id}
        className={`accordion-body border-t border-(--border) px-5 py-5 ${open ? 'is-open' : 'hidden'}`}
      >
        {children}
      </div>
    </section>
  );
}
