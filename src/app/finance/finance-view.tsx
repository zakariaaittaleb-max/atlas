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
import { useT } from '@/components/i18n-provider';
import { Term } from '@/components/term';
import { Accordion } from '@/components/ui/accordion';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
import { formatMadCompact } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/messages';
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

/** Les quatre paliers de détresse de trésorerie (doc 02 §10.2) : `fin.status.*` et `fin.statusHint.*`. */
const TREASURY_LEVELS = ['sain', 'surveillance', 'restructuration', 'liquidation'] as const;

/** Les montants qui se saisissent en valeur, bornés par un fait et non par un écart. */
const MONEY_FIELDS = [
  ['finance.capital_raise', 'capitalRaisedMad', 'Levée de fonds propres',
    'Vos actionnaires remettent au pot. Élargit directement votre capacité d’endettement — '
    + 'mais le prix et le plafond que voici dépendent de ce que les investisseurs pensent de vous.'],
  ['finance.dividend', 'dividendMad', 'Dividende',
    'Se vote sur l’exercice clos, et ne peut pas dépasser son résultat net. '
    + 'Rémunérer l’actionnaire, c’est autant de moins pour financer la croissance — mais une '
    + 'entreprise mûre qui ne distribue rien perd des points d’attractivité auprès d’eux.'],
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
  const t = useT();
  const treasuryLevel = (TREASURY_LEVELS as readonly string[]).includes(context.treasuryStatus) ? context.treasuryStatus : 'sain';

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

  const activeLevers = [...leverStates(levers, finance, context.financeLimits, context.das.length, t).values()]
    .filter((state) => state.status === 'active').length;

  const creditSummary =
    finance.netCreditMad > 0 ? t('fin.creditDraw', { amount: formatMadCompact(finance.netCreditMad) })
    : finance.netCreditMad < 0 ? t('fin.creditRepay', { amount: formatMadCompact(-finance.netCreditMad) })
    : t('fin.creditNone');

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            {t('strat.eyebrowGroup', { n: context.roundNumber })}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            {t('nav.link./finance')}
            <InfoHint label={t('nav.link./finance')}>{t('fin.intro')}</InfoHint>
          </h1>
        </header>

        <div className="space-y-4">
          {/* ── Les chiffres qui commandent le tour ───────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={t('fin.openingCash')}
              value={formatMadCompact(context.treasuryMad)}
              note={
                context.dealCashMad !== 0
                  ? `${t(`fin.status.${treasuryLevel}` as MessageKey)} · ${t('fin.dealCash', {
                      amount: `${context.dealCashMad > 0 ? '+' : '−'}${formatMadCompact(Math.abs(context.dealCashMad))}`,
                    })}`
                  : t(`fin.status.${treasuryLevel}` as MessageKey)
              }
              hint={t(`fin.statusHint.${treasuryLevel}` as MessageKey)}
            />
            <StatCard
              label={t('money.engaged')}
              value={formatMadCompact(engaged)}
              note={
                engaged > available
                  ? t('fin.over', { amount: formatMadCompact(engaged - available) })
                  : t('fin.of', { amount: formatMadCompact(available) })
              }
              hint={t('fin.engagedHint')}
            />
            <StatCard
              label={t('fin.netIncome')}
              value={results.group ? formatMadCompact(results.group.netIncomeMad) : '—'}
              note={results.group ? t('fin.year', { n: results.roundNumber ?? 0 }) : t('fin.noYear')}
            />
            <StatCard
              label={t('fin.debtCapacity')}
              value={formatMadCompact(context.financeLimits.capacityAvailableMad)}
              note={
                context.debtOutstandingMad > 0
                  ? t('fin.outstanding', { amount: formatMadCompact(context.debtOutstandingMad) })
                  : t('fin.noDebt')
              }
              hint={t('fin.debtHint')}
            />
            <StatCard
              label={t('fin.investors')}
              value={context.financeLimits.investorScore === null ? '—' : `${Math.round(context.financeLimits.investorScore)} / 100`}
              note={
                context.financeLimits.investorScore === null
                  ? t('fin.noResolution')
                  : t('fin.raiseFees', { pct: (context.financeLimits.equityIssueCostPct * 100).toFixed(1).replace('.', ',') })
              }
              hint={
                <>
                  {t('fin.investorsHint')}
                  {context.financeLimits.investorComponents ? (
                    <span className="mt-2 block space-y-1">
                      {context.financeLimits.investorComponents.map((c) => (
                        <span key={c.key} className="block">
                          <strong className="font-semibold">{c.label}</strong> {Math.round(c.score)}/100 — {c.reading}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </>
              }
            />
          </div>

          <BudgetGauge
            label={t('fin.gauge')}
            allocated={engaged}
            available={available}
          />

          {/* Les résultats AVANT les décisions. */}
          <Accordion
            title={t('fin.results')}
            summary={results.group ? t('fin.resultsSummary', { amount: formatMadCompact(results.group.netIncomeMad) }) : t('fin.noYearLower')}
            hint={t('fin.resultsHint')}
          >
            <ResultsSection results={results} />
          </Accordion>

          {results.group ? (
            <Accordion
              title={t('fin.indicators')}
              summary={t('fin.fcfSummary', { amount: formatMadCompact(results.group.freeCashFlowMad) })}
              hint={t('fin.indicatorsHint')}
            >
              <IndicatorsSection group={results.group} limits={context.financeLimits} />
            </Accordion>
          ) : null}

          {/* ── Les leviers, juste avant les champs qui les actionnent ────── */}
          {levers.length > 0 ? (
            <Accordion
              title={t('fin.levers')}
              defaultOpen
              summary={t('fin.leversActive', { count: activeLevers, total: levers.length })}
              hint={t('fin.leversHint')}
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
              title={t('fin.decisions')}
              indicators={{ topic: 'finance-decisions' }}
              anchor="finance-decisions"
              defaultOpen
              summary={creditSummary}
              hint={t('fin.decisionsHint')}
            >
              <fieldset disabled={locked} className="grid gap-8 sm:grid-cols-2">
                <legend className="sr-only">{t('fin.decisions')}</legend>
                {FINANCE_FIELDS.filter(([key]) => isOn(modules, key)).map(
                  ([key, field, family]) => (
                    <VariationField
                      key={key}
                      label={t('fin.opex.label')}
                      hint={t('fin.opex.hint')}
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
                    treasuryMad={context.treasuryMad}
                    disabled={locked}
                    onChange={(next) => pushFinance({ ...finance, cashTransfers: next })}
                  />
                </div>
              ) : null}

              {MONEY_FIELDS.some(([key]) => isOn(modules, key)) ? (
                <fieldset disabled={locked} className="mt-8 grid gap-8 border-t border-(--border) pt-6 sm:grid-cols-2">
                  <legend className="sr-only">{t('fin.equityLegend')}</legend>
                  {MONEY_FIELDS.filter(([key]) => isOn(modules, key)).map(
                    ([key, field]) => {
                      const label = t(`fin.${field}.label` as MessageKey);
                      const hint = t(`fin.${field}.hint` as MessageKey);
                      const ceiling =
                        field === 'dividendMad' ? context.financeLimits.dividendCeilingMad
                        : field === 'capitalRaisedMad' ? context.financeLimits.equityRaiseCapMad
                        : null;
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
                                ? ` · ${t('fin.fees', { amount: formatMadCompact(finance[field] * context.financeLimits.equityIssueCostPct) })}`
                                : ''}
                            </p>
                          ) : null}
                          {ceiling !== null ? (
                            <p className="tabular mt-1.5 mb-0 text-xs text-(--foreground-muted)">
                              {field === 'capitalRaisedMad'
                                ? t('fin.capitalCeiling', { amount: formatMadCompact(ceiling), pct: (context.financeLimits.equityIssueCostPct * 100).toFixed(1).replace('.', ',') })
                                : ceiling > 0
                                  ? t('fin.dividendCeiling', { amount: formatMadCompact(ceiling) })
                                  : t('fin.noDistributable')}
                            </p>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </fieldset>
              ) : null}

              <SectionActions
                what={t('fin.validate')}
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
            title={t('fin.payroll')}
            summary={t('fin.payrollSummary', { amount: formatMadCompact(hr.payrollMad), people: hr.headcountEnd.toLocaleString('fr-FR') })}
            hint={t('fin.payrollHint')}
          >
            <dl className="tabular grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat term="Effectif de départ" value={hr.headcountStart.toLocaleString('fr-FR')} />
              <Stat
                term="Variation d'effectif"
                value={
                  hr.hires === 0 && hr.layoffs === 0
                    ? t('fin.noVariation')
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
                note={t('fin.avgSalaryNote')}
              />
              <Stat term="Budget de formation" value={formatMadCompact(hr.trainingBudgetMad)} />
              <Stat
                term="Charges patronales"
                value={formatMadCompact(
                  hr.payrollMad - hr.payrollMad / (1 + context.chargesPatronalesPct),
                )}
                note={t('fin.chargesNote', { pct: (context.chargesPatronalesPct * 100).toFixed(2) })}
              />
              <Stat
                term="SMIG"
                value={`${context.smigMad.toLocaleString('fr-FR')} DH`}
                note={t('fin.smigNote')}
              />
            </dl>

            {hr.pendingDas.length > 0 ? (
              <p className="mt-4 rounded-lg bg-(--warning-subtle) px-4 py-3 text-sm">
                {t('fin.hrMissing')}{' '}
                {hr.pendingDas.map((d, i) => (
                  <span key={d.dasId}>
                    {i > 0 ? (i === hr.pendingDas.length - 1 ? t('fin.and') : ', ') : ''}
                    <strong>{d.name}</strong>
                  </span>
                ))}
                .{' '}
                <a href="/organisation" className="font-medium text-(--accent-text) underline">
                  {t('fin.openOrg')}
                </a>
                <InfoHint label={t('fin.hrMissingTitle')} className="ms-2">
                  {t('fin.hrMissingHint')}
                </InfoHint>
              </p>
            ) : (
              <p className="mt-4 text-sm text-(--foreground-muted)">
                {t('fin.hrAllDone')}
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
