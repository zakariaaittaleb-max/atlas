'use client';

/**
 * ATLAS — conception organisationnelle, DAS par DAS.
 *
 * ── POURQUOI PAR DAS, ET NON PAR GROUPE ────────────────────────────────────
 * Une équipe qui exploite l'agro-industrie et le numérique ne les structure pas
 * de la même façon : l'un est industriel et se pilote de près, l'autre est un
 * métier de compétences où la décision doit descendre au terrain. Concevoir une
 * organisation unique pour les deux, c'est se condamner à en rater au moins une.
 *
 * ── CE QUI SE DÉCIDE ICI, ET CE QUI SE DÉCIDE AU GROUPE ────────────────────
 * Cet écran ne porte QUE ce qui varie d'un métier à l'autre : axes, KPI,
 * budgets, postes clés, délégation, RH.
 *
 * La forme de structure et le couple vision/mission ont été rendus à l'écran
 * Stratégie, où ils étaient déjà saisis. Une entreprise a UNE vision, et sa
 * forme d'organisation est une décision d'architecture — le moteur la juge
 * d'ailleurs en la comparant au NOMBRE de domaines, ce qui n'a de sens qu'à
 * l'échelle du groupe. Les deux copies par domaine n'étaient lues par aucun
 * calcul : deux commandes pour une seule question, dont une sans effet.
 *
 * ── LA SYNTHÈSE D'ABORD ────────────────────────────────────────────────────
 * Sept blocs de saisie s'empilaient, chacun précédé d'un paragraphe. L'écran
 * s'ouvre désormais sur ce qui est décidé (rôle, effectif visé, climat,
 * moyens répartis), puis un bloc repliable par décision, sa valeur courante
 * dans le titre. Les explications sont sous les « + ».
 * ───────────────────────────────────────────────────────────────────────────
 */

