'use client';

/**
 * ATLAS — ressources humaines d'un DAS.
 *
 * ── LES INDICATEURS D'ABORD ────────────────────────────────────────────────
 * Le cahier des charges est explicite : « pour faire ces choix on a besoin de
 * voir des KPI ». Les indicateurs du dernier exercice clos figurent donc EN
 * TÊTE, avant tout champ de saisie. On décide en regardant d'où l'on part.
 *
 * ── CE QUE L'ÉCRAN DIT SANS DÉTOUR ─────────────────────────────────────────
 *   • licencier se paie d'AVANCE, en indemnités légales, alors que l'économie
 *     de masse salariale n'arrive qu'après ;
 *   • la standardisation — acquise en mutualisant, plus haut sur cet écran —
 *     est la SEULE façon de réduire un effectif sans perdre en qualité ;
 *   • le GIAC finance l'ingénierie de formation, pas la formation : sans bilan
 *     de compétences, il n'y a rien à rembourser.
 */

import { HeadcountStepper, NumberInput } from '@/components/decision-shell';
import { Term } from '@/components/term';
import { formatMadCompact } from '@/lib/format';
import type { DasHr, DasHrState } from '@/lib/org-types';

const TRAINING_FOCUS = [
  ['technique', 'Technique', 'Le geste métier. Sert la qualité et la productivité.'],
  ['management', 'Management', 'Encadrement intermédiaire. Sert la délégation.'],
  ['qualite', 'Qualité', 'Normes et contrôle. Sert la montée en gamme.'],
  ['polyvalence', 'Polyvalence', 'Sert la standardisation et absorbe les à-coups.'],
] as const;

const RESTRUCTURING = [
  ['aucune', 'Aucune', 'Rien ne change.'],
  ['reorganisation', 'Réorganisation interne', 'Redéploiement sans départs. Coût social modéré.'],
  ['externalisation', 'Externalisation', 'Une fonction passe à un prestataire. Coût social lourd.'],
  ['fermeture_site', 'Fermeture de site', 'Le geste le plus brutal. Le climat s’en souvient longtemps.'],
] as const;

