'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

/**
 * Fenêtre modale, sur l'élément natif `<dialog>`.
 *
 * Le glossaire était une `div` posée au-dessus de la page : aucun rôle annoncé,
 * Échap sans effet, et la tabulation filait derrière le voile vers des champs
 * qu'on ne voyait plus. `showModal()` règle les trois d'un coup — le reste de la
 * page devient inerte, Échap ferme, et le focus revient au bouton d'ouverture.
 *
 * Un clic sur le voile ferme aussi : sur un vidéoprojecteur piloté à la souris,
 * aller chercher la croix est un geste de trop.
 *
 * À la fermeture, le focus revient sur `returnFocus`. Le navigateur le rend de
 * lui-même à l'élément qui l'avait — mais Safari ne donne pas le focus à un
 * bouton cliqué, et le clavier repartait alors du haut de la page.
 *
 * Les clics sont arrêtés au bord de la fenêtre. Ouverte depuis l'en-tête d'un
 * accordéon, elle le replierait sinon à chaque clic dans son contenu — React
 * propage les événements le long de l'arbre des composants, pas du DOM.
 */
export function Dialog({
  open, onClose, title, subtitle, children, footer, width = 'md', returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg';
  /** Le bouton qui a ouvert la fenêtre, où ramener le focus. */
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        returnFocus?.current?.focus();
      }}
      // Échap est géré ici plutôt que laissé au navigateur : Chrome ignore un
      // second « cancel » sans nouveau geste de l'utilisateur, et la fenêtre
      // restait alors ouverte sous un clavier qui insiste.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        ref.current?.close();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === ref.current) ref.current?.close();
      }}
      className={`m-auto max-h-[85dvh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-(--border) bg-(--surface) p-0 text-left font-normal text-(--foreground) shadow-xl backdrop:bg-black/50 open:flex ${
        width === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
      }`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-(--border) px-6 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-semibold text-(--heading)">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-(--foreground-muted)">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Fermer"
          className="-mt-1 -mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-(--foreground-muted) transition-colors hover:bg-(--surface-muted) hover:text-(--foreground)"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-(--border) px-6 py-4">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
