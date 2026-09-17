'use client';

/**
 * ATLAS — le tableau de bord.
 *
 * Il montrait six nombres et comparait deux tours. Savoir que sa marge vaut
 * 12 % ne dit pas si l'on vient de la doubler ou de la diviser par deux, et
 * c'est pourtant la seule question qui change une décision. Tout y est donc en
 * TRAJECTOIRE, sur tous les tours résolus.
 *
 * ── TROIS NIVEAUX DE LECTURE, LES MÊMES DONNÉES ───────────────────────────
 * L'écran se consulte pendant un tour chronométré, debout, entre deux
 * arbitrages — et parfois au calme, pour creuser. Un seul écran servait les
 * deux, et noyait la première lecture sous la seconde. Il en offre désormais
 * trois, que chaque membre choisit :
 *  • Pilote — quatre indicateurs et ce qui demande attention ;
 *  • Gestionnaire — toutes les analyses, par thème, repliées ;
 *  • Analyste — les données brutes, tour par tour, exportables.
 * Aucun niveau n'invente ni ne retire de donnée : ils rangent différemment.
 * Les thèmes que l'administrateur a masqués disparaissent des trois.
 *
 * ── LA FRONTIÈRE ENTRE CE QU'ON SAIT ET CE QU'ON ESTIME ────────────────────
 * Les courbes de l'équipe sont pleines, celles venues du cabinet en
 * POINTILLÉS, avec la marge du palier payé affichée. Une estimation qui ne dit
 * pas qu'elle en est une devient une vérité, et c'est exactement l'erreur que
 * la simulation veut faire commettre puis débriefer — en connaissance de cause.
 */

import { ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { useId, useRef, useState } from 'react';

import { Accordion } from '@/components/ui/accordion';
import { ChartContainer } from '@/components/ui/chart-container';
import { DataTable, downloadCsv, type DataColumn, type DataRow } from '@/components/ui/data-table';
import { InfoHint } from '@/components/ui/info-hint';
import { MetricToggle } from '@/components/ui/metric-toggle';
import { StatCard } from '@/components/ui/stat-card';
import { formatSignedPct } from '@/lib/das-vitals';
import type { FieldDisclosure } from '@/lib/consulting-types';
import type {
  CabinetOverlay, DasSeries, DashboardContext, GroupPoint,
} from '@/lib/dashboard-types';
import {
  DASHBOARD_SECTIONS,
  PREFERENCE_COOKIE_MAX_AGE,
  VIEW_COOKIE,
  VIEW_LEVELS,
  type DashboardSectionKey,
  type ViewLevel,
} from '@/lib/display-config-types';
import { delta, formatMadCompact, formatScore, formatUnits } from '@/lib/format';

/**
 * L'identité des séries, dans un ordre fixe validé en vision daltonienne.
 * Au-delà de cinq, une série passe en gris pointillé plutôt que de recycler
 * une teinte déjà prise par quelqu'un d'autre.
 */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const seriesColour = (index: number) => SERIES[index] ?? 'var(--meta)';

const AXIS = {
  stroke: 'var(--border)',
  tick: { fontSize: 12, fill: 'var(--foreground-muted)' },
  tickLine: false,
} as const;

const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--foreground)',
} as const;

