import 'server-only';

/**
 * ATLAS — organisation héritée, posée au provisionnement.
 *
 * Chaque équipe démarre avec une organisation RÉELLE, pas une page blanche :
 * l'entreprise existe depuis deux exercices, elle a forcément une structure.
 *
 * Le profil est délibérément NEUTRE — moyenne des quatre profils stratégiques.
 * Une équipe qui n'y touche pas obtient donc des scores moyens sur les axes
 * d'organisation : ni récompensée, ni sanctionnée. C'est le point important.
 * Si ne rien faire donnait zéro, une équipe passive serait aussi mal notée
 * qu'une équipe qui s'organise à contresens — ce qui est faux, et ce qui
 * découragerait précisément celles qu'on veut faire réfléchir.
 */

import type { createAdminClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createAdminClient>;

/** Moyenne des quatre profils stratégiques : aucune direction n'est favorisée. */
export const NEUTRAL_BUDGET_SPLIT: Record<string, number> = {
  direction_generale: 0.020,
  technique: 0.1425,
  production: 0.220,
  achats: 0.125,
  qualite: 0.1075,
  commercial: 0.170,
  si: 0.0775,
  finance: 0.0525,
  rh: 0.085,
};

/**
 * Intitulé et indicateur hérités, direction par direction.
 *
 * Les indicateurs retenus sont ceux dont l'affinité varie peu d'une stratégie à
 * l'autre : une organisation héritée ne présume pas de la stratégie que
 * l'équipe va déclarer.
 */
const INHERITED: { direction: string; title: string; level: number; kpi: string }[] = [
  { direction: 'direction_generale', title: 'Direction générale du domaine', level: 1, kpi: 'dg_roce' },
  { direction: 'technique',   title: 'Responsable études et développement', level: 2, kpi: 'rd_taux_reussite_projets' },
  { direction: 'production',  title: 'Responsable de production',           level: 2, kpi: 'prod_taux_service' },
  { direction: 'achats',      title: 'Responsable achats',                  level: 2, kpi: 'ach_taux_rupture' },
  { direction: 'qualite',     title: 'Responsable qualité et HSE',          level: 2, kpi: 'qua_cout_non_qualite' },
  { direction: 'commercial',  title: 'Responsable commercial',              level: 2, kpi: 'com_notoriete' },
  { direction: 'si',          title: 'Responsable systèmes d’information',  level: 3, kpi: 'si_disponibilite' },
  { direction: 'finance',     title: 'Responsable administratif et financier', level: 2, kpi: 'fin_ratio_endettement' },
  { direction: 'rh',          title: 'Responsable ressources humaines',     level: 3, kpi: 'rh_climat_social' },
];

/** Axes hérités : un de chaque famille, pour ne pas orienter la stratégie. */
const INHERITED_AXES = ['excellence_operationnelle', 'digitalisation', 'capital_humain'];

export async function seedOrganisation(
  admin: Admin,
  teamId: string,
  dasId: string,
  roundNumber: number,
  headcount: number,
  operatingBudgetMad: number,
): Promise<void> {
  await admin.from('das_org_design').upsert(
    {
      team_id: teamId, das_id: dasId, round_number: roundNumber,
      structure_type: 'fonctionnelle',
      // 50 : ni tout remonté au sommet, ni tout laissé au terrain. C'est à
      // l'équipe de trancher selon la stratégie qu'elle déclare.
      delegation_level: 50,
      vision: null,
      mission: null,
    },
    { onConflict: 'team_id,das_id,round_number' },
  );

  await admin.from('das_strategic_axes').upsert(
    INHERITED_AXES.map((axis_key, i) => ({
      team_id: teamId, das_id: dasId, round_number: roundNumber,
      axis_key, priority: i + 1,
    })),
    { onConflict: 'team_id,das_id,round_number,axis_key' },
  );

  await admin.from('das_direction_budgets').upsert(
    Object.entries(NEUTRAL_BUDGET_SPLIT).map(([direction_key, part]) => ({
      team_id: teamId, das_id: dasId, round_number: roundNumber,
      direction_key, budget_mad: Math.round(operatingBudgetMad * part),
    })),
    { onConflict: 'team_id,das_id,round_number,direction_key' },
  );

  await admin.from('das_direction_kpis').upsert(
    INHERITED.map((d) => ({
      team_id: teamId, das_id: dasId, round_number: roundNumber,
      direction_key: d.direction, kpi_key: d.kpi, target_value: null,
    })),
    { onConflict: 'team_id,das_id,round_number,direction_key' },
  );

  await admin.from('das_positions').upsert(
    INHERITED.map((d) => ({
      team_id: teamId, das_id: dasId, round_number: roundNumber,
      direction_key: d.direction, title: d.title, hierarchy_level: d.level,
      headcount: Math.round(headcount * (NEUTRAL_BUDGET_SPLIT[d.direction] ?? 0.1)),
      budget_mad: Math.round(operatingBudgetMad * (NEUTRAL_BUDGET_SPLIT[d.direction] ?? 0)),
      // AUCUN poste clé hérité : déclarer ses priorités est précisément
      // l'exercice qu'on attend de l'équipe.
      is_key_position: false,
    })),
    { onConflict: 'team_id,das_id,round_number,direction_key,title' },
  );
}
