import 'server-only';

/**
 * ATLAS — « Votre premier tour, pas à pas ».
 *
 * Une équipe qui arrivait sur le Dashboard voyait quatre indicateurs et onze
 * entrées de navigation, sans savoir par où commencer : la première demi-heure
 * se passait à demander au facilitateur « on fait quoi ? ». Ce parcours dit
 * l'étape suivante et coche celles qui sont faites, d'après ce qui est
 * réellement enregistré — pas d'après des clics.
 *
 * Il suit l'ordre de « Étape suivante » : un seul ordre dans tout le jeu. Il
 * disparaît dès la première résolution, ou quand toutes les étapes sont faites.
 */

import { ArrowRight, CircleCheck } from 'lucide-react';
import Link from 'next/link';

import { isOn, openScreenHrefs } from '@/lib/modules-state';
import { loadDecisionContext } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { createServerClient } from '@/lib/supabase/server';

import { OnboardingToggle } from './onboarding-toggle';

interface PathStep {
  href: string;
  title: string;
  text: string;
  done: boolean;
}

export async function OnboardingPath() {
  const context = await loadDecisionContext();
  const supabase = await createServerClient();
  const [modules, { count: studies }, { data: submission }] = await Promise.all([
    loadEnabledModules(context.team.sessionId),
    supabase
      .from('consulting_orders')
      .select('team_id', { count: 'exact', head: true })
      .eq('team_id', context.team.teamId),
    supabase
      .from('team_round_submissions')
      .select('submitted_at')
      .eq('team_id', context.team.teamId)
      .eq('round_number', context.roundNumber)
      .maybeSingle(),
  ]);

  const open = openScreenHrefs(modules);
  const everyDas = (test: (d: (typeof context.das)[number]) => boolean) =>
    context.das.length > 0 && context.das.every(test);

  const candidates: (PathStep & { shown: boolean })[] = [
    {
      href: '/cabinet',
      title: 'Commander une première étude',
      text: 'Le cabinet vend ce que vous ignorez encore de votre marché. Sans étude, vous décidez à l’aveugle.',
      done: (studies ?? 0) > 0,
      shown: true,
    },
    {
      href: '/strategie',
      title: 'Arrêter la stratégie du Groupe',
      text: 'Logique de portefeuille, structure et valeurs : le cadre dans lequel chaque domaine se positionnera.',
      done: context.corporateRecorded,
      shown: open.has('/strategie'),
    },
    {
      href: '/finance',
      title: 'Boucler le budget du Groupe',
      text: 'Frais de siège, crédit et dividende : ce que le Groupe peut se permettre ce tour.',
      done: context.financeRecorded,
      shown: open.has('/finance'),
    },
    {
      href: '/strategie/das',
      title: 'Positionner chaque domaine',
      text: 'Stratégie générique, prix et segments servis, domaine par domaine.',
      done: everyDas((d) => d.progress.strategy),
      shown: open.has('/strategie/das'),
    },
    {
      href: '/organisation',
      title: 'Organiser les équipes',
      text: 'Effectifs, salaires et formation : sans eux, l’outil ne produit pas.',
      done: everyDas((d) => d.progress.hr),
      shown: open.has('/organisation'),
    },
    {
      href: '/marches',
      title: 'Sécuriser achats et distribution',
      text: 'Sans matière, l’atelier s’arrête ; sans distributeur, un domaine ne vend rien.',
      done: everyDas(
        (d) =>
          (!isOn(modules, 'marches.procurement') || d.progress.procurement) &&
          (!isOn(modules, 'marches.distribution') || d.progress.distribution),
      ),
      shown: open.has('/marches'),
    },
    {
      href: '/recapitulatif',
      title: 'Relire et soumettre le tour',
      text: 'Toute l’équipe relit le récapitulatif ensemble, puis le soumet au facilitateur.',
      done: Boolean(submission),
      shown: true,
    },
  ];

  const steps = candidates.filter((s) => s.shown);
  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);
  if (nextIndex === -1) return null;

  return (
    <section
      aria-labelledby="parcours-titre"
      className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Prise en main · {doneCount} sur {steps.length} étapes
          </p>
          <h2 id="parcours-titre" className="mt-1 text-xl font-semibold text-(--heading)">
            Votre premier tour, pas à pas
          </h2>
        </div>
        <OnboardingToggle hidden={false} />
      </div>

      <div
        role="progressbar"
        aria-label="Avancement de la prise en main"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-(--surface-muted)"
      >
        <div
          className="h-full rounded-full bg-(--accent)"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="mt-5 grid gap-2">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          return (
            <li
              key={step.href}
              aria-current={isNext ? 'step' : undefined}
              className={`grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 rounded-lg px-3 py-2.5 ${
                isNext ? 'bg-(--accent-subtle)' : ''
              }`}
            >
              {step.done ? (
                <CircleCheck aria-hidden className="h-6 w-6 text-(--positive)" />
              ) : (
                <span
                  aria-hidden
                  className={`tabular flex h-6 w-6 items-center justify-center rounded-full font-mono text-sm font-semibold ${
                    isNext ? 'bg-(--accent) text-(--on-accent)' : 'bg-(--surface-muted) text-(--foreground-muted)'
                  }`}
                >
                  {index + 1}
                </span>
              )}

              <div className="min-w-0">
                <p className={`font-medium ${step.done ? 'text-(--foreground-muted)' : ''}`}>
                  {step.title}
                  <span className="sr-only">{step.done ? ' — fait' : isNext ? ' — étape suivante' : ' — à faire'}</span>
                </p>
                {isNext ? <p className="mt-0.5 text-sm text-(--foreground-muted)">{step.text}</p> : null}
              </div>

              {isNext ? (
                <Link
                  href={step.href}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-(--accent) px-4 text-sm font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
                >
                  {doneCount === 0 ? 'Commencer' : 'Continuer'}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href={step.href}
                  className="text-sm font-medium text-(--accent-text) underline-offset-4 hover:underline"
                >
                  {step.done ? 'Revoir' : 'Ouvrir'}
                  <span className="sr-only"> : {step.title}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