export function DashboardView({
  context,
  activeDasId,
  sections,
  initialView,
}: {
  context: DashboardContext;
  /** Le domaine choisi dans la barre du haut : l'écran le suit, comme les saisies. */
  activeDasId: string | null;
  sections: Record<DashboardSectionKey, boolean>;
  initialView: ViewLevel;
}) {
  const das = context.das.find((d) => d.dasId === activeDasId) ?? context.das[0] ?? null;
  const [view, setView] = useState<ViewLevel>(initialView);
  const visibleSections = DASHBOARD_SECTIONS.filter((s) => sections[s.key]);
  const [tab, setTab] = useState<DashboardSectionKey | null>(visibleSections[0]?.key ?? null);
  const activeTab = visibleSections.some((s) => s.key === tab) ? tab : visibleSections[0]?.key ?? null;

  function chooseView(next: ViewLevel) {
    setView(next);
    // Retenu par cookie : le serveur rend directement le bon niveau au
    // prochain chargement, sans clignoter depuis la vue par défaut.
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax`;
  }

  if (!context.hasResults) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
        <h2 className="text-2xl font-semibold text-(--heading)">Aucun tour résolu pour l’instant</h2>
        <p className="mt-3 max-w-2xl text-(--foreground-muted)">
          Vos indicateurs apparaîtront ici après la résolution du premier tour. D’ici là,
          saisissez vos décisions et commandez vos premières études auprès du cabinet — sans
          elles, vous jouerez à l’aveugle.
        </p>
      </section>
    );
  }

  if (visibleSections.length === 0 || activeTab === null) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--surface) p-8">
        <h2 className="text-2xl font-semibold text-(--heading)">Dashboard masqué</h2>
        <p className="mt-3 max-w-2xl text-(--foreground-muted)">
          L’animateur a masqué toutes les sections du dashboard pour ce moment de la partie. Vos
          données sont intactes et réapparaîtront dès qu’il les rallumera.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-(--foreground-muted)">Niveau de lecture</span>
          <MetricToggle
            variant="segmented"
            label="Niveau de lecture"
            options={VIEW_LEVELS}
            value={view}
            onChange={chooseView}
          />
          <InfoHint label="Niveaux de lecture">
            {VIEW_LEVELS.map((level) => (
              <span key={level.key} className="mt-2 block first:mt-0">
                <strong className="font-semibold">{level.label}</strong> — {level.description}
              </span>
            ))}
            <span className="mt-2 block text-(--foreground-muted)">
              Les trois niveaux montrent les mêmes données, rangées différemment. Votre choix est
              retenu sur cet appareil.
            </span>
          </InfoHint>
        </div>
      </div>

      {view === 'pilote' ? (
        <PilotView
          context={context}
          das={das}
          sections={sections}
          onDrillDown={(key) => {
            setTab(key);
            chooseView('gestionnaire');
          }}
        />
      ) : (
        <>
          <SectionTabs sections={visibleSections} value={activeTab} onChange={setTab} />
          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="reveal space-y-4" key={`${view}-${activeTab}`}>
            {view === 'gestionnaire' ? (
              <ManagerSection section={activeTab} context={context} das={das} />
            ) : (
              <AnalystSection section={activeTab} context={context} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Onglets
   ══════════════════════════════════════════════════════════════════════════ */

function SectionTabs({
  sections, value, onChange,
}: {
  sections: typeof DASHBOARD_SECTIONS;
  value: DashboardSectionKey;
  onChange: (key: DashboardSectionKey) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  // Flèches gauche/droite entre onglets, comme le veut le motif ARIA « tabs ».
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = sections.findIndex((s) => s.key === value);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = sections[(index + step + sections.length) % sections.length];
    onChange(next.key);
    list.current?.querySelector<HTMLButtonElement>(`#tab-${next.key}`)?.focus();
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Thèmes du dashboard"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-(--border)"
    >
      {sections.map((section) => {
        const on = section.key === value;
        return (
          <button
            key={section.key}
            id={`tab-${section.key}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`panel-${section.key}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(section.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 ${
              on
                ? 'border-(--accent) font-semibold text-(--accent-text)'
                : 'border-transparent font-medium text-(--foreground-muted) hover:border-(--border-strong) hover:text-(--foreground)'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Vue Pilote
   ══════════════════════════════════════════════════════════════════════════ */

function PilotView({
  context, das, sections, onDrillDown,
}: {
  context: DashboardContext;
  das: DasSeries | null;
  sections: Record<DashboardSectionKey, boolean>;
  onDrillDown: (key: DashboardSectionKey) => void;
}) {
  const { group } = context;
  const last = group[group.length - 1];
  const previous = group[group.length - 2];
  const trend = (key: keyof GroupPoint) => group.map((p) => p[key] as number);
  // Se situer dans son pool : une médiane sur au moins deux groupes, sinon rien.
  const revenueBenchmark =
    context.poolRevenueMedianMad && context.poolTeams > 1
      ? `Médiane du pool : ${formatMadCompact(context.poolRevenueMedianMad)} (${formatSignedPct(last.revenueMad / context.poolRevenueMedianMad - 1)})`
      : undefined;
  const card = (key: 'treasuryMad' | 'revenueMad' | 'netIncomeMad' | 'iaScore', label: string, unit: string) =>
    context.resolvedRounds === 0 && RESULT_METRICS.has(key) ? (
      <StatCard key={key} label={label} value="—" note={NOT_YET_PUBLISHED} />
    ) : (
      <StatCard
        key={key}
        label={label}
        value={show(last[key], unit)}
        delta={previous ? delta(last[key], previous[key], (v) => show(v, unit)) : null}
        trend={trend(key)}
        benchmark={key === 'revenueMad' ? revenueBenchmark : undefined}
      />
    );

  const cards = [
    ...(sections.sante
      ? [card('treasuryMad', 'Trésorerie', 'DH'), card('revenueMad', 'Chiffre d’affaires', 'DH'), card('netIncomeMad', 'Résultat net', 'DH')]
      : []),
    ...(sections.strategie ? [card('iaScore', 'Indice d’alignement', 'score')] : []),
  ];

  const signals = watchList(context, das, sections);

  return (
    <div className="space-y-6">
      {cards.length > 0 ? (
        <div className={`grid gap-4 sm:grid-cols-2 ${cards.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {cards}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <section aria-labelledby="watch-title" className="rounded-xl border border-(--border) bg-(--surface) p-5 lg:col-span-3">
          <h2 id="watch-title" className="flex items-center gap-2 text-lg font-semibold text-(--heading)">
            À surveiller
            <InfoHint label="À surveiller">
              Ce qui mérite un regard avant la prochaine décision. Chaque signal reprend une
              information déjà présente dans les vues Gestionnaire et Analyste.
            </InfoHint>
          </h2>
          {signals.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-(--positive)">
              <CircleCheck aria-hidden className="h-4 w-4" />
              Rien d’alarmant sur les indicateurs suivis.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-(--border)">
              {signals.map((signal) => (
                <li key={signal.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-(--warning)" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{signal.title}</p>
                    <p className="mt-0.5 text-(--foreground-muted)">{signal.detail}</p>
                  </div>
                  {signal.href ? (
                    <Link href={signal.href} className="shrink-0 text-sm font-medium text-(--accent-text) hover:underline">
                      {signal.action}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDrillDown(signal.section)}
                      className="shrink-0 text-sm font-medium text-(--accent-text) hover:underline"
                    >
                      {signal.action}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {sections.portefeuille && context.das.length > 0 ? (
          <section aria-labelledby="portfolio-title" className="rounded-xl border border-(--border) bg-(--surface) p-5 lg:col-span-2">
            <h2 id="portfolio-title" className="flex items-center gap-2 text-lg font-semibold text-(--heading)">
              Portefeuille
              <InfoHint label="Portefeuille">
                Poids de chaque domaine dans le chiffre d’affaires du Groupe, et sa marge brute, au
                dernier exercice clos.
              </InfoHint>
            </h2>
            <ul className="mt-4 space-y-3">
              {context.das.map((d, index) => (
                <li key={d.dasId}>
                  <ShareBar
                    label={d.name}
                    share={d.revenueShareOfGroup}
                    colour={seriesColour(index)}
                    note={context.resolvedRounds === 0 ? 'marge publiée à la première résolution' : `marge brute ${formatMadCompact(d.grossMarginMad)}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {DASHBOARD_SECTIONS.filter((s) => sections[s.key]).map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => onDrillDown(section.key)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-3.5 py-2 text-sm font-medium transition-colors hover:border-(--accent) hover:text-(--accent-text)"
          >
            {section.label}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface Signal {
  id: string;
  section: DashboardSectionKey;
  title: string;
  detail: string;
  action: string;
  href?: string;
}

/**
 * Ce qui mérite d'être regardé avant la prochaine décision.
 *
 * Rien n'est inventé : chaque signal reprend une information que les autres
 * vues montrent déjà, mais qu'une équipe pressée ne va pas chercher.
 */
function watchList(
  context: DashboardContext,
  das: DasSeries | null,
  sections: Record<DashboardSectionKey, boolean>,
): Signal[] {
  const signals: Signal[] = [];
  const last = context.group[context.group.length - 1];

  if (sections.sante && last && last.netIncomeMad < 0) {
    signals.push({
      id: 'net-income',
      section: 'sante',
      title: `Résultat net négatif : ${show(last.netIncomeMad, 'DH')}`,
      detail: 'Le Groupe perd de l’argent sur le dernier tour résolu.',
      action: 'Voir la santé',
    });
  }

  if (sections.strategie && (context.alignment.stuckInTheMiddle || context.alignment.drift)) {
    signals.push({
      id: 'alignment',
      section: 'strategie',
      title: context.alignment.stuckInTheMiddle ? 'Enlisé au milieu' : 'Dérive stratégique',
      detail: context.alignment.sentence,
      action: 'Voir la stratégie',
    });
  }

  const lastDas = das?.history[das.history.length - 1];
  if (sections.portefeuille && das && lastDas && lastDas.volumeLost > 0) {
    signals.push({
      id: 'lost-demand',
      section: 'portefeuille',
      title: `Demande non servie sur ${das.name} : ${formatUnits(Math.round(lastDas.volumeLost))} unités`,
      detail: 'Des clients voulaient acheter et n’ont pas été servis — production ou distribution insuffisante.',
      action: 'Voir le domaine',
    });
  }

  const missing = missingBcgStudies(context.das);
  if (sections.matrices && missing.length > 0) {
    signals.push({
      id: 'bcg',
      section: 'matrices',
      title: 'Matrice BCG impossible à placer',
      detail: `Il manque ${missing.join(' et ')}.`,
      action: 'Aller au cabinet',
      href: '/cabinet',
    });
  }

  return signals;
}

function ShareBar({
  label, share, colour, note,
}: {
  label: string;
  share: number;
  colour: string;
  note: string;
}) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular font-mono">{formatScore(pct, 1)} %</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--surface-muted)">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <p className="mt-1 text-xs text-(--meta)">{note}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Vue Gestionnaire
   ══════════════════════════════════════════════════════════════════════════ */

function ManagerSection({
  section, context, das,
}: {
  section: DashboardSectionKey;
  context: DashboardContext;
  das: DasSeries | null;
}) {
  switch (section) {
    case 'sante':
      return <GroupHealth group={context.group} resolvedRounds={context.resolvedRounds} />;
    case 'portefeuille':
      return (
        <>
          <Portfolio das={context.das} />
          {das ? <DasTrajectory das={das} cabinet={context.cabinet} /> : null}
        </>
      );
    case 'strategie':
      return <Alignment context={context} />;
    case 'concurrence':
      return <Competition cabinet={context.cabinet} das={das} />;
    case 'matrices':
      return das ? (
        <Matrices das={das} group={context.group} allDas={context.das} cabinet={context.cabinet} />
      ) : (
        <p className="text-(--foreground-muted)">Aucun domaine à analyser.</p>
      );
  }
}

/* ── Santé du Groupe ─────────────────────────────────────────────────────── */

/**
 * Grandeurs qui n'existent qu'après une résolution. À la dotation, elles valent
 * zéro en base : affiché « 0 DH », ce zéro se lisait comme un résultat nul.
 */
const RESULT_METRICS: ReadonlySet<string> = new Set(['netIncomeMad', 'grossMarginMad', 'marginPct']);
const NOT_YET_PUBLISHED = 'Publié à la première résolution';

const GROUP_METRICS = [
  { key: 'treasuryMad', label: 'Trésorerie', unit: 'DH' },
  { key: 'revenueMad', label: 'Chiffre d’affaires', unit: 'DH' },
  { key: 'netIncomeMad', label: 'Résultat net', unit: 'DH' },
  { key: 'grossMarginMad', label: 'Marge brute', unit: 'DH' },
  { key: 'marginPct', label: 'Taux de marge', unit: '%' },
  { key: 'iaScore', label: 'Indice d’alignement', unit: 'score' },
  { key: 'climatSocial', label: 'Climat social', unit: 'score' },
] as const;

type GroupMetricKey = (typeof GROUP_METRICS)[number]['key'];

function GroupHealth({ group, resolvedRounds }: { group: GroupPoint[]; resolvedRounds: number }) {
  const [metric, setMetric] = useState<GroupMetricKey>('treasuryMad');
  const last = group[group.length - 1];
  const previous = group[group.length - 2];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GROUP_METRICS.map((m) => (
          resolvedRounds === 0 && RESULT_METRICS.has(m.key) ? (
            <StatCard key={m.key} label={m.label} value="—" note={NOT_YET_PUBLISHED} />
          ) : (
            <StatCard
              key={m.key}
              label={m.label}
              value={show(last[m.key], m.unit)}
              delta={previous ? delta(last[m.key], previous[m.key], (v) => show(v, m.unit)) : null}
            />
          )
        ))}
      </div>

      <Accordion
        title="Trajectoire sur tous les tours"
        hint="Ce que vous gagnez, ce qu’il vous reste — tour après tour."
        summary={`${group.length} point${group.length > 1 ? 's' : ''}`}
      >
        <ChartContainer
          title="Trajectoire du Groupe"
          description="Trésorerie par défaut. La vue détaillée ouvre les sept indicateurs."
          columns={groupColumns()}
          rows={groupRows(group)}
          filename="atlas-groupe-trajectoire"
          detailLabel="Tous les indicateurs"
          controls={(detailed) =>
            detailed ? (
              <MetricToggle label="Indicateur du Groupe" options={GROUP_METRICS} value={metric} onChange={setMetric} />
            ) : null
          }
        >
          {(detailed) => {
            const spec = GROUP_METRICS.find((m) => m.key === (detailed ? metric : 'treasuryMad')) ?? GROUP_METRICS[0];
            return (
              <Trajectory
                data={group.map((p) => ({ round: roundLabel(p.roundNumber), valeur: p[spec.key] }))}
                unit={spec.unit}
                series={[{ dataKey: 'valeur', name: spec.label, colour: seriesColour(0) }]}
              />
            );
          }}
        </ChartContainer>
      </Accordion>
    </>
  );
}

/* ── Portefeuille ────────────────────────────────────────────────────────── */

function Portfolio({ das }: { das: DasSeries[] }) {
  const data = das.map((d, index) => ({
    name: d.name,
    part: d.revenueShareOfGroup * 100,
    marge: d.grossMarginMad,
    colour: seriesColour(index),
  }));

  return (
    <Accordion
      title="Poids et marge par domaine"
      hint="Quel métier fait vivre l’entreprise, et lequel la fait vivre bien. L’écart entre les deux classements est souvent la révélation : un domaine peut faire le volume sans faire la marge."
      summary={`${das.length} domaine${das.length > 1 ? 's' : ''}`}
    >
      {/* Deux graphiques, jamais deux axes : une part en % et une marge en DH
          sur le même tracé laissaient croire que les barres se comparaient. */}
      <div className="grid gap-8 lg:grid-cols-2">
        <ChartContainer
          title="Part du chiffre d’affaires"
          columns={portfolioColumns()}
          rows={portfolioRows(das)}
          filename="atlas-portefeuille"
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} width={48} tickFormatter={(v: number) => `${Math.round(v)} %`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--surface-muted)' }} formatter={(v) => [`${formatScore(Number(v), 1)} %`, 'Part du CA']} />
              <Bar dataKey="part" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {data.map((d) => <Cell key={d.name} fill={d.colour} />)}
                <LabelList dataKey="part" position="top" formatter={(v) => `${formatScore(Number(v), 0)} %`} style={{ fontSize: 12, fill: 'var(--foreground)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Marge brute"
          columns={portfolioColumns()}
          rows={portfolioRows(das)}
          filename="atlas-portefeuille"
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} width={76} tickFormatter={(v: number) => formatMadCompact(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--surface-muted)' }} formatter={(v) => [formatMadCompact(Number(v)), 'Marge brute']} />
              <Bar dataKey="marge" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {data.map((d) => <Cell key={d.name} fill={d.colour} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </Accordion>
  );
}

/* ── Le domaine piloté ───────────────────────────────────────────────────── */

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

type DasMetricKey = (typeof DAS_METRICS)[number]['key'];

function DasTrajectory({
  das, cabinet,
}: {
  das: DasSeries;
  cabinet: CabinetOverlay[];
}) {
  const [metric, setMetric] = useState<DasMetricKey>('marketSharePct');
  const lastPoint = das.history[das.history.length - 1];

  // Le marché et la demande ne se déduisent pas de vos chiffres : ils
  // s'achètent. Quand ils l'ont été, ils s'affichent ici — là où l'on décide
  // d'un prix et d'un volume — plutôt que dans un rapport qu'il faut aller
  // rouvrir.
  const pestel = studyFor(cabinet, 'pestel_sectoriel', das.dasId);
  const panel = studyFor(cabinet, 'panel_conso', das.dasId);

  return (
    <Accordion
      title={`Domaine : ${das.name}`}
      hint="Tout ce qui se décide sur ce métier."
      summary={lastPoint ? `part de marché ${formatScore(lastPoint.marketSharePct, 1)} %` : undefined}
    >
      {pestel || panel ? (
        <dl className="tabular mb-6 grid gap-4 rounded-lg bg-(--surface-muted) p-4 sm:grid-cols-3">
          {pestel ? (
            <>
              <CabinetFact label="Taille du marché" field={disclosed(pestel, 'market_size_mad')} errorMargin={pestel.errorMargin} />
              <CabinetFact label="Croissance" field={disclosed(pestel, 'growth_rate')} errorMargin={pestel.errorMargin} hint="L’ordonnée de la BCG" />
              <CabinetFact label="Prix moyen du marché" field={disclosed(pestel, 'reference_unit_price_mad')} errorMargin={pestel.errorMargin} />
            </>
          ) : null}
          {panel ? (
            <>
              <CabinetFact label="Exigence de qualité du segment" field={disclosed(panel, 'quality_requirement')} errorMargin={panel.errorMargin} />
              <CabinetFact label="Sensibilité au prix" field={disclosed(panel, 'price_sensitivity')} errorMargin={panel.errorMargin} hint="Plus elle est haute, moins le premium passe" />
            </>
          ) : null}
        </dl>
      ) : null}

      <ChartContainer
        title={`Trajectoire — ${das.name}`}
        description="Part de marché par défaut. La vue détaillée ouvre les quatorze indicateurs du domaine."
        columns={dasColumns()}
        rows={dasRows(das)}
        filename={`atlas-${slug(das.name)}-trajectoire`}
        detailLabel="Tous les indicateurs"
        controls={(detailed) =>
          detailed ? (
            <MetricToggle label="Indicateur du domaine" options={DAS_METRICS} value={metric} onChange={setMetric} size="sm" />
          ) : null
        }
      >
        {(detailed) => {
          const spec = DAS_METRICS.find((m) => m.key === (detailed ? metric : 'marketSharePct')) ?? DAS_METRICS[0];
          return (
            <Trajectory
              data={das.history.map((p) => ({ round: roundLabel(p.roundNumber), valeur: p[spec.key] }))}
              unit={spec.unit}
              series={[{ dataKey: 'valeur', name: spec.label, colour: seriesColour(0) }]}
            />
          );
        }}
      </ChartContainer>
    </Accordion>
  );
}

/* ── Cohérence stratégique ───────────────────────────────────────────────── */

function Alignment({ context }: { context: DashboardContext }) {
  const { alignment, group } = context;
  // L'audit est le seul livrable SANS bruit : le cabinet analyse les données
  // que l'équipe lui a elle-même transmises. Son verdict complète donc la
  // phrase du moteur au lieu de la concurrencer.
  const audit = studyFor(context.cabinet, 'audit_alignement', null);
  const alert = alignment.stuckInTheMiddle || alignment.drift;
  const last = group[group.length - 1];
  const previous = group[group.length - 2];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Indice d’alignement"
          value={show(last.iaScore, 'score')}
          delta={previous ? delta(last.iaScore, previous.iaScore, (v) => show(v, 'score')) : null}
          trend={group.map((p) => p.iaScore)}
        />
        <div
          className={`flex gap-3 rounded-xl p-5 lg:col-span-2 lg:row-span-3 ${
            alert ? 'bg-(--warning-subtle) text-(--foreground)' : 'border border-(--border) bg-(--surface)'
          }`}
        >
          {alert ? <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-(--warning)" /> : null}
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-(--foreground-muted) uppercase">
              {alert ? (alignment.stuckInTheMiddle ? 'Enlisé au milieu' : 'Dérive stratégique') : 'Diagnostic'}
              <InfoHint label="Cohérence stratégique">
                Une entreprise cohérente exécute mieux : la prime d’alignement joue sur la marge.
              </InfoHint>
            </p>
            <p className="mt-1">{alignment.sentence}</p>
          </div>
        </div>
      </div>

      {audit ? (
        <div className="rounded-xl border border-(--accent) bg-(--surface) p-5">
          <p className="mb-3 text-xs font-semibold tracking-wider text-(--foreground-muted) uppercase">
            Audit d’alignement · tour {audit.roundNumber} · sans marge d’erreur
          </p>
          <dl className="tabular grid gap-4 sm:grid-cols-3">
            <CabinetFact label="Alignement business" field={disclosed(audit, 'sab_global')} errorMargin={0} />
            <CabinetFact label="Alignement corporate" field={disclosed(audit, 'sac_score')} errorMargin={0} />
            <CabinetFact label="Indice d’alignement" field={disclosed(audit, 'ia_final')} errorMargin={0} />
          </dl>
        </div>
      ) : null}

      <Accordion
        title="Trajectoire de l’indice d’alignement"
        summary={show(last.iaScore, 'score')}
      >
        <ChartContainer
          title="Indice d’alignement"
          columns={[
            { key: 'round', label: 'Tour' },
            { key: 'iaScore', label: 'Indice d’alignement', format: (v) => show(Number(v), 'score') },
          ]}
          rows={group.map((p) => ({ round: roundLabel(p.roundNumber), iaScore: p.iaScore }))}
          filename="atlas-alignement"
        >
          <Trajectory
            data={group.map((p) => ({ round: roundLabel(p.roundNumber), valeur: p.iaScore }))}
            unit="score"
            series={[{ dataKey: 'valeur', name: 'Indice d’alignement', colour: seriesColour(0) }]}
          />
        </ChartContainer>
      </Accordion>

      {alignment.worstAxes.length > 0 ? (
        <Accordion
          title="Ce qui vous coûte le plus"
          hint="Les axes où l’écart au modèle retire le plus de points."
          summary={`${alignment.worstAxes.length} axe${alignment.worstAxes.length > 1 ? 's' : ''}`}
        >
          <DataTable
            caption="Axes les plus coûteux"
            columns={worstAxesColumns()}
            rows={worstAxesRows(context)}
          />
        </Accordion>
      ) : null}
    </>
  );
}

/* ── Concurrence ─────────────────────────────────────────────────────────── */

function Competition({
  cabinet, das,
}: {
  cabinet: CabinetOverlay[];
  das: DasSeries | null;
}) {
  const study = competitionStudy(cabinet, das);

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

  const { columns, rows } = competitionTable(study);

  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <ChartContainer
        title="Parts de marché de la ligue"
        description="Votre équipe en trait plein, les concurrents en pointillés."
        source={`cabinet ±${Math.round(study.errorMargin * 100)} %`}
        columns={columns}
        rows={rows}
        filename="atlas-concurrence"
        height={300}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="round" {...AXIS} />
            <YAxis {...AXIS} width={48} tickFormatter={(v: number) => `${Math.round(v)} %`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${formatScore(Number(v), 1)} %`, String(name)]} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--foreground-muted)' }} />
            {study.subjects.map((subject, index) => (
              <Line
                key={subject.subjectId}
                type="monotone"
                dataKey={subject.subjectName}
                stroke={seriesColour(index)}
                strokeWidth={subject.isSelf ? 3 : 2}
                // Le pointillé porte la frontière entre ce qu'on sait et ce
                // qu'on estime. Le trait plein n'appartient qu'à vos chiffres.
                strokeDasharray={subject.isSelf ? undefined : '5 4'}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}

/* ── Matrices ────────────────────────────────────────────────────────────── */

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
  const placeable = bcgPlaceable(allDas);
  const missing = missingBcgStudies(allDas);

  return (
    <>
      <Accordion
        title="Matrice BCG"
        hint="Part relative au leader et croissance du marché : deux études à acheter."
        summary={
          placeable.length > 0
            ? `${placeable.length}/${allDas.length} domaine${allDas.length > 1 ? 's' : ''} placé${placeable.length > 1 ? 's' : ''}`
            : `${missing.length} étude${missing.length > 1 ? 's' : ''} à commander`
        }
      >
        <Bcg allDas={allDas} />
      </Accordion>

      <Accordion
        title="Balanced Scorecard"
        hint="Les quatre perspectives de Kaplan et Norton."
        summary={last?.bsc ? `global ${formatScore(last.bsc.global, 1)}` : 'après le 1er tour'}
      >
        {last?.bsc ? (
          <ChartContainer
            title="Balanced Scorecard"
            description="Calculée par le moteur sur vos résultats. Un profil déséquilibré tient rarement dans la durée."
            columns={[
              { key: 'axe', label: 'Perspective' },
              { key: 'valeur', label: 'Score (sur 100)', format: (v) => formatScore(Number(v), 1) },
            ]}
            rows={bscRows(last)}
            filename="atlas-balanced-scorecard"
            height={288}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={bscRows(last)}>
                <PolarGrid stroke="var(--grid)" />
                <PolarAngleAxis dataKey="axe" tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--meta)' }} axisLine={false} />
                <Radar name="Votre profil" dataKey="valeur" stroke={seriesColour(0)} strokeWidth={2} fill={seriesColour(0)} fillOpacity={0.2} dot={{ r: 3 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>
        ) : (
          <Unavailable
            what="La Balanced Scorecard"
            reasons={[
              'Ses quatre perspectives se calculent sur des résultats. Elle apparaîtra après la résolution du premier tour — elle ne s’achète pas.',
            ]}
          />
        )}
      </Accordion>

      <Accordion
        title={`Les cinq forces de Porter — ${das.name}`}
        hint="Plus une force est haute, moins la filière est profitable de ce côté-là."
        summary={resolved ? `rivalité ${formatScore(das.forces.rivalry, 0)}` : 'après le 1er tour'}
      >
        {resolved ? (
          <ChartContainer
            title={`Cinq forces — ${das.name}`}
            description="À défaut de benchmark, le pouvoir des fournisseurs et des distributeurs se DÉDUIT du nombre d’acteurs indépendants qu’il vous reste ; le benchmark le remplace par leur force de négociation réelle."
            source={measured.note ? 'benchmark' : undefined}
            columns={[
              { key: 'axe', label: 'Force' },
              { key: 'valeur', label: 'Intensité (sur 100)', format: (v) => formatScore(Number(v), 1) },
            ]}
            rows={porterRows(das, measured)}
            filename={`atlas-${slug(das.name)}-porter`}
            height={288}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={porterRows(das, measured)}>
                <PolarGrid stroke="var(--grid)" />
                <PolarAngleAxis dataKey="axe" tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--meta)' }} axisLine={false} />
                <Radar name="Intensité" dataKey="valeur" stroke={seriesColour(1)} strokeWidth={2} fill={seriesColour(1)} fillOpacity={0.2} dot={{ r: 3 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>
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
        {resolved && measured.note ? (
          <p className="mt-3 text-sm text-(--accent-text)">{measured.note}</p>
        ) : null}
      </Accordion>

      <Accordion
        title="Matrice McKinsey / GE"
        hint="Force compétitive et attractivité du marché, calculées sur vos chiffres."
        summary={resolved ? `compétitivité ${formatScore(lastDas.competitivenessScore, 1)}` : 'après le 1er tour'}
      >
        {resolved ? (
          <McKinsey allDas={allDas} />
        ) : (
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
        )}
      </Accordion>
    </>
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

function bcgPlaceable(allDas: DasSeries[]): DasSeries[] {
  return allDas.filter((d) => d.relativeShare !== null && d.marketGrowth !== null);
}

/**
 * La matrice BCG — et pourquoi elle peut rester vide.
 *
 * Ses deux axes s'achètent : la part relative au leader vient de l'étude
 * concurrentielle, la croissance du marché de l'étude PESTEL. Le moteur en a
 * fait délibérément la récompense de deux missions. L'emplacement existe donc
 * toujours et dit ce qu'il manque — le manque d'information devient visible,
 * au lieu d'être une absence qu'on ne remarque pas. Ce n'est pas une panne.
 */
function Bcg({ allDas }: { allDas: DasSeries[] }) {
  const placeable = bcgPlaceable(allDas);

  if (placeable.length === 0) {
    return (
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
    );
  }

  const points = placeable.map((d) => ({
    x: d.relativeShare ?? 0,
    y: d.marketGrowth ?? 0,
    z: Math.max(d.revenueShareOfGroup * 100, 5),
    name: d.name,
    colour: seriesColour(allDas.indexOf(d)),
  }));

  return (
    <ChartContainer
      title="Matrice BCG"
      description="Part relative au leader en abscisse, croissance du marché en ordonnée. La taille des points est le poids du domaine dans votre chiffre d’affaires."
      columns={bcgColumns()}
      rows={bcgRows(allDas)}
      filename="atlas-bcg"
      height={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name="Part relative au leader" {...AXIS} domain={[0, 'dataMax']} tickFormatter={(v: number) => `${formatScore(v, 1)}×`} />
          <YAxis type="number" dataKey="y" name="Croissance du marché" {...AXIS} width={56} tickFormatter={(v: number) => `${formatScore(v * 100, 0)} %`} />
          <ZAxis type="number" dataKey="z" range={[80, 500]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [formatScore(Number(v), 2), String(name)]} />
          <Scatter data={points}>
            {points.map((p) => <Cell key={p.name} fill={p.colour} stroke="var(--surface)" strokeWidth={2} />)}
            <LabelList dataKey="name" position="top" style={{ fontSize: 12, fill: 'var(--foreground)' }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartContainer>
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
  const points = mckinseyPoints(allDas);

  return (
    <ChartContainer
      title="Matrice McKinsey / GE"
      description="Force compétitive en abscisse, attractivité du marché en ordonnée. Elle se calcule sur vos chiffres : contrairement à la BCG, elle ne demande rien au cabinet."
      columns={mckinseyColumns()}
      rows={points.map(({ name, x, y, z }) => ({ name, x, y, z }))}
      filename="atlas-mckinsey"
      height={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name="Force compétitive" domain={[0, 100]} {...AXIS} />
          <YAxis type="number" dataKey="y" name="Attractivité" domain={[0, 100]} width={48} {...AXIS} />
          <ZAxis type="number" dataKey="z" range={[80, 500]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [formatScore(Number(v), 1), String(name)]} />
          <Scatter data={points}>
            {points.map((p) => <Cell key={p.name} fill={p.colour} stroke="var(--surface)" strokeWidth={2} />)}
            <LabelList dataKey="name" position="top" style={{ fontSize: 12, fill: 'var(--foreground)' }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

function mckinseyPoints(allDas: DasSeries[]) {
  return allDas.map((d, i) => {
    const last = d.history[d.history.length - 1];
    // Un marché est d'autant plus attractif qu'il est difficile d'y entrer et
    // peu menacé par les substituts.
    const attractivite = Math.max(0, Math.min(100, (d.forces.entryBarrier + (100 - d.forces.substitution)) / 2));
    return {
      x: last?.competitivenessScore ?? 0,
      y: attractivite,
      z: Math.max(d.revenueShareOfGroup * 100, 5),
      name: d.name,
      colour: seriesColour(i),
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Vue Analyste — toutes les données, brutes
   ══════════════════════════════════════════════════════════════════════════ */

function AnalystSection({
  section, context,
}: {
  section: DashboardSectionKey;
  context: DashboardContext;
}) {
  const { group, das, alignment, cabinet } = context;

  switch (section) {
    case 'sante':
      return (
        <>
          <RawTable title="Groupe, tour par tour" columns={groupColumns()} rows={groupRows(group)} filename="atlas-groupe" />
          <RawTable title="Balanced Scorecard, tour par tour" columns={bscHistoryColumns()} rows={bscHistoryRows(group)} filename="atlas-bsc-historique" />
        </>
      );
    case 'portefeuille':
      return (
        <>
          <RawTable title="Portefeuille, dernier exercice clos" columns={portfolioColumns()} rows={portfolioRows(das)} filename="atlas-portefeuille" />
          {das.map((d) => (
            <RawTable key={d.dasId} title={`${d.name}, tour par tour`} columns={dasColumns()} rows={dasRows(d)} filename={`atlas-${slug(d.name)}`} />
          ))}
        </>
      );
    case 'strategie':
      return (
        <>
          <RawTable
            title="Diagnostic d’alignement"
            columns={[
              { key: 'indicateur', label: 'Indicateur' },
              { key: 'valeur', label: 'Valeur' },
            ]}
            rows={[
              { indicateur: 'Indice d’alignement', valeur: alignment.score === null ? null : formatScore(alignment.score, 1) },
              { indicateur: 'Écart au tour précédent (points)', valeur: alignment.trend === null ? null : formatScore(alignment.trend, 1) },
              { indicateur: 'Enlisé au milieu', valeur: alignment.stuckInTheMiddle ? 'oui' : 'non' },
              { indicateur: 'Dérive', valeur: alignment.drift ? 'oui' : 'non' },
              { indicateur: 'Verdict', valeur: alignment.sentence },
            ]}
            filename="atlas-alignement-diagnostic"
          />
          <RawTable title="Axes les plus coûteux" columns={worstAxesColumns()} rows={worstAxesRows(context)} filename="atlas-alignement-axes" />
          <RawTable
            title="Indice d’alignement et climat social, tour par tour"
            columns={[
              { key: 'round', label: 'Tour' },
              { key: 'iaScore', label: 'Indice d’alignement', format: (v) => show(Number(v), 'score') },
              { key: 'climatSocial', label: 'Climat social', format: (v) => show(Number(v), 'score') },
            ]}
            rows={group.map((p) => ({ round: roundLabel(p.roundNumber), iaScore: p.iaScore, climatSocial: p.climatSocial }))}
            filename="atlas-alignement-historique"
          />
        </>
      );
    case 'concurrence': {
      const studies = das.length > 0
        ? das.map((d) => competitionStudy(cabinet, d)).filter((s): s is CabinetOverlay => Boolean(s))
        : [];
      const unique = [...new Map(studies.map((s) => [`${s.dasId}-${s.roundNumber}-${s.tier}`, s])).values()];
      return (
        <>
          {unique.length === 0 ? (
            <Unavailable what="La comparaison au marché" studies={['l’étude concurrentielle']} reasons={['Aucune étude concurrentielle achetée pour l’instant.']} />
          ) : (
            unique.map((study) => {
              const table = competitionTable(study);
              const dasName = das.find((d) => d.dasId === study.dasId)?.name ?? 'Groupe';
              return (
                <RawTable
                  key={`${study.dasId}-${study.roundNumber}`}
                  title={`Parts de marché — ${dasName} (cabinet ±${Math.round(study.errorMargin * 100)} %)`}
                  columns={table.columns}
                  rows={table.rows}
                  filename={`atlas-concurrence-${slug(dasName)}`}
                />
              );
            })
          )}
          <RawTable title="Tous les livrables du cabinet" columns={cabinetColumns()} rows={cabinetRows(cabinet, das)} filename="atlas-cabinet" />
        </>
      );
    }
    case 'matrices':
      return (
        <>
          <RawTable title="Matrice BCG — coordonnées" columns={bcgColumns()} rows={bcgRows(das)} filename="atlas-bcg" />
          <RawTable title="Matrice McKinsey / GE — coordonnées" columns={mckinseyColumns()} rows={mckinseyPoints(das).map(({ name, x, y, z }) => ({ name, x, y, z }))} filename="atlas-mckinsey" />
          <RawTable title="Cinq forces de Porter, par domaine" columns={porterColumns()} rows={das.map((d) => porterRow(d, measuredForces(cabinet, d)))} filename="atlas-porter" />
        </>
      );
  }
}

function RawTable({
  title, columns, rows, filename,
}: {
  title: string;
  columns: DataColumn[];
  rows: DataRow[];
  filename: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={id} className="font-semibold text-(--heading)">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-(--meta)">{rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
          <button
            type="button"
            onClick={() => downloadCsv(filename, columns, rows)}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium hover:border-(--accent) hover:text-(--accent-text)"
          >
            Exporter en CSV
          </button>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} caption={title} />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Tables — une seule définition, pour les graphiques, leur repli et l'export
   ══════════════════════════════════════════════════════════════════════════ */

const fmt = (unit: string) => (v: unknown) => show(Number(v), unit);

function groupColumns(): DataColumn[] {
  return [
    { key: 'round', label: 'Tour' },
    ...GROUP_METRICS.map((m) => ({ key: m.key, label: m.label, format: fmt(m.unit) })),
  ];
}

function groupRows(group: GroupPoint[]): DataRow[] {
  return group.map((p) => ({
    round: roundLabel(p.roundNumber),
    ...Object.fromEntries(GROUP_METRICS.map((m) => [m.key, p[m.key]])),
  }));
}

function bscHistoryColumns(): DataColumn[] {
  return [
    { key: 'round', label: 'Tour' },
    { key: 'financial', label: 'Financier', format: fmt('score') },
    { key: 'client', label: 'Client', format: fmt('score') },
    { key: 'process', label: 'Processus', format: fmt('score') },
    { key: 'learning', label: 'Apprentissage', format: fmt('score') },
    { key: 'global', label: 'Global', format: fmt('score') },
  ];
}

function bscHistoryRows(group: GroupPoint[]): DataRow[] {
  return group.map((p) => ({
    round: roundLabel(p.roundNumber),
    financial: p.bsc?.financial ?? null,
    client: p.bsc?.client ?? null,
    process: p.bsc?.process ?? null,
    learning: p.bsc?.learning ?? null,
    global: p.bsc?.global ?? null,
  }));
}

function bscRows(point: GroupPoint) {
  const bsc = point.bsc!;
  return [
    { axe: 'Financier', valeur: bsc.financial },
    { axe: 'Client', valeur: bsc.client },
    { axe: 'Processus', valeur: bsc.process },
    { axe: 'Apprentissage', valeur: bsc.learning },
  ];
}

function portfolioColumns(): DataColumn[] {
  return [
    { key: 'name', label: 'Domaine' },
    { key: 'part', label: 'Part du CA', format: (v) => `${formatScore(Number(v), 1)} %` },
    { key: 'marge', label: 'Marge brute', format: fmt('DH') },
    { key: 'croissance', label: 'Croissance du marché', format: (v) => `${formatScore(Number(v) * 100, 1)} %` },
    { key: 'partRelative', label: 'Part relative au leader', format: (v) => `${formatScore(Number(v), 2)}×` },
  ];
}

function portfolioRows(das: DasSeries[]): DataRow[] {
  return das.map((d) => ({
    name: d.name,
    part: d.revenueShareOfGroup * 100,
    marge: d.grossMarginMad,
    croissance: d.marketGrowth,
    partRelative: d.relativeShare,
  }));
}

function dasColumns(): DataColumn[] {
  return [
    { key: 'round', label: 'Tour' },
    ...DAS_METRICS.map((m) => ({ key: m.key, label: m.label, format: fmt(m.unit) })),
  ];
}

function dasRows(das: DasSeries): DataRow[] {
  return das.history.map((p) => ({
    round: roundLabel(p.roundNumber),
    ...Object.fromEntries(DAS_METRICS.map((m) => [m.key, p[m.key]])),
  }));
}

function worstAxesColumns(): DataColumn[] {
  return [
    { key: 'axe', label: 'Axe' },
    { key: 'ecart', label: 'Écart au modèle', format: fmt('score') },
    { key: 'penalite', label: 'Points perdus', format: (v) => `−${formatScore(Number(v), 1)}` },
  ];
}

function worstAxesRows(context: DashboardContext): DataRow[] {
  return context.alignment.worstAxes.map((axis) => ({
    axe: axis.axisKey.replace(/_/g, ' '),
    ecart: axis.gap,
    penalite: axis.penalty,
  }));
}

function bcgColumns(): DataColumn[] {
  return [
    { key: 'name', label: 'Domaine' },
    { key: 'x', label: 'Part relative au leader', format: (v) => `${formatScore(Number(v), 2)}×` },
    { key: 'y', label: 'Croissance du marché', format: (v) => `${formatScore(Number(v) * 100, 1)} %` },
    { key: 'z', label: 'Poids dans le CA (%)', format: (v) => formatScore(Number(v), 1) },
  ];
}

function bcgRows(allDas: DasSeries[]): DataRow[] {
  return allDas.map((d) => ({
    name: d.name,
    x: d.relativeShare,
    y: d.marketGrowth,
    z: d.revenueShareOfGroup * 100,
  }));
}

function mckinseyColumns(): DataColumn[] {
  return [
    { key: 'name', label: 'Domaine' },
    { key: 'x', label: 'Force compétitive', format: fmt('score') },
    { key: 'y', label: 'Attractivité', format: fmt('score') },
    { key: 'z', label: 'Poids dans le CA (%)', format: fmt('score') },
  ];
}

function porterRows(das: DasSeries, measured: { supplier: number; distributor: number }) {
  return [
    { axe: 'Entrants', valeur: 100 - das.forces.entryBarrier },
    { axe: 'Substituts', valeur: das.forces.substitution },
    { axe: 'Fournisseurs', valeur: measured.supplier },
    { axe: 'Distributeurs', valeur: measured.distributor },
    { axe: 'Rivalité', valeur: das.forces.rivalry },
  ];
}

function porterColumns(): DataColumn[] {
  return [
    { key: 'name', label: 'Domaine' },
    { key: 'entrants', label: 'Entrants', format: fmt('score') },
    { key: 'substituts', label: 'Substituts', format: fmt('score') },
    { key: 'fournisseurs', label: 'Fournisseurs', format: fmt('score') },
    { key: 'distributeurs', label: 'Distributeurs', format: fmt('score') },
    { key: 'rivalite', label: 'Rivalité', format: fmt('score') },
    { key: 'source', label: 'Amont / aval' },
  ];
}

function porterRow(das: DasSeries, measured: { supplier: number; distributor: number; note: string | null }): DataRow {
  return {
    name: das.name,
    entrants: 100 - das.forces.entryBarrier,
    substituts: das.forces.substitution,
    fournisseurs: measured.supplier,
    distributeurs: measured.distributor,
    rivalite: das.forces.rivalry,
    source: measured.note ? 'mesuré (benchmark)' : 'déduit',
  };
}

function competitionStudy(cabinet: CabinetOverlay[], das: DasSeries | null) {
  return cabinet.find((o) => o.studyKey === 'concurrentielle' && (!das || o.dasId === das.dasId));
}

function competitionTable(study: CabinetOverlay): { columns: DataColumn[]; rows: DataRow[] } {
  const rounds = [
    ...new Set(study.subjects.flatMap((s) => (s.history ?? []).map((h) => h.roundNumber))),
  ].sort((a, b) => a - b);

  const rows = rounds.map((round) => {
    const row: DataRow = { round: roundLabel(round) };
    for (const subject of study.subjects) {
      const point = (subject.history ?? []).find((h) => h.roundNumber === round);
      row[subject.subjectName] = point?.values.competitor_market_share ?? null;
    }
    return row;
  });

  return {
    columns: [
      { key: 'round', label: 'Tour' },
      ...study.subjects.map((s) => ({
        key: s.subjectName,
        label: s.isSelf ? `${s.subjectName} (vous)` : s.subjectName,
        format: (v: unknown) => `${formatScore(Number(v), 1)} %`,
      })),
    ],
    rows,
  };
}

function cabinetColumns(): DataColumn[] {
  return [
    { key: 'etude', label: 'Étude' },
    { key: 'palier', label: 'Palier' },
    { key: 'tour', label: 'Tour' },
    { key: 'domaine', label: 'Domaine' },
    { key: 'sujet', label: 'Sujet' },
    { key: 'champ', label: 'Champ' },
    { key: 'valeur', label: 'Valeur' },
    { key: 'precision', label: 'Précision' },
  ];
}

function cabinetRows(cabinet: CabinetOverlay[], das: DasSeries[]): DataRow[] {
  return cabinet.flatMap((study) =>
    study.subjects.flatMap((subject) =>
      subject.fields.map((field) => ({
        etude: study.studyKey.replace(/_/g, ' '),
        palier: study.tier,
        tour: roundLabel(study.roundNumber),
        domaine: das.find((d) => d.dasId === study.dasId)?.name ?? 'Groupe',
        sujet: subject.isSelf ? `${subject.subjectName} (vous)` : subject.subjectName,
        champ: field.label,
        valeur: disclosureValue(field),
        precision: disclosurePrecision(field, study.errorMargin),
      })),
    ),
  );
}

function disclosureValue(field: FieldDisclosure): string {
  const unit = field.mode === 'withheld' ? undefined : field.unit === 'DH' ? 'DH' : field.unit === '%' ? '%' : 'score';
  if (field.mode === 'withheld') return 'non couvert';
  if (field.mode === 'band') return `${field.band} (${show(field.lower, unit!)} à ${show(field.upper, unit!)})`;
  return show(field.value, unit!);
}

function disclosurePrecision(field: FieldDisclosure, errorMargin: number): string {
  if (field.mode === 'withheld') return field.reason;
  if (field.mode === 'band') return 'fourchette';
  if (field.mode === 'estimate') return `±${Math.round(field.errorMargin * 100)} %`;
  return errorMargin > 0 ? `±${Math.round(errorMargin * 100)} %` : 'exact';
}

/* ══════════════════════════════════════════════════════════════════════════
   Ce que le cabinet a vendu, rendu là où la décision se prend
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
      <dt className="flex flex-wrap items-center gap-1.5 text-sm text-(--foreground-muted)">
        {label}
        <span className="rounded bg-(--surface) px-1.5 py-0.5 text-[0.6875rem] ring-1 ring-(--border)">
          cabinet {errorMargin > 0 ? `±${Math.round(errorMargin * 100)} %` : 'exact'}
        </span>
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

/**
 * Ce qu'on ne peut pas montrer, et comment l'obtenir.
 *
 * Un graphique absent est indistinguable d'un graphique vide : dans les deux
 * cas l'équipe voit du blanc et n'apprend rien. On remplace donc le graphe par
 * ce qui le débloquerait — en distinguant les deux causes, qui n'appellent pas
 * la même action : une étude qui n'a pas été payée se commande, un tour qui
 * n'a pas été résolu s'attend.
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
  const toBuy = Boolean(studies && studies.length > 0);
  return (
    <div className="rounded-xl border border-dashed border-(--border-strong) bg-(--surface-muted) p-6">
      <p className="text-xs font-semibold tracking-wider text-(--foreground-muted) uppercase">
        {toBuy ? 'Données à acheter' : 'Données à venir'}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-(--heading)">
        {what} n’est pas encore disponible.
        <InfoHint label={`Pourquoi : ${what}`}>
          {reasons.map((reason, index) => (
            <span key={index} className="mt-2 block first:mt-0">{reason}</span>
          ))}
        </InfoHint>
      </p>

      {toBuy ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/cabinet"
            className="inline-flex items-center gap-2 rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
          >
            Commander au cabinet
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          <span className="text-sm">
            À commander : <strong>{studies!.join(' et ')}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Briques communes
   ══════════════════════════════════════════════════════════════════════════ */

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
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="round" {...AXIS} />
        <YAxis {...AXIS} width={80} tickFormatter={(v: number) => show(v, unit)} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
          formatter={(v, name) => [show(Number(v), unit), String(name)]}
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.colour}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function show(value: number, unit: string): string {
  if (unit === 'DH') return formatMadCompact(value);
  if (unit === '%') return `${formatScore(value, 1)} %`;
  if (unit === 'unites') return formatUnits(Math.round(value));
  return formatScore(value, 1);
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Le provisionnement écrit une ligne AVANT le premier tour : c'est la dotation,
 * identique pour toutes les équipes. L'afficher « T-1 » laissait croire à un
 * tour joué que personne ne se rappelait.
 */
function roundLabel(round: number): string {
  return round < 0 ? 'Départ' : `T${round}`;
}
