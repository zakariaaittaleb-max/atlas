'use client';

/**
 * ATLAS — ressources humaines et finance : plans 6 et 7 du cahier.
 *
 * Deux règles d'interface imposées ici :
 *
 *   • Le **coût du recrutement s'affiche en direct** — salaire brut × 1,2109,
 *     plancher SMIG appliqué côté client pour le retour immédiat, TOUJOURS
 *     revalidé côté serveur : ces taux changent par décret.
 *
 *   • L'allocation se fait **sous contrainte de trésorerie visible**. La barre
 *     ne bloque pas la saisie — elle montre le dépassement pendant qu'on
 *     arbitre. Une équipe a le droit de plonger en trésorerie négative ; elle
 *     n'a pas le droit de le découvrir à la résolution.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { BudgetGauge, DecisionBar, MoneyField, type MissingDecision } from '@/components/decision-shell';
import { formatMadCompact } from '@/lib/format';
import type { DecisionContext } from '@/lib/decision-types';
import type { MoneyBar, ResultsContext } from '@/lib/results-types';
import { ResultsSection } from './results-section';
import { useAutosave } from '@/lib/use-autosave';

const PROFILES = [
  ['hireOperateurs', 'Opérateurs', 'Coût bas, peu de qualification. Servent une stratégie de volume.'],
  ['hireTechniciens', 'Techniciens', 'Cœur de l’exécution industrielle.'],
  ['hireExperts', 'Experts', 'Coûteux. Indispensables à une différenciation crédible.'],
  ['hireCadres', 'Cadres dirigeants', 'Structurent, coûtent cher, alourdissent le siège.'],
] as const;

const REGIMES = [
  ['droit_commun', 'Droit commun', 'IS 20 % jusqu’à 100 M DH de bénéfice, 35 % au-delà.'],
  ['cfc_zai', 'CFC / zone d’accélération industrielle', 'Régime dérogatoire.'],
  ['banque_assurance', 'Banque & assurance', 'IS 40 % au-delà du seuil.'],
] as const;

export function FinanceView({
  context, missing, results, money,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  results: ResultsContext;
  /** La MÊME définition que la barre du haut : un seul « engagé ce tour ». */
  money: MoneyBar | null;
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const locked = !context.decisionsOpen;

  const [hr, setHr] = useState(() => context.hr ?? {
    hireOperateurs: 0, hireTechniciens: 0, hireExperts: 0, hireCadres: 0,
    avgSalaryBrutMad: context.avgSalaryMad || context.smigMad,
    trainingBudgetMad: 0, restructuringCount: 0,
  });

  const [finance, setFinance] = useState(() => context.finance ?? {
    opexMad: 0, debtDrawnMad: 0, debtRepaidMad: 0, taxRegime: 'droit_commun',
  });

  const pushHr = useCallback((next: typeof hr) => {
    // Plancher légal appliqué immédiatement, pour que l'équipe voie le coût
    // réel pendant qu'elle arbitre. Le serveur le réapplique de toute façon.
    const guarded = { ...next, avgSalaryBrutMad: Math.max(next.avgSalaryBrutMad, context.smigMad) };
    setHr(guarded);
    autosave.save({ plan: 'hr', ...guarded });
  }, [autosave, context.smigMad]);

  const pushFinance = useCallback((next: typeof finance) => {
    setFinance(next);
    autosave.save({ plan: 'finance', ...next });
  }, [autosave]);

  const hires = hr.hireOperateurs + hr.hireTechniciens + hr.hireExperts + hr.hireCadres;
  const headcountEnd = Math.max(context.headcount + hires - hr.restructuringCount, 0);
  const payroll = headcountEnd * hr.avgSalaryBrutMad * 12 * (1 + context.chargesPatronalesPct);

  // Un recrutement supérieur à 20 % de l'effectif désorganise : le climat social
  // en pâtit. Le seuil est annoncé, pas caché.
  const recruitmentRatio = context.headcount > 0 ? hires / context.headcount : 0;
  const shockRecruitment = recruitmentRatio > 0.2;

  // Une seule définition de « engagé ce tour », partagée avec la barre du haut.
  // Deux calculs parallèles affichaient deux nombres différents sous des
  // libellés presque identiques — de quoi faire douter du moteur entier.
  // La part des DAS vient du serveur (elle se décide ailleurs) ; les champs de
  // CET écran restent vivants sous la frappe. Deux calculs parallèles
  // affichaient auparavant deux nombres différents sous des libellés presque
  // identiques — de quoi faire douter du moteur entier.
  const engaged =
    (money?.dasEngagedMad ?? 0) +
    payroll + finance.opexMad + hr.trainingBudgetMad + finance.debtRepaidMad;
  const available = context.treasuryMad + finance.debtDrawnMad;

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Organisation &amp; finance</h1>
          <p className="tabular mt-3 text-(--foreground-muted)">
            Trésorerie d’ouverture : <strong>{formatMadCompact(context.treasuryMad)}</strong>
            {context.debtOutstandingMad > 0 ? (
              <> · dette en cours : <strong>{formatMadCompact(context.debtOutstandingMad)}</strong></>
            ) : null}
          </p>
        </header>

        <BudgetGauge
          label="Charges et remboursements engagés ce tour"
          allocated={engaged}
          available={available}
        />

        {/* Les résultats AVANT les décisions : on arbitre en regardant d'où
            l'on part, pas en découvrant après coup où l'on est arrivé. */}
        <ResultsSection results={results} />

        {/* ── Plan 6 : ressources humaines ──────────────────────────────── */}
        <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="text-xl font-medium">Ressources humaines</h2>
          <p className="tabular mt-1 text-sm text-(--foreground-muted)">
            Effectif de départ : {context.headcount.toLocaleString('fr-FR')} personnes
          </p>

          <fieldset disabled={locked} className="mt-5">
            <legend className="mb-3 text-sm font-medium">Recrutement par profil</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {PROFILES.map(([key, label, hint]) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <input
                    type="number" min={0} step={10} value={hr[key]}
                    onChange={(e) => pushHr({ ...hr, [key]: Math.max(Number(e.target.value) || 0, 0) })}
                    className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-(--foreground-muted)">{hint}</span>
                </label>
              ))}
            </div>

            {shockRecruitment ? (
              <p className="mt-3 rounded-lg border border-(--warning) px-4 py-2.5 text-sm text-(--warning)">
                Vous recrutez {(recruitmentRatio * 100).toFixed(0)} % de votre effectif en un tour.
                Au-delà de 20 %, l’intégration désorganise : le climat social en pâtira.
              </p>
            ) : null}
          </fieldset>

          <fieldset disabled={locked} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Salaire brut mensuel moyen</span>
              <input
                type="number" min={context.smigMad} step={100} value={hr.avgSalaryBrutMad}
                onChange={(e) => pushHr({ ...hr, avgSalaryBrutMad: Number(e.target.value) || 0 })}
                className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
              />
              <span className="mt-1 block text-xs text-(--foreground-muted)">
                Plancher SMIG : {context.smigMad.toLocaleString('fr-FR')} DH. Charges patronales
                de {(context.chargesPatronalesPct * 100).toFixed(2)} % en sus.
              </span>
            </label>

            <MoneyField
              label="Budget de formation"
              value={hr.trainingBudgetMad}
              onChange={(v) => pushHr({ ...hr, trainingBudgetMad: v })}
              hint="Améliore le climat social et l’intensité de compétences."
            />

            <label className="block">
              <span className="text-sm font-medium">Postes supprimés</span>
              <input
                type="number" min={0} step={10} value={hr.restructuringCount}
                onChange={(e) => pushHr({ ...hr, restructuringCount: Math.max(Number(e.target.value) || 0, 0) })}
                className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
              />
              <span className="mt-1 block text-xs text-(--foreground-muted)">
                Indemnités légales à verser d’avance, et le climat social chute dès le premier départ.
              </span>
            </label>
          </fieldset>

          <dl className="tabular mt-6 grid gap-4 border-t border-(--border) pt-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-(--foreground-muted)">Effectif en fin d’exercice</dt>
              <dd className="mt-0.5 text-lg font-semibold">{headcountEnd.toLocaleString('fr-FR')}</dd>
            </div>
            <div>
              <dt className="text-sm text-(--foreground-muted)">Coût total des salaires</dt>
              <dd className="mt-0.5 text-lg font-semibold">{formatMadCompact(payroll)}</dd>
            </div>
            <div>
              <dt className="text-sm text-(--foreground-muted)">Dont cotisations employeur</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {formatMadCompact(payroll - payroll / (1 + context.chargesPatronalesPct))}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Plan 7 : finance ──────────────────────────────────────────── */}
        <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="text-xl font-medium">Vos décisions financières</h2>

          <fieldset disabled={locked} className="mt-5 grid gap-4 sm:grid-cols-3">
            <MoneyField
              label="Frais de fonctionnement du siège"
              value={finance.opexMad}
              onChange={(v) => pushFinance({ ...finance, opexMad: v })}
              hint="Loyers, systèmes, direction générale. Mutualiser des métiers proches les allège."
            />
            <MoneyField
              label="Crédit que vous prenez"
              value={finance.debtDrawnMad}
              onChange={(v) => pushFinance({ ...finance, debtDrawnMad: v })}
              hint="Plus vous devez, plus la banque exige : le taux monte avec ce que vous avez déjà emprunté."
            />
            <MoneyField
              label="Crédit que vous remboursez"
              value={finance.debtRepaidMad}
              onChange={(v) => pushFinance({ ...finance, debtRepaidMad: v })}
              hint="Allège les intérêts que vous paierez les années suivantes."
            />
          </fieldset>

          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-2 text-sm font-medium">Votre régime d’imposition</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {REGIMES.map(([value, label, hint]) => (
                <button
                  key={value} type="button"
                  onClick={() => pushFinance({ ...finance, taxRegime: value })}
                  aria-pressed={finance.taxRegime === value}
                  className="rounded-lg border p-3 text-left"
                  style={{
                    borderColor: finance.taxRegime === value ? 'var(--accent)' : 'var(--border)',
                    background: finance.taxRegime === value ? 'var(--surface-muted)' : undefined,
                  }}
                >
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-1 block text-xs text-(--foreground-muted)">{hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <p className="mt-5 border-t border-(--border) pt-4 text-sm text-(--foreground-muted)">
            Une équipe déficitaire paie tout de même la cotisation minimale de 0,25 % du
            chiffre d’affaires. Perdre de l’argent tranquillement n’est pas une stratégie.
          </p>
        </section>
      </main>

      <DecisionBar
        state={autosave.state} pending={autosave.pending} lastError={autosave.lastError}
        missing={missing} decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}
