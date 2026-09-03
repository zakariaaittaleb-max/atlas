'use client';

/**
 * ATLAS — écrans de stratégie : plans 1, 2 et 3 du cahier.
 *
 * Corporate (portefeuille, structure, centralisation, valeurs) puis, pour
 * chaque DAS, la stratégie générique, le prix, les segments et les
 * investissements.
 *
 * Principe d'écriture : chaque champ déclenche une auto-sauvegarde. L'écran ne
 * connaît qu'un seul contrat — `POST /api/decisions` — et la file d'attente
 * locale se charge des coupures réseau.
 *
 * Ce que l'écran NE FAIT PAS, délibérément : il n'annonce aucun résultat. Il
 * dit le coût d'une décision, jamais son effet sur la part de marché. Prédire
 * le résultat rendrait la révélation sans intérêt, et le jeu se transformerait
 * en optimisation par tâtonnement.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { BudgetGauge, DecisionBar, type MissingDecision } from '@/components/decision-shell';
import { formatMadCompact, strategyLabel } from '@/lib/format';
import type { DasEntry, DecisionContext } from '@/lib/decision-types';
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

const FUNCTIONS = [
  ['centralPurchasing', 'Achats'], ['centralIt', 'Système d’information'],
  ['centralRd', 'R&D'], ['centralHr', 'Ressources humaines'], ['centralFinance', 'Finance'],
] as const;

export function StrategieView({
  context, missing,
}: { context: DecisionContext; missing: MissingDecision[] }) {
  const router = useRouter();
  const autosave = useAutosave();
  const locked = !context.decisionsOpen;

  const [corporate, setCorporate] = useState(() => context.corporate ?? {
    corporateStrategy: 'specialisation', structureType: 'fonctionnelle',
    centralPurchasing: false, centralIt: false, centralRd: false,
    centralHr: false, centralFinance: true,
    sharedProduction: false, sharedRd: false,
    value1: 'fiabilite_service', value2: 'efficience_operationnelle',
    vision: null, mission: null,
  });

  const [dasState, setDasState] = useState<Record<string, DasEntry['decision']>>(() =>
    Object.fromEntries(
      context.das.map((d) => [
        d.dasId,
        d.decision ?? {
          genericStrategy: 'domination_couts', pricePosition: 50,
          servedSegments: d.segments.slice(0, 1).map((s) => s.key),
          capexCapacityMad: 0, capexAutomationMad: 0, capexOwnNetworkMad: 0,
          rdBudgetMad: 0, marketingBudgetMad: 0, declareBlueOcean: false,
        },
      ]),
    ),
  );

  const pushCorporate = useCallback(
    (next: typeof corporate) => {
      setCorporate(next);
      autosave.save({ plan: 'corporate', ...next });
    },
    [autosave],
  );

  const pushDas = useCallback(
    (dasId: string, next: NonNullable<DasEntry['decision']>) => {
      setDasState((prev) => ({ ...prev, [dasId]: next }));
      autosave.save({ plan: 'das', dasId, ...next });
    },
    [autosave],
  );

  const engaged = Object.values(dasState).reduce(
    (acc, d) =>
      acc + (d ? d.capexCapacityMad + d.capexAutomationMad + d.capexOwnNetworkMad
                 + d.rdBudgetMad + d.marketingBudgetMad : 0),
    0,
  );

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
        <header className="mb-8">
          <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Tour {context.roundNumber}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Stratégie</h1>
          <p className="mt-3 max-w-3xl text-(--foreground-muted)">
            Ce que vous déclarez ici sera comparé à ce que vous faites. L’indice d’alignement ne
            mesure pas votre performance — il mesure la <strong>cohérence</strong> entre les deux.
          </p>
        </header>

        <BudgetGauge
          label="Engagé sur vos DAS ce tour"
          allocated={engaged}
          available={context.treasuryMad}
        />

        {/* ── Plan 1 : portefeuille corporate ───────────────────────────── */}
        <section className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
          <h2 className="text-xl font-medium">Stratégie d’entreprise</h2>

          <fieldset disabled={locked} className="mt-5">
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

          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Fonctions pilotées au siège</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Centraliser mutualise les coûts et ralentit les divisions. Sur des métiers
              étrangers, cela produit surtout de la coordination.
            </p>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONS.map(([key, label]) => (
                <Toggle
                  key={key}
                  label={label}
                  on={corporate[key] as boolean}
                  onToggle={() => pushCorporate({ ...corporate, [key]: !corporate[key] })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Mutualisation effective</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Distincte de la centralisation : on peut centraliser les achats sans que les
              métiers achètent les mêmes choses. Seul le partage réel compte.
            </p>
            <div className="flex flex-wrap gap-2">
              <Toggle label="Production partagée" on={corporate.sharedProduction}
                onToggle={() => pushCorporate({ ...corporate, sharedProduction: !corporate.sharedProduction })} />
              <Toggle label="R&D mutualisée" on={corporate.sharedRd}
                onToggle={() => pushCorporate({ ...corporate, sharedRd: !corporate.sharedRd })} />
            </div>
          </fieldset>

          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">Vos deux valeurs communiquées</legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Elles ne coûtent rien et pèsent sur votre alignement. Annoncer l’excellence en
              jouant le prix bas est une contradiction que le moteur relève.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ValueSelect
                label="Première valeur" value={corporate.value1}
                exclude={corporate.value2}
                onChange={(v) => pushCorporate({ ...corporate, value1: v })}
              />
              <ValueSelect
                label="Seconde valeur" value={corporate.value2}
                exclude={corporate.value1}
                onChange={(v) => pushCorporate({ ...corporate, value2: v })}
              />
            </div>
          </fieldset>

          <fieldset disabled={locked} className="mt-6">
            <legend className="mb-1 text-sm font-medium">
              Vision et mission du Groupe
            </legend>
            <p className="mb-3 text-xs text-(--foreground-muted)">
              Comme au niveau de chaque DAS, ces énoncés ne sont PAS notés : un score tiré de
              mots-clés serait arbitraire. Ils cadrent votre débriefing, et chaque DAS devra les
              décliner en axes — c’est cette déclinaison-là qui pèse.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </fieldset>
        </section>

        {/* ── Plans 2 & 3 : par domaine d'activité ──────────────────────── */}
        {context.das.map((das) => {
          const d = dasState[das.dasId];
          if (!d) return null;
          return (
            <section key={das.dasId} className="mt-8 rounded-xl border border-(--border) bg-(--surface) p-6">
              <h2 className="text-xl font-medium">{das.name}</h2>

              <fieldset disabled={locked} className="mt-5">
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

              <fieldset disabled={locked} className="mt-6">
                <legend className="mb-3 text-sm font-medium">Investissements du tour</legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Money label="Investir dans l’outil de production" value={d.capexCapacityMad}
                    hint="Disponible au tour SUIVANT : il faut anticiper la demande."
                    onChange={(v) => pushDas(das.dasId, { ...d, capexCapacityMad: v })} />
                  <Money label="Investir dans l’automatisation" value={d.capexAutomationMad}
                    hint="Baisse le coût variable, augmente les coûts fixes."
                    onChange={(v) => pushDas(das.dasId, { ...d, capexAutomationMad: v })} />
                  <Money label="Investir dans votre réseau de vente" value={d.capexOwnNetworkMad}
                    hint="Supprime la marge distributeur. Lent à construire."
                    onChange={(v) => pushDas(das.dasId, { ...d, capexOwnNetworkMad: v })} />
                  <Money label="Recherche & développement" value={d.rdBudgetMad}
                    hint="Effet DIFFÉRÉ d’un tour sur la qualité."
                    onChange={(v) => pushDas(das.dasId, { ...d, rdBudgetMad: v })} />
                  <Money label="Marketing" value={d.marketingBudgetMad}
                    hint="Effet immédiat sur la notoriété, à rendement décroissant."
                    onChange={(v) => pushDas(das.dasId, { ...d, marketingBudgetMad: v })} />
                </div>
                <p className="tabular mt-3 text-sm text-(--foreground-muted)">
                  Total engagé sur ce DAS :{' '}
                  <strong>
                    {formatMadCompact(
                      d.capexCapacityMad + d.capexAutomationMad + d.capexOwnNetworkMad +
                      d.rdBudgetMad + d.marketingBudgetMad,
                    )}
                  </strong>
                </p>
              </fieldset>

              <fieldset disabled={locked} className="mt-6 border-t border-(--border) pt-5">
                <Toggle
                  label="Déclarer un océan bleu sur ce DAS"
                  on={d.declareBlueOcean}
                  onToggle={() => pushDas(das.dasId, { ...d, declareBlueOcean: !d.declareBlueOcean })}
                />
                <p className="mt-2 max-w-2xl text-xs text-(--foreground-muted)">
                  Vous sortez du calcul à somme nulle pendant deux tours et votre marge est
                  multipliée par 2,5 — en cas de succès. L’entrée coûte cher et peut échouer.
                </p>
              </fieldset>
            </section>
          );
        })}
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

function Money({
  label, value, hint, onChange,
}: { label: string; value: number; hint: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number" min={0} step={1_000_000} value={value}
        onChange={(e) => onChange(Math.max(Number(e.target.value) || 0, 0))}
        className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 disabled:opacity-50"
      />
      <span className="mt-1 block text-xs text-(--foreground-muted)">{hint}</span>
    </label>
  );
}
