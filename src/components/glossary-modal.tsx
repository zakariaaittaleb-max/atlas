'use client';

import { BookOpen, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Dialog } from '@/components/ui/dialog';

const GLOSSARY = [
  {
    term: 'DAS',
    title: 'Domaine d\'Activité Stratégique',
    description: 'Un métier ou une branche d\'activité distincts. Votre entreprise peut en opérer plusieurs (ex: Électronique, Textiles, Services). Chaque DAS a ses propres décisions de prix, investissements, stratégie.',
  },
  {
    term: 'Indice d\'Alignement',
    title: 'L\'alignement de votre stratégie',
    description: 'Mesure si vos 7 plans de décision travaillent ensemble. Entre 0-100. Un score faible = vos choix se contredisent (ex: prix bas + fort marketing). Le Cabinet Conseil détaille où améliorer.',
  },
  {
    term: 'PESTEL',
    title: 'Les 6 facteurs externes',
    description: 'Politique, Économique, Social, Technologique, Environnemental, Légal. Le jeu simule comment ces facteurs affectent votre marché régional. Certains vous aident, d\'autres vous freinent.',
  },
  {
    term: 'Balanced Scorecard',
    title: 'Le tableau de bord complet',
    description: '4 axes : Financier (profit, trésorerie), Client (part de marché), Processus (qualité), Apprentissage (innovation). Aucun n\'est plus important que les autres — une bonne gestion équilibre les 4.',
  },
  {
    term: 'Dotation',
    title: 'Votre budget initial',
    description: 'Montant d\'argent (en millions de dirhams) disponible au début du jeu pour investir, rembourser vos dettes, ou constituer une réserve. Gérée comme une vraie trésorerie.',
  },
  {
    term: 'Capacité',
    title: 'Votre production maximale',
    description: 'Mesurée en tonnes. Dépend de votre outil de production. Si la demande > capacité, vous perdez des ventes. Investir en capacité prend 1 tour pour être effectif.',
  },
];

/**
 * Le glossaire des concepts clés.
 *
 * Posé sur `Dialog` : c'était une `div` par-dessus la page, sans rôle, sans
 * Échap, et dont la tabulation s'échappait vers les champs cachés derrière.
 * Chaque terme se déplie par un bouton qui annonce son état.
 */
export function GlossaryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Concepts clés d’Atlas"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-(--accent) px-4 py-2.5 font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
        >
          Compris
        </button>
      }
    >
      <ul className="-my-2 divide-y divide-(--border)">
        {GLOSSARY.map((item, index) => {
          const isOpen = expanded === item.term;
          const panelId = `glossaire-${index}`;
          return (
            <li key={item.term} className="py-2">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setExpanded(isOpen ? null : item.term)}
                className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:bg-(--surface-muted)"
              >
                <span>
                  <span className="block font-semibold text-(--foreground)">{item.title}</span>
                  <span className="block text-sm text-(--foreground-muted)">{item.term}</span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={`h-5 w-5 shrink-0 text-(--foreground-muted) transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <p
                id={panelId}
                hidden={!isOpen}
                className="mt-1 mb-2 px-2 text-sm leading-relaxed text-(--foreground-muted)"
              >
                {item.description}
              </p>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

export function GlossaryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-(--foreground-muted) underline underline-offset-4 transition-colors hover:text-(--foreground)"
      >
        <BookOpen aria-hidden className="h-4 w-4" />
        Concepts clés
      </button>
      <GlossaryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
