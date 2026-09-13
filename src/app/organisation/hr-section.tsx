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
 *
 * Les chiffres et les alertes restent visibles ; les explications de ces
 * mécanismes sont sous les « + ».
 */

import { TriangleAlert } from 'lucide-react';

import { HeadcountStepper } from '@/components/decision-shell';
import { Term } from '@/components/term';
import { ChoiceCard, Definitions, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { anyOn, isOn, type EnabledModules } from '@/lib/modules-state';
import { VariationField } from '@/components/variation-field';
import { endowmentReference, type VariationBasis } from '@/lib/variation-references';
import { referenceOf, type VariationScale } from '@/lib/variation-scale';
import { formatMadCompact } from '@/lib/format';
import type { DasHr, DasHrState } from '@/lib/org-types';
import { hiresOf, retargetHeadcount, type HireKey } from '@/lib/headcount-target';

/**
 * Ce que chaque orientation sert RÉELLEMENT, dans l'ordre où le moteur la lit.
 *
 * « Management » annonçait la délégation, que rien ne mesure : ce que
 * l'encadrement intermédiaire produit dans le moteur, c'est du climat social —
 * de loin le plus fort coefficient des quatre. La promesse est alignée sur le
 * calcul, et non l'inverse.
 */
const TRAINING_FOCUS = [
  ['technique', 'Technique', 'Le geste métier. Sert la compétence, et la qualité après elle.'],
  ['management', 'Management', 'Encadrement intermédiaire. Sert d’abord le climat social.'],
  ['qualite', 'Qualité', 'Normes et contrôle. Le meilleur rendement en qualité produit.'],
  ['polyvalence', 'Polyvalence', 'Sert la standardisation : c’est elle qui autorise à réduire l’effectif sans perdre en qualité.'],
] as const;

const RESTRUCTURING = [
  ['aucune', 'Aucune', 'Rien ne change.'],
  ['reorganisation', 'Réorganisation interne', 'Redéploiement sans départs. Coût social modéré.'],
  ['externalisation', 'Externalisation', 'Une fonction passe à un prestataire. Coût social lourd.'],
  ['fermeture_site', 'Fermeture de site', 'Le geste le plus brutal. Le climat s’en souvient longtemps.'],
] as const;

/** Les quatre catégories de recrutement : clé de module, champ, libellé. */
const HIRE_FIELDS = [
  ['org.hire_operateurs', 'hireOperateurs', 'Opérateurs'],
  ['org.hire_techniciens', 'hireTechniciens', 'Techniciens'],
  ['org.hire_experts', 'hireExperts', 'Experts'],
  ['org.hire_cadres', 'hireCadres', 'Cadres'],
] as const satisfies readonly (readonly [string, keyof DasHr, string])[];

export function HrSection({
  hr, state, locked, onChange, modules, previous, scales, basis,
}: {
  hr: DasHr;
  state: DasHrState | null;
  locked: boolean;
  onChange: (hr: DasHr) => void;
  modules: EnabledModules;
  /** Les grandeurs RH du tour précédent : référence des curseurs. */
  previous: Record<string, number>;
  scales: Readonly<Record<string, VariationScale>>;
  basis: VariationBasis;
}) {
  const patch = (values: Partial<DasHr>) => onChange({ ...hr, ...values });

  /** Référence d'un champ : le tour précédent, la dotation à défaut. */
  //
  // Un NIVEAU — salaire, formation — part de sa valeur en vigueur. Un FLUX —
  // recrutements, transferts — part de ZÉRO : recruter autant qu'au tour
  // dernier n'est pas « ne rien changer », c'est refaire le même geste. Le
  // serveur borne les flux sur la même origine.
  const ref = (key: string, field: string, flow = false) =>
    referenceOf(flow ? 0 : (previous[field] ?? 0), endowmentReference(key, basis));

  const hires = hiresOf(hr);

  // Le profil qui reçoit un recrutement ajouté depuis le compteur : le premier
  // que la session ouvre. Aucun ouvert, l'effectif ne peut que baisser.
  const openHireKey: HireKey | null =
    HIRE_FIELDS.find(([key]) => isOn(modules, key))?.[1] ?? null;

  // L'effectif EN PLACE, relevé du dernier exercice clos, est le point d'appui
  // de toute la saisie. Sans lui — première session, domaine acquis ce tour —
  // on part de zéro, ce qui reste vrai : il n'y a effectivement personne.
  const current = state?.headcount ?? 0;
  // L'effectif visé est la SOMME des décisions, jamais une saisie à part :
  // c'est ce qui garantit que l'écran et le moteur lisent le même effectif.
  const target = Math.max(current + hires - hr.layoffs, 0);

  // Indemnités : barème de l'article 53, huit ans d'ancienneté moyenne,
  // deux mois de préavis. Le calcul exact est refait côté serveur.
  const severancePerHead = (912 * hr.avgSalaryBrutMad) / 191 + 2 * hr.avgSalaryBrutMad;
  const severanceTotal = hr.layoffs * severancePerHead;

  const overCut = state !== null && hr.layoffs > state.safeReduction;
  const restructuring = RESTRUCTURING.find(([v]) => v === hr.restructuring);

  return (
    <div className="space-y-8">
      {/* ── Où l'on en est ─────────────────────────────────────────────── */}
      {state === null ? (
        <p className="rounded-lg bg-(--surface-muted) px-4 py-3 text-sm text-(--foreground-muted)">
          Aucun exercice n’est encore clos pour ce domaine : vos indicateurs sociaux
          apparaîtront ici après la première publication.
        </p>
      ) : (
        <div>
          <GroupLegend as="p" title="Où en est ce domaine">
            Relevé du dernier exercice clos. C’est à partir de là que vos décisions agissent.
          </GroupLegend>
          <dl className="tabular grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi
              term="Climat social" value={state.climatSocial.toFixed(0)}
              alert={state.climatSocial < 40 ? 'dégradé' : undefined}
              note={
                state.climatSocial < 40
                  ? 'Dégradé : la rotation s’emballe.'
                  : 'Sous 60, une part de l’outil cesse de produire et chaque unité coûte plus cher. L’effet se voit au tour suivant.'
              }
            />
            <Kpi
              term="Indice de charge" value={state.workloadIndex.toFixed(0)}
              alert={state.workloadIndex > 120 ? 'surcharge' : state.workloadIndex < 80 ? 'sous-charge' : undefined}
              note={
                state.workloadIndex > 120 ? 'Surcharge : on tient par l’usure.'
                : state.workloadIndex < 80 ? 'Sous-charge : on paie des gens à attendre.'
                : '100 = l’effectif absorbe exactement la demande.'
              }
            />
            <Kpi
              term="Taux de rotation"
              value={`${(state.turnoverRate * 100).toFixed(1)} %`}
              alert={state.turnoverRate > 0.15 ? 'élevé' : undefined}
              note={
                state.turnoverRate > 0.15
                  ? 'Ce sont les plus qualifiés qui partent, et ils partent ce tour-ci.'
                  : 'Ce taux s’applique à votre effectif ce tour-ci, en départs subis.'
              }
            />
            <Kpi
              term="Départs subis"
              value={state.departuresCount.toLocaleString('fr-FR')}
              alert={state.departuresCount > 0 ? 'à remplacer' : undefined}
              note={
                state.departuresCount > 0
                  ? 'Partis d’eux-mêmes. À remplacer pour tenir la même charge.'
                  : undefined
              }
            />
            <Kpi term="Effectif de clôture" value={state.headcount.toLocaleString('fr-FR')} />
            <Kpi term="Masse salariale" value={formatMadCompact(state.payrollMad)} />
            <Kpi
              term="Productivité par tête"
              value={`${Math.round(state.productivity).toLocaleString('fr-FR')} u./pers.`}
            />
            <Kpi
              term="Niveau de standardisation" value={state.standardisationLevel.toFixed(0)}
              note="Acquise en mutualisant puis en standardisant, dans le bloc Directives du Groupe."
            />
            <Kpi term="Niveau d'automatisation" value={state.automationLevel.toFixed(0)} />
            <Kpi
              label="Indice de compétence" value={state.skillIndex.toFixed(0)}
              note="Au-dessus du niveau dont vous avez hérité, il abaisse votre coût de production et fait mieux rendre votre budget de recherche ; en dessous, l’inverse. Effet au tour suivant."
            />
          </dl>

          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-(--surface-muted) px-4 py-3 text-sm">
            <span>
              Réduction possible sans perte de qualité :{' '}
              <strong className="font-mono">{state.safeReduction.toLocaleString('fr-FR')} postes</strong>
            </span>
            <InfoHint label="Réduction sans perte de qualité">
              Votre standardisation et votre automatisation permettent de retirer ces postes sans
              perdre en qualité. Au-delà, chaque poste supprimé se paie en qualité produit.
            </InfoHint>
          </p>
          {state.qualityLossPts > 0 ? (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-(--negative-subtle) px-4 py-3 text-sm text-(--negative)">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Vos coupes du dernier exercice ont dépassé ce seuil :{' '}
                <strong>−{state.qualityLossPts.toFixed(1)} points de qualité</strong> sont retirés à
                votre produit ce tour-ci.
              </span>
            </p>
          ) : null}
        </div>
      )}

      {/* ── Effectif visé ──────────────────────────────────────────────
          On ne décide pas « de recruter quarante personnes » : on décide de
          passer de 1 240 à 1 280. Le compteur porte donc l'effectif EN PLACE,
          et l'équipe l'augmente ou le baisse. Recrutements et licenciements
          en découlent, au lieu d'être deux champs à zéro sans point d'appui. */}
      <fieldset disabled={locked}>
        <GroupLegend title="Effectif de ce domaine">
          Partez de ce qui est en place et ajustez. C’est l’écart qui se traduit en
          recrutements ou en départs — et qui se paie.
        </GroupLegend>

        <div className="grid gap-4 sm:grid-cols-2">
          <HeadcountStepper
            label="Effectif visé en fin d’exercice"
            current={current}
            value={target}
            step={10}
            max={openHireKey === null ? current + hires : undefined}
            disabled={locked}
            // Le « + » remettait les départs à zéro sans créer de recrutement :
            // l'effectif visé, recalculé, revenait à l'effectif en place. La
            // règle complète vit dans `retargetHeadcount`, testée à part.
            onChange={(next) => patch(retargetHeadcount(hr, current, next, openHireKey))}
            hint={
              openHireKey === null
                ? 'Le recrutement est fermé pour cette session : l’effectif ne peut que baisser.'
                : 'Les flèches vont de dix en dix ; le champ accepte n’importe quelle valeur. Ce que vous ajoutez va aux opérateurs : répartissez ensuite entre les profils.'
            }
          />

          {isOn(modules, 'org.restructuring') ? (
            <label className="block self-start">
              <span className="flex items-center gap-2 text-sm font-medium">
                Nature de la restructuration
                <InfoHint label="Nature de la restructuration">
                  <Definitions items={RESTRUCTURING.map(([, label, hint]) => [label, hint] as const)} />
                </InfoHint>
              </span>
              <select
                value={hr.restructuring}
                onChange={(e) => patch({ restructuring: e.target.value as DasHr['restructuring'] })}
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              >
                {RESTRUCTURING.map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              {restructuring && restructuring[0] !== 'aucune' ? (
                <span className="mt-1 block text-sm text-(--warning)">{restructuring[2]}</span>
              ) : null}
            </label>
          ) : null}
        </div>
      </fieldset>

      {/* ── Qui l'on recrute ───────────────────────────────────────────── */}
      {hires > 0 ? (
        <fieldset disabled={locked}>
          <GroupLegend title={`Qui vous recrutez — ${hires.toLocaleString('fr-FR')} personne${hires > 1 ? 's' : ''}`}>
            La composition compte autant que le nombre : une différenciation crédible ne se
            construit pas avec des opérateurs seuls.
          </GroupLegend>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HIRE_FIELDS.map(([key, field, label]) => (
              <VariationField
                key={field}
                label={label}
                unit="count"
                value={hr[field]}
                reference={ref(key, field, true)}
                referenceLabel="sans mouvement"
                scale={scales.recrutement}
                onChange={(v) => patch({ [field]: v })}
              />
            ))}
          </div>

          {isOn(modules, 'org.internal_transfers') ? (
            <div className="mt-6">
              <VariationField
                label="Venus d’un autre domaine du groupe"
                unit="count"
                value={hr.internalTransfersIn}
                reference={ref('org.internal_transfers', 'internalTransfersIn', true)}
                referenceLabel="sans mouvement"
                scale={scales.recrutement}
                onChange={(v) => patch({ internalTransfersIn: v })}
                hint="Ils connaissent déjà la maison : contrairement à un recrutement externe, ils ne diluent pas le niveau moyen."
              />
            </div>
          ) : null}

          {state !== null && state.headcount > 0 && hires / state.headcount > 0.2 ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-(--warning-subtle) px-4 py-2.5 text-sm text-(--warning)">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Vous recrutez {((hires / state.headcount) * 100).toFixed(0)} % de l’effectif en un
                exercice. Au-delà de 20 %, l’intégration ne suit plus et le climat en pâtit.
              </span>
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
          <GroupLegend title={`Départs — ${hr.layoffs.toLocaleString('fr-FR')} poste${hr.layoffs > 1 ? 's' : ''}`}>
            Les indemnités se versent immédiatement — l’économie de salaires, elle, n’arrive
            qu’ensuite. Barème de l’article 53 du Code du travail, préavis compris.
          </GroupLegend>
          <p
            className={`flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm ${
              overCut ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--warning-subtle) text-(--warning)'
            }`}
          >
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-mono">{formatMadCompact(severanceTotal)}</strong> d’indemnités
              légales à verser ce tour.
              {overCut ? (
                <>
                  {' '}Vous dépassez de {(hr.layoffs - (state?.safeReduction ?? 0)).toLocaleString('fr-FR')} postes
                  ce que votre standardisation autorise : la qualité produit en souffrira.
                </>
              ) : null}
            </span>
          </p>
        </fieldset>
      ) : null}

      {/* ── Rémunération et formation ──────────────────────────────────── */}
      <fieldset disabled={locked}>
        <GroupLegend title="Rémunération et formation" />
        <div className="grid gap-6 sm:grid-cols-2">
          <VariationField
            label="Salaire brut mensuel moyen"
            value={hr.avgSalaryBrutMad}
            reference={ref('org.avg_salary', 'avgSalaryBrutMad')}
            scale={scales.salaire}
            disabled={locked}
            onChange={(v) => patch({ avgSalaryBrutMad: v })}
            hint="Payer mieux améliore le climat, avec des rendements décroissants. La fourchette est étroite : un salaire ne se renégocie pas de moitié d’un exercice à l’autre."
          />

          {isOn(modules, 'org.training_budget') ? (
            <VariationField
              label="Budget de formation"
              value={hr.trainingBudgetMad}
              reference={ref('org.training_budget', 'trainingBudgetMad')}
              scale={scales.formation}
              disabled={locked}
              onChange={(v) => patch({ trainingBudgetMad: v })}
              hint="Améliore la compétence et le climat, et amortit le choc d’une automatisation. La dotation de repli est le droit de tirage OFPPT : 1,6 % de la masse salariale."
            />
          ) : null}
        </div>
      </fieldset>

      {isOn(modules, 'org.training_focus') ? (
        <fieldset disabled={locked}>
          <GroupLegend title="Sur quoi former">
            <Definitions items={TRAINING_FOCUS.map(([, label, hint]) => [label, hint] as const)} />
          </GroupLegend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TRAINING_FOCUS.map(([v, label]) => (
              <ChoiceCard
                key={v}
                title={label}
                selected={hr.trainingFocus === v}
                onSelect={() => patch({ trainingFocus: v })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* ── Financements publics ───────────────────────────────────────── */}
      {anyOn(modules, ['org.skills_audit', 'org.claim_giac', 'org.claim_ofppt']) ? (
        <fieldset disabled={locked}>
          <GroupLegend title="Diagnostic et financements" />
          <div className="grid gap-2 lg:grid-cols-3">
            {isOn(modules, 'org.skills_audit') ? (
              <Check
                checked={hr.orderSkillsAudit} disabled={locked}
                onChange={(v) => patch({ orderSkillsAudit: v, claimGiac: v && hr.claimGiac })}
                label="Commander un bilan de compétences"
                hint="Un plan de formation bâti sur un diagnostic rend nettement plus qu’un plan improvisé. C’est aussi ce que le GIAC finance."
              />
            ) : null}
            {isOn(modules, 'org.claim_ofppt') ? (
              <Check
                checked={hr.claimOfppt} disabled={locked}
                onChange={(v) => patch({ claimOfppt: v })}
                label="Solliciter l’OFPPT"
                hint="Contrats spéciaux de formation. Rembourse 70 % de la formation, dans la limite de votre droit de tirage — 1,6 % de votre masse salariale. Dépenser au-delà ne rembourse pas davantage."
              />
            ) : null}
            {/* Le GIAC exige le bilan : si le facilitateur a fermé le bilan, la
                case resterait cochable mais jamais satisfaisable. */}
            {isOn(modules, 'org.claim_giac') && isOn(modules, 'org.skills_audit') ? (
              <Check
                checked={hr.claimGiac} disabled={locked || !hr.orderSkillsAudit}
                onChange={(v) => patch({ claimGiac: v })}
                label="Solliciter le GIAC sectoriel"
                requirement={hr.orderSkillsAudit ? undefined : 'Exige un bilan de compétences'}
                hint="Finance l’ingénierie de formation — le diagnostic, l’analyse des besoins, le plan —, pas la formation elle-même. Sans diagnostic, il n’y a rien à rembourser."
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

/**
 * Un indicateur social du dernier exercice.
 *
 * Un état dégradé se lit par un pictogramme ET un mot, pas seulement par le
 * rouge du chiffre ; l'explication du seuil est sous le « + ».
 */
function Kpi({
  term, label, value, note, alert,
}: {
  /** Terme du glossaire, avec sa définition au survol. */
  term?: string;
  /** Libellé simple, quand le terme n'est pas au glossaire. */
  label?: string;
  value: string;
  note?: string;
  alert?: string;
}) {
  const name = term ?? label ?? '';
  return (
    <div className={`rounded-lg px-3 py-2.5 ${alert ? 'bg-(--negative-subtle)' : 'bg-(--surface-muted)'}`}>
      <dt className="flex items-center gap-1.5 text-sm text-(--foreground-muted)">
        {term ? <Term>{term}</Term> : label}
        {note ? <InfoHint label={name}>{note}</InfoHint> : null}
      </dt>
      <dd className={`mt-0.5 font-mono text-lg font-semibold ${alert ? 'text-(--negative)' : 'text-(--foreground)'}`}>
        {value}
      </dd>
      {alert ? (
        <dd className="flex items-center gap-1 text-sm font-medium text-(--negative)">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
          {alert}
        </dd>
      ) : null}
    </div>
  );
}

function Check({
  checked, disabled, onChange, label, hint, requirement,
}: {
  checked: boolean; disabled: boolean;
  onChange: (v: boolean) => void; label: string; hint: string;
  /** Condition non remplie, dite en clair : elle explique la case grisée. */
  requirement?: string;
}) {
  return (
    <label
      className={`flex gap-3 rounded-lg border px-4 py-3 transition-colors ${
        checked ? 'border-(--accent) bg-(--accent-subtle)' : 'border-(--border) bg-(--surface)'
      }`}
    >
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-(--accent)"
      />
      <span className="min-w-0">
        <span className={`flex items-center gap-2 text-sm font-medium ${disabled ? 'text-(--foreground-muted)' : ''}`}>
          {label}
          <InfoHint label={label}>{hint}</InfoHint>
        </span>
        {requirement ? (
          <span className="mt-0.5 block text-sm text-(--foreground-muted)">{requirement}</span>
        ) : null}
      </span>
    </label>
  );
}