export function HrSection({
  hr, state, locked, onChange,
}: {
  hr: DasHr;
  state: DasHrState | null;
  locked: boolean;
  onChange: (hr: DasHr) => void;
}) {
  const patch = (values: Partial<DasHr>) => onChange({ ...hr, ...values });

  const hires =
    hr.hireOperateurs + hr.hireTechniciens + hr.hireExperts + hr.hireCadres +
    hr.internalTransfersIn;

  // L'effectif EN PLACE, relevé du dernier exercice clos, est le point d'appui
  // de toute la saisie. Sans lui — première session, domaine acquis ce tour —
  // on part de zéro, ce qui reste vrai : il n'y a effectivement personne.
  const current = state?.headcount ?? 0;
  const target = Math.max(current + hires - hr.layoffs, 0);
  // Ce qui manque encore pour que la composition rejoigne l'effectif visé.
  const remainder = hr.layoffs > 0 ? 0 : target - current - hires;

  // Indemnités : barème de l'article 53, huit ans d'ancienneté moyenne,
  // deux mois de préavis. Le calcul exact est refait côté serveur.
  const severancePerHead = (912 * hr.avgSalaryBrutMad) / 191 + 2 * hr.avgSalaryBrutMad;
  const severanceTotal = hr.layoffs * severancePerHead;

  const overCut = state !== null && hr.layoffs > state.safeReduction;

  return (
    <div className="space-y-6">
      {/* ── Où l'on en est ─────────────────────────────────────────────── */}
      {state === null ? (
        <p className="rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
          Aucun exercice n’est encore clos pour ce domaine : vos indicateurs sociaux
          apparaîtront ici après la première publication.
        </p>
      ) : (
        <div>
          <span className="text-sm font-medium">Où en est ce domaine</span>
          <p className="mt-0.5 mb-3 text-sm text-(--foreground-muted)">
            Relevé du dernier exercice clos. C’est à partir de là que vos décisions agissent.
          </p>
          <dl className="tabular grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi
              term="Climat social" value={state.climatSocial.toFixed(0)}
              tone={state.climatSocial < 40 ? 'bad' : state.climatSocial > 70 ? 'good' : undefined}
              note={state.climatSocial < 40 ? 'Dégradé : la rotation s’emballe.' : undefined}
            />
            <Kpi
              term="Indice de charge" value={state.workloadIndex.toFixed(0)}
              tone={state.workloadIndex > 120 ? 'bad' : state.workloadIndex < 80 ? 'bad' : 'good'}
              note={
                state.workloadIndex > 120 ? 'Surcharge : on tient par l’usure.'
                : state.workloadIndex < 80 ? 'Sous-charge : on paie des gens à attendre.'
                : '100 = l’effectif absorbe exactement la demande.'
              }
            />
            <Kpi
              term="Taux de rotation"
              value={`${(state.turnoverRate * 100).toFixed(1)} %`}
              tone={state.turnoverRate > 0.15 ? 'bad' : undefined}
              note={state.turnoverRate > 0.15 ? 'Ce sont les plus qualifiés qui partent.' : undefined}
            />
            <Kpi term="Effectif de clôture" value={state.headcount.toLocaleString('fr-FR')} />
            <Kpi term="Masse salariale" value={formatMadCompact(state.payrollMad)} />
            <Kpi
              term="Productivité par tête"
              value={`${Math.round(state.productivity).toLocaleString('fr-FR')} u./pers.`}
            />
            <Kpi
              term="Niveau de standardisation" value={state.standardisationLevel.toFixed(0)}
              note="Acquise en mutualisant puis en standardisant, plus haut sur cet écran."
            />
            <Kpi term="Niveau d'automatisation" value={state.automationLevel.toFixed(0)} />
          </dl>

          <p className="mt-4 rounded-lg border border-(--border) px-4 py-3 text-sm">
            Votre standardisation et votre automatisation permettent de retirer{' '}
            <strong>{state.safeReduction.toLocaleString('fr-FR')} postes</strong> sans perdre en
            qualité. Au-delà, chaque poste supprimé se paie en qualité produit.
          </p>
        </div>
      )}

      {/* ── Effectif visé ──────────────────────────────────────────────
          On ne décide pas « de recruter quarante personnes » : on décide de
          passer de 1 240 à 1 280. Le compteur porte donc l'effectif EN PLACE,
          et l'équipe l'augmente ou le baisse. Recrutements et licenciements
          en découlent, au lieu d'être deux champs à zéro sans point d'appui. */}
      <fieldset disabled={locked}>
        <legend className="text-sm font-medium">Effectif de ce domaine</legend>
        <p className="mt-1 mb-3 text-sm text-(--foreground-muted)">
          Partez de ce qui est en place et ajustez. C’est l’écart qui se traduit en
          recrutements ou en départs — et qui se paie.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <HeadcountStepper
            label="Effectif visé en fin d’exercice"
            current={current}
            value={target}
            step={10}
            disabled={locked}
            onChange={(next) => {
              const delta = next - current;
              if (delta >= 0) {
                // On monte : les départs n'ont plus lieu d'être, et l'écart
                // reste à répartir entre les profils, juste en dessous.
                patch({ layoffs: 0 });
              } else {
                // On descend : l'écart EST le nombre de départs, et aucun
                // recrutement ne peut coexister avec lui sans se contredire.
                patch({
                  layoffs: -delta,
                  hireOperateurs: 0, hireTechniciens: 0,
                  hireExperts: 0, hireCadres: 0, internalTransfersIn: 0,
                });
              }
            }}
            hint="Les flèches vont de dix en dix ; le champ accepte n’importe quelle valeur."
          />

          <div className="self-end">
            <label className="block">
              <span className="text-sm font-medium">Nature de la restructuration</span>
              <select
                value={hr.restructuring} disabled={locked}
                onChange={(e) => patch({ restructuring: e.target.value as DasHr['restructuring'] })}
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              >
                {RESTRUCTURING.map(([v, label, hint]) => (
                  <option key={v} value={v}>{label} — {hint}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </fieldset>

      {/* ── Qui l'on recrute ───────────────────────────────────────────── */}
      {hires > 0 || remainder !== 0 ? (
        <fieldset disabled={locked}>
          <legend className="text-sm font-medium">Qui vous recrutez</legend>
          <p className="mt-1 mb-3 text-sm text-(--foreground-muted)">
            La composition compte autant que le nombre : une différenciation crédible ne se
            construit pas avec des opérateurs seuls.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Count label="Opérateurs" value={hr.hireOperateurs}
              onChange={(v) => patch({ hireOperateurs: v })} />
            <Count label="Techniciens" value={hr.hireTechniciens}
              onChange={(v) => patch({ hireTechniciens: v })} />
            <Count label="Experts" value={hr.hireExperts}
              onChange={(v) => patch({ hireExperts: v })} />
            <Count label="Cadres" value={hr.hireCadres}
              onChange={(v) => patch({ hireCadres: v })} />
          </div>

          <div className="mt-3">
            <Count
              label="Venus d’un autre domaine du groupe"
              value={hr.internalTransfersIn}
              onChange={(v) => patch({ internalTransfersIn: v })}
              hint="Ils connaissent déjà la maison : contrairement à un recrutement externe, ils ne diluent pas le niveau moyen."
            />
          </div>

          {remainder !== 0 ? (
            <p
              className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm"
              style={{ borderColor: remainder > 0 ? 'var(--warning)' : 'var(--negative)' }}
            >
              {remainder > 0 ? (
                <>
                  <span>
                    Il reste <strong>{remainder.toLocaleString('fr-FR')}</strong> poste(s) à
                    répartir pour atteindre l’effectif visé.
                  </span>
                  <button
                    type="button" disabled={locked}
                    onClick={() => patch({ hireOperateurs: hr.hireOperateurs + remainder })}
                    className="rounded-lg border border-(--border) px-3 py-1.5"
                  >
                    Tout mettre en opérateurs
                  </button>
                </>
              ) : (
                <span>
                  Vous avez réparti <strong>{(-remainder).toLocaleString('fr-FR')}</strong> poste(s)
                  de plus que votre effectif visé. Remontez l’effectif, ou baissez ces nombres.
                </span>
              )}
            </p>
          ) : null}

          {state !== null && state.headcount > 0 && hires / state.headcount > 0.2 ? (
            <p className="mt-3 rounded-lg border border-(--warning) px-4 py-2.5 text-sm text-(--warning)">
              Vous recrutez {((hires / state.headcount) * 100).toFixed(0)} % de l’effectif en un
              exercice. Au-delà de 20 %, l’intégration ne suit plus et le climat en pâtit.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* ── Départs ────────────────────────────────────────────────────
          Rendu SEULEMENT quand l'équipe a effectivement baissé son effectif :
          un cadre « Départs » vide en permanence suggère qu'il manque une
          saisie, alors qu'il n'y a rien à saisir. */}
      {hr.layoffs > 0 ? (
        <fieldset disabled={locked}>
          <legend className="text-sm font-medium">
            Départs — {hr.layoffs.toLocaleString('fr-FR')} poste(s)
          </legend>
          <p
            className="mt-3 rounded-lg border px-4 py-2.5 text-sm"
            style={{ borderColor: overCut ? 'var(--negative)' : 'var(--warning)' }}
          >
            <strong>{formatMadCompact(severanceTotal)}</strong> d’indemnités légales, à verser
            immédiatement — l’économie de salaires, elle, n’arrive qu’ensuite. Barème de
            l’article 53 du Code du travail, préavis compris.
            {overCut ? (
              <>
                {' '}Vous dépassez de {(hr.layoffs - (state?.safeReduction ?? 0)).toLocaleString('fr-FR')} postes
                ce que votre standardisation autorise : la qualité produit en souffrira.
              </>
            ) : null}
          </p>
        </fieldset>
      ) : null}

      {/* ── Rémunération et formation ──────────────────────────────────── */}
      <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Salaire brut mensuel moyen</span>
          <NumberInput
            value={hr.avgSalaryBrutMad} disabled={locked}
            onChange={(v) => patch({ avgSalaryBrutMad: v })}
            className="mt-1.5 w-full"
          />
          <span className="mt-1 block text-xs text-(--foreground-muted)">
            Payer mieux améliore le climat, avec des rendements décroissants.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Budget de formation</span>
          <NumberInput
            value={hr.trainingBudgetMad} disabled={locked}
            onChange={(v) => patch({ trainingBudgetMad: v })}
            className="mt-1.5 w-full"
          />
          <span className="mt-1 block text-xs text-(--foreground-muted)">
            Améliore la compétence et le climat, et amortit le choc d’une automatisation.
          </span>
        </label>
      </fieldset>

      <fieldset disabled={locked}>
        <legend className="text-sm font-medium">Sur quoi former</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TRAINING_FOCUS.map(([v, label, hint]) => (
            <button
              key={v} type="button" disabled={locked}
              onClick={() => patch({ trainingFocus: v })}
              className="rounded-lg border px-4 py-2.5 text-left text-sm"
              style={{
                borderColor: hr.trainingFocus === v ? 'var(--accent)' : 'var(--border)',
                background: hr.trainingFocus === v ? 'var(--surface-muted)' : undefined,
              }}
            >
              <span className="font-medium">{label}</span>
              <span className="mt-0.5 block text-(--foreground-muted)">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── Financements publics ───────────────────────────────────────── */}
      <fieldset disabled={locked}>
        <legend className="text-sm font-medium">Diagnostic et financements</legend>
        <div className="mt-3 space-y-2">
          <Check
            checked={hr.orderSkillsAudit} disabled={locked}
            onChange={(v) => patch({ orderSkillsAudit: v, claimGiac: v && hr.claimGiac })}
            label="Commander un bilan de compétences"
            hint="Un plan de formation bâti sur un diagnostic rend nettement plus qu’un plan improvisé. C’est aussi ce que le GIAC finance."
          />
          <Check
            checked={hr.claimOfppt} disabled={locked}
            onChange={(v) => patch({ claimOfppt: v })}
            label="Solliciter l’OFPPT (contrats spéciaux de formation)"
            hint="Rembourse 70 % de la formation, dans la limite de votre droit de tirage — 1,6 % de votre masse salariale. Dépenser au-delà ne rembourse pas davantage."
          />
          <Check
            checked={hr.claimGiac} disabled={locked || !hr.orderSkillsAudit}
            onChange={(v) => patch({ claimGiac: v })}
            label="Solliciter le GIAC sectoriel"
            hint={
              hr.orderSkillsAudit
                ? "Finance l’ingénierie de formation — le diagnostic, l’analyse des besoins, le plan."
                : "Exige un bilan de compétences : le GIAC finance l’ingénierie, pas la formation. Sans diagnostic, il n’y a rien à rembourser."
            }
          />
        </div>
      </fieldset>
    </div>
  );
}

function Kpi({
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

function Count({
  label, value, onChange, hint,
}: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <NumberInput value={value} onChange={onChange} className="mt-1.5 w-full" />
      {hint ? <span className="mt-1 block text-xs text-(--foreground-muted)">{hint}</span> : null}
    </label>
  );
}

function Check({
  checked, disabled, onChange, label, hint,
}: {
  checked: boolean; disabled: boolean;
  onChange: (v: boolean) => void; label: string; hint: string;
}) {
  return (
    <label className="flex gap-3 rounded-lg border border-(--border) px-4 py-3">
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className={`text-sm font-medium ${disabled ? 'text-(--foreground-muted)' : ''}`}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-(--foreground-muted)">{hint}</span>
      </span>
    </label>
  );
}
