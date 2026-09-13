'use client';

import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Une explication rangée derrière un « + ».
 *
 * ── POURQUOI ───────────────────────────────────────────────────────────────
 * Les écrans empilaient sous chaque champ une phrase d'aide. Chacune était
 * juste ; ensemble elles noyaient la décision, et une équipe pressée finissait
 * par ne plus rien lire. Le texte reste à un geste — survol ou clic — et
 * l'écran ne montre plus que ce qui se décide.
 *
 * ── COMPORTEMENT ───────────────────────────────────────────────────────────
 * Le survol ouvre, le clic épingle (indispensable sur tactile et sur un
 * vidéoprojecteur piloté à la souris), Échap ou un clic ailleurs referme.
 * Le « + » pivote en « × » quand la bulle est ouverte : l'état se voit sans
 * dépendre de la couleur.
 *
 * Le contenu doit rester du texte en ligne (`span`, `strong`, `a`) : la bulle
 * peut être posée dans un titre, une légende ou un paragraphe.
 */
export function InfoHint({
  label,
  children,
  className = '',
}: {
  /** Ce que la bulle explique, pour le lecteur d'écran : « En savoir plus : … ». */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const open = pinned || hovered;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setHovered(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Près du bord droit, la bulle s'ouvre vers la gauche plutôt que de sortir
  // de l'écran.
  function place() {
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) setAlignEnd(rect.left > window.innerWidth - 320);
  }

  return (
    <span
      ref={wrap}
      className={`relative inline-flex shrink-0 align-middle ${className}`}
      onMouseEnter={() => { place(); setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`En savoir plus : ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          // Posée dans un en-tête cliquable ou un <label>, la bulle ne doit ni
          // replier la section ni activer le champ.
          event.preventDefault();
          event.stopPropagation();
          place();
          setPinned((value) => !value);
        }}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-[transform,background-color,border-color,color] duration-200 ${
          open
            ? 'rotate-45 border-(--accent) bg-(--accent) text-(--on-accent)'
            : 'border-(--border-strong) bg-(--surface) text-(--foreground-muted) hover:border-(--accent) hover:text-(--accent-text)'
        }`}
      >
        <Plus aria-hidden className="h-3 w-3" strokeWidth={3} />
      </button>

      {open ? (
        <span
          id={id}
          role="note"
          onClick={(event) => event.stopPropagation()}
          className={`reveal absolute top-full z-40 mt-2 block w-80 max-w-[calc(100vw-2rem)] cursor-auto rounded-lg border border-(--border) bg-(--surface) p-3.5 text-left text-sm leading-relaxed font-normal tracking-normal text-(--foreground) normal-case shadow-lg before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:content-[''] ${
            alignEnd ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
