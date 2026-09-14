'use client';

/**
 * ATLAS — écrans de stratégie : plans 1, 2 et 3 du cahier.
 *
 * ── DEUX NIVEAUX, DEUX ÉCRANS ──────────────────────────────────────────────
 * Ce fichier porte DEUX vues, servies par deux adresses distinctes :
 *
 *   • `/strategie`     → {@link StrategieGroupeView} — portefeuille, structure,
 *     centralisation, mutualisation, valeurs, vision. Cela vaut pour
 *     l'entreprise entière et ne se saisit qu'une fois.
 *   • `/strategie/das` → {@link StrategieDasView} — stratégie générique, prix,
 *     segments, investissements. Cela ne concerne QUE le domaine choisi dans la
 *     barre du haut.
 *
 * Les deux blocs vivaient auparavant sur la même page, l'un sous l'autre, et la
 * barre de navigation prétendait les distinguer avec deux entrées pointant vers
 * la même adresse à une ancre près. Le résultat était le contraire de ce que le
 * cahier demande : « Stratégie du Groupe » ouvrait un écran où la stratégie du
 * domaine était visible juste en dessous, si bien qu'on réglait un prix — une
 * décision de DAS — en croyant piloter le Groupe. Séparer les adresses est la
 * seule façon de rendre la frontière vraie plutôt que décorative : chaque écran
 * ne montre QUE son niveau, et le changement d'écran est le geste qui marque le
 * changement de niveau de décision.
 *
 * ── CE QUE LES DEUX ÉCRANS NE FONT PAS, DÉLIBÉRÉMENT ───────────────────────
 * Ils n'annoncent aucun résultat. Ils disent le coût d'une décision, jamais son
 * effet sur la part de marché. Prédire le résultat rendrait la révélation sans
 * intérêt, et le jeu deviendrait une optimisation par tâtonnement.
 *
 * ── L'AIDE SOUS UN « + » ───────────────────────────────────────────────────
 * Chaque option, chaque bloc, chaque poste avait sa phrase d'explication
 * affichée en permanence. L'écran se lisait comme une notice, et la décision
 * se perdait dedans. Les explications sont désormais derrière un « + » : l'écran
 * montre ce qui se décide, le « + » dit pourquoi.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { useDasScope } from '@/components/das-scope';
import { useT } from '@/components/i18n-provider';
import {
  BudgetGauge, DasChecklist, DecisionBar, SectionActions,
  type MissingDecision,
} from '@/components/decision-shell';
import { GlossaryButton } from '@/components/glossary-modal';
import { Accordion } from '@/components/ui/accordion';
import { DasDot } from '@/components/ui/das-dot';
import { ChipToggle, ChoiceCard, Definitions, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
import { delta, formatMadCompact, formatScore } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/messages';
import {
  dasDecisionDefaults,
  type CorporateValues, type DasDecisionValues, type DasEntry, type DecisionContext,
} from '@/lib/decision-types';
import { deepEqual } from '@/lib/deep-equal';
import { anyOn, isOn, type EnabledModules } from '@/lib/modules-state';
import { BrandName } from '@/components/brand-name';
import { VariationField } from '@/components/variation-field';
import { endowmentReference } from '@/lib/variation-references';
import { referenceOf, type VariationScale } from '@/lib/variation-scale';
import { useAutosave } from '@/lib/use-autosave';

const CORPORATE = [
  ['specialisation', 'Concentrer toutes les ressources sur un ou deux métiers proches.'],
  ['integration_verticale', 'Contrôler les maillons amont et aval de sa propre filière.'],
  ['diversification_liee', 'Plusieurs métiers qui partagent ressources, canaux ou compétences.'],
  ['diversification_conglomerale', 'Plusieurs métiers sans lien opérationnel : logique financière.'],
] as const;

const STRUCTURES = [
  ['fonctionnelle', 'Une direction par fonction. Simple, tient mal au-delà de trois métiers.'],
  ['divisionnelle', 'Une division autonome par métier. Duplique les fonctions support.'],
  ['matricielle', 'Croise métiers et fonctions. Ne vaut que s’il y a des ressources à partager.'],
] as const;

const GENERIC = [
  ['domination_couts', 'Servir un marché large au coût le plus bas. Le profit vient du volume.'],
  ['differenciation', 'Une offre perçue comme unique, qui justifie un prix élevé.'],
  ['focus_couts', 'Un seul segment, servi mieux et moins cher que les généralistes.'],
  ['focus_differenciation', 'Un seul segment, servi sur mesure à forte valeur.'],
] as const;

const VALUES = [
  'excellence_produit', 'innovation', 'proximite_client', 'accessibilite_prix',
  'efficience_operationnelle', 'responsabilite_sociale', 'ancrage_territorial', 'fiabilite_service',
] as const;

/**
 * Fonctions centralisables, chacune avec la clé du module qui l'ouvre : le
 * facilitateur peut n'ouvrir que les achats, et la ligne n'affiche alors qu'un
 * seul interrupteur.
 */
