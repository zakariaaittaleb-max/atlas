/**
 * Saisie des décisions — les sept plans du cahier (doc 00 §3).
 *
 * Un seul point d'entrée pour toutes les tables de décision : c'est ce qui
 * permet à l'auto-sauvegarde côté client de n'avoir qu'un seul contrat à
 * connaître, et de rejouer sa file d'attente sans logique par formulaire.
 *
 * Trois contrôles systématiques, dans cet ordre :
 *   1. l'appelant appartient bien à une équipe (les Server Functions et Route
 *      Handlers sont joignables par POST direct, jamais seulement via l'écran) ;
 *   2. le tour accepte encore des écritures — un tour verrouillé n'en accepte
 *      plus AUCUNE, sinon le calcul à somme nulle porterait sur un état qui
 *      bouge pendant qu'on le lit ;
 *   3. la charge utile est validée par Zod, et l'équipe est imposée par le
 *      serveur — jamais lue dans le corps de la requête.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

const VALUES = [
  'excellence_produit', 'innovation', 'proximite_client', 'accessibilite_prix',
  'efficience_operationnelle', 'responsabilite_sociale', 'ancrage_territorial', 'fiabilite_service',
] as const;

/**
 * Un montant en dirhams, tel qu'il entre en base.
 *
 * ── POURQUOI L'ARRONDI EST ICI, ET PAS DANS L'ÉCRAN ────────────────────────
 * La colonne est un `numeric` : elle accepte sans broncher
 * `578444444.4444445`, et c'est bien ce qu'elle contenait. Une fraction de
 * centime de dirham ne veut rien dire — ni pour l'équipe, ni pour le moteur,
 * ni pour l'export comptable — et elle ressort telle quelle partout où on la
 * relit, y compris dans un champ de saisie.
 *
 * Arrondir à l'AFFICHAGE ne réglerait que l'écran où l'on a vu le défaut : la
 * valeur sale resterait en base et reparaîtrait au prochain endroit qui la
 * lit. La frontière d'écriture est le seul point que TOUS les chemins
 * traversent — saisie, reconduction d'un tour à l'autre, import.
 */
const money = z.number().min(0).finite().transform(Math.round);

const Payload = z.discriminatedUnion('plan', [
  // Plan 1 & 6 — portefeuille corporate, structure, centralisation, valeurs.
  z.object({
    plan: z.literal('corporate'),
    corporateStrategy: z.enum(['specialisation', 'integration_verticale', 'diversification_liee', 'diversification_conglomerale']),
    structureType: z.enum(['fonctionnelle', 'divisionnelle', 'matricielle']),
    centralPurchasing: z.boolean(),
    centralIt: z.boolean(),
    centralRd: z.boolean(),
    centralHr: z.boolean(),
    centralFinance: z.boolean(),
    sharedProduction: z.boolean(),
    sharedRd: z.boolean(),
    value1: z.enum(VALUES),
    value2: z.enum(VALUES),
    // Énoncés du GROUPE, pendants de ceux de chaque DAS. Jamais notés
    // numériquement, pas plus ici qu'au niveau DAS : ils cadrent le
    // débriefing, et ce sont les valeurs qui pèsent sur le calcul.
    vision: z.string().max(600).nullable().optional(),
    mission: z.string().max(600).nullable().optional(),
  }).refine((d) => d.value1 !== d.value2, {
    message: 'Les deux valeurs communiquées doivent être distinctes.',
    path: ['value2'],
  }),

  // Plans 2 & 3 — stratégie générique, prix, segments, investissements du DAS.
  z.object({
    plan: z.literal('das'),
    dasId: z.string().uuid(),
    genericStrategy: z.enum(['domination_couts', 'differenciation', 'focus_couts', 'focus_differenciation']),
    pricePosition: z.number().min(0).max(100),
    servedSegments: z.array(z.string().min(1)).min(1),
    capexCapacityMad: money,
    capexAutomationMad: money,
    capexOwnNetworkMad: money,
    rdBudgetMad: money,
    marketingBudgetMad: money,
    declareBlueOcean: z.boolean(),
  }),

  // Plan 4 — achats. La liste REMPLACE l'existante : un contrat retiré de
  // l'écran doit disparaître de la base, pas y survivre silencieusement.
  z.object({
    plan: z.literal('procurement'),
    dasId: z.string().uuid(),
    lines: z.array(z.object({
      supplierId: z.string().uuid(),
      committedVolume: z.number().min(0).finite().transform(Math.round),
    })).max(5),
  }),

  // Plan 5 — distribution. Idem : remplacement intégral.
  z.object({
    plan: z.literal('distribution'),
    dasId: z.string().uuid(),
    lines: z.array(z.object({
      distributorId: z.string().uuid(),
      volumeShare: z.number().min(0).max(1),
    })).max(4),
  }).refine(
    (d) => d.lines.reduce((acc, l) => acc + l.volumeShare, 0) <= 1.0001,
    { message: 'La somme des parts de volume confiées ne peut pas dépasser 100 %.', path: ['lines'] },
  ),

  // Plan 6 — ressources humaines : DÉPLACÉ vers `/api/organisation`, bloc `hr`.
  // Le recrutement se saisit domaine par domaine ; ce point d'entrée ne
  // l'accepte plus. Voir le refus explicite au début du POST.

  // Plan 7 — finance.
  z.object({
    plan: z.literal('finance'),
    opexMad: money,
    debtDrawnMad: money,
    debtRepaidMad: money,
    taxRegime: z.enum(['droit_commun', 'cfc_zai', 'banque_assurance']),
  }),
]);

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (team.isLiquidated) {
    return NextResponse.json({ error: 'Votre équipe est en liquidation.' }, { status: 409 });
  }

  const raw: unknown = await request.json().catch(() => null);

  // Saisie RH de niveau groupe : plus produite par aucun écran depuis que le
  // recrutement se décide domaine par domaine. Elle est refusée AVANT l'analyse
  // — le plan ne figure plus dans le schéma, et un message générique
  // « saisie invalide » n'apprendrait rien à une équipe dont le poste rejoue
  // une file d'auto-sauvegarde vieille d'un déploiement.
  //
  // 400 et non 500 : la file traite le 400 comme définitif et retire
  // l'écriture, là où un 500 la ferait réessayer indéfiniment.
  if (typeof raw === 'object' && raw !== null && (raw as { plan?: unknown }).plan === 'hr') {
    return NextResponse.json(
      {
        error:
          'Le recrutement se saisit maintenant domaine par domaine, dans l’écran '
          + 'Organisation. Cette saisie n’a pas été reprise.',
      },
      { status: 400 },
    );
  }

  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Saisie invalide.' },
      { status: 400 },
    );
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : plus aucune saisie n’est acceptée.', locked: true },
      { status: 409 },
    );
  }

  const roundNumber = (round?.current_round as number) ?? 0;
  const admin = createAdminClient();
  const body = parsed.data;

  try {
    await write(admin, team.teamId, roundNumber, body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Écriture refusée.' },
      { status: 500 },
    );
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId,
    round_number: roundNumber,
    decision_type: body.plan,
    payload: body,
    decided_by: team.userId,
  });

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

