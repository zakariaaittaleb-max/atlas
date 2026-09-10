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
 */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { useDasScope } from '@/components/das-scope';
import {
  BudgetGauge, DasChecklist, DecisionBar, MoneyField as Money, SectionActions,
  type MissingDecision,
} from '@/components/decision-shell';
import { GlossaryButton } from '@/components/glossary-modal';
import { formatMadCompact, formatScore, strategyLabel } from '@/lib/format';
import {
  dasDecisionDefaults,
  type CorporateValues, type DasDecisionValues, type DasEntry, type DecisionContext,
} from '@/lib/decision-types';
import { deepEqual } from '@/lib/deep-equal';
import { anyOn, isOn, type EnabledModules } from '@/lib/modules-state';
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

/** Les cinq postes d'engagement du domaine, réunis dans un même bloc. */
const INVESTMENT_KEYS = [
  'das.capex_capacity',
  'das.capex_automation',
  'das.capex_own_network',
  'das.rd_budget',
  'das.marketing_budget',
];

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
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber} · niveau Groupe
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Stratégie du Groupe</h1>
          <p className="mt-3 max-w-3xl text-(--foreground-muted)">
            Ces choix valent pour l’entreprise entière. Chaque domaine devra ensuite s’y
            situer — en les suivant ou en s’en écartant, les deux se paient. Ce que décide
            chaque métier se règle dans{' '}
            <a href="/strategie/das" className="underline">Stratégie du DAS</a>.
          </p>
        </header>

        <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
          {isOn(modules, 'strategie.corporate_strategy') ? (
          <fieldset disabled={locked}>
            <legend className="mb-2 text-sm font-medium">Votre logique de portefeuille</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CORPORATE.map(([value, desc]) => (
                <Choice
                  key={value}
                  selected={corporate.corporateStrategy === value}
                  title={strategyLabel(value)}
                  description={desc}
                  onSelect={() => pushCorporate({ ...corporate, corporateStrategy: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {isOn(modules, 'strategie.structure_type') ? (
          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-2 text-sm font-medium">
              Structure organisationnelle
              <span className="ml-2 font-normal text-(--foreground-muted)">
                — elle doit suivre votre portefeuille, pas l’inverse
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRUCTURES.map(([value, desc]) => (
                <Choice
                  key={value}
                  selected={corporate.structureType === value}
                  title={strategyLabel(value)}
                  description={desc}
                  onSelect={() => pushCorporate({ ...corporate, structureType: value })}
                />
              ))}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, CENTRALISATION_KEYS) ? (
          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Fonctions pilotées au siège</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Centraliser mutualise les coûts et ralentit les divisions. Sur des métiers
              étrangers, cela produit surtout de la coordination.
            </p>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONS.filter(([, , moduleKey]) => isOn(modules, moduleKey)).map(
                ([key, label]) => (
                  <Toggle
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
            <legend className="mb-1 text-sm font-medium">Mutualisation effective</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Distincte de la centralisation : on peut centraliser les achats sans que les
              métiers achètent les mêmes choses. Seul le partage réel compte.
            </p>
            <div className="flex flex-wrap gap-2">
              {isOn(modules, 'strategie.shared_production') ? (
                <Toggle label="Production partagée" on={corporate.sharedProduction}
                  onToggle={() => pushCorporate({ ...corporate, sharedProduction: !corporate.sharedProduction })} />
              ) : null}
              {isOn(modules, 'strategie.shared_rd') ? (
                <Toggle label="R&D mutualisée" on={corporate.sharedRd}
                  onToggle={() => pushCorporate({ ...corporate, sharedRd: !corporate.sharedRd })} />
              ) : null}
            </div>
          </fieldset>
          ) : null}

          {anyOn(modules, ['strategie.value1', 'strategie.value2']) ? (
          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Vos deux valeurs communiquées</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Elles ne coûtent rien et pèsent sur votre alignement. Annoncer l’excellence en
              jouant le prix bas est une contradiction que le moteur relève.
            </p>
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
            <legend className="mb-1 text-sm font-medium">Vision et mission du Groupe</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              L’entreprise n’en a qu’une, et elle se déclare ici — les domaines ne la
              réécrivent pas, ils la déclinent en axes dans l’écran Organisation. Ces énoncés
              ne sont PAS notés : un score tiré de mots-clés serait arbitraire. C’est la
              déclinaison en axes, elle, qui pèse sur votre alignement.
            </p>
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
 */
export function StrategieDasView({
  context, missing, modules,
}: {
  context: DecisionContext;
  missing: MissingDecision[];
  modules: EnabledModules;
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
  // L'état d'ouverture du tour — c'est-à-dire ce que l'équipe a décidé à
  // l'exercice précédent, puisque les décisions se reconduisent. Il sert de
  // repère sous chaque champ, et non seulement de cible au bouton de remise à
  // zéro : une saisie sans point de départ n'est pas un arbitrage.
  const b = das?.baseline.decision ?? dasDecisionDefaults(das?.segments ?? []);

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber} · niveau domaine
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {das ? `Stratégie de ${das.name}` : 'Stratégie du domaine'}
          </h1>
          <p className="mt-3 max-w-3xl text-(--foreground-muted)">
            Ces choix ne concernent que le domaine piloté. Changez de domaine dans la barre du
            haut pour renseigner les autres. Ce qui vaut pour l’entreprise entière se règle
            dans <a href="/strategie" className="underline">Stratégie du Groupe</a>.
          </p>
        </header>

        <BudgetGauge
          label="Engagé sur l’ensemble de vos domaines ce tour"
          allocated={engaged}
          available={context.treasuryMad}
        />

        {das && d ? (
          <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
            <fieldset disabled={locked}>
              <legend className="mb-2 text-sm font-medium">Stratégie générique</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {GENERIC.map(([value, desc]) => (
                  <Choice
                    key={value}
                    selected={d.genericStrategy === value}
                    title={strategyLabel(value)}
                    description={desc}
                    onSelect={() => pushDas(das.dasId, { ...d, genericStrategy: value })}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset disabled={locked} className="mt-6">
              <legend className="mb-2 text-sm font-medium">
                Positionnement prix
                <span className="tabular ml-2 font-semibold">{d.pricePosition}</span>
                {/* La position seule ne dit rien : « 72 » n'est un choix que si
                    l'équipe voit qu'elle vend 22 % au-dessus du marché. */}
                <span className="tabular ml-2 font-normal text-(--foreground-muted)">
                  = {priceMultiplier(d.pricePosition)} du prix marché
                </span>
              </legend>
              <input
                type="range" min={0} max={100} step={1} value={d.pricePosition}
                onChange={(e) => pushDas(das.dasId, { ...d, pricePosition: Number(e.target.value) })}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-(--foreground-muted)">
                <span>0 — agressif (60 % du prix marché)</span>
                <span>50 — prix marché</span>
                <span>100 — premium (140 %)</span>
              </div>
              <p className="tabular mt-2 text-xs text-(--foreground-muted)">
                Tour précédent : {b.pricePosition} ({priceMultiplier(b.pricePosition)})
                {d.pricePosition !== b.pricePosition ? (
                  <> · {d.pricePosition > b.pricePosition ? '↑ +' : '↓ −'}
                    {Math.abs(d.pricePosition - b.pricePosition)} points</>
                ) : ' · inchangé'}
              </p>
            </fieldset>

            <fieldset disabled={locked} className="mt-6">
              <legend className="mb-1 text-sm font-medium">Segments servis</legend>
              <p className="mb-3 text-xs text-(--foreground-muted)">
                Un segment de plus élargit le marché adressable et dilue une stratégie de
                concentration. Chaque segment a sa propre exigence de qualité.
              </p>
              <div className="flex flex-wrap gap-2">
                {das.segments.map((seg) => {
                  const on = d.servedSegments.includes(seg.key);
                  return (
                    <Toggle
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

            {anyOn(modules, INVESTMENT_KEYS) ? (
            <fieldset disabled={locked} className="mt-6">
              <legend className="mb-3 text-sm font-medium">Investissements du tour (millions DH)</legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isOn(modules, 'das.capex_capacity') ? (
                  <Money label="Investir dans l’outil de production" value={d.capexCapacityMad}
                    hint="Disponible au tour SUIVANT : il faut anticiper la demande."
                    previous={b.capexCapacityMad}
                    shareOf={context.treasuryMad} shareLabel="de la trésorerie"
                    onChange={(v) => pushDas(das.dasId, { ...d, capexCapacityMad: v })} />
                ) : null}
                {isOn(modules, 'das.capex_automation') ? (
                  <Money label="Investir dans l’automatisation" value={d.capexAutomationMad}
                    hint="Baisse le coût variable, augmente les coûts fixes."
                    previous={b.capexAutomationMad}
                    shareOf={context.treasuryMad} shareLabel="de la trésorerie"
                    onChange={(v) => pushDas(das.dasId, { ...d, capexAutomationMad: v })} />
                ) : null}
                {isOn(modules, 'das.capex_own_network') ? (
                  <Money label="Investir dans votre réseau de vente" value={d.capexOwnNetworkMad}
                    hint="Supprime la marge distributeur. Lent à construire."
                    previous={b.capexOwnNetworkMad}
                    shareOf={context.treasuryMad} shareLabel="de la trésorerie"
                    onChange={(v) => pushDas(das.dasId, { ...d, capexOwnNetworkMad: v })} />
                ) : null}
                {isOn(modules, 'das.rd_budget') ? (
                  <Money label="Recherche & développement" value={d.rdBudgetMad}
                    hint="Effet DIFFÉRÉ d’un tour sur la qualité."
                    previous={b.rdBudgetMad}
                    shareOf={context.treasuryMad} shareLabel="de la trésorerie"
                    onChange={(v) => pushDas(das.dasId, { ...d, rdBudgetMad: v })} />
                ) : null}
                {isOn(modules, 'das.marketing_budget') ? (
                  <Money label="Marketing" value={d.marketingBudgetMad}
                    hint="Effet immédiat sur la notoriété, à rendement décroissant."
                    previous={b.marketingBudgetMad}
                    shareOf={context.treasuryMad} shareLabel="de la trésorerie"
                    onChange={(v) => pushDas(das.dasId, { ...d, marketingBudgetMad: v })} />
                ) : null}
              </div>
              <p className="tabular mt-3 text-sm text-(--foreground-muted)">
                Total engagé sur ce domaine : <strong>{formatMadCompact(engagedOn(d))}</strong>
                {' · '}l’an dernier {formatMadCompact(engagedOn(b))}
                {context.treasuryMad > 0 ? (
                  <>
                    {' · '}
                    {formatScore((engagedOn(d) / context.treasuryMad) * 100, 1)} % de la trésorerie
                  </>
                ) : null}
              </p>
            </fieldset>
            ) : null}

            {isOn(modules, 'das.declare_blue_ocean') ? (
            <fieldset disabled={locked} className="mt-6 border-t border-(--border) pt-5">
              <Toggle
                label="Déclarer un océan bleu sur ce domaine"
                on={d.declareBlueOcean}
                onToggle={() => pushDas(das.dasId, { ...d, declareBlueOcean: !d.declareBlueOcean })}
              />
              <p className="mt-2 max-w-2xl text-xs text-(--foreground-muted)">
                Vous sortez du calcul à somme nulle pendant deux tours et votre marge est
                multipliée par 2,5 — en cas de succès. L’entrée coûte cher et peut échouer.
              </p>
            </fieldset>
            ) : null}

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
          </section>
        ) : (
          <p className="mt-8 rounded-xl border border-(--border) bg-(--surface) px-6 py-5 text-(--foreground-muted)">
            Vous n’exploitez aucun domaine d’activité pour l’instant. Un rachat sur le{' '}
            <a href="/cession" className="underline">marché des acquisitions</a> en ajoutera un.
          </p>
        )}

        {das ? (
          <div className="mt-8">
            <DasChecklist items={checklistOf(das)} />
          </div>
        ) : null}
      </main>

      <DecisionBar
        state={autosave.state}
        pending={autosave.pending}
        lastError={autosave.lastError}
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

function Choice({
  selected, title, description, onSelect,
}: { selected: boolean; title: string; description: string; onSelect: () => void }) {
  return (
    <button
      type="button" onClick={onSelect} aria-pressed={selected}
      className="rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        background: selected ? 'var(--surface-muted)' : undefined,
      }}
    >
      <span className="block text-sm" style={{ fontWeight: selected ? 600 : 500 }}>{title}</span>
      <span className="mt-1 block text-xs text-(--foreground-muted)">{description}</span>
    </button>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={on}
      className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
      style={{
        borderColor: on ? 'var(--accent)' : 'var(--border)',
        background: on ? 'var(--surface-muted)' : undefined,
        fontWeight: on ? 600 : 400,
      }}
    >
      {/* Le « ✓ » double la couleur : l'état ne repose jamais sur la seule teinte. */}
      {on ? '✓ ' : ''}{label}
    </button>
  );
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

/**
 * Traduit la position de prix (0–100) en pourcentage du prix de marché.
 *
 * La grille du moteur : 0 → 60 %, 50 → 100 %, 100 → 140 %. Affichée à côté du
 * curseur, elle transforme un nombre sans unité en une décision commerciale que
 * l'équipe peut défendre au débriefing.
 */
function priceMultiplier(position: number): string {
  const pct = 60 + (position / 100) * 80;
  return `${pct.toFixed(0)} %`;
}
