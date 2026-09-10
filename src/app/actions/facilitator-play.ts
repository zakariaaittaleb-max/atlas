"use server";

import 'server-only';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAdminAction } from '@/lib/admin-audit';
import { getUser } from '@/lib/dal';
import { facilitatorCan } from '@/lib/facilitator-capabilities';
import { FACILITATOR_PLAY_COOKIE, type FacilitatorPlayState } from '@/lib/facilitator-play';
import { createAdminClient } from '@/lib/supabase/server';

export type FacilitatorPlayResult = { ok: true } | { ok: false; error: string };

/**
 * Le facilitateur entre dans un de ses groupes pour y JOUER.
 *
 * Le geste se résume à une ligne dans `team_members` : à partir de là il est un
 * membre de l'équipe comme un autre, et tous les écrans, toutes les écritures
 * et toute la RLS existante s'appliquent sans exception à écrire nulle part.
 * Le marqueur `is_facilitator` ne lui ouvre aucun droit supplémentaire — il ne
 * sert qu'à l'affichage et à la traçabilité.
 */
const JoinInput = z.object({
  sessionId: z.string().uuid(),
  teamId: z.string().uuid(),
  visible: z.boolean().default(true),
});

export async function joinTeamAsFacilitatorAction(input: {
  sessionId: string;
  teamId: string;
  visible: boolean;
}): Promise<FacilitatorPlayResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const parsed = JoinInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Requête invalide.' };

  const { sessionId, teamId, visible } = parsed.data;
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, facilitator_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || session.facilitator_id !== user.id) {
    return { ok: false, error: 'Accès refusé.' };
  }

  if (!(await facilitatorCan(user.id, 'join_team_as_player'))) {
    return {
      ok: false,
      error:
        "Le super-admin n'a pas ouvert ce droit pour votre compte. Demandez-lui l'accès « Entrer dans un groupe comme participant ».",
    };
  }

  // L'équipe doit appartenir à CETTE session : sans ce contrôle, un `teamId`
  // emprunté ferait entrer le facilitateur dans l'atelier d'un collègue.
  const { data: team } = await admin
    .from('teams')
    .select('id, name, session_id')
    .eq('id', teamId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (!team) return { ok: false, error: 'Équipe introuvable dans cette session.' };

  // Une équipe à la fois. `getTeamContext` ne lit qu'un rattachement : en
  // laisser deux ferait dépendre l'équipe affichée de l'ordre de la base.
  await leaveCurrentTeam(user.id);

  const { error } = await admin.from('team_members').insert({
    team_id: teamId,
    user_id: user.id,
    display_name: displayNameFor(user.email),
    is_facilitator: true,
    facilitator_visible: visible,
  });

  if (error) {
    return { ok: false, error: `Entrée impossible : ${error.message}` };
  }

  await admin.from('facilitator_play_log').insert({
    session_id: sessionId,
    team_id: teamId,
    facilitator_id: user.id,
    visible_to_team: visible,
  });

  await logAdminAction(user.id, 'facilitator_play_join', 'team', teamId, {
    sessionId,
    teamName: String(team.name),
    visible,
  });

  const state: FacilitatorPlayState = {
    sessionId,
    teamId,
    teamName: String(team.name),
    visible,
  };

  (await cookies()).set(FACILITATOR_PLAY_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Retour à l'animation : le rattachement disparaît, le journal reste.
 *
 * C'est l'appelant qui navigue, pas cette action. Un `redirect()` posé ici ne
 * déplaçait pas le navigateur : le facilitateur restait sur l'écran d'équipe
 * qu'il venait de quitter, à lire les chiffres d'un groupe dont il n'a plus le
 * périmètre. Le bandeau connaît la session — il pousse la route lui-même.
 */
export async function leaveTeamAsFacilitatorAction(): Promise<FacilitatorPlayResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const left = await leaveCurrentTeam(user.id);
  (await cookies()).delete(FACILITATOR_PLAY_COOKIE);

  if (left) {
    await logAdminAction(user.id, 'facilitator_play_leave', 'team', left.teamId, {
      sessionId: left.sessionId,
    });
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Bascule discret / visible sans sortir du groupe. */
export async function setFacilitatorVisibilityAction(input: {
  visible: boolean;
}): Promise<FacilitatorPlayResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const visible = Boolean(input.visible);
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('is_facilitator', true)
    .maybeSingle();

  if (!membership) return { ok: false, error: "Vous n'êtes dans aucun groupe." };

  await admin
    .from('team_members')
    .update({ facilitator_visible: visible })
    .eq('user_id', user.id)
    .eq('is_facilitator', true);

  await admin
    .from('facilitator_play_log')
    .update({ visible_to_team: visible })
    .eq('facilitator_id', user.id)
    .is('left_at', null);

  const jar = await cookies();
  const raw = jar.get(FACILITATOR_PLAY_COOKIE)?.value;
  if (raw) {
    try {
      const state = JSON.parse(raw) as FacilitatorPlayState;
      jar.set(FACILITATOR_PLAY_COOKIE, JSON.stringify({ ...state, visible }), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
    } catch {
      // Cookie illisible : le réglage est écrit en base, qui fait foi.
    }
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

async function leaveCurrentTeam(
  facilitatorId: string,
): Promise<{ teamId: string; sessionId: string } | null> {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from('team_members')
    .select('team_id, teams(session_id)')
    .eq('user_id', facilitatorId)
    .eq('is_facilitator', true)
    .maybeSingle();

  if (!membership) return null;

  await admin
    .from('team_members')
    .delete()
    .eq('user_id', facilitatorId)
    .eq('is_facilitator', true);

  await admin
    .from('facilitator_play_log')
    .update({ left_at: new Date().toISOString() })
    .eq('facilitator_id', facilitatorId)
    .is('left_at', null);

  const team = membership.teams as unknown as { session_id: string } | null;
  return { teamId: String(membership.team_id), sessionId: String(team?.session_id ?? '') };
}

function displayNameFor(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0]?.trim();
  return local ? local : 'Facilitateur';
}