type Admin = ReturnType<typeof createAdminClient>;
type Body = z.infer<typeof Payload>;

async function write(admin: Admin, teamId: string, round: number, body: Body): Promise<void> {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  if (body.plan === 'corporate') {
    fail((await admin.from('team_round_strategy').upsert({
      team_id: teamId, round_number: round,
      corporate_strategy: body.corporateStrategy,
      structure_type: body.structureType,
      central_purchasing: body.centralPurchasing,
      central_it: body.centralIt,
      central_rd: body.centralRd,
      central_hr: body.centralHr,
      central_finance: body.centralFinance,
      shared_production: body.sharedProduction,
      shared_rd: body.sharedRd,
      value_1: body.value1, value_2: body.value2,
      vision: body.vision ?? null, mission: body.mission ?? null,
    }, { onConflict: 'team_id,round_number' })).error);
    return;
  }

  if (body.plan === 'das') {
    fail((await admin.from('das_decisions').upsert({
      team_id: teamId, das_id: body.dasId, round_number: round,
      generic_strategy: body.genericStrategy,
      price_position: body.pricePosition,
      served_segments: body.servedSegments,
      capex_capacity_mad: body.capexCapacityMad,
      capex_automation_mad: body.capexAutomationMad,
      capex_own_network_mad: body.capexOwnNetworkMad,
      rd_budget_mad: body.rdBudgetMad,
      marketing_budget_mad: body.marketingBudgetMad,
      declare_blue_ocean: body.declareBlueOcean,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id,das_id,round_number' })).error);
    return;
  }

  // Achats et distribution : REMPLACEMENT INTÉGRAL de la liste. Un contrat
  // retiré de l'écran doit disparaître de la base — un `upsert` seul l'y
  // laisserait, et le moteur l'appliquerait quand même au tour suivant.
  //
  // Les deux branches sont séparées plutôt que factorisées : leurs lignes n'ont
  // pas les mêmes colonnes, et une union de formes empêche le client Supabase
  // de les typer.
  if (body.plan === 'procurement') {
    fail((await admin.from('procurement_contracts').delete()
      .eq('team_id', teamId).eq('das_id', body.dasId).eq('round_number', round)).error);

    if (body.lines.length === 0) return;

    fail((await admin.from('procurement_contracts').insert(
      body.lines.map((l) => ({
        team_id: teamId, das_id: body.dasId, round_number: round,
        supplier_id: l.supplierId, committed_volume: l.committedVolume,
      })),
    )).error);
    return;
  }

  if (body.plan === 'distribution') {
    fail((await admin.from('distribution_contracts').delete()
      .eq('team_id', teamId).eq('das_id', body.dasId).eq('round_number', round)).error);

    if (body.lines.length === 0) return;

    fail((await admin.from('distribution_contracts').insert(
      body.lines.map((l) => ({
        team_id: teamId, das_id: body.dasId, round_number: round,
        distributor_id: l.distributorId, volume_share: l.volumeShare,
      })),
    )).error);
    return;
  }


  // Plan finance : trésorerie, capitaux propres et dette sont REPRIS du tour
  // précédent, jamais saisis — une équipe ne décide pas de son bilan d'ouverture.
  const [{ data: pnl }, { data: previousBudget }] = await Promise.all([
    admin.from('pnl_statements').select('treasury_end_mad')
      .eq('team_id', teamId).eq('round_number', round - 1).maybeSingle(),
    admin.from('financial_budgets').select('equity_mad, debt_outstanding_mad')
      .eq('team_id', teamId).eq('round_number', round - 1).maybeSingle(),
  ]);

  fail((await admin.from('financial_budgets').upsert({
    team_id: teamId, round_number: round,
    opex_mad: body.opexMad,
    debt_drawn_mad: body.debtDrawnMad,
    debt_repaid_mad: body.debtRepaidMad,
    tax_regime: body.taxRegime,
    treasury_start_mad: Number(pnl?.treasury_end_mad ?? 0),
    equity_mad: Number(previousBudget?.equity_mad ?? 0),
    debt_outstanding_mad:
      Number(previousBudget?.debt_outstanding_mad ?? 0) + body.debtDrawnMad - body.debtRepaidMad,
  }, { onConflict: 'team_id,round_number' })).error);
}
