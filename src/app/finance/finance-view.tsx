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
 *     l'on part, pas en découvrant après coup où l'on est arrivé.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import {
  BudgetGauge, DecisionBar, SectionActions, type MissingDecision,
} from '@/components/decision-shell';
import { Term } from '@/components/term';
import { formatMadCompact } from '@/lib/format';
import type { DecisionContext, FinanceValues } from '@/lib/decision-types';
import { deepEqual } from '@/lib/deep-equal';
import type { MoneyBar, ResultsContext } from '@/lib/results-types';
import { CashPooling } from './cash-pooling';
import { CreditSlider } from './credit-slider';
import { LeversSection, type FinancialLever } from './levers-section';
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

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber} · Niveau Groupe
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Finance du Groupe</h1>
          <p className="tabular mt-3 text-(--foreground-muted)">
            Trésorerie d’ouverture : <strong>{formatMadCompact(context.treasuryMad)}</strong>
            {context.debtOutstandingMad > 0 ? (
              <> · dette en cours : <strong>{formatMadCompact(context.debtOutstandingMad)}</strong></>
            ) : null}
          </p>
          <p className="mt-3 max-w-3xl text-sm text-(--foreground-muted)">
            Cet écran ne porte que des décisions de niveau Groupe : elles valent pour tous vos
            domaines à la fois. Ce qui se décide domaine par domaine — stratégie,
            investissements, recrutement — se saisit sur les écrans dédiés.
          </p>
        </header>

        <BudgetGauge
          label="Charges et remboursements engagés ce tour"
          allocated={engaged}
          available={available}
        />

        {/* Les résultats AVANT les décisions. */}
        <ResultsSection results={results} />

        {results.group ? (
          <IndicatorsSection group={results.group} limits={context.financeLimits} />
        ) : null}

        <LeversSection levers={levers} />

        {/* ── Consolidation RH — un RELEVÉ, pas une saisie ──────────────────
            Repliée : elle occupait le tiers d'un écran dont l'objet est de
            DÉCIDER, pour n'y montrer que des chiffres déjà arrêtés ailleurs.
            Le résumé porte les deux seuls qui engagent la trésorerie du tour ;
            le détail reste à un clic. */}
        <details className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <summary className="cursor-pointer list-none">
            <span className="text-xl font-medium">Masse salariale consolidée</span>
            <span className="tabular ml-3 text-(--foreground-muted)">
              {formatMadCompact(hr.payrollMad)} · {hr.headcountEnd.toLocaleString('fr-FR')} personnes
            </span>
          </summary>
          <p className="mt-3 text-sm text-(--foreground-muted)">
            Somme de ce que vous avez décidé sur chaque domaine. Le recrutement se saisit
            là où il a un sens — dans le domaine concerné, avec son climat social et sa
            charge de travail sous les yeux.
          </p>

          <dl className="tabular mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat term="Effectif de départ" value={hr.headcountStart.toLocaleString('fr-FR')} />
            <Stat
              term="Variation d'effectif"
              value={
                hr.hires === 0 && hr.layoffs === 0
                  ? 'aucun'
                  : [
                      hr.hires > 0 ? `+${hr.hires.toLocaleString('fr-FR')}` : null,
                      hr.layoffs > 0 ? `−${hr.layoffs.toLocaleString('fr-FR')}` : null,
                    ].filter(Boolean).join(' · ')
              }
              tone={hr.layoffs > 0 && hr.hires === 0 ? 'bad' : hr.hires > 0 ? 'good' : undefined}
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
            <p className="mt-5 rounded-lg border border-(--warning) px-4 py-3 text-sm">
              Aucune décision RH ce tour sur{' '}
              {hr.pendingDas.map((d, i) => (
                <span key={d.dasId}>
                  {i > 0 ? (i === hr.pendingDas.length - 1 ? ' et ' : ', ') : ''}
                  <strong>{d.name}</strong>
                </span>
              ))}
              . Ne rien changer est un choix légitime, mais il doit être posé :{' '}
              <a href="/organisation" className="underline">ouvrez l’écran d’organisation</a>{' '}
              pour le déclarer.
            </p>
          ) : (
            <p className="mt-5 rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
              ✓ Tous vos domaines ont reçu une décision RH ce tour.
            </p>
          )}
        </details>

        {/* ── Plan 7 : finance ──────────────────────────────────────────── */}
        {screenIsOpen(modules, 'finance') ? (
        <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="text-xl font-medium">Vos décisions financières</h2>

          <fieldset disabled={locked} className="mt-5 grid gap-6 sm:grid-cols-2">
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
              <CreditSlider
                value={finance.netCreditMad}
                limits={context.financeLimits}
                disabled={locked}
                onChange={(v) => pushFinance({ ...finance, netCreditMad: v })}
              />
            ) : null}
          </fieldset>

          {isOn(modules, 'finance.cash_pooling') && context.das.length > 1 ? (
            <CashPooling
              das={context.das}
              transfers={finance.cashTransfers}
              disabled={locked}
              onChange={(next) => pushFinance({ ...finance, cashTransfers: next })}
            />
          ) : null}

          {MONEY_FIELDS.some(([key]) => isOn(modules, key)) ? (
            <fieldset disabled={locked} className="mt-6 grid gap-6 sm:grid-cols-2">
              {MONEY_FIELDS.filter(([key]) => isOn(modules, key)).map(
                ([key, field, label, hint]) => {
                  const ceiling =
                    field === 'dividendMad' ? context.financeLimits.dividendCeilingMad : null;
                  return (
                    <div key={key}>
                      <label className="text-sm font-medium" htmlFor={`money-${field}`}>
                        {label}
                      </label>
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
                          className="tabular w-48 rounded-lg border border-(--border) bg-(--background) px-3 py-2 text-sm"
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
                            ? `plafond : ${formatMadCompact(ceiling)}, le résultat du dernier exercice`
                            : 'aucun résultat distribuable sur le dernier exercice'}
                        </p>
                      ) : null}
                      <p className="mt-1.5 mb-0 text-xs text-(--foreground-muted)">{hint}</p>
                    </div>
                  );
                },
              )}
            </fieldset>
          ) : null}

          <p className="mt-5 border-t border-(--border) pt-4 text-sm text-(--foreground-muted)">
            Une équipe déficitaire paie tout de même la cotisation minimale de 0,25 % du
            chiffre d’affaires. Perdre de l’argent tranquillement n’est pas une stratégie.
          </p>

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
        </section>
        ) : null}
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

function Stat({
  term, value, note, tone,
}: { term: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <dt className="text-sm text-(--foreground-muted)"><Term>{term}</Term></dt>
      <dd
        className="mt-0.5 text-lg font-semibold"
        style={{
          color:
            tone === 'bad' ? 'var(--negative)'
            : tone === 'good' ? 'var(--positive)'
            : undefined,
        }}
      >
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-xs text-(--foreground-muted)">{note}</p> : null}
    </div>
  );
}
