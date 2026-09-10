/**
 * Rattachement d'un étudiant à son équipe, par code de session + code d'équipe.
 *
 * Pourquoi ce détour plutôt qu'une inscription Supabase classique : le public
 * est une salle de classe. Pas de mot de passe à saisir (Atlas n'en manipule
 * aucun), pas d'e-mail à vérifier, pas d'auto-inscription libre. Le facilitateur
 * distribue deux codes, et c'est tout.
 *
 * L'utilisateur s'authentifie d'abord en anonyme côté navigateur ; cette route
 * valide les codes avec la clé `service_role` et crée le lien
 * `auth.users → teams`. La validation ne peut PAS se faire côté client : les
 * codes d'équipe des concurrents seraient lisibles.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

const JoinRequest = z.object({
  sessionCode: z.string().trim().min(4).max(32),
  teamCode: z.string().trim().min(4).max(32),
  // Le prénom sert à une seule chose : que chacun voie qui travaille avec lui
  // dans son groupe. Aucun nom de famille n'est demandé, aucune vérification
  // n'est faite — c'est une étiquette de table, pas une identité.
  displayName: z.string().trim().min(1).max(40),
});

export async function POST(request: Request) {
  // Passe par la DAL : c'est le point de passage unique pour l'identité, et
  // c'est lui qui accepte aussi bien le cookie du navigateur qu'un jeton
  // porteur. Reconstruire un client ici ferait diverger les deux chemins.
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Session navigateur absente. Rechargez la page et réessayez." },
      { status: 401 },
    );
  }

  const parsed = JoinRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Prénom manquant ou codes invalides.' },
      { status: 400 },
    );
  }

  const { sessionCode, teamCode, displayName } = parsed.data;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, name, status')
    .eq('join_code', sessionCode.toUpperCase())
    .maybeSingle();

  // Message volontairement identique pour un code de session et un code
  // d'équipe erronés : distinguer les deux permettrait d'énumérer les sessions.
  const invalid = () =>
    NextResponse.json(
      { error: 'Code de session ou code d’équipe incorrect.' },
      { status: 403 },
    );

  if (!session) return invalid();

  const { data: team } = await admin
    .from('teams')
    .select('id, name, session_id, is_liquidated')
    .eq('session_id', session.id)
    .eq('join_code', teamCode.toUpperCase())
    .maybeSingle();

  if (!team) return invalid();

  if (session.status === 'completed') {
    return NextResponse.json(
      { error: 'Cette session est terminée.' },
      { status: 409 },
    );
  }

  // Un étudiant qui vide son navigateur revient avec une nouvelle identité
  // anonyme : on le rattache simplement à nouveau. `unique(team_id, user_id)`
  // rend l'opération idempotente pour un même utilisateur.
  const { error } = await admin
    .from('team_members')
    .upsert(
      { team_id: team.id, user_id: user.id, display_name: displayName },
      { onConflict: 'team_id,user_id' },
    );

  if (error) {
    return NextResponse.json(
      { error: "Le rattachement a échoué. Prévenez votre formateur." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    sessionId: session.id,
    sessionName: session.name,
  });
}
