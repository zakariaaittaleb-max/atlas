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
 * ───────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { useDasScope } from '@/components/das-scope';
import { NumberInput, SaveIndicator } from '@/components/decision-shell';
import { formatMadCompact, formatPct } from '@/lib/format';
import type { DasOrganisation, OrgContext, PositionDraft } from '@/lib/org-types';
import { useAutosave } from '@/lib/use-autosave';

import { anyOn, isOn, type EnabledModules } from '@/lib/modules-state';

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
}: {
  context: OrgContext;
  modules: EnabledModules;
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
        <h1 className="text-3xl font-semibold tracking-tight">Organisation</h1>
        <p className="mt-4 text-(--foreground-muted)">
          Vous n’exploitez aucun domaine d’activité pour l’instant.
        </p>
      </main>
    );
  }

  const budgetTotal = das.budgets.reduce((acc, b) => acc + b.budgetMad, 0);
  const keyCount = das.positions.filter((p) => p.isKeyPosition).length;

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Exercice {context.roundNumber} · {context.teamName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Organisation</h1>
          <p className="mt-3 max-w-3xl text-(--foreground-muted)">
            Chaque domaine d’activité se structure séparément : un métier industriel et un métier
            de compétences ne se pilotent pas de la même façon. Ces choix pèsent{' '}
            <strong>35 % de votre indice d’alignement</strong>, et donc sur votre chiffre
            d’affaires.
          </p>
          {das.inheritedFromRound !== null && das.inheritedFromRound < context.roundNumber ? (
            <p className="mt-3 rounded-lg border border-(--border) px-4 py-2.5 text-sm text-(--foreground-muted)">
              Organisation héritée de l’exercice {das.inheritedFromRound}. Elle reste en vigueur
              tant que vous ne la modifiez pas — comme dans une entreprise réelle.
            </p>
          ) : null}
        </header>

        {/* Le sélecteur de domaine n'est plus ici : il vit dans la barre de
            navigation, où il suit l'équipe d'un écran à l'autre. En garder une
            copie sur cette page donnait deux commandes pour une seule question,
            et rien ne disait laquelle faisait foi. */}

        {/* ── Directives du Groupe ─────────────────────────────────────── */}
        {anyOn(modules, DIRECTIVES_KEYS) ? (
        <Section
          title="Ce DAS face aux directives du Groupe"
          hint="Le groupe arbitre, ce DAS se situe. Suivre une directive inadaptée à votre métier dégrade votre cohérence propre ; s’en écarter dégrade celle du groupe. Les deux coûtent — c’est l’arbitrage."
        >
          {context.group === null ? (
            <p className="rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
              Votre groupe n’a pas encore arrêté sa stratégie. Renseignez-la dans{' '}
              <a href="/strategie" className="underline">Stratégie</a> : sans directive,
              se positionner n’a pas de sens.
            </p>
          ) : (
            <fieldset disabled={locked} className="space-y-6">
              {isOn(modules, 'org.portfolio_role') ? (
              <div>
                <span className="text-sm font-medium">
                  Rôle de ce DAS dans le portefeuille
                </span>
                <p className="mt-1 text-sm text-(--foreground-muted)">
                  Ce n’est pas un titre honorifique : le rôle fixe l’intensité d’investissement
                  attendue. Un « moteur » qu’on ne finance pas est une contradiction, et un
                  portefeuille sans « soutien » ni « réserve » est un portefeuille qui n’arbitre pas.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PORTFOLIO_ROLES.map(([value, label, hint]) => (
                    <button
                      key={value} type="button" disabled={locked}
                      onClick={() => {
                        const directives = { ...das.directives, portfolioRole: value };
                        update({ directives });
                        push('directives', directives);
                      }}
                      className="rounded-lg border px-4 py-3 text-left text-sm"
                      style={{
                        borderColor: das.directives.portfolioRole === value
                          ? 'var(--accent)' : 'var(--border)',
                        background: das.directives.portfolioRole === value
                          ? 'var(--surface-muted)' : undefined,
                      }}
                    >
                      <span className="font-medium">{label}</span>
                      <span className="mt-1 block text-(--foreground-muted)">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              {anyOn(modules, HQ_KEYS) ? (
              <div>
                <span className="text-sm font-medium">Fonctions déléguées au siège</span>
                <p className="mt-1 text-sm text-(--foreground-muted)">
                  Ce que le groupe a centralisé figure en regard. Refuser une centralisation
                  décidée en haut brise l’économie d’échelle ; l’accepter quand votre métier
                  exige de la réactivité vous coûte cette réactivité.
                </p>
                <div className="mt-3 space-y-2">
                  {HQ_FUNCTIONS.filter(([, , moduleKey]) => isOn(modules, moduleKey)).map(([key, label]) => {
                    const central = context.group![CENTRAL_OF[key]];
                    const delegated = das.directives[key];
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--border) px-4 py-3"
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="ml-2 text-sm text-(--foreground-muted)">
                            {central ? 'centralisée par le groupe' : 'laissée aux DAS'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {central !== delegated ? (
                            <span className="text-sm text-(--negative)">divergence</span>
                          ) : null}
                          <button
                            type="button" disabled={locked}
                            onClick={() => {
                              const directives = { ...das.directives, [key]: !delegated };
                              update({ directives });
                              push('directives', directives);
                            }}
                            className="rounded-lg border px-3 py-1.5 text-sm"
                            style={{
                              borderColor: delegated ? 'var(--accent)' : 'var(--border)',
                              background: delegated ? 'var(--surface-muted)' : undefined,
                            }}
                          >
                            {delegated ? 'déléguée' : 'gardée ici'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              ) : null}

              {das.sharedOffers.length > 0 && isOn(modules, 'org.shared_resources') ? (
                <div>
                  <span className="text-sm font-medium">Ressources mutualisées ouvertes à ce DAS</span>
                  <p className="mt-1 text-sm text-(--foreground-muted)">
                    Mutualiser entre métiers proches produit des économies ; entre métiers
                    étrangers, surtout de la coordination. La proximité indiquée est celle de
                    ce DAS aux autres utilisateurs — en dessous de 40, s’abstenir est le bon choix.
                    On ne standardise que ce qu’on a d’abord réellement adopté.
                  </p>
                  <div className="mt-3 space-y-3">
                    {das.sharedOffers.map((offer, i) => (
                      <div key={offer.resourceKey} className="rounded-lg border border-(--border) p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{offer.label}</span>
                          <span className="tabular text-sm text-(--foreground-muted)">
                            proximité {Math.round(offer.proximity)}
                          </span>
                        </div>
                        <label className="mt-3 block">
                          <span className="text-sm text-(--foreground-muted)">
                            Adhésion : {offer.adoptionLevel}
                          </span>
                          <input
                            type="range" min={0} max={100} step={5}
                            value={offer.adoptionLevel} disabled={locked}
                            onChange={(e) => {
                              const level = Number(e.target.value);
                              const next = das.sharedOffers.map((o, j) =>
                                j === i
                                  ? { ...o, adoptionLevel: level,
                                      standardised: o.standardised && level >= 50 }
                                  : o,
                              );
                              update({ sharedOffers: next });
                              push('mutualisation', {
                                resources: next.map((o) => ({
                                  resourceKey: o.resourceKey,
                                  adoptionLevel: o.adoptionLevel,
                                  standardised: o.standardised,
                                })),
                              });
                            }}
                            className="mt-2 w-full"
                          />
                        </label>
                        <label className="mt-2 flex items-center gap-2 text-sm">
                          <input
                            type="checkbox" checked={offer.standardised}
                            disabled={locked || offer.adoptionLevel < 50}
                            onChange={(e) => {
                              const next = das.sharedOffers.map((o, j) =>
                                j === i ? { ...o, standardised: e.target.checked } : o,
                              );
                              update({ sharedOffers: next });
                              push('mutualisation', {
                                resources: next.map((o) => ({
                                  resourceKey: o.resourceKey,
                                  adoptionLevel: o.adoptionLevel,
                                  standardised: o.standardised,
                                })),
                              });
                            }}
                          />
                          <span className={offer.adoptionLevel < 50 ? 'text-(--foreground-muted)' : ''}>
                            Standardiser sur cette plateforme
                            {offer.adoptionLevel < 50 ? ' — exige au moins 50 d’adhésion' : ''}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </fieldset>
          )}
        </Section>
        ) : null}

        {/* ── Ressources humaines ──────────────────────────────────────── */}
        {anyOn(modules, HR_KEYS) ? (
        <Section
          title="Ressources humaines de ce domaine"
          hint="Chaque métier a sa pyramide et sa sensibilité à la formation. Les indicateurs du dernier exercice figurent en tête : on décide en regardant d’où l’on part."
        >
          <HrSection
            hr={das.hr}
            state={das.hrState}
            locked={locked}
            modules={modules}
            onChange={(hr) => {
              update({ hr });
              push('hr', { ...hr });
            }}
          />
        </Section>
        ) : null}

        {/* ── Axes stratégiques ────────────────────────────────────────────
            La vision et la mission ont été retirées d'ici : elles étaient déjà
            saisies au niveau Groupe, sur `/strategie`. Une entreprise a UNE
            vision ; ce qu'un domaine déclare de spécifique, ce sont ses axes —
            et eux, contrairement à un texte libre, pèsent sur l'alignement. */}
        {isOn(modules, 'org.axes') ? (
        <Section
          title="Axes stratégiques"
          hint="La vision et la mission du Groupe se déclarent dans l’écran Stratégie. Ici, ce domaine dit ce qu’il PRIORISE — et c’est cela qui est mesuré."
        >
          <fieldset disabled={locked}>
            <legend className="mb-1 text-sm font-medium">
              Vos trois axes stratégiques, par ordre de priorité
            </legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              L’ordre compte : le premier axe pèse trois fois plus que le troisième. Choisir trois
              priorités n’est un arbitrage que si l’on en écarte d’autres.
            </p>

            <ol className="mb-3 space-y-2">
              {[0, 1, 2].map((rank) => {
                const key = das.axisKeys[rank];
                const axis = context.axes.find((a) => a.key === key);
                return (
                  <li key={rank} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border) p-3">
                    <span className="tabular w-6 font-semibold text-(--foreground-muted)">{rank + 1}</span>
                    <select
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
                    {axis ? (
                      <span className="w-full text-xs text-(--foreground-muted)">{axis.description}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </fieldset>
        </Section>
        ) : null}

        {/* ── Délégation ───────────────────────────────────────────────────
            La FORME de structure a été retirée d'ici : elle se décide au niveau
            Groupe, sur `/strategie`. Le moteur la juge en la comparant au NOMBRE
            de domaines — « fonctionnelle au-delà de quatre métiers », « matricielle
            pour un seul » — ce qui n'a de sens qu'à l'échelle de l'entreprise. La
            copie par domaine n'était lue par aucun calcul : deux commandes pour
            une seule question, dont une sans effet. */}
        {isOn(modules, 'org.delegation') ? (
        <Section
          title="Délégation"
          hint="La forme de structure se décide au niveau Groupe, dans l’écran Stratégie. Ce qui se règle ici est le degré d’autonomie laissé à CE métier — et ni le sommet ni le terrain n’ont raison dans l’absolu : standardiser sert les coûts, décider vite sert une niche exigeante."
        >
          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-medium">
              Niveau de délégation : <span className="tabular">{das.delegationLevel}</span>
            </legend>
            <input
              type="range" min={0} max={100} step={5} value={das.delegationLevel}
              onChange={(e) => {
                const delegationLevel = Number(e.target.value);
                update({ delegationLevel });
                push('design', { delegationLevel });
              }}
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-(--foreground-muted)">
              <span>0 — toute décision remonte au sommet</span>
              <span>100 — le terrain décide seul</span>
            </div>
          </fieldset>
        </Section>
        ) : null}

        {/* ── Organigramme ─────────────────────────────────────────────── */}
        {isOn(modules, 'org.positions') ? (
        <Section
          title="Organigramme"
          hint={`Déclarer un poste CLÉ, c'est y concentrer l'attention et les moyens. Au-delà de trois, « clé » cesse de vouloir dire quelque chose — vous en avez ${keyCount}.`}
        >
          <PositionEditor
            positions={das.positions}
            directions={context.directions}
            locked={locked}
            onChange={(positions) => {
              update({ positions });
              push('positions', { positions });
            }}
          />
        </Section>
        ) : null}

        {/* ── Pilotage ─────────────────────────────────────────────────── */}
        {isOn(modules, 'org.kpis') ? (
        <Section
          title="Indicateurs de pilotage"
          hint="Choisir un indicateur, c'est décider de ce que la direction va optimiser — donc de ce qu'elle va sacrifier. Un responsable de production suivi sur le coût unitaire et un autre suivi sur le taux de rebut ne prendront pas les mêmes décisions."
        >
          <div className="space-y-3">
            {context.directions.map((direction) => {
              const current = das.kpis.find((k) => k.directionKey === direction.key);
              const options = context.kpis.filter((k) => k.directionKey === direction.key);
              const chosen = options.find((o) => o.key === current?.kpiKey);

              return (
                <div key={direction.key} className="rounded-lg border border-(--border) p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 text-sm font-medium">{direction.name}</span>
                    <select
                      disabled={locked}
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
                  </div>
                  {chosen ? (
                    <p className="mt-2 text-xs text-(--foreground-muted)">{chosen.description}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
        ) : null}

        {/* ── Budgets ──────────────────────────────────────────────────── */}
        {isOn(modules, 'org.budgets') ? (
        <Section
          title="Répartition des moyens"
          hint="Là où va l'argent dit ce que vous faites vraiment. Déclarer une différenciation en finançant la production comme une usine low-cost est l'incohérence que le moteur relève le plus sûrement."
        >
          <p className="tabular mb-4 text-sm text-(--foreground-muted)">
            Assiette répartissable : <strong>{formatMadCompact(context.operatingBudgetMad)}</strong>
            {' · '}réparti : <strong>{formatMadCompact(budgetTotal)}</strong>
            {budgetTotal > 0 ? ` (${formatPct(budgetTotal / Math.max(context.operatingBudgetMad, 1), 0)})` : ''}
          </p>

          <div className="space-y-2">
            {context.directions.map((direction) => {
              const budget = das.budgets.find((b) => b.directionKey === direction.key)?.budgetMad ?? 0;
              const share = budgetTotal > 0 ? budget / budgetTotal : 0;

              return (
                <div key={direction.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--border) p-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{direction.name}</span>
                  <NumberInput
                    disabled={locked} value={Math.round(budget)}
                    onChange={(value) => {
                      const budgets = das.budgets.filter((b) => b.directionKey !== direction.key);
                      budgets.push({ directionKey: direction.key, budgetMad: value });
                      update({ budgets });
                      push('budgets', { budgets });
                    }}
                    className="w-44 text-sm"
                  />
                  <span className="tabular w-14 text-right text-sm text-(--foreground-muted)">
                    {formatPct(share, 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
        ) : null}
      </main>

      <div className="sticky bottom-0 border-t border-(--border) bg-(--surface)">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <SaveIndicator
            state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
          />
          <button
            type="button" disabled={pending || locked}
            onClick={async () => {
              await autosave.flush();
              startTransition(() => router.refresh());
            }}
            className="rounded-lg bg-(--accent) px-6 py-3 font-medium text-white disabled:opacity-40"
          >
            {locked ? 'Tour verrouillé' : 'Terminer la conception'}
          </button>
        </div>
      </div>
    </>
  );
}

function Section({
  title, hint, children,
}: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">{hint}</p>
      {children}
    </section>
  );
}

/** Éditeur d'organigramme : ajouter, retirer, hiérarchiser, prioriser. */
function PositionEditor({
  positions, directions, locked, onChange,
}: {
  positions: PositionDraft[];
  directions: { key: string; name: string }[];
  locked: boolean;
  onChange: (positions: PositionDraft[]) => void;
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
              className="rounded-lg border p-3"
              style={{
                borderColor: position.isKeyPosition ? 'var(--accent)' : 'var(--border)',
                // Le retrait visuel matérialise la profondeur hiérarchique.
                marginLeft: `${(position.hierarchyLevel - 1) * 16}px`,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  disabled={locked} value={position.title}
                  onChange={(e) => patch(index, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm font-medium"
                />
                <select
                  disabled={locked} value={position.directionKey}
                  onChange={(e) => patch(index, { directionKey: e.target.value })}
                  className="rounded border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm"
                >
                  {directions.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
                </select>
                <select
                  disabled={locked} value={position.hierarchyLevel}
                  onChange={(e) => patch(index, { hierarchyLevel: Number(e.target.value) })}
                  className="rounded border border-(--border) bg-(--surface) px-2.5 py-1.5 text-sm"
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
                </label>
                <button
                  type="button" disabled={locked} aria-pressed={position.isKeyPosition}
                  onClick={() => patch(index, { isKeyPosition: !position.isKeyPosition })}
                  className="rounded border px-2.5 py-1.5 text-sm"
                  style={{
                    borderColor: position.isKeyPosition ? 'var(--accent)' : 'var(--border)',
                    fontWeight: position.isKeyPosition ? 600 : 400,
                  }}
                >
                  {position.isKeyPosition ? '★ poste clé' : '☆ poste clé'}
                </button>
                <button
                  type="button" disabled={locked}
                  onClick={() => onChange(positions.filter((_, i) => i !== index))}
                  className="rounded border border-(--border) px-2.5 py-1.5 text-sm text-(--foreground-muted)"
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
        className="mt-3 rounded-lg border border-(--border) px-4 py-2 text-sm"
      >
        Ajouter un poste
      </button>
    </div>
  );
}
