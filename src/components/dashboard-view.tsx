'use client';

/**
 * ATLAS — le tableau de bord.
 *
 * Il montrait six nombres et comparait deux tours. Savoir que sa marge vaut
 * 12 % ne dit pas si l'on vient de la doubler ou de la diviser par deux, et
 * c'est pourtant la seule question qui change une décision. Tout y est donc en
 * TRAJECTOIRE, sur tous les tours résolus.
 *
 * ── CE QUI EST OUVERT, ET POURQUOI ─────────────────────────────────────────
 * L'écran se consulte pendant un tour chronométré, debout, entre deux
 * arbitrages. Les sections qui répondent aux questions les plus fréquentes —
 * « est-ce qu'on tient ? », « quel métier nous porte ? », « sommes-nous
 * cohérents ? » — sont ouvertes. Les matrices et la concurrence se déplient
 * quand on a le temps de creuser.
 *
 * ── LA FRONTIÈRE ENTRE CE QU'ON SAIT ET CE QU'ON ESTIME ────────────────────
 * Les courbes de l'équipe sont pleines, celles venues du cabinet en
 * POINTILLÉS, avec la marge du palier payé affichée. Une estimation qui ne dit
 * pas qu'elle en est une devient une vérité, et c'est exactement l'erreur que
 * la simulation veut faire commettre puis débriefer — en connaissance de cause.
 */

import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useState } from 'react';

import type { FieldDisclosure } from '@/lib/consulting-types';
import type {
  CabinetOverlay, DasSeries, DashboardContext, GroupPoint,
} from '@/lib/dashboard-types';
import { formatMadCompact, formatScore, formatUnits } from '@/lib/format';

const SERIES_COLOURS = [
  'var(--accent)', '#c2410c', '#0f766e', '#7c3aed', '#a16207', '#be123c', '#1d4ed8',
];

const AXIS = { stroke: 'var(--foreground-muted)', tick: { fontSize: 12 } } as const;

const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
} as const;

