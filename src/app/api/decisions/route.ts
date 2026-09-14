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

import { debtCapacity } from '@/lib/engine/finance';
import { buildParams } from '@/lib/engine/params';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import type { EnabledModules } from '@/lib/modules-state';
import {
  ModuleClosedError,
  enforceCorporate,
  enforceDas,
  enforceFinance,
  requireOpen,
} from '@/lib/server/module-enforcement';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadVariationScales } from '@/lib/server/variation-scales';
import type { VariationBasis } from '@/lib/variation-references';
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
    /**
     * Crédit NET du tour : positif on tire, négatif on rembourse.
     *
     * Un seul curseur, parce qu'il n'y a qu'une seule décision — on ne tire
     * pas et ne rembourse pas le même tour. Les deux champs séparés laissaient
     * saisir les deux, et il fallait alors deviner ce que l'équipe voulait
     * dire. Les bornes sont posées plus bas, contre la capacité d'endettement.
     */
    netCreditMad: z.number().finite(),
    capitalRaisedMad: money,
    dividendMad: money,
    /**
     * Cash pooling : un montant SIGNÉ par domaine, de somme nulle.
     *
     * C'est un transfert, pas une création de monnaie. Le serveur ne corrige
     * pas un déséquilibre en silence — il refuse, parce qu'une équipe qui
     * croit avoir déplacé un milliard et n'en a déplacé que la moitié prendra
     * ses décisions suivantes sur une trésorerie qu'elle n'a pas.
     */
    cashTransfers: z
      .array(z.object({ dasId: z.string().uuid(), transferMad: z.number().finite() }))
      .max(8)
      .optional(),
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

  // Un bloc masqué dans l'interface n'est pas protégé pour autant : cette
  // route est joignable par POST direct. Les champs fermés sont ramenés à leur
  // valeur du tour précédent AVANT toute écriture.
  const [modules, scales] = await Promise.all([
    loadEnabledModules(team.sessionId),
    loadVariationScales(team.sessionId),
  ]);
  const basis = await loadBasis(admin, team.teamId, roundNumber);
  let body: Body;
  try {
    body = await enforce(admin, team.teamId, roundNumber, parsed.data, modules, {
      scales,
      basis,
    });
  } catch (error) {
    if (error instanceof ModuleClosedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  try {
    await write(admin, team.teamId, roundNumber, body);
  } catch (error) {
    // Un transfert déséquilibré est un refus métier, pas une panne : l'équipe
    // doit lire ce qui manque, et non « erreur serveur ».
    if (error instanceof RefusMetier) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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

/**
 * Les grandeurs de dotation, pour les champs sans tour précédent exploitable.
 *
 * Deux lignes lues sur le dernier exercice clos : la trésorerie, assiette de
 * tout engagement, et la masse salariale, sur laquelle se dimensionne le siège.
 * Sans cette seconde, le repli des frais de siège valait zéro ici et le clamp
 * serveur laissait passer n'importe quel montant. Les autres grandeurs ne
 * servent qu'aux écrans d'organisation, dont les écritures passent par une
 * autre route.
 */
async function loadBasis(
  admin: Admin,
  teamId: string,
  round: number,
): Promise<VariationBasis> {
  const { data } = await admin
    .from('pnl_statements')
    .select('treasury_end_mad, payroll_mad')
    .eq('team_id', teamId)
    .eq('round_number', round - 1)
    .maybeSingle();

  const treasuryMad = Number(data?.treasury_end_mad ?? 0);
  return {
    treasuryMad,
    payrollMad: Number(data?.payroll_mad ?? 0),
    headcount: 0,
    smigMad: 0,
    operatingBudgetMad: 0,
    directionCount: 0,
  };
}

/** Neutralise les champs fermés, refuse les blocs fermés, borne les montants. */
async function enforce(
  admin: Admin,
  teamId: string,
  round: number,
  body: Body,
  modules: EnabledModules,
  limits: { scales: Awaited<ReturnType<typeof loadVariationScales>>; basis: VariationBasis },
): Promise<Body> {
  if (body.plan === 'corporate') {
    return enforceCorporate(admin, teamId, round, body, modules);
  }
  if (body.plan === 'das') {
    return enforceDas(admin, teamId, body.dasId, round, body, modules, limits);
  }
  if (body.plan === 'finance') {
    return enforceFinance(admin, teamId, round, body, modules, limits);
  }
  if (body.plan === 'procurement') {
    requireOpen(modules, 'marches.procurement', 'Contrats fournisseurs');
    return body;
  }
  requireOpen(modules, 'marches.distribution', 'Contrats distributeurs');
  return body;
}

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


  // ── Le bilan d'ouverture ne se saisit pas : il se lit ────────────────────
  //
  // Le moteur l'arrête à la clôture du tour précédent et l'écrit lui-même. Ici
  // on ne fait que le recopier lors de la CRÉATION de la ligne, pour satisfaire
  // les colonnes obligatoires — jamais lors d'une mise à jour, sans quoi une
  // deuxième saisie écraserait le bilan calculé par une valeur périmée.
  const { data: budgets } = await admin
    .from('financial_budgets')
    .select('round_number, treasury_start_mad, equity_mad, debt_outstanding_mad')
    .eq('team_id', teamId)
    .lte('round_number', round)
    .order('round_number');

  const rows = budgets ?? [];
  const existing = rows.find((b) => Number(b.round_number) === round) ?? null;
  const opening = rows[rows.length - 1] ?? null;

  const equityMad = Number(opening?.equity_mad ?? 0);
  // Plancher à zéro, comme à l'écran : avec une dette négative, la borne
  // « on ne rembourse pas plus qu'on ne doit » devenait une borne POSITIVE, et
  // aucun tirage ne passait plus.
  const debtMad = Math.max(Number(opening?.debt_outstanding_mad ?? 0), 0);

  // ── Bornes du crédit ────────────────────────────────────────────────────
  //
  // On peut tout rembourser — mais pas plus que ce qu'on doit — et tirer
  // jusqu'à la capacité d'endettement restante, telle que la banque la voit :
  // le plus contraignant du gearing et de la capacité de remboursement.
  const { data: lastPnl } = await admin
    .from('pnl_statements')
    .select('revenue_mad, net_income_mad, treasury_end_mad')
    .eq('team_id', teamId)
    .lt('round_number', round)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const capacity = debtCapacity(
    equityMad,
    Number(lastPnl?.revenue_mad ?? 0),
    debtMad,
    buildParams(),
  );

  const netCredit = Math.min(Math.max(body.netCreditMad, -debtMad), capacity.availableMad);
  const drawnMad = Math.max(netCredit, 0);
  const repaidMad = Math.max(-netCredit, 0);

  // Un dividende se vote sur l'exercice CLOS : on ne distribue pas un résultat
  // qui n'est pas encore calculé, et on ne distribue pas une perte.
  const dividendMad = Math.min(body.dividendMad, Math.max(Number(lastPnl?.net_income_mad ?? 0), 0));

  const decisions = {
    opex_mad: body.opexMad,
    debt_drawn_mad: drawnMad,
    debt_repaid_mad: repaidMad,
    capital_raised_mad: body.capitalRaisedMad,
    dividend_mad: dividendMad,
  };

  // Absent de la requête : on ne touche à rien. Présent, même vide : c'est la
  // répartition du tour, qui remplace la précédente.
  if (body.cashTransfers) await writeCashPooling(admin, teamId, round, body.cashTransfers);

  if (existing) {
    fail((await admin.from('financial_budgets').update(decisions)
      .eq('team_id', teamId).eq('round_number', round)).error);
    return;
  }

  fail((await admin.from('financial_budgets').insert({
    team_id: teamId, round_number: round,
    ...decisions,
    treasury_start_mad: Number(
      lastPnl?.treasury_end_mad ?? opening?.treasury_start_mad ?? 0,
    ),
    equity_mad: equityMad,
    debt_outstanding_mad: debtMad,
  })).error);
}

/** Un refus MÉTIER, à distinguer d'une panne : il porte son propre code. */
class RefusMetier extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Le cash pooling : un transfert entre domaines, donc de somme nulle.
 *
 * Le déséquilibre est refusé et non rattrapé : c'est la seule façon que
 * l'équipe sache ce qu'elle a réellement déplacé. Une tolérance d'un dirham
 * absorbe les arrondis de l'interface, rien de plus.
 */
async function writeCashPooling(
  admin: Admin,
  teamId: string,
  round: number,
  transfers: { dasId: string; transferMad: number }[],
): Promise<void> {
  const total = transfers.reduce((acc, t) => acc + t.transferMad, 0);
  if (Math.abs(total) > 1) {
    throw new RefusMetier(
      `Les transferts entre domaines doivent s’équilibrer : il manque ${Math.round(-total)} DH.`,
      409,
    );
  }

  // Les domaines doivent appartenir au portefeuille ACTIF de l'équipe : sans
  // ce contrôle, un identifiant emprunté ferait créditer le domaine d'une autre.
  const { data: units } = await admin
    .from('team_units')
    .select('das_id')
    .eq('team_id', teamId)
    .in('status', ['active', 'listed_for_sale']);

  const mine = new Set((units ?? []).map((u) => String(u.das_id)));
  const rows = transfers
    .filter((t) => mine.has(t.dasId))
    .map((t) => ({
      team_id: teamId,
      das_id: t.dasId,
      round_number: round,
      transfer_mad: t.transferMad,
    }));

  // Revenir à la référence doit EFFACER les transferts : un simple upsert
  // laissait en base ceux qu'on venait de retirer, et le moteur les appliquait.
  const { error: clearError } = await admin
    .from('das_cash_allocation')
    .delete()
    .eq('team_id', teamId)
    .eq('round_number', round);
  if (clearError) throw new Error(`Transferts refusés : ${clearError.message}`);

  if (rows.length === 0) return;

  const { error } = await admin
    .from('das_cash_allocation')
    .upsert(rows, { onConflict: 'team_id,das_id,round_number' });

  if (error) throw new Error(`Transferts refusés : ${error.message}`);
}
