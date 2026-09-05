/**
 * Conception organisationnelle d'un DAS.
 *
 * Cinq gestes distincts, parce qu'ils se prennent à des moments différents et
 * qu'une auto-sauvegarde par bloc évite de réécrire tout l'organigramme quand
 * on déplace un curseur.
 *
 * ── UN POINT DE MODÈLE ─────────────────────────────────────────────────────
 * L'organisation PERSISTE d'un exercice à l'autre. Écrire au tour N crée une
 * conception qui supplante celle du tour N−1 ; ne rien écrire, c'est conserver
 * la structure de l'an dernier. C'est le comportement d'une vraie entreprise,
 * et c'est aussi ce qui évite qu'une équipe passive soit notée comme une équipe
 * incohérente.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { refreshHrRollup } from '@/lib/server/hr-rollup';
import { createAdminClient } from '@/lib/supabase/server';

const Payload = z.discriminatedUnion('block', [
  z.object({
    // La conception d'un domaine se réduit à son DEGRÉ DE DÉLÉGATION.
    //
    // La forme de structure et le couple vision/mission ont été retirés d'ici :
    // ils étaient saisis une seconde fois au niveau Groupe, sur `/strategie`.
    // La forme de structure est une décision d'architecture d'entreprise — le
    // moteur la juge d'ailleurs en la comparant au NOMBRE de domaines, ce qui
    // n'a de sens qu'au niveau du groupe — et la version par domaine n'était
    // lue par aucun calcul. Voir la migration 0017.
    block: z.literal('design'),
    dasId: z.string().uuid(),
    delegationLevel: z.number().int().min(0).max(100),
  }),
  z.object({
    block: z.literal('axes'),
    dasId: z.string().uuid(),
    // Exactement trois, ordonnés. Choisir trois priorités n'est un arbitrage
    // que si l'on doit en écarter d'autres.
    axisKeys: z.array(z.string().min(1)).length(3),
  }),
  z.object({
    block: z.literal('budgets'),
    dasId: z.string().uuid(),
    budgets: z.array(z.object({
      directionKey: z.string().min(1),
      budgetMad: z.number().min(0).finite().transform(Math.round),
    })).max(12),
  }),
  z.object({
    block: z.literal('kpis'),
    dasId: z.string().uuid(),
    kpis: z.array(z.object({
      directionKey: z.string().min(1),
      kpiKey: z.string().min(1),
      targetValue: z.number().finite().nullable(),
    })).max(12),
  }),
  z.object({
    // Déclinaison des directives du groupe par ce DAS : le rôle qui lui est
    // assigné et les fonctions qu'il délègue effectivement au siège.
    block: z.literal('directives'),
    dasId: z.string().uuid(),
    portfolioRole: z.enum(['moteur', 'relais', 'soutien', 'reserve']),
    ansoffMovement: z.enum([
      'penetration', 'developpement_marche', 'developpement_produit', 'diversification',
    ]),
    hqPurchasing: z.boolean(),
    hqIt: z.boolean(),
    hqRd: z.boolean(),
    hqHr: z.boolean(),
    hqFinance: z.boolean(),
  }),
  z.object({
    // Adhésion de ce DAS aux ressources que le groupe a ouvertes.
    block: z.literal('mutualisation'),
    dasId: z.string().uuid(),
    resources: z.array(z.object({
      resourceKey: z.string().min(1),
      adoptionLevel: z.number().int().min(0).max(100),
      standardised: z.boolean(),
    })).max(8),
  }),
  z.object({
    // Ressources humaines de CE DAS. Une conserverie et une société de
    // services n'ont ni la même pyramide ni la même sensibilité à la formation.
    block: z.literal('hr'),
    dasId: z.string().uuid(),
    hireOperateurs: z.number().int().min(0).max(100000),
    hireTechniciens: z.number().int().min(0).max(100000),
    hireExperts: z.number().int().min(0).max(100000),
    hireCadres: z.number().int().min(0).max(100000),
    layoffs: z.number().int().min(0).max(100000),
    internalTransfersIn: z.number().int().min(0).max(100000),
    avgSalaryBrutMad: z.number().min(0).finite().transform(Math.round),
    trainingBudgetMad: z.number().min(0).finite().transform(Math.round),
    trainingFocus: z.enum(['technique', 'management', 'qualite', 'polyvalence']),
    claimOfppt: z.boolean(),
    claimGiac: z.boolean(),
    orderSkillsAudit: z.boolean(),
    restructuring: z.enum([
      'aucune', 'reorganisation', 'externalisation', 'fermeture_site',
    ]),
  }),
  z.object({
    block: z.literal('positions'),
    dasId: z.string().uuid(),
    positions: z.array(z.object({
      directionKey: z.string().min(1),
      title: z.string().trim().min(1).max(120),
      hierarchyLevel: z.number().int().min(1).max(4),
      headcount: z.number().int().min(0),
      budgetMad: z.number().min(0).finite().transform(Math.round),
      isKeyPosition: z.boolean(),
    })).max(40),
  }),
]);

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  if (team.isLiquidated) {
    return NextResponse.json({ error: 'Votre équipe est en liquidation.' }, { status: 409 });
  }

  const parsed = Payload.safeParse(await request.json().catch(() => null));
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
  const scope = { team_id: team.teamId, das_id: body.dasId, round_number: roundNumber };

  try {
    // Écrire un bloc quelconque matérialise la conception de CE tour. Sans
    // cette ligne, les axes ou budgets saisis resteraient orphelins et le
    // chargeur continuerait de lire la conception de l'an dernier.
    await ensureDesign(admin, scope, body);

    switch (body.block) {
      case 'design':
        break; // déjà écrit par `ensureDesign`

      case 'axes': {
        // Remplacement intégral : un axe retiré de l'écran doit disparaître.
        await admin.from('das_strategic_axes').delete().match(scope);
        const { error } = await admin.from('das_strategic_axes').insert(
          body.axisKeys.map((axis_key, i) => ({ ...scope, axis_key, priority: i + 1 })),
        );
        if (error) throw new Error(error.message);
        break;
      }

      case 'budgets': {
        await admin.from('das_direction_budgets').delete().match(scope);
        if (body.budgets.length > 0) {
          const { error } = await admin.from('das_direction_budgets').insert(
            body.budgets.map((b) => ({
              ...scope, direction_key: b.directionKey, budget_mad: b.budgetMad,
            })),
          );
          if (error) throw new Error(error.message);
        }
        break;
      }

      case 'kpis': {
        await admin.from('das_direction_kpis').delete().match(scope);
        if (body.kpis.length > 0) {
          const { error } = await admin.from('das_direction_kpis').insert(
            body.kpis.map((k) => ({
              ...scope, direction_key: k.directionKey,
              kpi_key: k.kpiKey, target_value: k.targetValue,
            })),
          );
          if (error) throw new Error(error.message);
        }
        break;
      }

      case 'directives': {
        const { error } = await admin.from('das_group_directives').upsert({
          ...scope,
          portfolio_role: body.portfolioRole,
          ansoff_movement: body.ansoffMovement,
          hq_purchasing: body.hqPurchasing,
          hq_it: body.hqIt,
          hq_rd: body.hqRd,
          hq_hr: body.hqHr,
          hq_finance: body.hqFinance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id,das_id,round_number' });
        if (error) throw new Error(error.message);
        break;
      }

      case 'mutualisation': {
        await admin.from('das_shared_resources').delete().match(scope);
        if (body.resources.length > 0) {
          const { error } = await admin.from('das_shared_resources').insert(
            body.resources.map((r) => ({
              ...scope,
              resource_key: r.resourceKey,
              adoption_level: r.adoptionLevel,
              // La contrainte `standardise_requires_adoption` refuse la
              // standardisation en deçà de 50 : on ne standardise que ce qu'on
              // a d'abord réellement mutualisé. On la fait respecter ici plutôt
              // que de laisser Postgres renvoyer une erreur illisible.
              standardised: r.standardised && r.adoptionLevel >= 50,
            })),
          );
          if (error) throw new Error(error.message);
        }
        break;
      }

      case 'hr': {
        const { error } = await admin.from('das_hr_decisions').upsert({
          ...scope,
          hire_operateurs: body.hireOperateurs,
          hire_techniciens: body.hireTechniciens,
          hire_experts: body.hireExperts,
          hire_cadres: body.hireCadres,
          layoffs: body.layoffs,
          internal_transfers_in: body.internalTransfersIn,
          avg_salary_brut_mad: body.avgSalaryBrutMad,
          training_budget_mad: body.trainingBudgetMad,
          training_focus: body.trainingFocus,
          claim_ofppt: body.claimOfppt,
          // Le GIAC finance l'INGÉNIERIE de formation, pas la formation :
          // le réclamer sans bilan de compétences serait demander un
          // remboursement pour une prestation non faite. On l'aligne ici
          // plutôt que de laisser l'équipe croire qu'elle y a droit.
          claim_giac: body.claimGiac && body.orderSkillsAudit,
          order_skills_audit: body.orderSkillsAudit,
          restructuring: body.restructuring,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'team_id,das_id,round_number' });
        if (error) throw new Error(error.message);

        // `hr_metrics` est la projection de niveau ÉQUIPE de ces décisions, et
        // c'est elle que le moteur lit pour la masse salariale et le talent_mix.
        // Personne ne la saisit : elle est recalculée ici, après chaque
        // écriture. L'oublier ferait calculer le tour sur zéro recrutement,
        // silencieusement.
        await refreshHrRollup(admin, team.teamId, roundNumber);
        break;
      }

      case 'positions': {
        await admin.from('das_positions').delete().match(scope);
        if (body.positions.length > 0) {
          const { error } = await admin.from('das_positions').insert(
            body.positions.map((p) => ({
              ...scope,
              direction_key: p.directionKey, title: p.title,
              hierarchy_level: p.hierarchyLevel, headcount: p.headcount,
              budget_mad: p.budgetMad, is_key_position: p.isKeyPosition,
            })),
          );
          if (error) throw new Error(error.message);
        }
        break;
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Écriture refusée.' },
      { status: 500 },
    );
  }

  await admin.from('decisions_log').insert({
    team_id: team.teamId, round_number: roundNumber,
    decision_type: `organisation_${body.block}`,
    payload: body, decided_by: team.userId,
  });

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}

type Admin = ReturnType<typeof createAdminClient>;
type Scope = { team_id: string; das_id: string; round_number: number };
type Body = z.infer<typeof Payload>;

/**
 * Garantit qu'une conception existe pour ce tour, en reprenant celle du tour
 * précédent quand l'équipe ne modifie qu'un bloc annexe.
 */
async function ensureDesign(admin: Admin, scope: Scope, body: Body): Promise<void> {
  if (body.block === 'design') {
    const { error } = await admin.from('das_org_design').upsert(
      {
        ...scope,
        delegation_level: body.delegationLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,das_id,round_number' },
    );
    if (error) throw new Error(error.message);
    return;
  }

  const { data: existing } = await admin
    .from('das_org_design').select('id').match(scope).maybeSingle();
  if (existing) return;

  // Reprise de la conception la plus récente : modifier ses budgets ne doit pas
  // faire perdre la délégation décidée l'an dernier.
  const { data: previous } = await admin
    .from('das_org_design')
    .select('delegation_level')
    .eq('team_id', scope.team_id).eq('das_id', scope.das_id)
    .lt('round_number', scope.round_number)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from('das_org_design').insert({
    ...scope,
    delegation_level: previous?.delegation_level ?? 50,
  });
  if (error) throw new Error(error.message);
}
