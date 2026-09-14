'use client';

/**
 * Le glossaire d'Atlas, accessible depuis tous les écrans d'équipe.
 *
 * Il ne tenait que six entrées écrites à part, dont certaines fausses (« 7 plans
 * de décision », une capacité « en tonnes »), et n'était ouvert que depuis la
 * stratégie. Il se construit désormais sur la même source que les infobulles
 * des termes (`lib/glossary.ts`) : une définition, un exemple chiffré, et une
 * seule vérité quel que soit l'endroit où l'on apprend le mot.
 *
 * Posé sur `Dialog` : rôle, Échap et piège de tabulation compris. La recherche
 * ignore accents et formes d'apostrophe — « differenciation » trouve
 * « Différenciation ».
 */

import { BookOpen, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Dialog } from '@/components/ui/dialog';
import { GLOSSARY } from '@/lib/glossary';

const ENTRIES = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b, 'fr'));

const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ]/g, "'").toLowerCase();

export function GlossaryModal({
  open, onClose, returnFocus,
}: { open: boolean; onClose: () => void; returnFocus?: React.RefObject<HTMLElement | null> }) {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return ENTRIES;
    return ENTRIES.filter(([term, entry]) => fold(term).includes(q) || fold(entry.definition).includes(q));
  }, [query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      returnFocus={returnFocus}
      title="Glossaire d’Atlas"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-(--accent) px-4 py-2.5 font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
        >
          Fermer
        </button>
      }
    >
      <label htmlFor="glossaire-recherche" className="sr-only">Rechercher un terme</label>
      <div className="relative mb-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--foreground-muted)"
        />
        <input
          id="glossaire-recherche"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="DAS, marge, BCG…"
          className="w-full rounded-lg border border-(--border) bg-(--surface) py-2 pr-3 pl-9 text-sm"
        />
      </div>
      <p role="status" className="mb-1 text-sm text-(--foreground-muted)">
        {shown.length === 0
          ? 'Aucun terme ne correspond.'
          : `${shown.length} terme${shown.length > 1 ? 's' : ''}`}
      </p>

      <dl className="divide-y divide-(--border)">
        {shown.map(([term, entry]) => (
          <div key={term} className="py-3">
            <dt className="font-semibold text-(--foreground)">{term}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-(--foreground-muted)">{entry.definition}</dd>
            <dd className="mt-1 text-sm leading-relaxed">
              <span className="font-medium">Exemple : </span>
              {entry.example}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export function GlossaryButton() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-(--foreground-muted) transition-colors hover:bg-(--surface-muted) hover:text-(--foreground)"
      >
        <BookOpen aria-hidden className="h-4 w-4" />
        Glossaire
      </button>
      <GlossaryModal open={open} onClose={() => setOpen(false)} returnFocus={trigger} />
    </>
  );
}