export function DashboardView({
  context,
  activeDasId,
}: {
  context: DashboardContext;
  /** Le domaine choisi dans la barre du haut : l'écran le suit, comme les saisies. */
  activeDasId: string | null;
}) {
  const das = context.das.find((d) => d.dasId === activeDasId) ?? context.das[0] ?? null;

  if (!context.hasResults) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
        <h2 className="text-xl font-medium">Aucun tour résolu pour l’instant</h2>
        <p className="mt-3 max-w-2xl text-(--foreground-muted)">
          Vos indicateurs apparaîtront ici après la résolution du premier tour. D’ici là,
          saisissez vos décisions et commandez vos premières études auprès du cabinet — sans
          elles, vous jouerez à l’aveugle.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Santé du Groupe" hint="Ce que vous gagnez, ce qu’il vous reste." open>
        <GroupHealth group={context.group} />
      </Section>

      <Section
        title="Portefeuille"
        hint="Quel métier fait vivre l’entreprise, et lequel la fait vivre bien. Le poids en chiffre d’affaires et la marge brute ne disent pas toujours la même chose."
        open
      >
        <Portfolio das={context.das} />
      </Section>

      <Section
        title="Cohérence stratégique"
        hint="Une entreprise cohérente exécute mieux : la prime joue sur la marge."
        open
      >
        <Alignment context={context} />
      </Section>

      {das ? (
        <Section title={`Domaine : ${das.name}`} hint="Tout ce qui se décide sur ce métier." open>
          <DasTrajectory das={das} cabinet={context.cabinet} />
        </Section>
      ) : null}

      {das ? (
        <Section
          title="Matrices stratégiques"
          hint="Les grilles classiques, calculées sur vos chiffres — pas sur un exemple de manuel."
        >
          <Matrices
            das={das}
            group={context.group}
            allDas={context.das}
            cabinet={context.cabinet}
          />
        </Section>
      ) : null}

      <Section
        title="La concurrence"
        hint="Ce que vous savez des autres, et ce que vous ignorez."
      >
        <Competition cabinet={context.cabinet} das={das} />
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Coque de section
   ══════════════════════════════════════════════════════════════════════════ */

function Section({
  title, hint, children, open = false,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded-xl border border-(--border) bg-(--surface) [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="cursor-pointer list-none px-6 py-4">
        <span className="text-lg font-medium">{title}</span>
        <span className="mt-1 block max-w-3xl text-sm text-(--foreground-muted)">{hint}</span>
      </summary>
      <div className="border-t border-(--border) px-6 py-5">{children}</div>
    </details>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Santé du Groupe
   ══════════════════════════════════════════════════════════════════════════ */

const GROUP_METRICS = [
  { key: 'treasuryMad', label: 'Trésorerie', unit: 'DH' },
  { key: 'revenueMad', label: 'Chiffre d’affaires', unit: 'DH' },
  { key: 'netIncomeMad', label: 'Résultat net', unit: 'DH' },
  { key: 'grossMarginMad', label: 'Marge brute', unit: 'DH' },
  { key: 'marginPct', label: 'Taux de marge', unit: '%' },
  { key: 'iaScore', label: 'Indice d’alignement', unit: 'score' },
  { key: 'climatSocial', label: 'Climat social', unit: 'score' },
] as const;

function GroupHealth({ group }: { group: GroupPoint[] }) {
  const [metric, setMetric] = useState<string>('treasuryMad');
  const spec = GROUP_METRICS.find((m) => m.key === metric) ?? GROUP_METRICS[0];
  const last = group[group.length - 1];
  const previous = group[group.length - 2];

  return (
    <div>
      <dl className="tabular mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {GROUP_METRICS.map((m) => {
          const value = last[m.key] as number;
          const before = previous ? (previous[m.key] as number) : null;
          return (
            <div key={m.key}>
              <dt className="text-xs text-(--foreground-muted)">{m.label}</dt>
              <dd className="text-lg font-semibold">{show(value, m.unit)}</dd>
              {before !== null ? <Trend value={value} before={before} unit={m.unit} /> : null}
            </div>
          );
        })}
      </dl>

      <Picker
        options={GROUP_METRICS.map((m) => ({ key: m.key, label: m.label }))}
        value={metric}
        onChange={setMetric}
      />
      <Trajectory
        data={group.map((p) => ({ round: roundLabel(p.roundNumber), valeur: p[spec.key] as number }))}
        unit={spec.unit}
        series={[{ dataKey: 'valeur', name: spec.label, colour: SERIES_COLOURS[0] }]}
      />
    </div>
  );
}

function Trend({ value, before, unit }: { value: number; before: number; unit: string }) {
  const delta = value - before;
  if (Math.abs(delta) < 1e-9) {
    return <dd className="text-xs text-(--foreground-muted)">= inchangé</dd>;
  }
  return (
    <dd
      className="text-xs"
      style={{ color: delta > 0 ? 'var(--positive)' : 'var(--negative)' }}
    >
      {delta > 0 ? '↑ +' : '↓ −'}{show(Math.abs(delta), unit)} vs tour précédent
    </dd>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Portefeuille
   ══════════════════════════════════════════════════════════════════════════ */

function Portfolio({ das }: { das: DasSeries[] }) {
  const data = das.map((d) => ({
    name: d.name,
    'Part du chiffre d’affaires': d.revenueShareOfGroup * 100,
    'Marge brute': d.grossMarginMad,
  }));

  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis
              yAxisId="part" {...AXIS} width={56}
              tickFormatter={(v: number) => `${Math.round(v)} %`}
            />
            <YAxis
              yAxisId="marge" orientation="right" {...AXIS} width={72}
              tickFormatter={(v: number) => formatMadCompact(v)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [
                String(name) === 'Marge brute'
                  ? formatMadCompact(Number(v))
                  : `${formatScore(Number(v), 1)} %`,
                String(name),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="part" dataKey="Part du chiffre d’affaires" fill="var(--accent)" />
            <Bar yAxisId="marge" dataKey="Marge brute" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-(--foreground-muted)">
        L’écart entre les deux barres est souvent la révélation : un domaine peut faire le
        volume sans faire la marge.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Alignement
   ══════════════════════════════════════════════════════════════════════════ */

function Alignment({ context }: { context: DashboardContext }) {
  const { alignment, group } = context;
  // L'audit est le seul livrable SANS bruit : le cabinet analyse les données
  // que l'équipe lui a elle-même transmises. Son verdict complète donc la
  // phrase du moteur au lieu de la concurrencer.
  const audit = studyFor(context.cabinet, 'audit_alignement', null);

  return (
    <div>
      <p
        className="mb-4 rounded-lg border px-4 py-3"
        style={{
          borderColor:
            alignment.stuckInTheMiddle || alignment.drift ? 'var(--warning)' : 'var(--border)',
        }}
      >
        {alignment.sentence}
      </p>

      <Trajectory
        data={group.map((p) => ({ round: roundLabel(p.roundNumber), valeur: p.iaScore }))}
        unit="score"
        series={[{ dataKey: 'valeur', name: 'Indice d’alignement', colour: SERIES_COLOURS[0] }]}
      />

      {audit ? (
        <div className="mt-4 rounded-lg border border-(--accent) p-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
            Audit d’alignement · tour {audit.roundNumber} · sans marge d’erreur
          </p>
          <dl className="tabular grid gap-4 sm:grid-cols-3">
            <CabinetFact
              label="Alignement business"
              field={disclosed(audit, 'sab_global')}
              errorMargin={0}
            />
            <CabinetFact
              label="Alignement corporate"
              field={disclosed(audit, 'sac_score')}
              errorMargin={0}
            />
            <CabinetFact
              label="Indice d’alignement"
              field={disclosed(audit, 'ia_final')}
              errorMargin={0}
            />
          </dl>
        </div>
      ) : null}

      {alignment.worstAxes.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
            Ce qui vous coûte le plus
          </p>
          <ul className="tabular space-y-1 text-sm">
            {alignment.worstAxes.map((axis) => (
              <li key={axis.axisKey} className="flex flex-wrap items-baseline gap-2">
                <span>{axis.axisKey.replace(/_/g, ' ')}</span>
                <span className="text-(--foreground-muted)">
                  écart {formatScore(axis.gap, 1)} · −{formatScore(axis.penalty, 1)} points
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Le domaine piloté
   ══════════════════════════════════════════════════════════════════════════ */

const DAS_METRICS = [
  { key: 'marketSharePct', label: 'Part de marché', unit: '%' },
  { key: 'revenueMad', label: 'Chiffre d’affaires', unit: 'DH' },
  { key: 'grossMarginMad', label: 'Marge brute', unit: 'DH' },
  { key: 'volumeSold', label: 'Volume vendu', unit: 'unites' },
  { key: 'productionUnits', label: 'Production', unit: 'unites' },
  { key: 'volumeLost', label: 'Demande non servie', unit: 'unites' },
  { key: 'inputStockUnits', label: 'Matière en magasin', unit: 'unites' },
  { key: 'finishedStockUnits', label: 'Produits finis en stock', unit: 'unites' },
  { key: 'competitivenessScore', label: 'Compétitivité', unit: 'score' },
  { key: 'perceivedQuality', label: 'Qualité perçue', unit: 'score' },
  { key: 'notoriety', label: 'Notoriété', unit: 'score' },
  { key: 'pricePosition', label: 'Positionnement prix', unit: 'score' },
  { key: 'distributionCoverage', label: 'Couverture de distribution', unit: '%' },
  { key: 'utilisationRate', label: 'Taux d’utilisation', unit: '%' },
] as const;

function DasTrajectory({
  das, cabinet,
}: {
  das: DasSeries;
  cabinet: CabinetOverlay[];
}) {
  const [metric, setMetric] = useState<string>('marketSharePct');
  const spec = DAS_METRICS.find((m) => m.key === metric) ?? DAS_METRICS[0];

  // Le marché et la demande ne se déduisent pas de vos chiffres : ils
  // s'achètent. Quand ils l'ont été, ils s'affichent ici — là où l'on décide
  // d'un prix et d'un volume — plutôt que dans un rapport qu'il faut aller
  // rouvrir.
  const pestel = studyFor(cabinet, 'pestel_sectoriel', das.dasId);
  const panel = studyFor(cabinet, 'panel_conso', das.dasId);

  return (
    <div>
      {pestel || panel ? (
        <dl className="tabular mb-5 grid gap-4 rounded-lg border border-(--border) bg-(--surface-muted) p-4 sm:grid-cols-3">
          {pestel ? (
            <>
              <CabinetFact
                label="Taille du marché"
                field={disclosed(pestel, 'market_size_mad')}
                errorMargin={pestel.errorMargin}
              />
              <CabinetFact
                label="Croissance"
                field={disclosed(pestel, 'growth_rate')}
                errorMargin={pestel.errorMargin}
                hint="L’ordonnée de la BCG"
              />
              <CabinetFact
                label="Prix moyen du marché"
                field={disclosed(pestel, 'reference_unit_price_mad')}
                errorMargin={pestel.errorMargin}
              />
            </>
          ) : null}
          {panel ? (
            <>
              <CabinetFact
                label="Exigence de qualité du segment"
                field={disclosed(panel, 'quality_requirement')}
                errorMargin={panel.errorMargin}
              />
              <CabinetFact
                label="Sensibilité au prix"
                field={disclosed(panel, 'price_sensitivity')}
                errorMargin={panel.errorMargin}
                hint="Plus elle est haute, moins le premium passe"
              />
            </>
          ) : null}
        </dl>
      ) : null}
      <Picker
        options={DAS_METRICS.map((m) => ({ key: m.key, label: m.label }))}
        value={metric}
        onChange={setMetric}
      />
      <Trajectory
        data={das.history.map((p) => ({
          round: roundLabel(p.roundNumber),
          valeur: p[spec.key] as number,
        }))}
        unit={spec.unit}
        series={[{ dataKey: 'valeur', name: spec.label, colour: SERIES_COLOURS[0] }]}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Matrices
   ══════════════════════════════════════════════════════════════════════════ */

function Matrices({
  das, group, allDas, cabinet,
}: {
  das: DasSeries;
  group: GroupPoint[];
  allDas: DasSeries[];
  cabinet: CabinetOverlay[];
}) {
  const last = group[group.length - 1];
  const lastDas = das.history[das.history.length - 1];
  // La rivalité et la force compétitive sortent d'une résolution : avant le
  // premier tour résolu, les tracer donnerait un radar plat à zéro qu'une
  // équipe lirait comme un diagnostic.
  const resolved = Boolean(lastDas && lastDas.competitivenessScore > 0);
  const measured = measuredForces(cabinet, das);

  return (
    <div className="space-y-8">
      <Bcg allDas={allDas} />

      <div>
        <h3 className="mb-1 font-medium">Balanced Scorecard</h3>
        {last?.bsc ? (
          <>
            <p className="mb-3 text-sm text-(--foreground-muted)">
              Les quatre perspectives de Kaplan et Norton, calculées par le moteur sur vos
              résultats. Un profil déséquilibré tient rarement dans la durée.
            </p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={[
                    { axe: 'Financier', valeur: last.bsc.financial },
                    { axe: 'Client', valeur: last.bsc.client },
                    { axe: 'Processus', valeur: last.bsc.process },
                    { axe: 'Apprentissage', valeur: last.bsc.learning },
                  ]}
                >
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axe" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Radar
                    name="Votre profil" dataKey="valeur"
                    stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <Unavailable
            what="La Balanced Scorecard"
            reasons={[
              'Ses quatre perspectives se calculent sur des résultats. Elle apparaîtra après la résolution du premier tour — elle ne s’achète pas.',
            ]}
          />
        )}
      </div>

      <div>
        <h3 className="mb-1 font-medium">Les cinq forces de Porter — {das.name}</h3>
        {resolved ? (
          <>
            <p className="mb-3 text-sm text-(--foreground-muted)">
              Plus une force est haute, moins la filière est profitable de ce côté-là. À
              défaut de benchmark, le pouvoir des fournisseurs et des distributeurs se
              DÉDUIT du nombre d’acteurs indépendants qu’il vous reste ; le benchmark le
              remplace par leur force de négociation réelle.
            </p>
            {measured.note ? (
              <p className="mb-3 text-xs" style={{ color: 'var(--accent)' }}>
                {measured.note}
              </p>
            ) : null}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={[
                    { axe: 'Entrants', valeur: 100 - das.forces.entryBarrier },
                    { axe: 'Substituts', valeur: das.forces.substitution },
                    { axe: 'Fournisseurs', valeur: measured.supplier },
                    { axe: 'Distributeurs', valeur: measured.distributor },
                    { axe: 'Rivalité', valeur: das.forces.rivalry },
                  ]}
                >
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axe" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Radar
                    name="Intensité" dataKey="valeur"
                    stroke="#c2410c" fill="#c2410c" fillOpacity={0.25}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <Unavailable
            what="La grille des cinq forces"
            reasons={[
              <>
                <strong>Intensité de la rivalité</strong> — elle se mesure à la pression que
                vos concurrents exercent réellement sur le marché, donc après une résolution.
              </>,
              'Les quatre autres forces sont déjà connues : barrière à l’entrée, substituts, et le pouvoir de vos fournisseurs et distributeurs.',
            ]}
          />
        )}
      </div>

      {resolved ? (
        <McKinsey allDas={allDas} />
      ) : (
        <div>
          <h3 className="mb-1 font-medium">Matrice McKinsey / GE</h3>
          <Unavailable
            what="La matrice McKinsey / GE"
            reasons={[
              <>
                <strong>Force compétitive</strong> — c’est le score que le moteur vous
                attribue face au marché. Il n’existe qu’après une résolution.
              </>,
              'Contrairement à la BCG, elle ne demande rien au cabinet : elle se calcule sur vos propres chiffres.',
            ]}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Le pouvoir de l'amont et de l'aval, mesuré plutôt que déduit.
 *
 * Sans benchmark, ces deux forces s'estiment au nombre d'acteurs indépendants
 * restants — une approximation honnête mais grossière : cinq fournisseurs dont
 * un seul est fiable ne valent pas cinq fournisseurs solides.
 *
 * Le benchmark donne leur force de négociation réelle. On prend la PLUS FORTE
 * du panel, pas la moyenne : c'est celui qui peut vous tordre le bras qui fixe
 * votre rapport de force, pas la moyenne de ceux qui ne le peuvent pas.
 */
export function measuredForces(
  cabinet: CabinetOverlay[],
  das: DasSeries,
): { supplier: number; distributor: number; note: string | null } {
  const amont = studyFor(cabinet, 'benchmark_fourn', das.dasId);
  const aval = studyFor(cabinet, 'benchmark_distri', das.dasId);

  const strongest = (study: CabinetOverlay | undefined, key: string): number | null => {
    if (!study) return null;
    const values = study.subjects
      .map((_, index) => disclosed(study, key, index))
      .filter((f): f is FieldDisclosure => Boolean(f) && f!.mode !== 'withheld')
      .map((f) => (f.mode === 'band' ? (f.lower + f.upper) / 2 : f.mode === 'withheld' ? 0 : f.value));
    return values.length > 0 ? Math.max(...values) : null;
  };

  // Le fournisseur se mesure par son coût de changement : celui dont on ne peut
  // pas sortir tient le rapport de force, quelle que soit son amabilité.
  const supplier = strongest(amont, 'switching_cost');
  const distributor = strongest(aval, 'negotiating_strength');

  const sources: string[] = [];
  if (supplier !== null) sources.push('amont');
  if (distributor !== null) sources.push('aval');

  return {
    supplier: supplier ?? das.forces.supplierPower,
    distributor: distributor ?? das.forces.distributorPower,
    note: sources.length > 0
      ? `Pouvoir ${sources.join(' et ')} mesuré par benchmark, et non déduit du nombre d’acteurs.`
      : null,
  };
}

/**
 * Les études qu'il manque pour placer la BCG, nommées une à une.
 *
 * Dire « il vous manque deux études » à une équipe qui en a déjà payé une la
 * ferait racheter la mauvaise. On ne réclame que ce qui manque vraiment.
 */
function missingBcgStudies(allDas: DasSeries[]): string[] {
  const studies: string[] = [];
  if (allDas.every((d) => d.relativeShare === null)) studies.push('l’étude concurrentielle');
  if (allDas.every((d) => d.marketGrowth === null)) studies.push('le PESTEL sectoriel');
  return studies;
}

/**
 * La matrice BCG — et pourquoi elle peut rester vide.
 *
 * Ses deux axes s'achètent : la part relative au leader vient de l'étude
 * concurrentielle, la croissance du marché de l'étude PESTEL. Le moteur en a
 * fait délibérément la récompense de deux missions. L'emplacement existe donc
 * toujours et dit ce qu'il manque — le manque d'information devient visible,
 * au lieu d'être une absence qu'on ne remarque pas.
 */
function Bcg({ allDas }: { allDas: DasSeries[] }) {
  const placeable = allDas.filter(
    (d) => d.relativeShare !== null && d.marketGrowth !== null,
  );

  return (
    <div>
      <h3 className="mb-1 font-medium">Matrice BCG</h3>
      <p className="mb-3 text-sm text-(--foreground-muted)">
        Part relative au leader en abscisse, croissance du marché en ordonnée. La taille des
        points est le poids du domaine dans votre chiffre d’affaires.
      </p>

      {placeable.length === 0 ? (
        <Unavailable
          what="La matrice BCG"
          studies={missingBcgStudies(allDas)}
          reasons={[
            <>
              <strong>Part relative au leader</strong> — votre part seule ne suffit pas :
              20 % fait un poids mort face à un leader à 60 %, et une vache à lait face à un
              second à 8 %.
            </>,
            <>
              <strong>Croissance du marché</strong> — elle situe le domaine entre une étoile
              et une vache à lait.
            </>,
          ]}
        />
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                type="number" dataKey="x" name="Part relative au leader" {...AXIS}
                domain={[0, 'dataMax']}
                tickFormatter={(v: number) => `${formatScore(v, 1)}×`}
              />
              <YAxis
                type="number" dataKey="y" name="Croissance du marché" {...AXIS} width={64}
                tickFormatter={(v: number) => `${formatScore(v * 100, 0)} %`}
              />
              <ZAxis type="number" dataKey="z" range={[80, 500]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [formatScore(Number(v), 2), String(name)]}
              />
              <Scatter
                data={placeable.map((d) => ({
                  x: d.relativeShare ?? 0,
                  y: d.marketGrowth ?? 0,
                  z: Math.max(d.revenueShareOfGroup * 100, 5),
                  name: d.name,
                }))}
              >
                {placeable.map((d, i) => (
                  <Cell key={d.dasId} fill={SERIES_COLOURS[i % SERIES_COLOURS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/**
 * McKinsey / GE : attractivité du marché contre force compétitive.
 *
 * Les deux axes se calculent sur vos propres chiffres — la compétitivité que le
 * moteur vous attribue, et l'attractivité déduite des forces de la filière.
 * Contrairement à la BCG, elle ne demande donc rien au cabinet.
 */
function McKinsey({ allDas }: { allDas: DasSeries[] }) {
  const points = allDas.map((d, i) => {
    const last = d.history[d.history.length - 1];
    // Un marché est d'autant plus attractif qu'il est difficile d'y entrer et
    // peu menacé par les substituts.
    const attractivite = Math.max(
      0,
      Math.min(100, (d.forces.entryBarrier + (100 - d.forces.substitution)) / 2),
    );
    return {
      x: last?.competitivenessScore ?? 0,
      y: attractivite,
      z: Math.max(d.revenueShareOfGroup * 100, 5),
      name: d.name,
      colour: SERIES_COLOURS[i % SERIES_COLOURS.length],
    };
  });

  return (
    <div>
      <h3 className="mb-1 font-medium">Matrice McKinsey / GE</h3>
      <p className="mb-3 text-sm text-(--foreground-muted)">
        Force compétitive en abscisse, attractivité du marché en ordonnée. Elle se calcule
        sur vos chiffres : contrairement à la BCG, elle ne demande rien au cabinet.
      </p>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 24, bottom: 12, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="Force compétitive" domain={[0, 100]} {...AXIS} />
            <YAxis
              type="number" dataKey="y" name="Attractivité" domain={[0, 100]} width={56} {...AXIS}
            />
            <ZAxis type="number" dataKey="z" range={[80, 500]} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [formatScore(Number(v), 1), String(name)]}
            />
            <Scatter data={points}>
              {points.map((p) => (
                <Cell key={p.name} fill={p.colour} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Concurrence
   ══════════════════════════════════════════════════════════════════════════ */

function Competition({
  cabinet, das,
}: {
  cabinet: CabinetOverlay[];
  das: DasSeries | null;
}) {
  const study = cabinet.find(
    (o) => o.studyKey === 'concurrentielle' && (!das || o.dasId === das.dasId),
  );

  if (!study) {
    return (
      <Unavailable
        what="La comparaison au marché"
        studies={['l’étude concurrentielle']}
        reasons={[
          'Vous ne voyez que vos propres chiffres. Une part de marché de 18 % ne vous dit pas si elle fait de vous le premier ou le dernier.',
          <>
            L’étude couvre <strong>toutes les équipes de votre ligue</strong>, sur tous les
            tours joués : parts, volumes, chiffre d’affaires, marge et fournisseurs.
          </>,
        ]}
      />
    );
  }

  const rounds = [
    ...new Set(study.subjects.flatMap((s) => (s.history ?? []).map((h) => h.roundNumber))),
  ].sort((a, b) => a - b);

  const data = rounds.map((round) => {
    const row: Record<string, number | string | null> = { round: roundLabel(round) };
    for (const subject of study.subjects) {
      const point = (subject.history ?? []).find((h) => h.roundNumber === round);
      row[subject.subjectName] = point?.values.competitor_market_share ?? null;
    }
    return row;
  });

  return (
    <div>
      <p className="mb-3 text-sm text-(--foreground-muted)">
        Parts de marché, votre équipe en trait plein et les concurrents en pointillés.
        <span
          className="ml-2 rounded px-1.5 py-0.5 text-xs"
          style={{ background: 'var(--surface-muted)' }}
        >
          cabinet ±{Math.round(study.errorMargin * 100)} %
        </span>
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="round" {...AXIS} />
            <YAxis {...AXIS} width={56} tickFormatter={(v: number) => `${Math.round(v)} %`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [`${formatScore(Number(v), 1)} %`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {study.subjects.map((subject, index) => (
              <Line
                key={subject.subjectId}
                type="monotone"
                dataKey={subject.subjectName}
                stroke={SERIES_COLOURS[index % SERIES_COLOURS.length]}
                strokeWidth={subject.isSelf ? 3 : 1.75}
                // Le pointillé porte la frontière entre ce qu'on sait et ce
                // qu'on estime. Le trait plein n'appartient qu'à vos chiffres.
                strokeDasharray={subject.isSelf ? undefined : '5 4'}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


/**
 * Ce qu'on ne peut pas montrer, et comment l'obtenir.
 *
 * Un graphique absent est indistinguable d'un graphique vide : dans les deux
 * cas l'équipe voit du blanc et n'apprend rien. Le Balanced Scorecard
 * disparaissait ainsi purement et simplement tant qu'aucun tour n'était résolu.
 *
 * On masque donc le graphe et on le remplace par ce qui le débloquerait — en
 * distinguant les deux causes, qui n'appellent pas la même action : une étude
 * qui n'a pas été payée se commande, un tour qui n'a pas été résolu s'attend.
 */
function Unavailable({
  what,
  reasons,
  studies,
}: {
  what: string;
  reasons: React.ReactNode[];
  /** Études à commander. Vide quand il s'agit seulement d'attendre un tour. */
  studies?: string[];
}) {
  return (
    <div className="rounded-lg border border-dashed border-(--border) p-6">
      <p className="text-sm font-medium">{what} ne peut pas être affichée.</p>
      <ul className="mt-2 space-y-1 text-sm text-(--foreground-muted)">
        {reasons.map((reason, index) => (
          <li key={index}>— {reason}</li>
        ))}
      </ul>

      {studies && studies.length > 0 ? (
        <>
          <p className="mt-3 text-sm">
            À commander au cabinet : <strong>{studies.join(' et ')}</strong>.
          </p>
          <Link
            href="/cabinet"
            className="mt-3 inline-block rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white"
          >
            Aller au cabinet
          </Link>
        </>
      ) : null}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Ce que le cabinet a vendu, rendu la où la décision se prend
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * L'étude achetée qui couvre ce périmètre.
 *
 * Une étude concurrentielle sur l'agro-industrie ne dit rien du textile : le
 * domaine fait partie de l'identité de la mission, pas seulement de son titre.
 * On prend la plus récente, une équipe pouvant racheter la même étude à un
 * palier supérieur.
 */
function studyFor(
  cabinet: CabinetOverlay[],
  studyKey: string,
  dasId: string | null,
): CabinetOverlay | undefined {
  return cabinet.find(
    (o) => o.studyKey === studyKey && (dasId === null || o.dasId === dasId),
  );
}

/** Un champ divulgué, sur le premier sujet de l'étude. */
function disclosed(
  study: CabinetOverlay | undefined,
  key: string,
  subjectIndex = 0,
): FieldDisclosure | undefined {
  return study?.subjects[subjectIndex]?.fields.find((f) => f.key === key);
}

/**
 * Un indicateur venu du cabinet, affiché comme tel.
 *
 * Le badge n'est pas décoratif : il sépare ce que l'équipe SAIT de ce qu'elle a
 * ACHETÉ, et rappelle avec quelle précision. Sans lui, une estimation à ±10 %
 * se lirait comme une mesure.
 */
function CabinetFact({
  label, field, errorMargin, hint,
}: {
  label: string;
  field: FieldDisclosure | undefined;
  errorMargin: number;
  hint?: string;
}) {
  if (!field || field.mode === 'withheld') return null;

  const value =
    field.mode === 'band'
      ? field.band
      : show(field.value, field.unit === 'DH' ? 'DH' : field.unit === '%' ? '%' : 'score');

  return (
    <div>
      <dt className="text-xs text-(--foreground-muted)">
        {label}
        <span
          className="ml-1.5 rounded px-1 py-0.5 text-[10px]"
          style={{ background: 'var(--surface-muted)' }}
        >
          cabinet {errorMargin > 0 ? `±${Math.round(errorMargin * 100)} %` : 'exact'}
        </span>
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {hint ? <dd className="text-xs text-(--foreground-muted)">{hint}</dd> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Briques communes
   ══════════════════════════════════════════════════════════════════════════ */

function Picker({
  options, value, onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className="rounded-lg border px-2.5 py-1 text-xs"
          style={{
            borderColor: value === option.key ? 'var(--accent)' : 'var(--border)',
            background: value === option.key ? 'var(--surface-muted)' : undefined,
            fontWeight: value === option.key ? 600 : 400,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Trajectory({
  data, unit, series,
}: {
  data: Record<string, number | string>[];
  unit: string;
  series: { dataKey: string; name: string; colour: string }[];
}) {
  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-(--border) p-6 text-sm text-(--foreground-muted)">
        Aucun tour résolu : il n’y a pas encore de trajectoire à tracer.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="round" {...AXIS} />
          <YAxis {...AXIS} width={76} tickFormatter={(v: number) => show(v, unit)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [show(Number(v), unit), String(name)]}
          />
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.colour}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function show(value: number, unit: string): string {
  if (unit === 'DH') return formatMadCompact(value);
  if (unit === '%') return `${formatScore(value, 1)} %`;
  if (unit === 'unites') return formatUnits(Math.round(value));
  return formatScore(value, 1);
}

/**
 * Le provisionnement écrit une ligne AVANT le premier tour : c'est la dotation,
 * identique pour toutes les équipes. L'afficher « T-1 » laissait croire à un
 * tour joué que personne ne se rappelait.
 */
function roundLabel(round: number): string {
  return round < 0 ? 'Départ' : `T${round}`;
}
