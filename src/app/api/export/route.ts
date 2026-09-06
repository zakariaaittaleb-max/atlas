/**
 * Exports Excel — le canal principal de sortie du jeu.
 *
 * L'export n'est pas un livrable de fin de partie : les étudiants construisent
 * leurs matrices BCG, PESTEL, Porter et VRIO **sur tableur, hors de
 * l'application** (doc 00 §9). Atlas vend la donnée ; l'intelligence reste au
 * groupe.
 *
 * Deux portées, deux autorisations distinctes :
 *   • `resultats_tour`    — une équipe, ses propres données. Contrôle : appartenance.
 *   • `session_complete`  — toute la session, six onglets. Contrôle : facilitateur.
 *
 * Le second contient les décisions de TOUTES les équipes : c'est un document de
 * débriefing, jamais accessible à un joueur.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getTeamContext, getUser } from '@/lib/dal';
import { loadSusAggregate } from '@/lib/server/sus';
import { buildWorkbook, safeFileName, type SheetSpec } from '@/lib/server/xlsx';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const Query = z.object({
  type: z.enum(['dossier_initial', 'resultats_tour', 'session_complete', 'ux_protocol']),
  sessionId: z.string().uuid().optional(),
});

type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : Number(v ?? d) || d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = Query.safeParse({
    type: url.searchParams.get('type'),
    sessionId: url.searchParams.get('sessionId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (parsed.data.type === 'dossier_initial') return openingDossierExport(admin);
  if (parsed.data.type === 'resultats_tour') return teamRoundExport(admin);
  if (parsed.data.type === 'ux_protocol') return uxProtocolExport(admin, parsed.data.sessionId);
  return sessionExport(admin, parsed.data.sessionId);
}

// ---------------------------------------------------------------------------

async function teamRoundExport(admin: ReturnType<typeof createAdminClient>) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const [{ data: metrics }, { data: pnls }, { data: states }, { data: alignments }, { data: decisions }, { data: dasRows }] =
    await Promise.all([
      admin.from('team_das_round_metrics').select('*').eq('team_id', team.teamId).order('round_number'),
      admin.from('pnl_statements').select('*').eq('team_id', team.teamId).order('round_number'),
      admin.from('team_round_state').select('*').eq('team_id', team.teamId).order('round_number'),
      admin.from('alignment_scores').select('*').eq('team_id', team.teamId).order('round_number'),
      admin.from('decisions_log').select('*').eq('team_id', team.teamId).order('round_number'),
      admin.from('strategic_units').select('id, name').eq('session_id', team.sessionId),
    ]);

  const dasName = new Map((dasRows ?? []).map((d) => [String(d.id), str(d.name)]));

  const sheets: SheetSpec[] = [
    {
      name: 'KPI par DAS',
      preamble: [
        `${team.teamName} — indicateurs par domaine d'activité et par tour`,
        'Les colonnes sont des NOMBRES : triez, sommez, croisez librement.',
      ],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'DAS', key: 'das', width: 28 },
        { header: 'Qualité perçue', key: 'quality', format: 'score' },
        { header: 'Notoriété', key: 'notoriety', format: 'score' },
        { header: 'Prix unitaire', key: 'price', format: 'mad' },
        { header: 'Coût unitaire', key: 'cost', format: 'mad' },
        { header: 'Capacité', key: 'capacity', format: 'score', width: 16 },
        { header: 'Volume vendu', key: 'sold', format: 'score', width: 16 },
        { header: 'Taux de rupture', key: 'stockout', format: 'pct' },
        { header: 'Taux d’utilisation', key: 'utilisation', format: 'pct', width: 18 },
        { header: 'Couverture distribution', key: 'coverage', format: 'pct', width: 22 },
        { header: 'Score compétitivité', key: 'score', format: 'score', width: 20 },
        { header: 'Part de marché', key: 'share', format: 'pct', width: 16 },
        { header: 'Chiffre d’affaires', key: 'revenue', format: 'mad', width: 20 },
        { header: 'Résultat d’exploitation', key: 'ebitda', format: 'mad', width: 22 },
      ],
      rows: (metrics ?? []).map((m: Row) => ({
        round: num(m.round_number),
        das: dasName.get(str(m.das_id)) ?? '—',
        quality: r2(num(m.perceived_quality)),
        notoriety: r2(num(m.notoriety)),
        price: r2(num(m.unit_price_mad)),
        cost: r2(num(m.unit_variable_cost_mad)),
        capacity: Math.round(num(m.capacity_units)),
        sold: Math.round(num(m.volume_sold)),
        stockout: num(m.stockout_rate),
        utilisation: num(m.utilisation_rate),
        coverage: num(m.distribution_coverage),
        score: r2(num(m.competitiveness_score) * 100),
        share: num(m.market_share_pct),
        revenue: Math.round(num(m.revenue_mad)),
        ebitda: Math.round(num(m.ebitda_mad)),
      })),
    },
    {
      name: 'Compte de résultat',
      preamble: [`${team.teamName} — compte de produits et charges par tour`],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Chiffre d’affaires', key: 'revenue', format: 'mad', width: 20 },
        { header: 'Marge distributeurs', key: 'distri', format: 'mad', width: 20 },
        { header: 'CA net', key: 'net', format: 'mad' },
        { header: 'Coût des ventes', key: 'cogs', format: 'mad', width: 18 },
        { header: 'Marge brute', key: 'gross', format: 'mad' },
        { header: 'Personnel', key: 'payroll', format: 'mad' },
        { header: 'Marketing', key: 'marketing', format: 'mad' },
        { header: 'R&D', key: 'rd', format: 'mad' },
        { header: 'Structure', key: 'overhead', format: 'mad' },
        { header: 'Coûts fixes production', key: 'fixed', format: 'mad', width: 22 },
        { header: 'Conseil', key: 'consulting', format: 'mad' },
        { header: 'Résultat d’exploitation', key: 'ebitda', format: 'mad', width: 22 },
        { header: 'Amortissements', key: 'depreciation', format: 'mad', width: 18 },
        { header: 'Résultat d’exploitation', key: 'ebit', format: 'mad', width: 22 },
        { header: 'Charges financières', key: 'interest', format: 'mad', width: 20 },
        { header: 'IS', key: 'tax', format: 'mad' },
        { header: 'Résultat net', key: 'netIncome', format: 'mad', width: 16 },
        { header: 'Argent immobilisé dans le cycle', key: 'wc', format: 'mad', width: 30 },
        { header: 'Variation de cet argent', key: 'wcChange', format: 'mad', width: 24 },
        { header: 'Investissements', key: 'capex', format: 'mad', width: 18 },
        { header: 'Trésorerie finale', key: 'treasury', format: 'mad', width: 18 },
      ],
      rows: (pnls ?? []).map((p: Row) => ({
        round: num(p.round_number),
        revenue: Math.round(num(p.revenue_mad)),
        distri: Math.round(num(p.distributor_margin_mad)),
        net: Math.round(num(p.net_revenue_mad)),
        cogs: Math.round(num(p.cogs_mad)),
        gross: Math.round(num(p.gross_margin_mad)),
        payroll: Math.round(num(p.payroll_mad)),
        marketing: Math.round(num(p.marketing_mad)),
        rd: Math.round(num(p.rd_mad)),
        overhead: Math.round(num(p.overhead_mad)),
        fixed: Math.round(num(p.fixed_production_mad)),
        consulting: Math.round(num(p.consulting_mad)),
        ebitda: Math.round(num(p.ebitda_mad)),
        depreciation: Math.round(num(p.depreciation_mad)),
        ebit: Math.round(num(p.ebit_mad)),
        interest: Math.round(num(p.interest_mad)),
        tax: Math.round(num(p.corporate_tax_mad)),
        netIncome: Math.round(num(p.net_income_mad)),
        wc: Math.round(num(p.working_capital_mad)),
        wcChange: Math.round(num(p.working_capital_change_mad)),
        capex: Math.round(num(p.capex_mad)),
        treasury: Math.round(num(p.treasury_end_mad)),
      })),
    },
    {
      name: 'Alignement',
      preamble: [
        `${team.teamName} — indice d'alignement stratégique par tour`,
        "L'IA mesure la COHÉRENCE entre ce que vous déclarez et ce que vous faites, jamais la performance.",
      ],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Business (SAB)', key: 'sab', format: 'score', width: 16 },
        { header: 'Corporate (SAC)', key: 'sac', format: 'score', width: 16 },
        { header: 'Temporel (SAT)', key: 'sat', format: 'score', width: 16 },
        { header: 'Indice d’alignement', key: 'ia', format: 'score', width: 20 },
        { header: 'Milieu de gué', key: 'stuck', width: 16 },
        { header: 'Dérive', key: 'drift', width: 12 },
        { header: 'Déclaré', key: 'declared', width: 24 },
        { header: 'Réellement exécuté', key: 'actual', width: 24 },
        { header: 'Climat social', key: 'climate', format: 'score', width: 16 },
        { header: 'Prime de marge', key: 'premium', format: 'pct', width: 16 },
        { header: 'Trésorerie', key: 'status', width: 18 },
      ],
      rows: (alignments ?? []).map((a: Row) => {
        const state = (states ?? []).find((s) => num(s.round_number) === num(a.round_number)) as Row | undefined;
        return {
          round: num(a.round_number),
          sab: r2(num(a.sab_global)),
          sac: r2(num(a.sac_score)),
          sat: r2(num(a.sat_score)),
          ia: r2(num(a.ia_final)),
          stuck: a.stuck_in_the_middle ? 'OUI' : 'non',
          drift: a.strategic_drift ? 'OUI' : 'non',
          declared: str(a.drift_declared, '—'),
          actual: str(a.drift_actual, '—'),
          climate: r2(num(state?.climat_social)),
          premium: num(state?.margin_premium_pct),
          status: str(state?.treasury_status, '—'),
        };
      }),
    },
    {
      name: 'Décisions',
      preamble: [`${team.teamName} — journal des décisions, source de vérité du débriefing`],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Type', key: 'type', width: 24 },
        { header: 'Détail', key: 'payload', width: 80 },
      ],
      rows: (decisions ?? []).map((d: Row) => ({
        round: num(d.round_number),
        type: str(d.decision_type),
        payload: JSON.stringify(d.payload),
      })),
    },
  ];

  const buffer = await buildWorkbook(`Atlas — ${team.teamName}`, sheets);

  await admin.from('exports_log').insert({
    session_id: team.sessionId, team_id: team.teamId,
    export_type: 'resultats_tour', requested_by: team.userId,
  });

  return xlsxResponse(buffer, safeFileName('atlas', 'resultats', team.teamName));
}

// ---------------------------------------------------------------------------

async function sessionExport(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string | undefined,
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (!sessionId) {
    return NextResponse.json({ error: 'Session non précisée.' }, { status: 400 });
  }

  const { data: session } = await admin
    .from('game_sessions').select('id, name, facilitator_id').eq('id', sessionId).maybeSingle();

  // Ce classeur contient les décisions de TOUTES les équipes : il n'est jamais
  // accessible à un joueur.
  if (!session || session.facilitator_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const { data: teams } = await admin
    .from('teams').select('id, name, pool_id, is_liquidated').eq('session_id', sessionId);
  const teamIds = (teams ?? []).map((t) => String(t.id));
  const teamName = new Map((teams ?? []).map((t) => [String(t.id), str(t.name)]));

  const { data: dasRows } = await admin
    .from('strategic_units').select('id, name, sector_key, bcg_stage').eq('session_id', sessionId);
  const dasName = new Map((dasRows ?? []).map((d) => [String(d.id), str(d.name)]));

  const ids = teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000'];
  const [{ data: metrics }, { data: pnls }, { data: alignments }, { data: decisions }, { data: orders }] =
    await Promise.all([
      admin.from('team_das_round_metrics').select('*').in('team_id', ids).order('round_number'),
      admin.from('pnl_statements').select('*').in('team_id', ids).order('round_number'),
      admin.from('alignment_scores').select('*').in('team_id', ids).order('round_number'),
      admin.from('decisions_log').select('*').in('team_id', ids).order('round_number'),
      admin.from('consulting_orders').select('*').in('team_id', ids).order('round_number'),
    ]);

  const { data: scorecards } = await admin
    .from('balanced_scorecards').select('*').in('team_id', ids);

  const sheets: SheetSpec[] = [
    {
      name: 'Classement',
      preamble: [
        `${session.name} — classement par pool, par DAS et par tour`,
        'Trié par part de marché décroissante.',
      ],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'DAS', key: 'das', width: 26 },
        { header: 'Score', key: 'score', format: 'score' },
        { header: 'Part de marché', key: 'share', format: 'pct', width: 16 },
        { header: 'Chiffre d’affaires', key: 'revenue', format: 'mad', width: 20 },
        { header: 'Résultat d’exploitation', key: 'ebitda', format: 'mad', width: 22 },
      ],
      rows: [...(metrics ?? [])]
        .sort((a, b) => num(a.round_number) - num(b.round_number) || num(b.market_share_pct) - num(a.market_share_pct))
        .map((m: Row) => ({
          round: num(m.round_number),
          team: teamName.get(str(m.team_id)) ?? '—',
          das: dasName.get(str(m.das_id)) ?? '—',
          score: r2(num(m.competitiveness_score) * 100),
          share: num(m.market_share_pct),
          revenue: Math.round(num(m.revenue_mad)),
          ebitda: Math.round(num(m.ebitda_mad)),
        })),
    },
    {
      name: 'KPI par tour',
      preamble: [`${session.name} — indicateurs détaillés de toutes les équipes`],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'DAS', key: 'das', width: 26 },
        { header: 'Qualité perçue', key: 'quality', format: 'score', width: 16 },
        { header: 'Notoriété', key: 'notoriety', format: 'score' },
        { header: 'Coût unitaire', key: 'cost', format: 'mad', width: 16 },
        { header: 'Prix unitaire', key: 'price', format: 'mad', width: 16 },
        { header: 'Taux de rupture', key: 'stockout', format: 'pct', width: 16 },
        { header: 'Stratégie réellement exécutée', key: 'fit', width: 28 },
      ],
      rows: (metrics ?? []).map((m: Row) => ({
        round: num(m.round_number),
        team: teamName.get(str(m.team_id)) ?? '—',
        das: dasName.get(str(m.das_id)) ?? '—',
        quality: r2(num(m.perceived_quality)),
        notoriety: r2(num(m.notoriety)),
        cost: r2(num(m.unit_variable_cost_mad)),
        price: r2(num(m.unit_price_mad)),
        stockout: num(m.stockout_rate),
        fit: str(m.best_fit_strategy, '—'),
      })),
    },
    {
      name: 'P&L consolidé',
      preamble: [`${session.name} — comptes de résultat de toutes les équipes`],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'Chiffre d’affaires', key: 'revenue', format: 'mad', width: 20 },
        { header: 'Résultat d’exploitation', key: 'ebitda', format: 'mad', width: 22 },
        { header: 'Résultat net', key: 'net', format: 'mad', width: 16 },
        { header: 'Trésorerie finale', key: 'treasury', format: 'mad', width: 18 },
        { header: 'Levier', key: 'leverage', format: 'score' },
      ],
      rows: (pnls ?? []).map((p: Row) => ({
        round: num(p.round_number),
        team: teamName.get(str(p.team_id)) ?? '—',
        revenue: Math.round(num(p.revenue_mad)),
        ebitda: Math.round(num(p.ebitda_mad)),
        net: Math.round(num(p.net_income_mad)),
        treasury: Math.round(num(p.treasury_end_mad)),
        leverage: r2(num(p.leverage_ratio)),
      })),
    },
    {
      name: 'Alignement',
      preamble: [
        `${session.name} — indices d'alignement`,
        'Colonne « Milieu de gué » : la position que Porter décrit comme la moins défendable.',
      ],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'SAB', key: 'sab', format: 'score' },
        { header: 'SAC', key: 'sac', format: 'score' },
        { header: 'SAT', key: 'sat', format: 'score' },
        { header: 'IA', key: 'ia', format: 'score' },
        { header: 'Milieu de gué', key: 'stuck', width: 16 },
        { header: 'Dérive', key: 'drift', width: 12 },
        { header: 'Pénalités déclenchées', key: 'penalties', width: 60 },
      ],
      rows: (alignments ?? []).map((a: Row) => ({
        round: num(a.round_number),
        team: teamName.get(str(a.team_id)) ?? '—',
        sab: r2(num(a.sab_global)),
        sac: r2(num(a.sac_score)),
        sat: r2(num(a.sat_score)),
        ia: r2(num(a.ia_final)),
        stuck: a.stuck_in_the_middle ? 'OUI' : 'non',
        drift: a.strategic_drift ? 'OUI' : 'non',
        penalties: Array.isArray(a.categorical_penalties)
          ? (a.categorical_penalties as { key: string; points: number }[])
              .map((p) => `${p.key} (${p.points})`).join(' · ')
          : '',
      })),
    },
    {
      name: 'Balanced Scorecard',
      preamble: [
        `${session.name} — tableau de bord prospectif`,
        'Calculé une seule fois, à la clôture. Les quatre axes pèsent à égalité.',
        '',
        'Les scores sont RELATIFS AU POOL : « bien gérer » n’a de sens que par comparaison',
        'avec ceux qui se disputaient le même marché. La normalisation part de 20, jamais de 0 —',
        'le dernier d’une ligue serrée n’a pas démérité.',
      ],
      columns: [
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'Financier', key: 'financial', format: 'score', width: 14 },
        { header: 'Client & marché', key: 'client', format: 'score', width: 18 },
        { header: 'Processus internes', key: 'process', format: 'score', width: 20 },
        { header: 'Apprentissage', key: 'learning', format: 'score', width: 16 },
        { header: 'Score global', key: 'global', format: 'score', width: 16 },
      ],
      rows: [...(scorecards ?? [])]
        .sort((a, b) => num(b.global_score) - num(a.global_score))
        .map((c: Row) => ({
          team: teamName.get(str(c.team_id)) ?? '—',
          financial: r2(num(c.financial_score)),
          client: r2(num(c.client_score)),
          process: r2(num(c.process_score)),
          learning: r2(num(c.learning_score)),
          global: r2(num(c.global_score)),
        })),
    },
    {
      name: 'Décisions',
      preamble: [`${session.name} — journal exhaustif, source de vérité du débriefing`],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'Type', key: 'type', width: 24 },
        { header: 'Détail', key: 'payload', width: 80 },
      ],
      rows: (decisions ?? []).map((d: Row) => ({
        round: num(d.round_number),
        team: teamName.get(str(d.team_id)) ?? '—',
        type: str(d.decision_type),
        payload: JSON.stringify(d.payload),
      })),
    },
    {
      name: 'Débriefing formateur',
      preamble: [
        `${session.name} — grille de débriefing`,
        'Un axe, un indicateur, une question à poser en salle.',
        '',
        'Le stade BCG de chaque DAS figure ici : il n’a JAMAIS été montré aux équipes,',
        'qui devaient le déduire elles-mêmes sur tableur.',
      ],
      columns: [
        { header: 'Sujet', key: 'topic', width: 30 },
        { header: 'Où regarder', key: 'where', width: 34 },
        { header: 'Question à poser', key: 'question', width: 80 },
      ],
      rows: [
        { topic: 'Cohérence stratégique', where: 'Onglet Alignement, colonne IA',
          question: 'Quelle équipe a le mieux tenu son cap ? Est-ce la même que celle qui a gagné des parts ?' },
        { topic: 'Milieu de gué', where: 'Onglet Alignement, colonne Milieu de gué',
          question: 'À quelle décision précise remonte l’incohérence ? Était-elle défendable sur le moment ?' },
        { topic: 'Dérive stratégique', where: 'Onglet Alignement, colonnes Déclaré / Exécuté',
          question: 'L’équipe savait-elle qu’elle jouait autre chose que ce qu’elle annonçait ?' },
        { topic: 'Volume contre marge', where: 'Onglet Classement, part de marché contre résultat d’exploitation',
          question: 'Qui a pris des parts ? Qui a gagné de l’argent ? Pourquoi pas les mêmes ?' },
        { topic: 'Courbe d’expérience', where: 'Onglet KPI, coût unitaire par tour',
          question: 'Le leader en volume a-t-il creusé son avantage de coût ? Les suiveurs pouvaient-ils rattraper ?' },
        { topic: 'Rupture d’approvisionnement', where: 'Onglet KPI, taux de rupture',
          question: 'Qui a choisi le fournisseur bon marché ? Avait-il acheté l’étude qui l’aurait prévenu ?' },
        { topic: 'La croissance consomme du cash', where: 'Onglet P&L, résultat net vs trésorerie',
          question: 'Une équipe a-t-elle été bénéficiaire et à court de trésorerie ? Comment l’expliquer ?' },
        { topic: 'Valeur de l’information', where: 'Onglet Études commandées',
          question: 'Qui a payé pour savoir ? Qui a joué à l’aveugle ? Qu’est-ce que ça a coûté ?' },
        { topic: 'Marché non servi', where: 'Table pool_round_summary',
          question: 'Combien de marché le pool a-t-il collectivement laissé sur la table, faute de distribution ?' },
        ...(dasRows ?? []).map((d: Row) => ({
          topic: `BCG — ${str(d.name)}`,
          where: 'Non communiqué aux équipes',
          question: `Stade réel : ${str(d.bcg_stage, '—')}. Les équipes l’avaient-elles correctement déduit ?`,
        })),
      ],
    },
    {
      name: 'Études commandées',
      preamble: [
        `${session.name} — qui a payé pour savoir`,
        'Le palier acheté détermine la précision reçue, et les signaux faibles omis.',
      ],
      columns: [
        { header: 'Tour', key: 'round' },
        { header: 'Équipe', key: 'team', width: 24 },
        { header: 'Étude', key: 'study', width: 26 },
        { header: 'Palier', key: 'tier', width: 16 },
        { header: 'Prix payé', key: 'price', format: 'mad', width: 16 },
        { header: 'Marge d’erreur', key: 'margin', format: 'pct', width: 16 },
      ],
      rows: (orders ?? []).map((o: Row) => ({
        round: num(o.round_number),
        team: teamName.get(str(o.team_id)) ?? '—',
        study: str(o.study_key),
        tier: str(o.tier),
        price: Math.round(num(o.price_paid_mad)),
        margin: num(o.error_margin),
      })),
    },
  ];

  const buffer = await buildWorkbook(`Atlas — ${session.name}`, sheets);

  await admin.from('exports_log').insert({
    session_id: sessionId, export_type: 'session_complete', requested_by: user.id,
  });

  return xlsxResponse(buffer, safeFileName('atlas', 'session', session.name, 'complet'));
}

// ---------------------------------------------------------------------------

/**
 * Dossier initial (T0) — ce que chaque équipe reçoit avant le premier tour.
 *
 * Il contient sa situation d'ouverture, le catalogue des domaines d'activité
 * et de leurs segments, l'annuaire de l'écosystème, et des TRAMES VIERGES de
 * matrices stratégiques.
 *
 * Les trames sont vides à dessein : Atlas fournit la donnée, l'analyse reste un
 * livrable étudiant (doc 00 §0). Le stade BCG d'un DAS n'est jamais communiqué —
 * c'est précisément ce que les équipes doivent déduire.
 */
