'use client';

/**
 * ATLAS — un terme technique, et son explication au survol.
 *
 * ── LE PARTI PRIS ──────────────────────────────────────────────────────────
 * On affiche le TERME EXACT — « charges d'exploitation », pas « ce que tout
 * cela a coûté » — et l'explication vient au survol ou au clavier. Une équipe
 * apprend ainsi le vocabulaire en le lisant, sans jamais rester bloquée devant.
 *
 * ── POURQUOI UN BOUTON, ET NON UN `title` ──────────────────────────────────
 * L'attribut `title` du navigateur est inaccessible au clavier, invisible sur
 * tactile, illisible sur vidéoprojecteur et non stylable. Ici l'infobulle est
 * un vrai élément : elle s'ouvre au survol ET au focus, se ferme à l'Échap,
 * et se laisse lire à trois mètres.
 *
 * Le déclencheur est un `<button>` : c'est le seul élément nativement
 * focusable et annoncé comme actionnable par un lecteur d'écran. `aria-describedby`
 * relie le terme à sa définition — le lecteur lit « charges d'exploitation,
 * tout ce que coûte l'activité du tour… » sans que l'utilisateur ait à
 * chercher.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { lookup } from '@/lib/glossary';

export function Term({ children, className = '' }: { children: string; className?: string }) {
  const entry = lookup(children);
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Un clic ailleurs referme : sur tactile, il n'y a pas de « sortie de survol ».
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  // Un terme absent du glossaire s'affiche tel quel plutôt que de casser la
  // page : l'oubli se voit au test de couverture, pas en salle.
  if (!entry) return <span className={className}>{children}</span>;

  return (
    <span ref={wrap} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="cursor-help border-b border-dotted border-current text-left"
        style={{ textUnderlineOffset: 3 }}
      >
        {children}
      </button>

      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 block w-72 rounded-lg border border-(--border) p-3 text-left shadow-lg"
          style={{ background: 'var(--surface)' }}
        >
          <span className="block text-sm leading-relaxed text-(--foreground)">
            {entry.definition}
          </span>
          <span
            className="mt-2 block border-t border-(--border) pt-2 text-sm leading-relaxed italic text-(--foreground-muted)"
          >
            {entry.example}
          </span>
        </span>
      ) : null}
    </span>
  );
}
