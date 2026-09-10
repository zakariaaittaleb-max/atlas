import 'server-only';

/**
 * ATLAS — couche d'accès aux données (DAL).
 *
 * Point de passage unique pour toute vérification d'identité et de périmètre.
 * Les Server Functions sont joignables par POST direct, pas seulement via
 * l'interface : chacune doit donc revérifier ici, jamais se fier à un contrôle
 * fait dans un composant.
 */

import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { TeamContext } from './decision-types';
import { createAdminClient, createServerClient } from './supabase/server';

// Réexportée pour que les appelants n'aient qu'un point d'import à connaître.
export type { TeamContext };

export interface FacilitatorContext {
  userId: string;
  sessionId: string;
  sessionName: string;
}

/**
 * Utilisateur authentifié, ou `null`. Ne redirige pas.
 *
 * Deux sources, dans cet ordre :
 *   1. un en-tête `Authorization: Bearer …` — pour les appels programmatiques
 *      (provisionnement d'une session depuis un script, tests de bout en bout) ;
 *   2. le cookie de session, posé par le client Supabase du navigateur.
 *
 * Le jeton porteur n'affaiblit rien : sa signature est vérifiée par Supabase
 * exactement comme celle du cookie. Il évite en revanche d'avoir à contrefaire
 * un format de cookie interne pour piloter l'application depuis l'extérieur.
 */
export const getUser = cache(async () => {
  const supabase = await createServerClient();

  const authorization = (await headers()).get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Périmètre d'équipe de l'utilisateur courant.
 *
 * La lecture passe par le client anonyme, donc par la RLS : si les politiques
 * étaient mal écrites, cette fonction ne verrait rien plutôt que de voir trop.
 */
export const getTeamContext = cache(async (): Promise<TeamContext | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('team_members')
    .select(
      'display_name, is_facilitator, team_id, teams(id, name, pool_id, session_id, is_liquidated)',
    )
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const team = data.teams as unknown as {
    id: string;
    name: string;
    pool_id: string | null;
    session_id: string;
    is_liquidated: boolean;
  } | null;
  if (!team) return null;

  return {
    userId: user.id,
    teamId: team.id,
    teamName: team.name,
    poolId: team.pool_id,
    sessionId: team.session_id,
    displayName: (data.display_name as string | null) ?? null,
    isFacilitator: Boolean(data.is_facilitator),
    isLiquidated: team.is_liquidated,
  };
});

/** Variante qui exige un contexte d'équipe : redirige vers la connexion sinon. */
export async function requireTeam(): Promise<TeamContext> {
  const context = await getTeamContext();
  if (!context) redirect('/login');
  return context;
}

/**
 * Vérifie que l'utilisateur anime bien la session demandée.
 *
 * Passe par la clé `service_role` parce que `game_sessions` n'expose pas de
 * politique de lecture aux équipes — mais ne renvoie que l'identité de la
 * session, jamais son contenu.
 */
export const getFacilitatorContext = cache(
  async (sessionId: string): Promise<FacilitatorContext | null> => {
    const user = await getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const { data } = await admin
      .from('game_sessions')
      .select('id, name, facilitator_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!data || data.facilitator_id !== user.id) return null;

    return { userId: user.id, sessionId: data.id, sessionName: data.name };
  },
);

export async function requireFacilitator(sessionId: string): Promise<FacilitatorContext> {
  const context = await getFacilitatorContext(sessionId);
  if (!context) redirect('/login');
  return context;
}

/**
 * État courant du tour. Toute écriture de décision doit le consulter :
 * un tour verrouillé n'accepte plus rien, faute de quoi le calcul à somme
 * nulle porterait sur un état qui bouge pendant qu'on le lit.
 */
export const getRoundState = cache(async (sessionId: string) => {
  const admin = createAdminClient();
  const { data } = await admin
    .from('game_sessions')
    .select('id, status, current_round, planned_rounds, max_rounds, round_started_at, round_soft_deadline')
    .eq('id', sessionId)
    .maybeSingle();

  return data;
});

export function decisionsAreOpen(status: string | undefined): boolean {
  return status === 'round_active' || status === 'onboarding';
}