async function openingDossierExport(admin: ReturnType<typeof createAdminClient>) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const [{ data: units }, { data: das }, { data: segments }, { data: actors }, { data: pnl }, { data: budget }] =
    await Promise.all([
      admin.from('team_units').select('das_id').eq('team_id', team.teamId),
      admin.from('strategic_units').select('id, name, sector_key').eq('session_id', team.sessionId).order('name'),
      admin.from('market_segments').select('das_id, segment_key, name'),
      admin.from('ecosystem_actors').select('id, name, actor_type, region_key, das_id')
        .eq('session_id', team.sessionId).in('actor_type', ['fournisseur', 'distributeur']),
      admin.from('pnl_statements').select('*').eq('team_id', team.teamId).eq('round_number', 0).maybeSingle(),
      admin.from('financial_budgets').select('*').eq('team_id', team.teamId).eq('round_number', 0).maybeSingle(),
    ]);

  const dasName = new Map((das ?? []).map((d) => [str(d.id), str(d.name)]));
  const ownDas = new Set((units ?? []).map((u) => str(u.das_id)));

  const sheets: SheetSpec[] = [
    {
      name: 'Situation d’ouverture',
      preamble: [
        `${team.teamName} — dossier initial`,
        'Votre situation au démarrage. Elle est STRICTEMENT identique à celle de vos concurrents :',
        'tout écart de fin de partie viendra de vos décisions, jamais de votre dotation.',
      ],
      columns: [
        { header: 'Poste', key: 'poste', width: 34 },
        { header: 'Valeur', key: 'valeur', format: 'mad', width: 22 },
      ],
      rows: [
        { poste: 'Trésorerie', valeur: Math.round(num(budget?.treasury_start_mad)) },
        { poste: 'Capitaux propres', valeur: Math.round(num(budget?.equity_mad)) },
        { poste: 'Dette existante', valeur: Math.round(num(budget?.debt_outstanding_mad)) },
        { poste: 'Besoin en fonds de roulement', valeur: Math.round(num(pnl?.working_capital_mad)) },
        { poste: 'Chiffre d’affaires de référence', valeur: Math.round(num(pnl?.revenue_mad)) },
      ],
    },
    {
      name: 'Domaines d’activité',
      preamble: [
        'Les domaines ouverts dans cette session, et leurs segments.',
        'Ni la taille de marché ni le stade BCG ne figurent ici : ils s’achètent au cabinet,',
        'ou se déduisent — c’est le travail que l’on attend de vous.',
      ],
      columns: [
        { header: 'Domaine', key: 'das', width: 30 },
        { header: 'Segment', key: 'segment', width: 32 },
        { header: 'Dans votre portefeuille', key: 'mien', width: 22 },
      ],
      rows: (segments ?? []).map((s: Row) => ({
        das: dasName.get(str(s.das_id)) ?? '—',
        segment: str(s.name),
        mien: ownDas.has(str(s.das_id)) ? 'OUI' : 'non',
      })),
    },
    {
      name: 'Écosystème',
      preamble: [
        'Les fournisseurs et distributeurs présents sur chaque domaine.',
        'Leurs capacités, fiabilités et marges exigées ne sont PAS communiquées :',
        'elles font l’objet des benchmarks du cabinet.',
      ],
      columns: [
        { header: 'Domaine', key: 'das', width: 30 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Raison sociale', key: 'nom', width: 32 },
        { header: 'Région', key: 'region', width: 28 },
      ],
      rows: (actors ?? []).map((a: Row) => ({
        das: dasName.get(str(a.das_id)) ?? '—',
        type: str(a.actor_type) === 'fournisseur' ? 'Fournisseur' : 'Distributeur',
        nom: str(a.name),
        region: str(a.region_key).replace(/_/g, ' '),
      })),
    },
    {
      name: 'Trame BCG',
      preamble: [
        'Matrice BCG — à construire par vos soins.',
        '',
        'Croissance du marché et part relative se déduisent des études sectorielles et',
        'concurrentielles. Atlas ne vous donnera jamais le stade d’un domaine : le déduire EST',
        'l’exercice.',
      ],
      columns: [
        { header: 'Domaine', key: 'das', width: 30 },
        { header: 'Croissance du marché (%)', key: 'croissance', width: 24 },
        { header: 'Part de marché relative', key: 'part', width: 24 },
        { header: 'Stade déduit', key: 'stade', width: 22 },
        { header: 'Décision de portefeuille', key: 'decision', width: 34 },
      ],
      rows: (das ?? []).map((d: Row) => ({
        das: str(d.name), croissance: null, part: null, stade: null, decision: null,
      })),
    },
    {
      name: 'Trame PESTEL',
      preamble: ['Analyse PESTEL — à construire à partir des études sectorielles.'],
      columns: [
        { header: 'Dimension', key: 'dim', width: 20 },
        { header: 'Facteur identifié', key: 'facteur', width: 44 },
        { header: 'Opportunité ou menace', key: 'nature', width: 24 },
        { header: 'Réponse envisagée', key: 'reponse', width: 44 },
      ],
      rows: ['Politique', 'Économique', 'Socioculturel', 'Technologique', 'Écologique', 'Légal']
        .flatMap((dim) => [1, 2, 3].map(() => ({ dim, facteur: null, nature: null, reponse: null }))),
    },
    {
      name: 'Trame 5 forces',
      preamble: [
        'Les cinq forces de Porter — à construire à partir de l’étude concurrentielle',
        'et des benchmarks fournisseurs et distributeurs.',
      ],
      columns: [
        { header: 'Force', key: 'force', width: 34 },
        { header: 'Intensité estimée', key: 'intensite', width: 20 },
        { header: 'Sur quoi vous vous appuyez', key: 'preuve', width: 48 },
        { header: 'Contre-mesure', key: 'contre', width: 40 },
      ],
      rows: [
        'Pouvoir de négociation des fournisseurs',
        'Pouvoir de négociation des distributeurs',
        'Menace des nouveaux entrants',
        'Menace des produits de substitution',
        'Intensité de la rivalité interne',
      ].map((force) => ({ force, intensite: null, preuve: null, contre: null })),
    },
  ];

  const buffer = await buildWorkbook(`Atlas — dossier initial ${team.teamName}`, sheets);

  await admin.from('exports_log').insert({
    session_id: team.sessionId, team_id: team.teamId, round_number: 0,
    export_type: 'dossier_initial', requested_by: team.userId,
  });

  return xlsxResponse(buffer, safeFileName('atlas', 'dossier_initial', team.teamName));
}