import { Star, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { useDasScope } from '@/components/das-scope';
import { NumberInput, SaveIndicator } from '@/components/decision-shell';
import { Accordion } from '@/components/ui/accordion';
import { ChoiceCard, Definitions, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { MetricToggle } from '@/components/ui/metric-toggle';
import { StatCard } from '@/components/ui/stat-card';
import { delta, formatMadCompact, formatPct, formatUnits } from '@/lib/format';
import { hiresOf } from '@/lib/headcount-target';
import type { DasOrganisation, OrgContext, PositionDraft } from '@/lib/org-types';
import { useAutosave } from '@/lib/use-autosave';

import { anyOn, isOn, type EnabledModules } from '@/lib/modules-state';
import type { VariationBasis } from '@/lib/variation-references';
import type { VariationScale } from '@/lib/variation-scale';

import { HrSection } from './hr-section';

const PORTFOLIO_ROLES = [
  ['moteur', 'Moteur',
   'Porte la croissance. Doit capter nettement plus d’investissement que son poids en chiffre d’affaires.'],
  ['relais', 'Relais',
   'Tient sa position. Investissement proportionnel à son poids.'],
  ['soutien', 'Soutien',
   'Finance les autres. On l’exploite sans le développer.'],
  ['reserve', 'Réserve',
   'En veille. Investissement minimal — on garde l’option, on ne la joue pas.'],
] as const;

const HQ_FUNCTIONS = [
  ['hqPurchasing', 'Achats', 'org.hq_purchasing'],
  ['hqIt', 'Systèmes d’information', 'org.hq_it'],
  ['hqRd', 'Recherche & développement', 'org.hq_rd'],
  ['hqHr', 'Ressources humaines', 'org.hq_hr'],
  ['hqFinance', 'Finance', 'org.hq_finance'],
] as const;

const HQ_KEYS = HQ_FUNCTIONS.map(([, , moduleKey]) => moduleKey);

/** Tout ce que porte le bloc « directives » : s'il est vide, il disparaît. */
const DIRECTIVES_KEYS = ['org.portfolio_role', ...HQ_KEYS, 'org.shared_resources'];

/**
 * Tout ce que porte le bloc RH. Les effectifs sont du noyau : ce bloc ne
 * disparaît donc jamais en pratique — la liste sert à ne pas avoir à le savoir.
 */
const HR_KEYS = [
  'org.hire_operateurs', 'org.hire_techniciens', 'org.hire_experts', 'org.hire_cadres',
  'org.layoffs', 'org.avg_salary', 'org.internal_transfers',
  'org.training_budget', 'org.training_focus',
  'org.claim_ofppt', 'org.claim_giac', 'org.skills_audit', 'org.restructuring',
];

/** Correspondance entre la fonction vue du DAS et la directive du groupe. */
const CENTRAL_OF = {
  hqPurchasing: 'centralPurchasing',
  hqIt: 'centralIt',
  hqRd: 'centralRd',
  hqHr: 'centralHr',
  hqFinance: 'centralFinance',
} as const;

const LEVELS = [
  [1, 'Direction'], [2, 'Encadrement supérieur'], [3, 'Encadrement intermédiaire'], [4, 'Opérationnel'],
] as const;

export function OrganisationView({
  context,
  modules,
  scales,
}: {
  context: OrgContext;
  modules: EnabledModules;
  scales: Readonly<Record<string, VariationScale>>;
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const [pending, startTransition] = useTransition();
  // Le domaine piloté vient de la barre de navigation, jamais d'un état local :
  // celui choisi ici doit être encore celui de la stratégie et des achats.
  // L'écran en gardait auparavant sa propre copie, et changer de domaine ici
  // ne changeait rien ailleurs — deux vérités pour une seule question.
  const { activeDasId } = useDasScope();
  const activeDas = activeDasId ?? context.das[0]?.dasId ?? '';
  const [drafts, setDrafts] = useState<Record<string, DasOrganisation>>(
    () => Object.fromEntries(context.das.map((d) => [d.dasId, d])),
  );

  const locked = !context.decisionsOpen;
  const das = drafts[activeDas];

  /**
   * Envoi d'un bloc. On passe par la file d'auto-sauvegarde, qui persiste avant
   * l'appel réseau : une coupure en pleine conception ne perd rien.
   */
  const push = useCallback(
    (block: string, payload: Record<string, unknown>) => {
      autosave.save({
        __endpoint: '/api/organisation',
        block, dasId: activeDas, ...payload,
      });
    },
    [autosave, activeDas],
  );

  const update = useCallback(
    (patch: Partial<DasOrganisation>) => {
      setDrafts((prev) => ({ ...prev, [activeDas]: { ...prev[activeDas], ...patch } }));
    },
    [activeDas],
  );

  if (!das) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold text-(--heading) tracking-tight">Organisation</h1>
        <p className="mt-4 text-(--foreground-muted)">
          Vous n’exploitez aucun domaine d’activité pour l’instant.
        </p>
      </main>
    );
  }

  const budgetTotal = das.budgets.reduce((acc, b) => acc + b.budgetMad, 0);
  const budgetShare = context.operatingBudgetMad > 0
    ? budgetTotal / context.operatingBudgetMad
    : 0;
  const overBudget = budgetTotal > context.operatingBudgetMad;
  const keyCount = das.positions.filter((p) => p.isKeyPosition).length;

  // ── La synthèse, calculée comme les blocs la calculent ──────────────────
  const role = PORTFOLIO_ROLES.find(([value]) => value === das.directives.portfolioRole);
  const headcountNow = das.hrState?.headcount ?? 0;
  const headcountTarget = Math.max(headcountNow + hiresOf(das.hr) - das.hr.layoffs, 0);
  const divergences = context.group === null
    ? 0
    : HQ_FUNCTIONS.filter(
        ([key, , moduleKey]) =>
          isOn(modules, moduleKey) && context.group![CENTRAL_OF[key]] !== das.directives[key],
      ).length;
  const axesChosen = das.axisKeys.filter(Boolean).length;
  const kpisChosen = context.directions.filter((direction) =>
    das.kpis.some((k) => k.directionKey === direction.key),
  ).length;

  const cards = [
    isOn(modules, 'org.portfolio_role') ? (
      <StatCard
        key="role"
        size="sm"
        label="Rôle dans le portefeuille"
        value={role ? role[1] : 'À choisir'}
        note={
          context.group === null
            ? 'Stratégie du Groupe pas encore arrêtée'
            : divergences > 0
              ? `${divergences} divergence${divergences > 1 ? 's' : ''} avec le Groupe`
              : 'Aligné sur les directives du Groupe'
        }
        hint="Le rôle fixe l’intensité d’investissement attendue de ce domaine."
      />
    ) : null,
    anyOn(modules, HR_KEYS) ? (
      <StatCard
        key="headcount"
        label="Effectif visé"
        value={formatUnits(headcountTarget)}
        delta={das.hrState ? delta(headcountTarget, headcountNow, (v) => formatUnits(Math.round(v))) : null}
        note="Aucun exercice clos pour ce domaine"
        polarity="neutral"
        hint="Effectif en place, plus les recrutements, moins les départs décidés dans le bloc Ressources humaines."
      />
    ) : null,
    das.hrState ? (
      <StatCard
        key="climate"
        label="Climat social"
        value={das.hrState.climatSocial.toFixed(0)}
        note={das.hrState.climatSocial < 60 ? 'Sous 60 : la production en pâtit' : 'Dernier exercice clos'}
        hint="Sous 60, une part de l’outil cesse de produire et chaque unité produite coûte plus cher. L’effet se voit au tour suivant."
      />
    ) : null,
    isOn(modules, 'org.budgets') ? (
      <StatCard
        key="budget"
        label="Moyens répartis"
        value={formatPct(budgetShare, 0)}
        note={
          overBudget
            ? `Dépassement de ${formatMadCompact(budgetTotal - context.operatingBudgetMad)}`
            : `${formatMadCompact(budgetTotal)} sur ${formatMadCompact(context.operatingBudgetMad)}`
        }
        hint="Part du budget de fonctionnement affectée aux directions de ce domaine."
      />
    ) : null,
  ].filter(Boolean);

  const inherited = das.inheritedFromRound !== null && das.inheritedFromRound < context.roundNumber;

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Exercice {context.roundNumber} · {context.teamName} · niveau domaine
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            Organisation &amp; RH
            <InfoHint label="Organisation et RH">
              Chaque domaine d’activité se structure séparément : un métier industriel et un
              métier de compétences ne se pilotent pas de la même façon. Ces choix pèsent{' '}
              <strong>35 % de votre indice d’alignement</strong>, et donc sur votre chiffre
              d’affaires. La forme de structure, la vision et la mission se décident au niveau
              Groupe, dans{' '}
              <a href="/strategie" className="font-medium text-(--accent-text) underline">
                Stratégie du Groupe
              </a>.
            </InfoHint>
          </h1>
          {inherited ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-(--surface) px-3 py-1 text-sm text-(--foreground-muted) ring-1 ring-(--border)">
              Organisation héritée de l’exercice {das.inheritedFromRound}
              <InfoHint label="Organisation héritée">
                Elle reste en vigueur tant que vous ne la modifiez pas — comme dans une entreprise
                réelle.
              </InfoHint>
            </p>
          ) : null}
        </header>

        <div className="space-y-4">
          {cards.length > 0 ? (
            <div className={`grid gap-4 sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {cards}
            </div>
          ) : null}

          {/* ── Directives du Groupe ─────────────────────────────────────── */}
          {anyOn(modules, DIRECTIVES_KEYS) ? (
            <Accordion
              title="Directives du Groupe"
              indicators={{ topic: 'org-directives', dasId: activeDas }}
              defaultOpen
              summary={
                context.group === null
                  ? 'Groupe non arrêté'
                  : `${role ? role[1] : 'rôle à choisir'}${divergences > 0 ? ` · ${divergences} divergence${divergences > 1 ? 's' : ''}` : ''}`
              }
              hint="Le groupe arbitre, ce DAS se situe. Suivre une directive inadaptée à votre métier dégrade votre cohérence propre ; s’en écarter dégrade celle du groupe. Les deux coûtent — c’est l’arbitrage."
            >
              {context.group === null ? (
                <p className="text-sm text-(--foreground-muted)">
                  Votre groupe n’a pas encore arrêté sa stratégie. Renseignez-la dans{' '}
                  <a href="/strategie" className="font-medium text-(--accent-text) underline">Stratégie du Groupe</a>{' '}
                  : sans directive, se positionner n’a pas de sens.
                </p>
              ) : (
                <div className="space-y-8">
                  {isOn(modules, 'org.portfolio_role') ? (
                    <fieldset disabled={locked}>
                      <GroupLegend title="Rôle de ce DAS dans le portefeuille">
                        <span className="block">
                          Ce n’est pas un titre honorifique : le rôle fixe l’intensité
                          d’investissement attendue. Un « moteur » qu’on ne finance pas est une
                          contradiction, et un portefeuille sans « soutien » ni « réserve » est un
                          portefeuille qui n’arbitre pas.
                        </span>
                        <span className="mt-3 block">
                          <Definitions items={PORTFOLIO_ROLES.map(([, label, hint]) => [label, hint] as const)} />
                        </span>
                      </GroupLegend>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {PORTFOLIO_ROLES.map(([value, label]) => (
                          <ChoiceCard
                            key={value}
                            title={label}
                            selected={das.directives.portfolioRole === value}
                            onSelect={() => {
                              const directives = { ...das.directives, portfolioRole: value };
                              update({ directives });
                              push('directives', directives);
                            }}
                          />
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {anyOn(modules, HQ_KEYS) ? (
                    <fieldset disabled={locked}>
                      <GroupLegend title="Fonctions déléguées au siège">
                        Ce que le groupe a centralisé figure en regard. Refuser une centralisation
                        décidée en haut brise l’économie d’échelle ; l’accepter quand votre métier
                        exige de la réactivité vous coûte cette réactivité.
                      </GroupLegend>
                      <ul className="divide-y divide-(--border) rounded-lg border border-(--border)">
                        {HQ_FUNCTIONS.filter(([, , moduleKey]) => isOn(modules, moduleKey)).map(([key, label]) => {
                          const central = context.group![CENTRAL_OF[key]];
                          const delegated = das.directives[key];
                          return (
                            <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-(--meta)">
                                  Groupe : {central ? 'centralisée' : 'laissée aux DAS'}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                {central !== delegated ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-(--warning-subtle) px-2 py-0.5 text-sm font-semibold text-(--warning)">
                                    <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
                                    divergence
                                  </span>
                                ) : null}
                                <MetricToggle
                                  variant="segmented"
                                  size="sm"
                                  label={`${label} : déléguée ou gardée`}
                                  options={[
                                    { key: 'delegated', label: 'Déléguée au siège' },
                                    { key: 'kept', label: 'Gardée ici' },
                                  ]}
                                  value={delegated ? 'delegated' : 'kept'}
                                  onChange={(choice) => {
                                    if ((choice === 'delegated') === delegated) return;
                                    const directives = { ...das.directives, [key]: choice === 'delegated' };
                                    update({ directives });
                                    push('directives', directives);
                                  }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  ) : null}

                  {das.sharedOffers.length > 0 && isOn(modules, 'org.shared_resources') ? (
                    <fieldset disabled={locked}>
                      <GroupLegend title="Ressources mutualisées ouvertes à ce DAS">
                        Mutualiser entre métiers proches produit des économies ; entre métiers
                        étrangers, surtout de la coordination. La proximité indiquée est celle de
                        ce DAS aux autres utilisateurs — en dessous de 40, s’abstenir est le bon
                        choix. On ne standardise que ce qu’on a d’abord réellement adopté.
                      </GroupLegend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {das.sharedOffers.map((offer, i) => {
                          const send = (next: typeof das.sharedOffers) => {
                            update({ sharedOffers: next });
                            push('mutualisation', {
                              resources: next.map((o) => ({
                                resourceKey: o.resourceKey,
                                adoptionLevel: o.adoptionLevel,
                                standardised: o.standardised,
                              })),
                            });
                          };
                          return (
                            <div key={offer.resourceKey} className="rounded-lg border border-(--border) p-4">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm font-medium">{offer.label}</span>
                                <span
                                  className={`tabular text-sm font-semibold ${offer.proximity < 40 ? 'text-(--warning)' : 'text-(--foreground-muted)'}`}
                                >
                                  proximité {Math.round(offer.proximity)}
                                  {offer.proximity < 40 ? ' · faible' : ''}
                                </span>
                              </div>
                              <label className="mt-3 block">
                                <span className="tabular text-sm text-(--foreground-muted)">
                                  Adhésion : <strong className="text-(--foreground)">{offer.adoptionLevel}</strong>
                                </span>
                                <input
                                  type="range" min={0} max={100} step={5}
                                  value={offer.adoptionLevel}
                                  onChange={(e) => {
                                    const level = Number(e.target.value);
                                    send(das.sharedOffers.map((o, j) =>
                                      j === i
                                        ? { ...o, adoptionLevel: level, standardised: o.standardised && level >= 50 }
                                        : o,
                                    ));
                                  }}
                                  className="mt-2 w-full accent-(--accent)"
                                />
                              </label>
                              <label className="mt-2 flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox" checked={offer.standardised}
                                  disabled={offer.adoptionLevel < 50}
                                  onChange={(e) =>
                                    send(das.sharedOffers.map((o, j) =>
                                      j === i ? { ...o, standardised: e.target.checked } : o,
                                    ))
                                  }
                                  className="accent-(--accent)"
                                />
                                <span className={offer.adoptionLevel < 50 ? 'text-(--foreground-muted)' : ''}>
                                  Standardiser sur cette plateforme
                                  {offer.adoptionLevel < 50 ? ' — exige 50 d’adhésion' : ''}
                                </span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                </div>
              )}
            </Accordion>
          ) : null}

          {/* ── Ressources humaines ──────────────────────────────────────── */}
          {anyOn(modules, HR_KEYS) ? (
            <Accordion
              title="Ressources humaines"
              indicators={{ topic: 'org-rh', dasId: activeDas }}
              summary={`effectif ${formatUnits(headcountTarget)}`}
              hint="Chaque métier a sa pyramide et sa sensibilité à la formation. Les indicateurs du dernier exercice figurent en tête du bloc : on décide en regardant d’où l’on part."
            >
              <HrSection
                hr={das.hr}
                state={das.hrState}
                locked={locked}
                modules={modules}
                previous={das.hrPrevious}
                scales={scales}
                basis={basisFor(das, context)}
                onChange={(hr) => {
                  update({ hr });
                  push('hr', { ...hr });
                }}
              />
            </Accordion>
          ) : null}

          {/* ── Axes stratégiques ────────────────────────────────────────────
              La vision et la mission ont été retirées d'ici : elles étaient déjà
              saisies au niveau Groupe, sur `/strategie`. Une entreprise a UNE
              vision ; ce qu'un domaine déclare de spécifique, ce sont ses axes —
              et eux, contrairement à un texte libre, pèsent sur l'alignement. */}
          {isOn(modules, 'org.axes') ? (
            <Accordion
              title="Axes stratégiques"
              indicators={{ topic: 'org-structure', dasId: activeDas }}
              summary={`${axesChosen} sur 3`}
              hint="Ce domaine dit ce qu’il PRIORISE — et c’est cela qui est mesuré. L’ordre compte : le premier axe pèse trois fois plus que le troisième. Choisir trois priorités n’est un arbitrage que si l’on en écarte d’autres."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Vos trois axes stratégiques, par ordre de priorité</legend>
                <ol className="space-y-2">
                  {[0, 1, 2].map((rank) => {
                    const key = das.axisKeys[rank];
                    const axis = context.axes.find((a) => a.key === key);
                    return (
                      <li key={rank} className="flex items-center gap-3 rounded-lg border border-(--border) p-3">
                        <span
                          aria-hidden
                          className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--accent-subtle) font-mono text-sm font-semibold text-(--accent-text)"
                        >
                          {rank + 1}
                        </span>
                        <select
                          aria-label={`Axe prioritaire n° ${rank + 1}`}
                          value={key ?? ''}
                          onChange={(e) => {
                            const next = [...das.axisKeys];
                            next[rank] = e.target.value;
                            // Trois axes DISTINCTS : sélectionner deux fois le même
                            // reviendrait à n'en choisir que deux.
                            if (new Set(next.filter(Boolean)).size !== next.filter(Boolean).length) return;
                            update({ axisKeys: next });
                            if (next.filter(Boolean).length === 3) push('axes', { axisKeys: next });
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                        >
                          <option value="">— choisir un axe —</option>
                          {context.axes.map((a) => (
                            <option key={a.key} value={a.key}>{a.name}</option>
                          ))}
                        </select>
                        {axis ? <InfoHint label={axis.name}>{axis.description}</InfoHint> : null}
                      </li>
                    );
                  })}
                </ol>
              </fieldset>
            </Accordion>
          ) : null}

          {/* ── Délégation ───────────────────────────────────────────────────
              La FORME de structure a été retirée d'ici : elle se décide au niveau
              Groupe, sur `/strategie`. Le moteur la juge en la comparant au NOMBRE
              de domaines — « fonctionnelle au-delà de quatre métiers », « matricielle
              pour un seul » — ce qui n'a de sens qu'à l'échelle de l'entreprise. La
              copie par domaine n'était lue par aucun calcul : deux commandes pour
              une seule question, dont une sans effet. */}
          {isOn(modules, 'org.delegation') ? (
            <Accordion
              title="Délégation"
              indicators={{ topic: 'org-structure', dasId: activeDas }}
              summary={`${das.delegationLevel} / 100`}
              hint="Le degré d’autonomie laissé à CE métier. Ni le sommet ni le terrain n’ont raison dans l’absolu : standardiser sert les coûts, décider vite sert une niche exigeante. La forme de structure, elle, se décide dans Stratégie du Groupe."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Niveau de délégation</legend>
                <p className="tabular font-mono text-2xl font-medium">{das.delegationLevel}</p>
                <input
                  type="range" min={0} max={100} step={5} value={das.delegationLevel}
                  aria-label="Niveau de délégation, de 0 (tout remonte au sommet) à 100 (le terrain décide seul)"
                  onChange={(e) => {
                    const delegationLevel = Number(e.target.value);
                    update({ delegationLevel });
                    push('design', { delegationLevel });
                  }}
                  className="mt-3 w-full accent-(--accent)"
                />
                <div className="mt-1 flex justify-between text-sm text-(--foreground-muted)">
                  <span>0 — tout remonte au sommet</span>
                  <span>100 — le terrain décide seul</span>
                </div>
              </fieldset>
            </Accordion>
          ) : null}

          {/* ── Organigramme ─────────────────────────────────────────────── */}
          {isOn(modules, 'org.positions') ? (
            <Accordion
              title="Organigramme"
              indicators={{ topic: 'org-structure', dasId: activeDas }}
              summary={`${das.positions.length} poste${das.positions.length > 1 ? 's' : ''} · ${keyCount} clé${keyCount > 1 ? 's' : ''}`}
              hint="Déclarer un poste CLÉ, c’est y concentrer l’attention et les moyens. Au-delà de trois, « clé » cesse de vouloir dire quelque chose."
            >
              {keyCount > 3 ? (
                <p className="mb-4 inline-flex items-center gap-2 rounded-lg bg-(--warning-subtle) px-3 py-2 text-sm font-medium text-(--warning)">
                  <TriangleAlert aria-hidden className="h-4 w-4" />
                  {keyCount} postes clés : au-delà de trois, plus aucun ne l’est vraiment.
                </p>
              ) : null}
              <PositionEditor
                positions={das.positions}
                inheritedHeadcount={das.inheritedHeadcount}
                directions={context.directions}
                locked={locked}
                onChange={(positions) => {
                  update({ positions });
                  push('positions', { positions });
                }}
              />
            </Accordion>
          ) : null}

          {/* ── Pilotage ─────────────────────────────────────────────────── */}
          {isOn(modules, 'org.kpis') ? (
            <Accordion
              title="Indicateurs de pilotage"
              indicators={{ topic: 'org-structure', dasId: activeDas }}
              summary={`${kpisChosen} sur ${context.directions.length}`}
              hint="Choisir un indicateur, c’est décider de ce que la direction va optimiser — donc de ce qu’elle va sacrifier. Un responsable de production suivi sur le coût unitaire et un autre suivi sur le taux de rebut ne prendront pas les mêmes décisions."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Un indicateur par direction</legend>
                <ul className="divide-y divide-(--border) rounded-lg border border-(--border)">
                  {context.directions.map((direction) => {
                    const current = das.kpis.find((k) => k.directionKey === direction.key);
                    const options = context.kpis.filter((k) => k.directionKey === direction.key);
                    const chosen = options.find((o) => o.key === current?.kpiKey);

                    return (
                      <li key={direction.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1 text-sm font-medium">{direction.name}</span>
                        <span className="flex w-full items-center gap-2 sm:w-auto">
                          <select
                            aria-label={`Indicateur de la direction ${direction.name}`}
                            value={current?.kpiKey ?? ''}
                            onChange={(e) => {
                              const kpis = das.kpis.filter((k) => k.directionKey !== direction.key);
                              if (e.target.value) {
                                kpis.push({ directionKey: direction.key, kpiKey: e.target.value });
                              }
                              update({ kpis });
                              push('kpis', {
                                kpis: kpis.map((k) => ({ ...k, targetValue: null })),
                              });
                            }}
                            className="w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm sm:w-80"
                          >
                            <option value="">— aucun indicateur —</option>
                            {options.map((o) => (
                              <option key={o.key} value={o.key}>{o.name}</option>
                            ))}
                          </select>
                          {chosen ? <InfoHint label={chosen.name}>{chosen.description}</InfoHint> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </Accordion>
          ) : null}

          {/* ── Budgets ──────────────────────────────────────────────────── */}
          {isOn(modules, 'org.budgets') ? (
            <Accordion
              title="Répartition des moyens"
              indicators={{ topic: 'org-moyens', dasId: activeDas }}
              summary={overBudget ? `dépassement ${formatMadCompact(budgetTotal - context.operatingBudgetMad)}` : `${formatPct(budgetShare, 0)} réparti`}
              hint="Là où va l’argent dit ce que vous faites vraiment. Déclarer une différenciation en finançant la production comme une usine low-cost est l’incohérence que le moteur relève le plus sûrement."
            >
              {/* ── L'assiette, en permanence sous les yeux ──────────────────
                  On répartit un pourcentage d'un total : sans ce total affiché,
                  « 12 % à la production » ne dit pas si c'est 200 M ou 2 Md, et la
                  répartition se fait à l'aveugle. */}
              <dl className="tabular mb-4 grid gap-4 rounded-lg bg-(--surface-muted) p-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-(--foreground-muted)">Budget total à répartir</dt>
                  <dd className="font-mono text-base font-semibold">{formatMadCompact(context.operatingBudgetMad)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-(--foreground-muted)">Réparti</dt>
                  <dd className={`font-mono text-base font-semibold ${overBudget ? 'text-(--negative)' : ''}`}>
                    {formatMadCompact(budgetTotal)} · {formatPct(budgetShare, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-(--foreground-muted)">{overBudget ? 'Dépassement' : 'Non affecté'}</dt>
                  <dd className={`font-mono text-base font-semibold ${overBudget ? 'text-(--negative)' : ''}`}>
                    {overBudget ? '− ' : ''}{formatMadCompact(Math.abs(context.operatingBudgetMad - budgetTotal))}
                  </dd>
                </div>
              </dl>

              {overBudget ? (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-(--negative-subtle) px-3 py-2 text-sm text-(--negative)">
                  <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  Vous répartissez plus que votre marge brute attendue. Le moteur ne créera pas
                  l’argent manquant : l’écart se paiera en trésorerie.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {context.directions.map((direction) => {
                  const budget = das.budgets.find((b) => b.directionKey === direction.key)?.budgetMad ?? 0;
                  // Le pourcentage porte sur l'ASSIETTE, pas sur ce qui est déjà
                  // réparti : sinon déplacer un curseur changerait le libellé de
                  // tous les autres sans que personne y ait touché.
                  const pct = context.operatingBudgetMad > 0
                    ? (budget / context.operatingBudgetMad) * 100
                    : 0;

                  const setPct = (next: number) => {
                    const budgets = das.budgets.filter((b) => b.directionKey !== direction.key);
                    budgets.push({
                      directionKey: direction.key,
                      budgetMad: Math.round((next / 100) * context.operatingBudgetMad),
                    });
                    update({ budgets });
                    push('budgets', { budgets });
                  };

                  return (
                    <div key={direction.key} className="rounded-lg border border-(--border) p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{direction.name}</span>
                        <span className="tabular font-mono text-sm">
                          {formatPct(pct / 100, 1)}
                          <span className="ml-2 text-(--foreground-muted)">{formatMadCompact(budget)}</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        disabled={locked}
                        value={Math.round(pct)}
                        aria-label={`Part du budget allouée à ${direction.name}`}
                        onChange={(event) => setPct(Number(event.target.value))}
                        className="mt-2 w-full accent-(--accent)"
                      />
                    </div>
                  );
                })}
              </div>
            </Accordion>
          ) : null}
        </div>
      </main>

      <div className="sticky bottom-0 z-10 border-t border-(--border) bg-(--surface)">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <SaveIndicator
              state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
              savedAt={autosave.savedAt}
            />
            <InfoHint label="Enregistrement de vos saisies">
              Vos saisies sont enregistrées au fil de la frappe. « Terminer la conception » envoie
              ce qui reste en file et recharge l’écran avec les valeurs enregistrées.
            </InfoHint>
          </div>
          <button
            type="button" disabled={pending || locked}
            onClick={async () => {
              await autosave.flush();
              startTransition(() => router.refresh());
            }}
            className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-6 py-3 font-medium text-(--on-accent) disabled:opacity-40"
          >
            {locked ? 'Tour verrouillé' : 'Terminer la conception'}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Les grandeurs de dotation d'un domaine.
 *
 * L'effectif et la masse salariale viennent du dernier exercice clos : c'est le
 * seul état RH connu au moment de décider. Avant la première résolution, on
 * retombe sur l'effectif du groupe, faute de mieux.
 */
function basisFor(das: OrgContext['das'][number], context: OrgContext): VariationBasis {
  return {
    treasuryMad: context.operatingBudgetMad,
    payrollMad: das.hrState?.payrollMad ?? 0,
    headcount: das.hrState?.headcount ?? context.headcount,
    smigMad: SMIG_MAD,
    operatingBudgetMad: context.operatingBudgetMad,
    directionCount: context.directions.length,
  };
}

/**
 * Salaire minimum légal mensuel, secteur industriel. Sert de plancher à la
 * dotation salariale quand aucun exercice n'est encore clos.
 */
const SMIG_MAD = 3111;

/**
 * L'écart d'effectif d'un poste par rapport à l'organigramme hérité.
 *
 * Un poste absent de l'héritage est un poste CRÉÉ ce tour-ci : le dire
 * explicitement évite qu'un « +12 » laisse croire à un renfort alors que
 * l'équipe vient d'ouvrir une direction entière.
 */
function HeadcountDelta({
  current,
  inherited,
}: {
  current: number;
  inherited: number | undefined;
}) {
  if (inherited === undefined) {
    return (
      <span className="text-xs text-(--foreground-muted)">nouveau poste</span>
    );
  }

  const diff = current - inherited;
  if (diff === 0) {
    return (
      <span className="tabular text-sm text-(--foreground-muted)">
        = hérité ({inherited})
      </span>
    );
  }

  return (
    <span className="tabular text-sm font-medium text-(--foreground)">
      {diff > 0 ? '↑ +' : '↓ −'}
      {Math.abs(diff)}
      <span className="ml-1 font-normal text-(--foreground-muted)">vs {inherited} hérité</span>
    </span>
  );
}

/** Éditeur d'organigramme : ajouter, retirer, hiérarchiser, prioriser. */
function PositionEditor({
  positions, directions, locked, onChange, inheritedHeadcount,
}: {
  positions: PositionDraft[];
  directions: { key: string; name: string }[];
  locked: boolean;
  onChange: (positions: PositionDraft[]) => void;
  /** Effectif hérité par intitulé de poste : la référence des écarts. */
  inheritedHeadcount: Record<string, number>;
}) {
  const patch = (index: number, values: Partial<PositionDraft>) =>
    onChange(positions.map((p, i) => (i === index ? { ...p, ...values } : p)));

  return (
    <div className="min-w-0">
      <div className="space-y-2">
        {positions
          .map((position, index) => ({ position, index }))
          .sort((a, b) => a.position.hierarchyLevel - b.position.hierarchyLevel)
          .map(({ position, index }) => (
            <div
              key={`${position.directionKey}-${position.title}-${index}`}
              className={`rounded-lg border p-3 ${position.isKeyPosition ? 'border-(--accent) bg-(--accent-subtle)/40' : 'border-(--border)'}`}
              // Le retrait visuel matérialise la profondeur hiérarchique.
              style={{ marginLeft: `${(position.hierarchyLevel - 1) * 16}px` }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Intitulé du poste"
                  disabled={locked} value={position.title}
                  onChange={(e) => patch(index, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm font-medium"
                />
                <select
                  aria-label="Direction"
                  disabled={locked} value={position.directionKey}
                  onChange={(e) => patch(index, { directionKey: e.target.value })}
                  className="rounded-md border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm"
                >
                  {directions.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
                </select>
                <select
                  aria-label="Niveau hiérarchique"
                  disabled={locked} value={position.hierarchyLevel}
                  onChange={(e) => patch(index, { hierarchyLevel: Number(e.target.value) })}
                  className="rounded-md border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm"
                >
                  {LEVELS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="text-(--foreground-muted)">Effectif</span>
                  <NumberInput
                    disabled={locked} value={position.headcount}
                    onChange={(v) => patch(index, { headcount: v })}
                    className="w-24 text-sm"
                  />
                  {/* L'organigramme se reprend d'un tour à l'autre : ce qui
                      compte n'est pas « 40 personnes » mais « quatre de plus
                      qu'à l'ouverture ». */}
                  <HeadcountDelta
                    current={position.headcount}
                    inherited={inheritedHeadcount[position.title]}
                  />
                </label>
                <button
                  type="button" disabled={locked} aria-pressed={position.isKeyPosition}
                  onClick={() => patch(index, { isKeyPosition: !position.isKeyPosition })}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    position.isKeyPosition
                      ? 'border-(--accent) font-semibold text-(--accent-text)'
                      : 'border-(--border) text-(--foreground-muted) enabled:hover:border-(--border-strong)'
                  }`}
                >
                  <Star aria-hidden className="h-3.5 w-3.5" fill={position.isKeyPosition ? 'currentColor' : 'none'} />
                  poste clé
                </button>
                <button
                  type="button" disabled={locked}
                  onClick={() => onChange(positions.filter((_, i) => i !== index))}
                  className="rounded-md px-2.5 py-1.5 text-sm text-(--foreground-muted) enabled:hover:bg-(--negative-subtle) enabled:hover:text-(--negative) disabled:opacity-50"
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
      </div>

      <button
        type="button" disabled={locked}
        onClick={() =>
          onChange([
            ...positions,
            {
              directionKey: directions[0]?.key ?? 'production',
              title: 'Nouveau poste', hierarchyLevel: 3,
              headcount: 0, budgetMad: 0, isKeyPosition: false,
            },
          ])
        }
        className="mt-3 rounded-lg border border-dashed border-(--border-strong) px-4 py-2 text-sm font-medium text-(--accent-text) enabled:hover:bg-(--accent-subtle) disabled:opacity-50"
      >
        + Ajouter un poste
      </button>
    </div>
  );
}