const FUNCTIONS = [
  ['centralPurchasing', 'Achats', 'strategie.central_purchasing'],
  ['centralIt', 'Système d’information', 'strategie.central_it'],
  ['centralRd', 'R&D', 'strategie.central_rd'],
  ['centralHr', 'Ressources humaines', 'strategie.central_hr'],
  ['centralFinance', 'Finance', 'strategie.central_finance'],
] as const;

const CENTRALISATION_KEYS = FUNCTIONS.map(([, , moduleKey]) => moduleKey);

/**
 * Les cinq postes d'engagement du domaine : clé de module, champ de décision,
 * libellé, et ce que l'équipe doit savoir avant d'arbitrer.
 */
const INVESTMENTS = [
  ['das.capex_capacity', 'capexCapacityMad', 'Outil de production',
    'Disponible au tour SUIVANT : il faut anticiper la demande.'],
  ['das.capex_automation', 'capexAutomationMad', 'Automatisation',
    'Baisse le coût variable, augmente les coûts fixes.'],
  ['das.capex_own_network', 'capexOwnNetworkMad', 'Réseau de vente propre',
    'Supprime la marge distributeur. Lent à construire.'],
  ['das.rd_budget', 'rdBudgetMad', 'Recherche & développement',
    'Effet DIFFÉRÉ d’un tour sur la qualité.'],
  ['das.marketing_budget', 'marketingBudgetMad', 'Marketing',
    'Effet immédiat sur la notoriété, à rendement décroissant.'],
] as const satisfies readonly (readonly [string, keyof DasDecisionValues, string, string])[];

const INVESTMENT_KEYS = INVESTMENTS.map(([key]) => key);

const FAMILY_OF: Record<string, string> = {
  'das.capex_capacity': 'investissement',
  'das.capex_automation': 'investissement',
  'das.capex_own_network': 'investissement',
  'das.rd_budget': 'innovation',
  'das.marketing_budget': 'marketing',
};

/* ══════════════════════════════════════════════════════════════════════════
   NIVEAU 1 — LE GROUPE                                          `/strategie`
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce que décide l'entreprise entière, une fois pour toutes ses activités.
 *
 * Aucun sélecteur de domaine n'agit sur cet écran : rien de ce qu'il porte n'est
 * propre à un métier. C'est précisément ce qui justifie qu'il soit seul sur sa
 * page — tant qu'il cohabitait avec les investissements d'un DAS, le domaine
 * affiché dans la barre semblait gouverner l'ensemble.
 */
