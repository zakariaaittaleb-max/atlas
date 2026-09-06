'use client';

import { useCallback, useState } from 'react';

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

export function GlossaryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleTerm = useCallback((term: string) => {
    setExpanded(exp => exp === term ? null : term);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl bg-(--surface) shadow-lg">
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Concepts clés d\'Atlas</h2>
          <button
            onClick={onClose}
            className="text-sm text-(--foreground-muted) hover:text-(--foreground) transition"
          >
            ✕
          </button>
        </div>

        <div className="divide-y divide-(--border)">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="px-6 py-4">
              <button
                onClick={() => toggleTerm(item.term)}
                className="w-full text-left flex items-center justify-between gap-3 hover:bg-(--surface-hover) p-2 rounded transition"
              >
                <div>
                  <div className="font-semibold text-(--foreground)">{item.title}</div>
                  <div className="text-xs text-(--foreground-muted)">({item.term})</div>
                </div>
                <span className="text-lg flex-shrink-0">{expanded === item.term ? "−" : "+"}</span>
              </button>
              {expanded === item.term && (
                <p className="mt-3 text-sm text-(--foreground-muted) ml-2 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-(--surface) border-t border-(--border) px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-(--primary) text-white rounded-lg font-medium hover:bg-(--primary-hover) transition"
          >
            Compris !
          </button>
        </div>
      </div>
    </div>
  );
}

export function GlossaryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm text-(--foreground-muted) hover:text-(--foreground) transition underline"
      >
        <span>?</span> Concepts clés
      </button>
      <GlossaryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
