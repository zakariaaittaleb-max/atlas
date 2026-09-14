'use client';

/**
 * Le guide d'animation, sur la page « Mes sessions ».
 *
 * Réécrit contre le produit tel qu'il est. L'ancienne version renvoyait à des
 * éléments qui n'existent pas (des codes « TEAM-RED », une adresse
 * « Atlas.com/rejoindre », un bouton « déverrouiller », des onglets du
 * projecteur), prêtait aux équipes des rôles qu'Atlas ne distribue pas, et
 * posait ses bandeaux sur des couleurs fixes illisibles en thème sombre.
 *
 * Chaque étape nomme une commande telle qu'elle s'affiche à l'écran.
 */

import { BookOpen, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function BriefingGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-8 rounded-xl border border-(--border) bg-(--surface)">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="guide-animation"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
      >
        <span className="flex items-center gap-3">
          <BookOpen aria-hidden className="h-5 w-5 shrink-0 text-(--accent-text)" />
          <span>
            <span className="block text-lg font-semibold text-(--heading)">Guide d’animation</span>
            <span className="block text-sm text-(--foreground-muted)">
              Préparer la séance, conduire un tour, réagir quand quelque chose coince
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`h-5 w-5 shrink-0 text-(--foreground-muted) transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div id="guide-animation" hidden={!open} className="space-y-10 border-t border-(--border) px-5 py-6">
        <Phase title="Avant la séance">
          <Step title="Créez la session">
            <p>
              En bas de cette page : nom de la session, secteurs joués, niveau de difficulté et nombre
              de tours prévus (de 3 à 10, comptez environ 45 minutes par tour).
            </p>
            <Definitions
              items={[
                ['Découverte', 'marché porteur, banque patiente — pour une première séance'],
                ['Standard', 'le calibrage de référence'],
                ['Exigeant', 'marché atone, incohérence sanctionnée vite — pour un public rodé'],
                ['Sur mesure', 'vous réglez chaque molette, depuis le pilotage'],
              ]}
            />
            <p>
              Secteurs disponibles : agro-industrie, construction &amp; infrastructures, tourisme &amp;
              hôtellerie, distribution de matériel industriel, distribution alimentaire moderne,
              textile &amp; habillement, énergies renouvelables, services numériques.
            </p>
          </Step>

          <Step title="Réglez ce que la session fait jouer">
            <p>
              « Piloter », onglet <Ui>Réglages de session</Ui> : les décisions ouvertes aux équipes et
              l’amplitude qu’elles peuvent donner à chacune. Le niveau de difficulté se verrouille à la
              première résolution — les équipes ne le voient jamais.
            </p>
          </Step>

          <Step title="Préparez les codes">
            <p>
              Le <strong>code de session</strong> s’affiche en haut du pilotage ; le code de chaque
              équipe figure dans le tableau d’avancement. Pour rejoindre, un participant ouvre la page
              de connexion et saisit code de session, code d’équipe et prénom.
            </p>
            <p>
              Une équipe n’a pas de rôles à répartir : tous ses membres voient et saisissent tous les
              écrans, en même temps, depuis plusieurs ordinateurs.
            </p>
          </Step>
        </Phase>

        <Phase title="Pendant un tour">
          <Step title="Ouvrez le tour">
            <p>
              Barre de conduite, en haut du pilotage : <Ui>Ouvrir le tour</Ui>. Affichez le projecteur
              au mur avec <Ui>Ouvrir le projecteur</Ui>.
            </p>
          </Step>

          <Step title="Suivez l’avancement">
            <p>
              Le tableau d’avancement coche, équipe par équipe, stratégie du Groupe, stratégie de chaque
              domaine, distribution et budget. Une équipe « En cours » a une décision manquante : le
              tableau dit laquelle. <Ui>Prolonger de 10 min</Ui> si la salle débat utilement.
            </p>
          </Step>

          <Step title="Faites vivre le marché">
            <p>
              Onglet <Ui>Marché &amp; crises</Ui> : déclenchez une carte du catalogue, ou composez la
              vôtre et utilisez <Ui>Créer et déclencher</Ui>. Les équipes la découvrent dans leur War
              Room, avec son nom et sa description, jamais ses chiffres. Vous arbitrez ensuite ce que
              leur plan de riposte leur vaut.
            </p>
          </Step>

          <Step title="Verrouillez, puis résolvez">
            <p>
              <Ui>Verrouiller le tour</Ui> fige toutes les équipes au même instant, prêtes ou non.
              <Ui>Résoudre le tour</Ui> calcule et publie les résultats en quelques secondes. Les deux
              gestes demandent une confirmation.
            </p>
          </Step>
        </Phase>

        <Phase title="Quand quelque chose coince">
          <Step title="La résolution échoue">
            <p>
              Rien n’est écrit, et la session revient à l’état « verrouillé ». Le motif s’affiche dans
              la barre de conduite et dans « Dernières résolutions ». Il n’existe pas de
              déverrouillage : corrigez la cause signalée, puis relancez <Ui>Résoudre le tour</Ui>.
            </p>
          </Step>

          <Step title="Une équipe décroche">
            <p>
              Onglet <Ui>Conduite</Ui> : offrez-lui un audit d’alignement, livré sans coût pour son
              compte de résultat. Vous pouvez aussi rejoindre le groupe comme participant, visible ou
              discret, et revenir à l’animation depuis le bandeau.
            </p>
          </Step>

          <Step title="Un participant perd sa connexion">
            <p>
              Il se reconnecte avec les mêmes codes. Tout ce qui a été saisi est enregistré au fil de
              la frappe et reste modifiable jusqu’au verrouillage.
            </p>
          </Step>
        </Phase>

        <Phase title="Après la résolution">
          <Step title="Projetez et débriefez">
            <p>
              Le projecteur se met à jour seul : il montre le classement de chaque marché, jamais le
              détail des décisions d’une équipe. Onglet <Ui>Débriefing</Ui> : le simulateur d’impacts
              rejoue une décision pour montrer ce qu’un autre choix aurait donné, et la cartographie du
              moteur explique ce que chaque décision déplace dans le calcul.
            </p>
          </Step>

          <Step title="Clôturez">
            <p>
              À partir du tour 3, <Ui>Clore la session</Ui>. L’export de la session (onglet Débriefing)
              rassemble les décisions de toutes les équipes : c’est un document d’animation, à ne pas
              distribuer.
            </p>
          </Step>
        </Phase>
      </div>
    </div>
  );
}

/** Une phase de la séance ; ses étapes se suivent, d'où la liste numérotée. */
function Phase({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">{title}</h3>
      <ol className="m-0 list-none space-y-5 p-0 [counter-reset:guide-step]">{children}</ol>
    </section>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3 [counter-increment:guide-step]">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-full bg-(--accent-subtle) font-mono text-sm font-semibold text-(--accent-text) before:content-[counter(guide-step)]"
      />
      <div className="min-w-0">
        <h4 className="text-base font-semibold">{title}</h4>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-(--foreground-muted)">{children}</div>
      </div>
    </li>
  );
}

/** Le nom d'une commande, tel qu'il s'affiche à l'écran. */
function Ui({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-(--foreground)">« {children} »</strong>;
}

function Definitions({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
      {items.map(([term, definition]) => (
        <div key={term} className="contents">
          <dt className="font-semibold text-(--foreground)">{term}</dt>
          <dd className="m-0">{definition}</dd>
        </div>
      ))}
    </dl>
  );
}
