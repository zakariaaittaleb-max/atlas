'use client';

/**
 * ATLAS — finance du Groupe : plan 7 du cahier, et la consolidation RH.
 *
 * ── POURQUOI LA RH N'EST PLUS SAISIE ICI ───────────────────────────────────
 * Elle l'était, en double. Cet écran demandait « combien recrutez-vous ? » au
 * niveau du Groupe pendant que l'écran d'organisation posait la même question
 * domaine par domaine, et les deux écrivaient dans des tables différentes. Une
 * équipe pouvait donc recruter deux fois sans le savoir, et le total affiché
 * dépendait de l'écran qu'elle avait ouvert en dernier.
 *
 * Le recrutement se décide là où il a un sens — DANS un domaine, avec sa
 * pyramide, son climat social et sa charge de travail sous les yeux. Le Groupe
 * n'en saisit rien : il en CONSTATE la somme, et c'est cette somme qui alimente
 * sa masse salariale. Le bloc ci-dessous est donc un relevé, avec un lien vers
 * les domaines qui restent à renseigner.
 *
 * ── DEUX RÈGLES D'INTERFACE CONSERVÉES ─────────────────────────────────────
 *   • L'allocation se fait sous CONTRAINTE DE TRÉSORERIE VISIBLE. La barre ne
 *     bloque pas la saisie — elle montre le dépassement pendant qu'on arbitre.
 *     Une équipe a le droit de plonger en trésorerie négative ; elle n'a pas le
 *     droit de le découvrir à la résolution.
 *   • Les résultats figurent AVANT les décisions : on arbitre en regardant d'où
 *     l'on part. Les quatre chiffres qui commandent le tour sont en cartes, en
 *     tête ; le détail des résultats et des ratios suit, replié, avant le bloc
 *     de décisions.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import {
  BudgetGauge, DecisionBar, SectionActions, type MissingDecision,
} from '@/components/decision-shell';
import { Term } from '@/components/term';
import { Accordion } from '@/components/ui/accordion';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
import { formatMadCompact } from '@/lib/format';
import type { DecisionContext, FinanceValues } from '@/lib/decision-types';
import { deepEqual } from '@/lib/deep-equal';
import type { MoneyBar, ResultsContext } from '@/lib/results-types';
import { CashPooling } from './cash-pooling';
import { CreditSlider } from './credit-slider';
import { LeversSection, leverStates, type FinancialLever } from './levers-section';
import { IndicatorsSection } from './indicators-section';
import { ResultsSection } from './results-section';
import { isOn, screenIsOpen, type EnabledModules } from '@/lib/modules-state';
import { VariationField } from '@/components/variation-field';
import { endowmentReference } from '@/lib/variation-references';
import { referenceOf, type VariationScale } from '@/lib/variation-scale';
import { useAutosave } from '@/lib/use-autosave';

/**
 * Les trois postes financiers du groupe : clé de module, champ, famille
 * d'échelle, libellé, et ce qu'il faut savoir avant de décider.
 */
const FINANCE_FIELDS = [
  ['finance.opex', 'opexMad', 'siege', 'Frais de fonctionnement du siège',
    'Loyers, systèmes, direction générale. Mutualiser des métiers proches les allège. '
    + 'Un siège se dégraisse, il ne se supprime pas : sous un plancher, la charge revient.'],
] as const satisfies readonly (readonly [string, 'opexMad', string, string, string])[];

/** Les montants qui se saisissent en valeur, bornés par un fait et non par un écart. */
const MONEY_FIELDS = [
  ['finance.capital_raise', 'capitalRaisedMad', 'Levée de fonds propres',
    'Vos actionnaires remettent au pot. Élargit directement votre capacité d’endettement — '
    + 'et se paie 2 % de frais d’émission.'],
  ['finance.dividend', 'dividendMad', 'Dividende',
    'Se vote sur l’exercice clos, et ne peut pas dépasser son résultat net. '
    + 'Rémunérer l’actionnaire, c’est autant de moins pour financer la croissance.'],
] as const satisfies readonly (readonly [string, 'capitalRaisedMad' | 'dividendMad', string, string])[];

