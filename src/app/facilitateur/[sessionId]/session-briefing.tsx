'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface SessionBriefingProps {
  roundNumber: number;
}

export function SessionBriefing({ roundNumber }: SessionBriefingProps) {
  const [open, setOpen] = useState(false);
  const isFirstRound = roundNumber === 0;

  return (
    <div className="mb-6 rounded-xl border border-(--border) bg-(--surface-alt) p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 flex-shrink-0 text-(--accent)" />
          <div className="text-sm">
            <p className="font-semibold">
              {isFirstRound ? "Avant de démarrer" : `Tour ${roundNumber}`}
            </p>
            <p className="text-xs text-(--foreground-muted)">
              {isFirstRound ? "Checklist de démarrage" : "Étapes de ce tour"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-(--foreground-muted) transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-(--border) pt-4">
          {isFirstRound ? (
            <>
              <Item
                icon="✅"
                title="Connectez les équipes"
                text={"Onglet « Avancement » — vérifiez que toutes les équipes sont en vert (« Connectés »)"}
              />
              <Item
                icon="📋"
                title="Montrez le tableau de bord Projecteur"
                text="Lancez le Projecteur depuis le bouton en haut. Affichez-le au mur pour que tous voient le classement et l'avancement."
              />
              <Item
                icon="📖"
                title="Expliquez la structure aux équipes"
                text={"Chaque équipe a 3-4 sections à remplir : Groupe, DAS, RH, Filière. Laissez-leur 15 min pour la première fois (plus long)."}
              />
              <Item
                icon="🎯"
                title="Lisez les codes d'équipe à voix haute"
                text={"Avant de commencer, appelez chaque équipe par son code (TEAM-RED, etc.) pour qu'elle sache qu'on parle d'elle."}
              />
            </>
          ) : (
            <>
              <Item
                icon="⏱️"
                title="Attendez 15-20 minutes"
                text={`Laissez les équipes saisir leurs décisions. Annoncez : « Vous avez 15 minutes, puis on gèle. »`}
              />
              <Item
                icon="🔍"
                title={"Regardez l'onglet « Avancement »"}
                text={"Colonne « Décisions » — si une équipe affiche « 2/3 », elle manque un domaine. Allez la voir."}
              />
              <Item
                icon="🔒"
                title="Verrouille les décisions"
                text={'Cliquez sur « Verrouiller les décisions du tour ». Confirmation requise — c{"\'"}est irréversible.'}
              />
              <Item
                icon="⚡"
                title="Résous le tour"
                text={'Cliquez sur « Résoudre ce tour ». Attends 3-5 sec. Regarde le statut : ✅ (succès) ou ❌ (erreur).'}
              />
              <Item
                icon="📊"
                title="Projette les résultats"
                text="Dans le Projecteur, montre les nouveaux classements, finances, et alignements. Laisse 3-5 min de discussion."
              />
              <Item
                icon="💡"
                title="Utilise les outils pédagogiques (optionnel)"
                text={"Si une équipe conteste, ouvre le Simulateur pour montrer le calcul exact ou la Cartographie du moteur."}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Item({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="flex-shrink-0 text-lg">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-(--foreground-muted) leading-relaxed mt-1">
          {text}
        </p>
      </div>
    </div>
  );
}
