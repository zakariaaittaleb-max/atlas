'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

/**
 * Le déroulé de l'étape en cours, pour le facilitateur.
 *
 * La liste était la même pour tout tour au-delà de l'onboarding, et renvoyait
 * à des éléments qui n'existaient pas (« l'onglet Avancement », « le bouton
 * Projecteur en haut », des codes « TEAM-RED »). Elle suit maintenant l'état
 * réel de la session, et nomme les commandes telles qu'elles s'affichent.
 *
 * C'est une suite d'étapes : la liste est numérotée parce que l'ordre compte.
 */
const STEPS: Record<string, { title: string; steps: [string, string][] }> = {
  preparation: {
    title: 'Avant le tour 1',
    steps: [
      ['Distribuez les codes', 'Le code de session est en haut à droite ; chaque équipe a le sien dans le tableau d’avancement.'],
      ['Affichez le projecteur', '« Ouvrir le projecteur », en haut : il se met à jour seul à chaque résolution.'],
      ['Laissez l’onboarding se faire', 'Les équipes découvrent leurs écrans et commandent leurs premières études. Comptez 15 à 20 minutes.'],
      ['Ouvrez le tour 1', 'Depuis la barre de conduite, quand la salle est prête.'],
    ],
  },
  round_active: {
    title: 'Pendant le tour',
    steps: [
      ['Suivez l’avancement', 'Une équipe « En cours » a une décision manquante : le tableau dit laquelle.'],
      ['Annoncez la clôture', '« Dix minutes, puis on verrouille. » Prolongez si la salle débat utilement.'],
      ['Verrouillez', 'Toutes les équipes sont figées au même instant, prêtes ou non.'],
    ],
  },
  round_locked: {
    title: 'Tour verrouillé',
    steps: [
      ['Arbitrez la War Room', 'Onglet « Marché & crises » : un plan non arbitré s’applique tel que la carte est écrite.'],
      ['Résolvez', 'Le calcul prend quelques secondes. S’il échoue, rien n’est écrit et le motif s’affiche.'],
    ],
  },
  round_resolved: {
    title: 'Résultats publiés',
    steps: [
      ['Projetez le classement', 'Les équipes voient leur révélation au même instant.'],
      ['Débriefez', 'Onglet « Débriefing » : le simulateur et la cartographie expliquent pourquoi le moteur a rendu ce résultat.'],
      ['Ouvrez le tour suivant', 'Ou, à partir du tour 3, clôturez la session.'],
    ],
  },
  completed: {
    title: 'Session terminée',
    steps: [
      ['Exportez la session', 'Onglet « Débriefing » : un classeur de six onglets, décisions de toutes les équipes comprises.'],
    ],
  },
};

function stageOf(status: string): keyof typeof STEPS {
  if (status === 'round_active') return 'round_active';
  if (status === 'round_locked' || status === 'round_resolving') return 'round_locked';
  if (status === 'round_resolved') return 'round_resolved';
  if (status === 'completed') return 'completed';
  return 'preparation';
}

export function SessionBriefing({ status }: { status: string }) {
  const [open, setOpen] = useState(false);
  const stage = STEPS[stageOf(status)];

  return (
    <div className="rounded-xl border border-(--border) bg-(--surface)">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="deroule-etape"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-(--heading)">Déroulé : {stage.title.toLowerCase()}</span>
          <span className="block text-sm text-(--foreground-muted)">
            {stage.steps.length} étape{stage.steps.length > 1 ? 's' : ''} · {stage.steps.map(([t]) => t).join(' → ')}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-(--foreground-muted) transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <ol id="deroule-etape" hidden={!open} className="space-y-3 border-t border-(--border) px-5 py-4">
        {stage.steps.map(([title, text], index) => (
          <li key={title} className="flex gap-3 text-sm">
            <span
              aria-hidden
              className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--accent-subtle) font-mono text-sm font-semibold text-(--accent-text)"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{title}</span>
              <span className="mt-0.5 block text-(--foreground-muted)">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
