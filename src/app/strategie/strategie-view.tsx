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
import {
  BudgetGauge, DasChecklist, DecisionBar, SectionActions,
  type MissingDecision,
} from '@/components/decision-shell';
import { GlossaryButton } from '@/components/glossary-modal';
import { Accordion } from '@/components/ui/accordion';
import { ChipToggle, ChoiceCard, Definitions, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
import { delta, formatMadCompact, formatScore, strategyLabel } from '@/lib/format';
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

const VALUE_LABELS: Record<string, string> = {
  excellence_produit: 'Excellence produit', innovation: 'Innovation',
  proximite_client: 'Proximité client', accessibilite_prix: 'Accessibilité prix',
  efficience_operationnelle: 'Efficience opérationnelle',
  responsabilite_sociale: 'Responsabilité sociale',
  ancrage_territorial: 'Ancrage territorial', fiabilite_service: 'Fiabilité de service',
};

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
            Tour {context.roundNumber} · niveau Groupe
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
            Stratégie du Groupe
            <InfoHint label="Stratégie du Groupe">
              Ces choix valent pour l’entreprise entière. Chaque domaine devra ensuite s’y
              situer — en les suivant ou en s’en écartant, les deux se paient. Ce que décide
              chaque métier se règle dans{' '}
              <a href="/strategie/das" className="font-medium text-(--accent-text) underline">
                Stratégie du DAS
              </a>.
            </InfoHint>
          </h1>
        </header>

        <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
          {isOn(modules, 'strategie.corporate_strategy') ? (
          <fieldset disabled={locked}>
            <GroupLegend title="Votre logique de portefeuille">
              <Definitions items={labelled(CORPORATE)} />
            </GroupLegend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CORPORATE.map(([value]) => (
                <ChoiceCard
                  key={value}
                  selected={corporate.corporateStrategy === value}
                  title={strategyLabel(value)}
                  onSelect={() => pushCorporate({ ...corporate, corporateStrategy: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {isOn(modules, 'strategie.structure_type') ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title="Structure organisationnelle">
              <span className="block">Elle doit suivre votre portefeuille, pas l’inverse.</span>
              <span className="mt-2 block"><Definitions items={labelled(STRUCTURES)} /></span>
            </GroupLegend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRUCTURES.map(([value]) => (
                <ChoiceCard
                  key={value}
                  selected={corporate.structureType === value}
                  title={strategyLabel(value)}
                  onSelect={() => pushCorporate({ ...corporate, structureType: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, CENTRALISATION_KEYS) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title="Fonctions pilotées au siège">
              Centraliser mutualise les coûts et ralentit les divisions. Sur des métiers
              étrangers, cela produit surtout de la coordination.
            </GroupLegend>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONS.filter(([, , moduleKey]) => isOn(modules, moduleKey)).map(
                ([key, label]) => (
                  <ChipToggle
                    key={key}
                    label={label}
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
            <GroupLegend title="Mutualisation effective">
              Distincte de la centralisation : on peut centraliser les achats sans que les
              métiers achètent les mêmes choses. Seul le partage réel compte.
            </GroupLegend>
            <div className="flex flex-wrap gap-2">
              {isOn(modules, 'strategie.shared_production') ? (
                <ChipToggle label="Production partagée" on={corporate.sharedProduction}
                  onToggle={() => pushCorporate({ ...corporate, sharedProduction: !corporate.sharedProduction })} />
              ) : null}
              {isOn(modules, 'strategie.shared_rd') ? (
                <ChipToggle label="R&D mutualisée" on={corporate.sharedRd}
                  onToggle={() => pushCorporate({ ...corporate, sharedRd: !corporate.sharedRd })} />
              ) : null}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.value1', 'strategie.value2']) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title="Vos deux valeurs communiquées">
              Elles ne coûtent rien et pèsent sur votre alignement. Annoncer l’excellence en
              jouant le prix bas est une contradiction que le moteur relève.
            </GroupLegend>
            <div className="grid gap-3 sm:grid-cols-2">
              {isOn(modules, 'strategie.value1') ? (
                <ValueSelect
                  label="Première valeur" value={corporate.value1}
                  exclude={corporate.value2}
                  onChange={(v) => pushCorporate({ ...corporate, value1: v })}
                />
              ) : null}
              {isOn(modules, 'strategie.value2') ? (
                <ValueSelect
                  label="Seconde valeur" value={corporate.value2}
                  exclude={corporate.value1}
                  onChange={(v) => pushCorporate({ ...corporate, value2: v })}
                />
              ) : null}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.vision', 'strategie.mission']) ? (
          <fieldset disabled={locked} className="mt-6">
            <GroupLegend title="Vision et mission du Groupe">
              L’entreprise n’en a qu’une, et elle se déclare ici — les domaines ne la
              réécrivent pas, ils la déclinent en axes dans l’écran Organisation. Ces énoncés
              ne sont PAS notés : un score tiré de mots-clés serait arbitraire. C’est la
              déclinaison en axes, elle, qui pèse sur votre alignement.
            </GroupLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              {isOn(modules, 'strategie.vision') ? (
                <label className="block">
                  <span className="text-sm">Vision du Groupe</span>
                  <textarea
                    rows={3} maxLength={600}
                    defaultValue={corporate.vision ?? ''}
                    placeholder="Ce que le Groupe veut devenir d’ici cinq ans."
                    onBlur={(e) => pushCorporate({ ...corporate, vision: e.target.value || null })}
                    className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              {isOn(modules, 'strategie.mission') ? (
                <label className="block">
                  <span className="text-sm">Mission du Groupe</span>
                  <textarea
                    rows={3} maxLength={600}
                    defaultValue={corporate.mission ?? ''}
                    placeholder="Ce qu’il apporte, à qui, et en quoi c’est différent."
                    onBlur={(e) => pushCorporate({ ...corporate, mission: e.target.value || null })}
                    className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
          ) : null}

          <SectionActions
            what="la stratégie du Groupe"
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
                Tour {context.roundNumber} · niveau domaine
              </p>
              <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
                {das ? (
                  <span>
                    Stratégie de{' '}
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
                  'Stratégie du domaine'
                )}
                <InfoHint label="Stratégie du domaine">
                  Ces choix ne concernent que le domaine piloté. Changez de domaine dans la barre
                  du haut pour renseigner les autres. Ce qui vaut pour l’entreprise entière se
                  règle dans{' '}
                  <a href="/strategie" className="font-medium text-(--accent-text) underline">
                    Stratégie du Groupe
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
                label="Stratégie générique"
                value={strategyLabel(d.genericStrategy)}
                delta={context.roundNumber > 0 && d.genericStrategy === b.genericStrategy ? { value: 0, label: '=', direction: 'flat' } : null}
                note={context.roundNumber > 0 ? `Changée — était : ${strategyLabel(b.genericStrategy)}` : undefined}
                polarity="neutral"
              />
              <StatCard
                label="Prix vs marché"
                value={priceMultiplier(d.pricePosition)}
                delta={context.roundNumber > 0 ? delta(pricePct(d.pricePosition), pricePct(b.pricePosition), (v) => `${formatScore(v, 0)} pts`) : null}
                polarity="neutral"
                hint={`Position ${d.pricePosition} sur 100. 0 = agressif (60 % du prix marché), 50 = prix marché, 100 = premium (140 %).`}
              />
              <StatCard
                label="Segments servis"
                value={`${d.servedSegments.length} / ${das.segments.length}`}
                delta={context.roundNumber > 0 ? delta(d.servedSegments.length, b.servedSegments.length, (v) => formatScore(v, 0)) : null}
                polarity="neutral"
              />
              {showInvestments ? (
                <StatCard
                  label="Engagé sur ce domaine"
                  value={formatMadCompact(engagedOn(d))}
                  delta={context.roundNumber > 0 ? delta(engagedOn(d), engagedOn(b), (v) => formatMadCompact(v)) : null}
                  polarity="neutral"
                  hint={
                    context.treasuryMad > 0
                      ? `${formatScore((engagedOn(d) / context.treasuryMad) * 100, 1)} % de la trésorerie du Groupe. Investissements, R&D et marketing de ce domaine.`
                      : 'Investissements, R&D et marketing de ce domaine.'
                  }
                />
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <BudgetGauge
                  label="Engagé sur l’ensemble de vos domaines ce tour"
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
              title="Stratégie générique"
              indicators={{ topic: 'das-strategie', dasId: das.dasId }}
              summary={strategyLabel(d.genericStrategy)}
              hint={<Definitions items={labelled(GENERIC)} />}
              defaultOpen
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Stratégie générique</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GENERIC.map(([value]) => (
                    <ChoiceCard
                      key={value}
                      selected={d.genericStrategy === value}
                      title={strategyLabel(value)}
                      onSelect={() => pushDas(das.dasId, { ...d, genericStrategy: value })}
                    />
                  ))}
                </div>
              </fieldset>
            </Accordion>

            <Accordion
              title="Positionnement prix"
              indicators={{ topic: 'das-prix', dasId: das.dasId }}
              summary={`${d.pricePosition} · ${priceMultiplier(d.pricePosition)} du marché`}
              hint="La position seule ne dit rien : « 72 » n’est un choix que si l’on voit qu’on vend 18 % au-dessus du marché. Le moteur traduit 0 en 60 % du prix marché, 50 en prix marché, 100 en 140 %."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Positionnement prix</legend>
                <p className="tabular flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-2xl font-medium">{d.pricePosition}</span>
                  <span className="text-(--foreground-muted)">
                    = {priceMultiplier(d.pricePosition)} du prix marché
                  </span>
                </p>
                <input
                  type="range" min={0} max={100} step={1} value={d.pricePosition}
                  aria-label="Positionnement prix, de 0 (agressif) à 100 (premium)"
                  onChange={(e) => pushDas(das.dasId, { ...d, pricePosition: Number(e.target.value) })}
                  className="mt-3 w-full accent-(--accent)"
                />
                <div className="mt-1 flex justify-between text-sm text-(--foreground-muted)">
                  <span>0 — agressif</span>
                  <span>50 — prix marché</span>
                  <span>100 — premium</span>
                </div>
                <p className="tabular mt-3 text-sm text-(--foreground-muted)">
                  Tour précédent : {b.pricePosition} ({priceMultiplier(b.pricePosition)})
                  {d.pricePosition !== b.pricePosition ? (
                    <> · {d.pricePosition > b.pricePosition ? '↑ +' : '↓ −'}
                      {Math.abs(d.pricePosition - b.pricePosition)} points</>
                  ) : ' · inchangé'}
                </p>
              </fieldset>
            </Accordion>

            <Accordion
              title="Segments servis"
              indicators={{ topic: 'das-segments', dasId: das.dasId }}
              summary={`${d.servedSegments.length} sur ${das.segments.length}`}
              hint="Un segment de plus élargit le marché adressable et dilue une stratégie de concentration. Chaque segment a sa propre exigence de qualité. Au moins un segment doit rester servi."
            >
              <fieldset disabled={locked}>
                <legend className="sr-only">Segments servis</legend>
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
                title="Investissements du tour"
                indicators={{ topic: 'das-investissements', dasId: das.dasId }}
                summary={formatMadCompact(engagedOn(d))}
                hint="Chaque curseur part de ce que vous avez engagé au tour précédent. Le montant se saisit aussi en dirhams. Le « + » de chaque poste dit ce qu’il produit, et quand."
              >
                <fieldset disabled={locked}>
                  <legend className="sr-only">Investissements du tour</legend>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {INVESTMENTS.filter(([key]) => isOn(modules, key)).map(
                      ([key, field, label, hint]) => (
                        <VariationField
                          key={key}
                          label={label}
                          hint={hint}
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
                    Total engagé sur ce domaine :{' '}
                    <strong className="font-mono text-(--foreground)">{formatMadCompact(engagedOn(d))}</strong>
                    {' · '}tour précédent {formatMadCompact(engagedOn(b))}
                    {context.treasuryMad > 0 ? (
                      <>
                        {' · '}
                        {formatScore((engagedOn(d) / context.treasuryMad) * 100, 1)} % de la trésorerie
                      </>
                    ) : null}
                  </p>
                </fieldset>
              </Accordion>
            ) : null}

            {isOn(modules, 'das.declare_blue_ocean') ? (
              <Accordion
                title="Océan bleu"
                indicators={{ topic: 'das-ocean-bleu', dasId: das.dasId }}
                summary={d.declareBlueOcean ? 'déclaré' : 'non déclaré'}
                hint="Vous sortez du calcul à somme nulle pendant deux tours et votre marge est multipliée par 2,5 — en cas de succès. L’entrée coûte cher et peut échouer."
              >
                <fieldset disabled={locked}>
                  <legend className="sr-only">Océan bleu</legend>
                  <ChipToggle
                    label="Déclarer un océan bleu sur ce domaine"
                    on={d.declareBlueOcean}
                    onToggle={() => pushDas(das.dasId, { ...d, declareBlueOcean: !d.declareBlueOcean })}
                  />
                </fieldset>
              </Accordion>
            ) : null}

            <div className="rounded-xl border border-(--border) bg-(--surface) px-5 pb-5">
              <SectionActions
                what={`la stratégie de ${das.name}`}
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
              label="Engagé sur l’ensemble de vos domaines ce tour"
              allocated={engaged}
              available={context.treasuryMad}
            />
            <p className="mt-6 rounded-xl border border-(--border) bg-(--surface) px-6 py-5 text-(--foreground-muted)">
              Vous n’exploitez aucun domaine d’activité pour l’instant. Un rachat sur le{' '}
              <a href="/cession" className="underline">marché des acquisitions</a> en ajoutera un.
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
    { label: 'Stratégie', href: '/strategie/das', done: das.progress.strategy },
    { label: 'Organisation', href: '/organisation', done: das.progress.organisation },
    { label: 'Ressources humaines', href: '/organisation', done: das.progress.hr },
    { label: 'Achats', href: '/marches', done: das.progress.procurement },
    { label: 'Distribution', href: '/marches', done: das.progress.distribution },
  ];
}

function ValueSelect({
  label, value, exclude, onChange,
}: { label: string; value: string; exclude: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
      >
        {VALUES.filter((v) => v !== exclude).map((v) => (
          <option key={v} value={v}>{VALUE_LABELS[v]}</option>
        ))}
      </select>
    </label>
  );
}

/** Des options du moteur, avec leur libellé lisible, pour la bulle d'aide. */
function labelled(items: readonly (readonly [string, string])[]) {
  return items.map(([value, description]) => [strategyLabel(value), description] as const);
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