export function FinanceView({
  context, missing, modules, scales, results, money, levers,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  modules: EnabledModules;
  scales: Readonly<Record<string, VariationScale>>;
  results: ResultsContext;
  /** La MÊME définition que la barre du haut : un seul « engagé ce tour ». */
  money: MoneyBar | null;
  /** Le référentiel des six leviers, tel qu'il vit en base. */
  levers: FinancialLever[];
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const locked = !context.decisionsOpen;

  const [finance, setFinance] = useState<FinanceValues>(context.finance);

  const pushFinance = useCallback((next: FinanceValues) => {
    setFinance(next);
    autosave.save({ plan: 'finance', ...next });
  }, [autosave]);

  const hr = context.hr;

  const basis = {
    treasuryMad: context.treasuryMad,
    payrollMad: hr.payrollMad,
    headcount: context.headcount,
    smigMad: context.smigMad,
    operatingBudgetMad: 0,
    directionCount: 0,
  };

  // Une seule définition de « engagé ce tour », partagée avec la barre du haut.
  // La part des DAS et la masse salariale viennent du serveur — elles se
  // décident ailleurs ; les champs de CET écran restent vivants sous la frappe.
  const drawnMad = Math.max(finance.netCreditMad, 0);
  const repaidMad = Math.max(-finance.netCreditMad, 0);
  const engaged =
    (money?.dasEngagedMad ?? 0) +
    hr.payrollMad + hr.trainingBudgetMad + finance.opexMad + repaidMad + finance.dividendMad;
  const available =
    context.treasuryMad + drawnMad + finance.capitalRaisedMad * 0.98;
  // Les transferts entre domaines n'entrent PAS dans la jauge : ils déplacent
  // la trésorerie du groupe sans en créer ni en consommer. Leur coût est une
  // perte de compétitivité sur le domaine ponctionné, pas une sortie de cash.

  const activeLevers = [...leverStates(levers, finance, context.financeLimits, context.das.length).values()]
    .filter((state) => state.status === 'active').length;

  const creditSummary =
    finance.netCreditMad > 0 ? `tirage ${formatMadCompact(finance.netCreditMad)}`
    : finance.netCreditMad < 0 ? `remboursement ${formatMadCompact(-finance.netCreditMad)}`
    : 'aucun mouvement de dette';

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            Tour {context.roundNumber} · niveau Groupe
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            Finance du Groupe
            <InfoHint label="Finance du Groupe">
              Cet écran ne porte que des décisions de niveau Groupe : elles valent pour tous vos
              domaines à la fois. Ce qui se décide domaine par domaine — stratégie,
              investissements, recrutement — se saisit sur les écrans dédiés.
            </InfoHint>
          </h1>
        </header>

        <div className="space-y-4">
          {/* ── Les chiffres qui commandent le tour ───────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Trésorerie d’ouverture"
              value={formatMadCompact(context.treasuryMad)}
              note="Au début du tour"
            />
            <StatCard
              label="Engagé ce tour"
              value={formatMadCompact(engaged)}
              note={
                engaged > available
                  ? `Dépassement de ${formatMadCompact(engaged - available)}`
                  : `Sur ${formatMadCompact(available)} disponibles`
              }
              hint="Engagements des domaines, masse salariale, formation, siège, remboursements et dividende. Les transferts entre domaines n’y entrent pas : ils déplacent la trésorerie sans en consommer."
            />
            <StatCard
              label="Résultat net"
              value={results.group ? formatMadCompact(results.group.netIncomeMad) : '—'}
              note={results.group ? `Exercice ${results.roundNumber}` : 'Aucun exercice clos'}
            />
            <StatCard
              label="Capacité d’endettement"
              value={formatMadCompact(context.financeLimits.capacityAvailableMad)}
              note={
                context.debtOutstandingMad > 0
                  ? `Encours ${formatMadCompact(context.debtOutstandingMad)}`
                  : 'Aucune dette en cours'
              }
              hint="Ce que la banque prêterait encore : le plus contraignant de deux fois vos fonds propres et de 40 % de votre activité, moins l’encours."
            />
          </div>

          <BudgetGauge
            label="Charges et remboursements engagés ce tour"
            allocated={engaged}
            available={available}
          />

          {/* Les résultats AVANT les décisions. */}
          <Accordion
            title="Vos résultats"
            summary={results.group ? `résultat net ${formatMadCompact(results.group.netIncomeMad)}` : 'aucun exercice clos'}
            hint="Les termes sont ceux de la discipline — ceux que vous emploierez en soutenance et que vous retrouverez dans un manuel. Survolez-en un pour sa définition et un exemple chiffré."
          >
            <ResultsSection results={results} />
          </Accordion>

          {results.group ? (
            <Accordion
              title="Indicateurs financiers"
              summary={`flux libre ${formatMadCompact(results.group.freeCashFlowMad)}`}
              hint="Les grandeurs sur lesquelles un comité de crédit et un actionnaire vous jugeront. Le « + » de chaque ligne montre son calcul avec vos propres chiffres."
            >
              <IndicatorsSection group={results.group} limits={context.financeLimits} />
            </Accordion>
          ) : null}

          {/* ── Les leviers, juste avant les champs qui les actionnent ────── */}
          {levers.length > 0 ? (
            <Accordion
              title="Leviers financiers du Groupe"
              defaultOpen
              summary={`${activeLevers} actionné${activeLevers > 1 ? 's' : ''} sur ${levers.length}`}
              hint="Six façons de faire travailler l’argent du groupe. Chaque carte dit si le levier est joué ce tour, s’il est jouable, et mène au champ qui l’actionne. Sa fiche — bénéfice, risque majeur, mécanisme — est sous son « + »."
            >
              <LeversSection
                levers={levers}
                finance={finance}
                limits={context.financeLimits}
                dasCount={context.das.length}
              />
            </Accordion>
          ) : null}

          {/* ── Plan 7 : finance ──────────────────────────────────────────── */}
          {screenIsOpen(modules, 'finance') ? (
            <Accordion
              title="Vos décisions financières"
              anchor="finance-decisions"
              defaultOpen
              summary={creditSummary}
              hint="Décisions de niveau Groupe, valables pour tous vos domaines. Une équipe déficitaire paie tout de même la cotisation minimale de 0,25 % du chiffre d’affaires : perdre de l’argent tranquillement n’est pas une stratégie."
            >
              <fieldset disabled={locked} className="grid gap-8 sm:grid-cols-2">
                <legend className="sr-only">Vos décisions financières</legend>
                {FINANCE_FIELDS.filter(([key]) => isOn(modules, key)).map(
                  ([key, field, family, label, hint]) => (
                    <VariationField
                      key={key}
                      label={label}
                      hint={hint}
                      value={finance[field]}
                      reference={referenceOf(
                        context.financeBaseline[field],
                        endowmentReference(key, basis),
                      )}
                      scale={scales[family]}
                      unset={!context.financeRecorded}
                      onChange={(v) => pushFinance({ ...finance, [field]: v })}
                    />
                  ),
                )}

                {isOn(modules, 'finance.credit') ? (
                  <div id="levier-credit" className="lever-target rounded-lg">
                    <CreditSlider
                      value={finance.netCreditMad}
                      limits={context.financeLimits}
                      disabled={locked}
                      onChange={(v) => pushFinance({ ...finance, netCreditMad: v })}
                    />
                  </div>
                ) : null}
              </fieldset>

              {isOn(modules, 'finance.cash_pooling') && context.das.length > 1 ? (
                <div id="levier-cash-pooling" className="lever-target rounded-lg">
                  <CashPooling
                    das={context.das}
                    transfers={finance.cashTransfers}
                    disabled={locked}
                    onChange={(next) => pushFinance({ ...finance, cashTransfers: next })}
                  />
                </div>
              ) : null}

              {MONEY_FIELDS.some(([key]) => isOn(modules, key)) ? (
                <fieldset disabled={locked} className="mt-8 grid gap-8 border-t border-(--border) pt-6 sm:grid-cols-2">
                  <legend className="sr-only">Fonds propres et dividende</legend>
                  {MONEY_FIELDS.filter(([key]) => isOn(modules, key)).map(
                    ([key, field, label, hint]) => {
                      const ceiling =
                        field === 'dividendMad' ? context.financeLimits.dividendCeilingMad : null;
                      return (
                        <div
                          key={key}
                          id={field === 'dividendMad' ? 'levier-dividende' : 'levier-capital'}
                          className="lever-target rounded-lg"
                        >
                          <span className="flex items-center gap-2">
                            <label className="text-sm font-medium" htmlFor={`money-${field}`}>
                              {label}
                            </label>
                            <InfoHint label={label}>{hint}</InfoHint>
                          </span>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              id={`money-${field}`}
                              type="text"
                              inputMode="numeric"
                              value={finance[field] === 0 ? '' : String(Math.round(finance[field]))}
                              onChange={(e) => {
                                const raw = Number(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                pushFinance({
                                  ...finance,
                                  [field]: ceiling === null ? raw : Math.min(raw, ceiling),
                                });
                              }}
                              placeholder="0"
                              className="tabular w-48 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                            />
                            <span className="text-sm text-(--foreground-muted)">DH</span>
                          </div>
                          {finance[field] > 0 ? (
                            <p className="tabular mt-1.5 mb-0 text-xs text-(--foreground-muted)">
                              {formatMadCompact(finance[field])}
                              {field === 'capitalRaisedMad'
                                ? ` · ${formatMadCompact(finance[field] * 0.02)} de frais`
                                : ''}
                            </p>
                          ) : null}
                          {ceiling !== null ? (
                            <p className="tabular mt-1.5 mb-0 text-xs text-(--foreground-muted)">
                              {ceiling > 0
                                ? `Plafond : ${formatMadCompact(ceiling)}, le résultat du dernier exercice`
                                : 'Aucun résultat distribuable sur le dernier exercice'}
                            </p>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </fieldset>
              ) : null}

              <SectionActions
                what="le budget du Groupe"
                locked={locked}
                changed={!deepEqual(finance, context.financeBaseline)}
                recorded={context.financeRecorded}
                onValidate={async () => {
                  autosave.save({ plan: 'finance', ...finance });
                  await autosave.flush();
                  router.refresh();
                }}
                onReset={() => pushFinance(context.financeBaseline)}
              />
            </Accordion>
          ) : null}

          {/* ── Consolidation RH — un RELEVÉ, pas une saisie ──────────────────
              Repliée : elle occupait le tiers d'un écran dont l'objet est de
              DÉCIDER, pour n'y montrer que des chiffres déjà arrêtés ailleurs.
              Le titre porte les deux seuls qui engagent la trésorerie du tour ;
              le détail reste à un clic. */}
          <Accordion
            title="Masse salariale consolidée"
            summary={`${formatMadCompact(hr.payrollMad)} · ${hr.headcountEnd.toLocaleString('fr-FR')} pers.`}
            hint="Somme de ce que vous avez décidé sur chaque domaine. Le recrutement se saisit là où il a un sens — dans Organisation & RH, avec le climat social et la charge de travail du domaine sous les yeux."
          >
            <dl className="tabular grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat term="Effectif de départ" value={hr.headcountStart.toLocaleString('fr-FR')} />
              <Stat
                term="Variation d'effectif"
                value={
                  hr.hires === 0 && hr.layoffs === 0
                    ? 'aucune'
                    : [
                        hr.hires > 0 ? `+${hr.hires.toLocaleString('fr-FR')}` : null,
                        hr.layoffs > 0 ? `−${hr.layoffs.toLocaleString('fr-FR')}` : null,
                      ].filter(Boolean).join(' · ')
                }
              />
              <Stat term="Effectif de clôture" value={hr.headcountEnd.toLocaleString('fr-FR')} />
              <Stat term="Masse salariale" value={formatMadCompact(hr.payrollMad)} />
              <Stat
                term="Salaire brut moyen"
                value={`${Math.round(hr.avgSalaryBrutMad).toLocaleString('fr-FR')} DH`}
                note="Pondéré par l’effectif de chaque domaine."
              />
              <Stat term="Budget de formation" value={formatMadCompact(hr.trainingBudgetMad)} />
              <Stat
                term="Charges patronales"
                value={formatMadCompact(
                  hr.payrollMad - hr.payrollMad / (1 + context.chargesPatronalesPct),
                )}
                note={`${(context.chargesPatronalesPct * 100).toFixed(2)} % du brut.`}
              />
              <Stat
                term="SMIG"
                value={`${context.smigMad.toLocaleString('fr-FR')} DH`}
                note="SMIG mensuel, réappliqué côté serveur."
              />
            </dl>

            {hr.pendingDas.length > 0 ? (
              <p className="mt-4 rounded-lg bg-(--warning-subtle) px-4 py-3 text-sm">
                Aucune décision RH ce tour sur{' '}
                {hr.pendingDas.map((d, i) => (
                  <span key={d.dasId}>
                    {i > 0 ? (i === hr.pendingDas.length - 1 ? ' et ' : ', ') : ''}
                    <strong>{d.name}</strong>
                  </span>
                ))}
                .{' '}
                <a href="/organisation" className="font-medium text-(--accent-text) underline">
                  Ouvrir Organisation &amp; RH
                </a>
                <InfoHint label="Décision RH manquante" className="ml-2">
                  Ne rien changer est un choix légitime, mais il doit être posé : ouvrez l’écran
                  d’organisation pour le déclarer.
                </InfoHint>
              </p>
            ) : (
              <p className="mt-4 text-sm text-(--foreground-muted)">
                ✓ Tous vos domaines ont reçu une décision RH ce tour.
              </p>
            )}
          </Accordion>

        </div>
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        savedAt={autosave.savedAt}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

function Stat({
  term, value, note,
}: { term: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-(--surface-muted) px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-sm text-(--foreground-muted)">
        <Term>{term}</Term>
        {note ? <InfoHint label={term}>{note}</InfoHint> : null}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}