// ---------------------------------------------------------------------------

/**
 * Cahier du protocole de test d'utilisabilité — préparation, observations de
 * terrain et questionnaire SUS du panel, en un classeur remis au facilitateur
 * pour son débriefing. Contrôle d'accès identique à `session_complete` :
 * ce document contient les notes qualitatives de la session, jamais montrées
 * aux participants.
 */
async function uxProtocolExport(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string | undefined,
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (!sessionId) {
    return NextResponse.json({ error: 'Session non précisée.' }, { status: 400 });
  }

  const { data: session } = await admin
    .from('game_sessions').select('id, name, facilitator_id').eq('id', sessionId).maybeSingle();

  if (!session || session.facilitator_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  const [{ data: notes }, sus] = await Promise.all([
    admin.from('ux_protocol_notes').select('data').eq('session_id', sessionId).maybeSingle(),
    loadSusAggregate(sessionId),
  ]);

  const d = (notes?.data ?? {}) as Record<string, unknown>;
  const debrief = (d.debrief ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(d.tasks) ? (d.tasks as unknown[]).map((t) => str(t)) : [];

  const sheets: SheetSpec[] = [
    {
      name: 'Cahier de session',
      preamble: [
        `${session.name} — protocole de test d'utilisabilité`,
        `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      ],
      columns: [
        { header: 'Rubrique', key: 'label', width: 30 },
        { header: 'Contenu', key: 'value', width: 90 },
      ],
      rows: [
        { label: 'Facilitateur', value: str(d.facilitator, '—') },
        { label: 'Email', value: str(d.email, '—') },
        { label: 'Date de la session', value: str(d.date, '—') },
        { label: 'Lieu', value: str(d.location, '—') },
        { label: 'Profil des participants', value: str(d.profile, '—') },
        ...tasks.map((t, i) => ({ label: `Tâche ${i + 1}`, value: t })),
        { label: 'Durée observée', value: str(d.duration, '—') },
        { label: 'Observations en direct', value: str(d.observations, '—') },
        { label: 'Points de friction', value: str(d.friction, '—') },
        { label: 'Moments de succès', value: str(d.success, '—') },
        { label: '— Débriefing qualitatif —', value: '' },
        { label: '1. Impression générale', value: str(debrief.q1, '—') },
        { label: '2. Points de confusion', value: str(debrief.q2, '—') },
        { label: '3. Points positifs', value: str(debrief.q3, '—') },
        { label: '4. Changement principal', value: str(debrief.q4, '—') },
      ],
    },
    {
      name: 'Questionnaire SUS',
      preamble: [
        `${session.name} — System Usability Scale (Brooke, 1996)`,
        'Le score individuel n’a pas de valeur isolée : seule la moyenne du panel s’interprète.',
        sus.average !== null
          ? `Moyenne du panel : ${sus.average} / 100, sur ${sus.count} réponse(s).`
          : 'Aucune réponse reçue.',
      ],
      columns: [
        { header: 'Participant', key: 'label', width: 22 },
        { header: 'Score SUS', key: 'score', format: 'score', width: 14 },
        { header: 'Commentaire', key: 'comment', width: 80 },
        { header: 'Répondu le', key: 'date', width: 20 },
      ],
      rows: sus.responses.map((r) => ({
        label: r.label,
        score: r.score,
        comment: r.comment || '—',
        date: new Date(r.createdAt).toLocaleString('fr-FR'),
      })),
    },
  ];

  const buffer = await buildWorkbook(`Atlas — protocole UX ${session.name}`, sheets);

  await admin.from('exports_log').insert({
    session_id: sessionId, export_type: 'ux_protocol', requested_by: user.id,
  });

  return xlsxResponse(buffer, safeFileName('atlas', 'protocole_ux', session.name));
}

// ---------------------------------------------------------------------------

function xlsxResponse(buffer: ArrayBuffer, filename: string): Response {
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