export function StrategieGroupeView({
  context, missing, modules,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  modules: EnabledModules;
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const locked = !context.decisionsOpen;
  const t = useT();

  const [corporate, setCorporate] = useState<CorporateValues>(context.corporate);

  const pushCorporate = useCallback(
    (next: CorporateValues) => {
      setCorporate(next);
      autosave.save({ plan: 'corporate', ...next });
    },
    [autosave],
  );

  const changed = !deepEqual(corporate, context.corporateBaseline);

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-8">
          <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
            {t('strat.eyebrowGroup', { n: context.roundNumber })}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            {t('strat.groupTitle')}
            <InfoHint label={t('strat.groupTitle')}>
              {t('strat.groupIntro')}{' '}
              <a href="/strategie/das" className="font-medium text-(--accent-text) underline">
                {t('nav.link./strategie/das')}
              </a>.
            </InfoHint>
          </h1>
        </header>

        <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
          {isOn(modules, 'strategie.corporate_strategy') ? (
          <fieldset disabled={locked}>
            <GroupLegend title={t('strat.portfolioLegend')}>
              <Definitions items={labelled(CORPORATE, t)} />
            </GroupLegend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CORPORATE.map(([value]) => (
                <ChoiceCard
                  key={value}
                  selected={corporate.corporateStrategy === value}
                  title={t(`strategy.${value}` as MessageKey)}
                  onSelect={() => pushCorporate({ ...corporate, corporateStrategy: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {isOn(modules, 'strategie.structure_type') ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title={t('strat.structureLegend')}>
              <span className="block">{t('strat.structureNote')}</span>
              <span className="mt-2 block"><Definitions items={labelled(STRUCTURES, t)} /></span>
            </GroupLegend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRUCTURES.map(([value]) => (
                <ChoiceCard
                  key={value}
                  selected={corporate.structureType === value}
                  title={t(`strategy.${value}` as MessageKey)}
                  onSelect={() => pushCorporate({ ...corporate, structureType: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, CENTRALISATION_KEYS) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title={t('strat.hqLegend')}>{t('strat.hqNote')}</GroupLegend>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONS.filter(([, , moduleKey]) => isOn(modules, moduleKey)).map(
                ([key]) => (
                  <ChipToggle
                    key={key}
                    label={t(`function.${key}` as MessageKey)}
                    on={corporate[key] as boolean}
                    onToggle={() => pushCorporate({ ...corporate, [key]: !corporate[key] })}
                  />
                ),
              )}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.shared_production', 'strategie.shared_rd']) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title={t('strat.sharingLegend')}>{t('strat.sharingNote')}</GroupLegend>
            <div className="flex flex-wrap gap-2">
              {isOn(modules, 'strategie.shared_production') ? (
                <ChipToggle label={t('strat.sharedProduction')} on={corporate.sharedProduction}
                  onToggle={() => pushCorporate({ ...corporate, sharedProduction: !corporate.sharedProduction })} />
              ) : null}
              {isOn(modules, 'strategie.shared_rd') ? (
                <ChipToggle label={t('strat.sharedRd')} on={corporate.sharedRd}
                  onToggle={() => pushCorporate({ ...corporate, sharedRd: !corporate.sharedRd })} />
              ) : null}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.value1', 'strategie.value2']) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title={t('strat.valuesLegend')}>{t('strat.valuesNote')}</GroupLegend>
            <div className="grid gap-3 sm:grid-cols-2">
              {isOn(modules, 'strategie.value1') ? (
                <ValueSelect
                  label={t('strat.value1')} value={corporate.value1}
                  exclude={corporate.value2}
                  onChange={(v) => pushCorporate({ ...corporate, value1: v })}
                />
              ) : null}
              {isOn(modules, 'strategie.value2') ? (
                <ValueSelect
                  label={t('strat.value2')} value={corporate.value2}
                  exclude={corporate.value1}
                  onChange={(v) => pushCorporate({ ...corporate, value2: v })}
                />
              ) : null}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.vision', 'strategie.mission']) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title={t('strat.visionLegend')}>{t('strat.visionNote')}</GroupLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              {isOn(modules, 'strategie.vision') ? (
                <label className="block">
                  <span className="text-sm">{t('strat.vision')}</span>
                  <textarea
                    rows={3} maxLength={600}
                    defaultValue={corporate.vision ?? ''}
                    placeholder={t('strat.visionPlaceholder')}
                    onBlur={(e) => pushCorporate({ ...corporate, vision: e.target.value || null })}
                    className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              {isOn(modules, 'strategie.mission') ? (
                <label className="block">
                  <span className="text-sm">{t('strat.mission')}</span>
                  <textarea
                    rows={3} maxLength={600}
                    defaultValue={corporate.mission ?? ''}
                    placeholder={t('strat.missionPlaceholder')}
                    onBlur={(e) => pushCorporate({ ...corporate, mission: e.target.value || null })}
                    className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
          ) : null}

          <SectionActions
            what={t('strat.validateGroup')}
            locked={locked}
            changed={changed}
            recorded={context.corporateRecorded}
            onValidate={async () => {
              autosave.save({ plan: 'corporate', ...corporate });
              await autosave.flush();
              router.refresh();
            }}
            onReset={() => pushCorporate(context.corporateBaseline)}
          />
        </section>
      </main>

      <DecisionBar
        state={autosave.state}
        pending={autosave.pending}
        lastError={autosave.lastError}
        savedAt={autosave.savedAt}
        missing={missing}
        decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NIVEAU 2 — LE DOMAINE PILOTÉ                              `/strategie/das`
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce que décide UN métier, celui choisi dans la barre du haut.
 *
 * Le domaine piloté vient du sélecteur global, jamais d'un état local : celui
 * retenu ici doit être encore celui des achats et de l'organisation.
 *
 * ── LA SYNTHÈSE D'ABORD ────────────────────────────────────────────────────
 * L'écran s'ouvre sur ce qui est décidé — stratégie, prix, segments, montant
 * engagé — lisible sans rien déplier, chacun comparé au tour précédent. Les
 * blocs de saisie suivent, repliés, leur valeur courante dans le titre : on
 * n'ouvre que ce qu'on veut changer.
 */
export function StrategieDasView({
  context, missing, modules, scales,
  renameBrandAction,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  modules: EnabledModules;
  scales: Readonly<Record<string, VariationScale>>;
  /**
   * Passée en PROPRIÉTÉ et non importée : un composant client qui importe une
   * action serveur tire tout le graphe `server-only` dans son bundle, et
   * `boundaries.test.ts` refuse cette dépendance — y compris transitive, ce
   * qu'a montré `marches-view`, qui n'importe que `checklistOf` d'ici.
   */
  renameBrandAction: (input: { dasId: string; brandName: string }) =>
    Promise<{ ok: true; name: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const autosave = useAutosave();
  const { activeDasId } = useDasScope();
  const locked = !context.decisionsOpen;
  const t = useT();

  const [dasState, setDasState] = useState<Record<string, DasDecisionValues>>(() =>
    Object.fromEntries(context.das.map((d) => [d.dasId, d.decision])),
  );

  const das = context.das.find((d) => d.dasId === activeDasId) ?? null;
  const d = das ? dasState[das.dasId] : null;

  const pushDas = useCallback(
    (dasId: string, next: DasDecisionValues) => {
      setDasState((prev) => ({ ...prev, [dasId]: next }));
      autosave.save({ plan: 'das', dasId, ...next });
    },
    [autosave],
  );

  // L'engagement affiché reste celui de TOUT le portefeuille : la trésorerie est
  // commune, et ne montrer que le domaine piloté laisserait croire qu'il en
  // dispose seul.
  const engaged = useMemo(
    () => Object.values(dasState).reduce((acc, v) => acc + engagedOn(v), 0),
    [dasState],
  );

  const changed = das && d ? !deepEqual(d, das.baseline.decision) : false;

  // Les dotations de repli se calculent sur la trésorerie du groupe : c'est
  // l'assiette de tout engagement, et la seule grandeur commune aux domaines.
  const basis = {
    treasuryMad: context.treasuryMad,
    payrollMad: context.hr.payrollMad,
    headcount: context.headcount,
    smigMad: context.smigMad,
    operatingBudgetMad: 0,
    directionCount: 0,
  };
  // L'état d'ouverture du tour — c'est-à-dire ce que l'équipe a décidé à
  // l'exercice précédent, puisque les décisions se reconduisent. Il sert de
  // repère sous chaque champ, et non seulement de cible au bouton de remise à
  // zéro : une saisie sans point de départ n'est pas un arbitrage.
  const b = das?.baseline.decision ?? dasDecisionDefaults(das?.segments ?? []);
  const showInvestments = anyOn(modules, INVESTMENT_KEYS);

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
        <header className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
                {t('strat.eyebrowDas', { n: context.roundNumber })}
              </p>
              <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
                {das ? (
                  <span className="inline-flex items-center gap-2">
                    <DasDot seed={das.activityName} />
                    {t('strat.dasTitlePrefix')}{' '}
                    {/* Le domaine EST une marque : c'est ici qu'on la nomme, dans
                        le titre de l'écran qui la pilote. */}
                    <BrandName
                      dasId={das.dasId}
                      brandName={das.brandName}
                      activityName={das.activityName}
                      renameAction={renameBrandAction}
                    />
                  </span>
                ) : (
                  t('strat.dasTitleFallback')
                )}
                <InfoHint label={t('strat.dasTitleFallback')}>
                  {t('strat.dasIntro')}{' '}
                  <a href="/strategie" className="font-medium text-(--accent-text) underline">
                    {t('strat.groupTitle')}
                  </a>.
                </InfoHint>
              </h1>
            </div>
            <GlossaryButton />
          </div>
        </header>

        {das && d ? (
          <div className="space-y-4">
            {/* ── Ce qui est décidé, sans rien ouvrir ───────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                size="sm"
                label={t('strat.cardGeneric')}
                value={t(`strategy.${d.genericStrategy}` as MessageKey)}
                delta={context.roundNumber > 0 && d.genericStrategy === b.genericStrategy ? { value: 0, label: '=', direction: 'flat' } : null}
                note={context.roundNumber > 0 ? t('strat.changedWas', { value: t(`strategy.${b.genericStrategy}` as MessageKey) }) : undefined}
                polarity="neutral"
              />
              <StatCard
                label={t('strat.cardPrice')}
                value={priceMultiplier(d.pricePosition)}
                delta={context.roundNumber > 0 ? delta(pricePct(d.pricePosition), pricePct(b.pricePosition), (v) => `${formatScore(v, 0)} pts`) : null}
                polarity="neutral"
                hint={t('strat.priceHint', { position: d.pricePosition })}
              />
              <StatCard
                label={t('strat.cardSegments')}
                value={`${d.servedSegments.length} / ${das.segments.length}`}
                delta={context.roundNumber > 0 ? delta(d.servedSegments.length, b.servedSegments.length, (v) => formatScore(v, 0)) : null}
                polarity="neutral"
              />
              {showInvestments ? (
                <StatCard
                  label={t('strat.cardEngaged')}
                  value={formatMadCompact(engagedOn(d))}
                  delta={context.roundNumber > 0 ? delta(engagedOn(d), engagedOn(b), (v) => formatMadCompact(v)) : null}
                  polarity="neutral"
                  hint={
                    context.treasuryMad > 0
                      ? t('strat.engagedHintShare', { share: formatScore((engagedOn(d) / context.treasuryMad) * 100, 1) })
                      : t('strat.engagedHint')
                  }
                />
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <BudgetGauge
                  label={t('strat.gaugeAll')}
                  allocated={engaged}
                  available={context.treasuryMad}
                />
              </div>
              <div className="lg:col-span-2">
                <DasChecklist items={checklistOf(das)} className="h-full" />
              </div>
            </div>

            {/* ── Les décisions, une par bloc ───────────────────────────── */}
            <Accordion
              title={t('strat.cardGeneric')}
              indicators={{ topic: 'das-strategie', dasId: das.dasId }}
              summary={t(`strategy.${d.genericStrategy}` as MessageKey)}
              hint={<Definitions items={labelled(GENERIC, t)} />}
              defaultOpen
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">{t('strat.cardGeneric')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GENERIC.map(([value]) => (
                    <ChoiceCard
                      key={value}
                      selected={d.genericStrategy === value}
                      title={t(`strategy.${value}` as MessageKey)}
                      onSelect={() => pushDas(das.dasId, { ...d, genericStrategy: value })}
                    />
                  ))}
                </div>
              </fieldset>
            </Accordion>

            <Accordion
              title={t('strat.pricingTitle')}
              indicators={{ topic: 'das-prix', dasId: das.dasId }}
              summary={t('strat.pricingSummary', { position: d.pricePosition, pct: priceMultiplier(d.pricePosition) })}
              hint={t('strat.pricingHint')}
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">{t('strat.pricingTitle')}</legend>
                <p className="tabular flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-2xl font-medium">{d.pricePosition}</span>
                  <span className="text-(--foreground-muted)">
                    {t('strat.pricingEquals', { pct: priceMultiplier(d.pricePosition) })}
                  </span>
                </p>
                <input
                  type="range" min={0} max={100} step={1} value={d.pricePosition}
                  aria-label={t('strat.pricingAria')}
                  onChange={(e) => pushDas(das.dasId, { ...d, pricePosition: Number(e.target.value) })}
                  className="mt-3 w-full accent-(--accent)"
                />
                <div className="mt-1 flex justify-between text-sm text-(--foreground-muted)">
                  <span>{t('strat.pricingLow')}</span>
                  <span>{t('strat.pricingMid')}</span>
                  <span>{t('strat.pricingHigh')}</span>
                </div>
                <p className="tabular mt-3 text-sm text-(--foreground-muted)">
                  {t('strat.previousRound', { position: b.pricePosition, pct: priceMultiplier(b.pricePosition) })}
                  {d.pricePosition !== b.pricePosition
                    ? ` · ${t(d.pricePosition > b.pricePosition ? 'strat.pointsUp' : 'strat.pointsDown', { n: Math.abs(d.pricePosition - b.pricePosition) })}`
                    : ` · ${t('strat.unchanged')}`}
                </p>
              </fieldset>
            </Accordion>

            <Accordion
              title={t('strat.cardSegments')}
              indicators={{ topic: 'das-segments', dasId: das.dasId }}
              summary={t('strat.segmentsSummary', { served: d.servedSegments.length, total: das.segments.length })}
              hint={t('strat.segmentsHint')}
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">{t('strat.cardSegments')}</legend>
                <div className="flex flex-wrap gap-2">
                  {das.segments.map((seg) => {
                    const on = d.servedSegments.includes(seg.key);
                    return (
                      <ChipToggle
                        key={seg.key}
                        label={seg.name}
                        on={on}
                        onToggle={() => {
                          const next = on
                            ? d.servedSegments.filter((s) => s !== seg.key)
                            : [...d.servedSegments, seg.key];
                          // Au moins un segment : sans marché adressable, il n'y
                          // a rien à calculer. La contrainte est aussi en base.
                          if (next.length === 0) return;
                          pushDas(das.dasId, { ...d, servedSegments: next });
                        }}
                      />
                    );
                  })}
                </div>
              </fieldset>
            </Accordion>

            {showInvestments ? (
              <Accordion
                title={t('strat.investTitle')}
                indicators={{ topic: 'das-investissements', dasId: das.dasId }}
                summary={formatMadCompact(engagedOn(d))}
                hint={t('strat.investHint')}
              >
                <fieldset disabled={locked}>
                  <legend className="sr-only">{t('strat.investTitle')}</legend>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {INVESTMENTS.filter(([key]) => isOn(modules, key)).map(
                      ([key, field]) => (
                        <VariationField
                          key={key}
                          label={t(`invest.${field}.label` as MessageKey)}
                          hint={t(`invest.${field}.hint` as MessageKey)}
                          value={d[field]}
                          reference={referenceOf(b[field], endowmentReference(key, basis))}
                          scale={scales[FAMILY_OF[key]]}
                          unset={!das.decisionRecorded}
                          onChange={(v) => pushDas(das.dasId, { ...d, [field]: v })}
                        />
                      ),
                    )}
                  </div>
                  <p className="tabular mt-5 border-t border-(--border) pt-4 text-sm text-(--foreground-muted)">
                    {t('strat.investTotal')}{' '}
                    <strong className="font-mono text-(--foreground)">{formatMadCompact(engagedOn(d))}</strong>
                    {' · '}{t('strat.investPrevious', { amount: formatMadCompact(engagedOn(b)) })}
                    {context.treasuryMad > 0
                      ? ` · ${t('strat.investShare', { share: formatScore((engagedOn(d) / context.treasuryMad) * 100, 1) })}`
                      : null}
                  </p>
                </fieldset>
              </Accordion>
            ) : null}

            {isOn(modules, 'das.declare_blue_ocean') ? (
              <Accordion
                title={t('strat.blueOceanTitle')}
                indicators={{ topic: 'das-ocean-bleu', dasId: das.dasId }}
                summary={d.declareBlueOcean ? t('strat.blueOceanDeclared') : t('strat.blueOceanNot')}
                hint={t('strat.blueOceanHint')}
              >
                <fieldset disabled={locked}>
                  <legend className="sr-only">{t('strat.blueOceanTitle')}</legend>
                  <ChipToggle
                    label={t('strat.blueOceanToggle')}
                    on={d.declareBlueOcean}
                    onToggle={() => pushDas(das.dasId, { ...d, declareBlueOcean: !d.declareBlueOcean })}
                  />
                </fieldset>
              </Accordion>
            ) : null}

            <div className="rounded-xl border border-(--border) bg-(--surface) px-5 pb-5">
              <SectionActions
                what={t('strat.validateDas', { name: das.name })}
                locked={locked}
                changed={changed}
                recorded={das.decisionRecorded}
                onValidate={async () => {
                  autosave.save({ plan: 'das', dasId: das.dasId, ...d });
                  await autosave.flush();
                  router.refresh();
                }}
                onReset={() => pushDas(das.dasId, das.baseline.decision)}
              />
            </div>
          </div>
        ) : (
          <>
            <BudgetGauge
              label={t('strat.gaugeAll')}
              allocated={engaged}
              available={context.treasuryMad}
            />
            <p className="mt-6 rounded-xl border border-(--border) bg-(--surface) px-6 py-5 text-(--foreground-muted)">
              {t('strat.noDas')}{' '}
              <a href="/cession" className="underline">{t('strat.noDasLink')}</a>{' '}
              {t('strat.noDasEnd')}
            </p>
          </>
        )}
      </main>

      <DecisionBar
        state={autosave.state}
        pending={autosave.pending}
        lastError={autosave.lastError}
        savedAt={autosave.savedAt}
        missing={missing}
        decisionsOpen={context.decisionsOpen}
        onValidate={async () => { await autosave.flush(); router.refresh(); }}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Éléments partagés par les deux niveaux
   ══════════════════════════════════════════════════════════════════════════ */

/** Ce qu'un domaine engage, sous la même définition que la barre de trésorerie. */
function engagedOn(d: DasDecisionValues): number {
  return d.capexCapacityMad + d.capexAutomationMad + d.capexOwnNetworkMad
    + d.rdBudgetMad + d.marketingBudgetMad;
}

/** Les cinq volets d'un domaine, et où les renseigner. */
export function checklistOf(das: DasEntry) {
  return [
    { label: 'Stratégie', labelKey: 'check.strategy' as const, href: '/strategie/das', done: das.progress.strategy },
    { label: 'Organisation', labelKey: 'check.organisation' as const, href: '/organisation', done: das.progress.organisation },
    { label: 'Ressources humaines', labelKey: 'check.hr' as const, href: '/organisation', done: das.progress.hr },
    { label: 'Achats', labelKey: 'check.procurement' as const, href: '/marches', done: das.progress.procurement },
    { label: 'Distribution', labelKey: 'check.distribution' as const, href: '/marches', done: das.progress.distribution },
  ];
}

function ValueSelect({
  label, value, exclude, onChange,
}: { label: string; value: string; exclude: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
      >
        {VALUES.filter((v) => v !== exclude).map((v) => (
          <option key={v} value={v}>{t(`value.${v}` as MessageKey)}</option>
        ))}
      </select>
    </label>
  );
}

/** Des options du moteur, avec leur libellé et leur définition dans la langue du participant. */
function labelled(items: readonly (readonly [string, string])[], t: (key: MessageKey) => string) {
  return items.map(([value]) => [
    t(`strategy.${value}` as MessageKey),
    t(`strategyDef.${value}` as MessageKey),
  ] as const);
}

/**
 * Traduit la position de prix (0–100) en pourcentage du prix de marché.
 *
 * La grille du moteur : 0 → 60 %, 50 → 100 %, 100 → 140 %. Affichée à côté du
 * curseur, elle transforme un nombre sans unité en une décision commerciale que
 * l'équipe peut défendre au débriefing.
 */
function pricePct(position: number): number {
  return 60 + (position / 100) * 80;
}

function priceMultiplier(position: number): string {
  return `${pricePct(position).toFixed(0)} %`;
}
