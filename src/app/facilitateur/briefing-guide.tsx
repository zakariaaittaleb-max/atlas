'use client';

import { useState } from 'react';
import { ChevronDown, BookOpen } from 'lucide-react';

export function BriefingGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8 rounded-xl border border-(--border) bg-(--surface-alt) p-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 flex-shrink-0 text-(--accent)" />
          <div>
            <h2 className="text-lg font-semibold">Guide d&apos;animation</h2>
            <p className="text-sm text-(--foreground-muted)">
              Étapes à suivre avant et pendant votre atelier
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-(--foreground-muted) transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="mt-6 space-y-8 border-t border-(--border) pt-6">
          {/* PHASE 1: PRÉPARATION */}
          <Section
            phase={1}
            title="Préparation avant l&apos;atelier (J-1)"
            color="bg-(--surface-muted) text-(--foreground)"
          >
            <Step number={1} title="Créez votre session">
              <p>
                Cliquez sur <strong>&laquo;&nbsp;Créer une session&nbsp;&raquo;</strong> et renseignez :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>
                  📝 <strong>Nom de la session</strong> : ex. &quot;Master MSC - Promo 2026&quot;
                </li>
                <li>
                  🏭 <strong>Secteurs</strong> : sélectionnez 2-3 secteurs parmi (agro,
                  BTP, tourisme, équipement, retail, textile, énergie, numérique)
                </li>
                <li>
                  🎚️ <strong>Difficulté</strong> : &quot;standard&quot; pour débuter, &quot;expert&quot; pour
                  une promo avancée
                </li>
                <li>
                  📊 <strong>Nombre de tours</strong> : 3-6 tours (durée : ~1h par 2 tours)
                </li>
              </ul>
              <div className="mt-4 rounded-lg bg-(--surface) p-4 border border-(--border)">
                <p className="text-xs font-medium text-(--foreground-muted) uppercase">
                  Résultat
                </p>
                <p className="mt-2 text-sm">
                  Vous recevez un <strong>code de session</strong> (ex. ABC123) à afficher
                  ou projeter. Les équipes l&apos;utilisent pour rejoindre.
                </p>
              </div>
            </Step>

            <Step number={2} title="Distribuez les codes d&apos;équipe">
              <p>
                Depuis la fiche de votre session, chaque équipe a un <strong>code d&apos;accès personnel</strong>.
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>
                  📋 Imprimez ou projetez les 4-6 codes d&apos;équipe (ex. TEAM-RED, TEAM-BLUE)
                </li>
                <li>
                  🎯 Assignez un code à chaque table (une équipe = 3-4 personnes)
                </li>
                <li>
                  📱 Les équipes doivent se connecter via <code className="text-xs">Atlas.com/rejoindre</code> avant
                  que vous ne lanciez le tour 1
                </li>
              </ul>
            </Step>

            <Step number={3} title="Vérifiez la connectivité">
              <p>
                Dans votre tableau de bord (&laquo;&nbsp;Piloter&nbsp;&raquo;), onglet <strong>&laquo;&nbsp;Avancement des équipes&nbsp;&raquo;</strong> :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>✅ Toutes les équipes doivent apparaître en vert avec &quot;Connectés&quot;</li>
                <li>⏳ Si une équipe traîne, allez lui demander de se reconnecter</li>
              </ul>
            </Step>
          </Section>

          {/* PHASE 2: DÉMARRAGE */}
          <Section
            phase={2}
            title="Démarrage du tour (à chaque début de cycle)"
            color="bg-green-100 text-(--foreground)"
          >
            <Step number={1} title="Vérifiez que toutes les décisions du tour précédent sont faites">
              <p>
                Onglet <strong>&laquo;&nbsp;Avancement des équipes&nbsp;&raquo;</strong> — colonne <strong>&laquo;&nbsp;Décisions&nbsp;&raquo;</strong> :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>
                  ✅ Chaque équipe doit afficher
                  <code className="text-xs ml-1 bg-(--surface) px-1 rounded">N/N</code>
                  (ex. &quot;3/3&quot; = 3 domaines décidés sur 3 attendus)
                </li>
                <li>⏳ Si une équipe affiche &quot;2/3&quot;, elle n&apos;a pas fini → allez la voir</li>
              </ul>
              <div className="mt-4 rounded-lg bg-(--surface) p-4 border border-(--border)">
                <p className="text-xs font-medium text-(--foreground-muted) uppercase">Conseil</p>
                <p className="mt-2 text-sm">
                  Laissez 15 minutes de buffer. Les équipes oublient toujours une décision.
                </p>
              </div>
            </Step>

            <Step number={2} title="Verrouille les décisions">
              <p>
                Une fois que tout le monde a fini (ou le délai écoulé) :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>
                  🔒 Cliquez sur <strong>&laquo;&nbsp;Verrouiller les décisions du tour&nbsp;&raquo;</strong>
                </li>
                <li>
                  ⚠️ Une confirmation apparaît — elle est irréversible pour ce tour
                </li>
                <li>
                  💬 Annoncez en salle : &quot;Vos décisions sont verrouillées, le moteur calcule.&quot;
                </li>
              </ul>
            </Step>

            <Step number={3} title="Lancer la résolution">
              <p>
                Cliquez sur <strong>&laquo;&nbsp;Résoudre ce tour&nbsp;&raquo;</strong> — le moteur calcule tous les résultats.
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>⏱️ Durée : 3-5 secondes normalement</li>
                <li>
                  ✅ Si <strong className="text-green-600">&laquo;&nbsp;Succès&nbsp;&raquo;</strong> apparaît, les
                  résultats sont écrits en base
                </li>
                <li>
                  ❌ Si <strong className="text-red-600">&laquo;&nbsp;Erreur&nbsp;&raquo;</strong> apparaît, voir
                  la section {' '}
                  <strong>&laquo;&nbsp;Résolution échouée&nbsp;&raquo;</strong> ci-dessous
                </li>
              </ul>
            </Step>

            <Step number={4} title="Projetez les résultats">
              <p>
                Une fois la résolution réussie, cliquez sur <strong>&laquo;&nbsp;Projecteur&nbsp;&raquo;</strong> et affinez :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>
                  📊 Sélectionnez l&apos;onglet <strong>&laquo;&nbsp;Classement&nbsp;&raquo;</strong> pour montrer les
                  parts de marché et les alignements
                </li>
                <li>
                  💰 Puis <strong>&laquo;&nbsp;Finance&nbsp;&raquo;</strong> pour les bilans (profitabilité, trésorerie)
                </li>
                <li>
                  📈 Optionnel : <strong>&laquo;&nbsp;Portefeuille&nbsp;&raquo;</strong> pour les acquisitions
                </li>
              </ul>
            </Step>
          </Section>

          {/* PHASE 3: CE QUE FONT LES ÉTUDIANTS */}
          <Section
            phase={3}
            title="Parallèlement : ce que font les équipes étudiantes"
            color="bg-purple-100 text-(--foreground)"
          >
            <p className="mb-4">
              Pendant que vous gérez l&apos;animation, vos équipes naviguent dans leur tableau de bord personnel :
            </p>

            <Step number={1} title="Stratégie du groupe (1 fois par atelier)">
              <p>
                Onglet <strong>&laquo;&nbsp;Groupe&nbsp;&raquo;</strong> — la première équipe de chaque groupe saisit :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>🎯 Stratégie de groupe (spécialisation, diversification, intégration verticale)</li>
                <li>🏢 Structure (combien de domaines, centralisés ou délégués)</li>
                <li>🤝 Mutualisations ouvertes par le groupe</li>
              </ul>
              <p className="mt-2 text-sm text-(--foreground-muted)">
                → Impact : alignement corporate, synergies, charges de structure
              </p>
            </Step>

            <Step number={2} title="Décisions par domaine (chaque tour)">
              <p>
                Chaque domaine a une équipe dédiée (ex. &quot;Domaine Agro&quot;). Elle saisit :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>💡 Stratégie générique (coûts, différenciation, concentration)</li>
                <li>💰 Budget : R&D, marketing, efficience coûts, capacité, réseau</li>
                <li>📦 Filière : fournisseurs, distributeurs (contrats ou intégration verticale)</li>
              </ul>
              <p className="mt-2 text-sm text-(--foreground-muted)">
                → Impact : volume, marge, alignement métier, qualité
              </p>
            </Step>

            <Step number={3} title="Gestion des ressources (en parallèle)">
              <p>
                La fonction RH du groupe saisit :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>👥 Embauches / licenciements par domaine</li>
                <li>🎓 Budgets de formation, orientation (compétence / qualité / climat)</li>
                <li>🏢 Salaires et mouvements internes</li>
              </ul>
              <p className="mt-2 text-sm text-(--foreground-muted)">
                → Impact : masse salariale, climat social, compétence, coûts RH
              </p>
            </Step>

            <Step number={4} title="Acquisitions & cessions (si marché ouvert)">
              <p>
                Si vous avez ouvert des domaines à l&apos;acquisition :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>🎯 Les équipes enchérissent sur les cibles disponibles</li>
                <li>💵 Prix d&apos;achat = fonction de la performance du domaine cible</li>
                <li>📊 Nouveaux domaines = nouvelles décisions à saisir à partir du tour suivant</li>
              </ul>
            </Step>
          </Section>

          {/* PHASE 4: GESTION DES CRISES */}
          <Section
            phase={4}
            title="Gestion des situations spéciales"
            color="bg-amber-100 text-(--foreground)"
          >
            <Step number={1} title="Une équipe a fini trop tôt">
              <p>
                Aucun problème. Les équipes rapides peuvent :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>📖 Consulter le <strong>Simulateur d&apos;impacts</strong> : voir comment
                  leurs décisions changent les résultats</li>
                <li>🔧 Ajuster leurs décisions du tour courant avant que vous ne
                  les verrouilles</li>
                <li>💭 Discuter stratégie pour les tours suivants</li>
              </ul>
            </Step>

            <Step number={2} title="Résolution échouée (❌ statut)">
              <p>
                Si la résolution renvoie une erreur :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>🔍 Lisez le message d&apos;erreur (ex. &quot;Équipe X : trésorerie négative&quot;)</li>
                <li>📞 Contactez l&apos;équipe en question</li>
                <li>🔙 L&apos;équipe retourne modifier sa décision fautive</li>
                <li>🔓 Vous déverrouillez les décisions du tour (bouton en haut)</li>
                <li>♻️ L&apos;équipe remet la décision corrigée, puis vous relancez la résolution</li>
              </ul>
              <div className="mt-4 rounded-lg bg-(--surface) p-4 border border-(--border)">
                <p className="text-xs font-medium text-(--foreground-muted) uppercase">Important</p>
                <p className="mt-2 text-sm">
                  Aucun résultat n&apos;est écrit si la résolution échoue. Le tour n&apos;avance pas.
                </p>
              </div>
            </Step>

            <Step number={3} title="Une équipe doit se déconnecter puis se reconnecter">
              <p>
                Si une équipe perd la connexion ou ferme par erreur :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>🔐 Elle utilise le même code d&apos;équipe pour se reconnecter</li>
                <li>💾 Toutes ses décisions saisies restent en base</li>
                <li>✏️ Elle peut les modifier si vous n&apos;avez pas encore verrouillé</li>
              </ul>
            </Step>

            <Step number={4} title="Une équipe a saisie une décision qui n&apos;a pas d&apos;effet">
              <p>
                Parfois les équipes tentent des choses comme :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>❌ Acheter un distributeur alors qu&apos;elle ne l&apos;exploite pas</li>
                <li>❌ Investir en R&D avec un budget zéro</li>
              </ul>
              <p className="mt-3">
                Le moteur <strong>rejette les décisions invalides</strong> via l&apos;API. L&apos;équipe
                voit un message d&apos;erreur et doit corriger avant que vous ne puissiez continuer.
              </p>
            </Step>
          </Section>

          {/* PHASE 5: OUTILS POUR DÉBRIÉFER */}
          <Section
            phase={5}
            title="Outils pédagogiques (après chaque tour)"
            color="bg-orange-100 text-(--foreground)"
          >
            <Step number={1} title="Cartographie du moteur">
              <p>
                Lien dans votre tableau de bord : <strong>&laquo;&nbsp;Cartographie du moteur&nbsp;&raquo;</strong>
              </p>
              <p className="mt-2">
                Montrez à la salle comment le moteur calcule :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>📊 8 phases de résolution (coûts → volumes → marge)</li>
                <li>🎯 4 niveaux d&apos;alignement (domaine, directives, groupe, temps)</li>
                <li>🔗 Tous les paramètres de calcul (extraits du code, pas redessinés)</li>
              </ul>
            </Step>

            <Step number={2} title="Simulateur d&apos;impacts">
              <p>
                Lien dans votre tableau de bord : <strong>&laquo;&nbsp;Simulateur d&apos;impacts&nbsp;&raquo;</strong>
              </p>
              <p className="mt-2">
                Utilisez-le en direct pour montrer :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>📈 Comment un geste de prix affecte la part de marché</li>
                <li>⚖️ Le poids exact de chaque axe sur l&apos;alignement</li>
                <li>🔁 La chaîne causale : décision → pénalité → score → compétitivité → volume</li>
              </ul>
              <div className="mt-4 rounded-lg bg-(--surface) p-4 border border-(--border)">
                <p className="text-xs font-medium text-(--foreground-muted) uppercase">Conseil</p>
                <p className="mt-2 text-sm">
                  Excellent pour rebondir après qu&apos;une équipe conteste un résultat. Montrez-lui
                  le calcul exact avec les valeurs de son tour.
                </p>
              </div>
            </Step>

            <Step number={3} title="Tableau de bord Projecteur">
              <p>
                Affichage public pendant tout l&apos;atelier. Montrez :
              </p>
              <ul className="mt-3 space-y-2 ml-4">
                <li>🥇 Classement actuel (parts de marché, alignements)</li>
                <li>💰 Santé financière (trésorerie, profitabilité)</li>
                <li>📊 Évolution tour par tour (onglet &laquo;&nbsp;Historique&nbsp;&raquo;)</li>
              </ul>
            </Step>
          </Section>

          {/* PHASE 6: CHECKLIST FINALE */}
          <Section
            phase={6}
            title="Checklist avant de lancer"
            color="bg-red-100 text-(--foreground)"
          >
            <div className="space-y-2 text-sm">
              <CheckItem>✅ Session créée avec le bon nombre de tours</CheckItem>
              <CheckItem>✅ Codes de session et codes d&apos;équipe distribués</CheckItem>
              <CheckItem>✅ Toutes les équipes connectées (onglet &laquo;&nbsp;Avancement&nbsp;&raquo;)</CheckItem>
              <CheckItem>✅ Vous êtes familier avec le simulateur et la cartographie</CheckItem>
              <CheckItem>✅ Vous avez expliqué aux équipes la structure de leur tableau de bord</CheckItem>
              <CheckItem>✅ Les équipes ont 10-15 min pour saisir chaque tour</CheckItem>
              <CheckItem>✅ Vous savez comment déverrouiller si une résolution échoue</CheckItem>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  phase,
  title,
  color,
  children,
}: {
  phase: number;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className={`${color} -mx-6 px-6 py-3 rounded-lg`}>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-600">
          Phase {phase}
        </p>
        <h3 className="text-lg font-semibold mt-1 text-slate-900 dark:text-slate-800">{title}</h3>
      </div>
      <div className="space-y-6 pl-2">{children}</div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="flex gap-4">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-(--accent) text-white font-bold text-sm">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-base">{title}</h4>
          <div className="mt-2 space-y-3 text-sm text-(--foreground-muted) leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-(--surface) p-3 border border-(--border)">
      <span className="flex-shrink-0 font-semibold text-green-600">{children}</span>
    </div>
  );
}
