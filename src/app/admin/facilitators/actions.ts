"use server";

import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAdminAction } from '@/lib/admin-audit';
import { getUser } from '@/lib/dal';
import {
  writeFacilitatorCapability,
  type FacilitatorCapability,
} from '@/lib/facilitator-capabilities';
import { ALL_MODULE_FIELDS } from '@/lib/modules-catalog';
import { writeFacilitatorModules } from '@/lib/server/modules';
import { IMPERSONATION_LABEL_COOKIE, IMPERSONATION_RETURN_COOKIE } from '@/lib/impersonation';
import { isSuperAdminEmail } from '@/lib/security-config';
import { createAdminClient, createServerClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireSuperAdmin() {
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) return null;
  return user;
}

const CreateFacilitator = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export async function createFacilitatorAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const parsed = CreateFacilitator.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'E-mail ou mot de passe invalide (8 caractères minimum).' };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Création impossible.' };
  }

  await logAdminAction(admin_.id, 'facilitator_create', 'user', data.user.id, {
    email: parsed.data.email,
  });
  revalidatePath('/admin/facilitators');

  return { ok: true };
}

export async function setFacilitatorBannedAction(input: {
  userId: string;
  banned: boolean;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(input.userId);
  if (target?.user?.email && target.user.email.toLowerCase() === admin_.email?.toLowerCase()) {
    return { ok: false, error: 'Vous ne pouvez pas vous bloquer vous-même.' };
  }

  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    // 100 ans : Supabase n'a pas de « bannissement permanent » dédié, c'est
    // l'idiome documenté pour en tenir lieu.
    ban_duration: input.banned ? '876000h' : 'none',
  });

  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin_.id, input.banned ? 'facilitator_block' : 'facilitator_unblock', 'user', input.userId, {});

  return { ok: true };
}

const ResetPassword = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(72),
});

export async function resetFacilitatorPasswordAction(input: {
  userId: string;
  newPassword: string;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const parsed = ResetPassword.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Mot de passe invalide (8 caractères minimum).' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.newPassword,
  });

  if (error) return { ok: false, error: error.message };

  // Jamais le mot de passe lui-même dans le journal.
  await logAdminAction(admin_.id, 'facilitator_reset_password', 'user', parsed.data.userId, {});

  return { ok: true };
}

const SetCapability = z.object({
  userId: z.string().uuid(),
  capability: z.enum(['join_team_as_player']),
  enabled: z.boolean(),
});

/** Ouvre ou ferme un droit à un facilitateur donné. */
export async function setFacilitatorCapabilityAction(input: {
  userId: string;
  capability: FacilitatorCapability;
  enabled: boolean;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const parsed = SetCapability.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Droit inconnu.' };

  await writeFacilitatorCapability(
    parsed.data.userId,
    parsed.data.capability,
    parsed.data.enabled,
    admin_.id,
  );

  revalidatePath('/admin/facilitators');
  return { ok: true };
}

/**
 * Plafond de modules d'un facilitateur.
 *
 * Le super-admin ferme ce qu'il ne veut pas voir animé ; le facilitateur
 * choisira ensuite, session par session, ce qu'il ouvre là-dedans. Les clés
 * inconnues du catalogue sont écartées : une clé retirée du code ne doit pas
 * repeupler la table à la première sauvegarde.
 */
export async function setFacilitatorModulesAction(input: {
  userId: string;
  fields: Record<string, boolean>;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  if (!z.string().uuid().safeParse(input.userId).success) {
    return { ok: false, error: 'Facilitateur inconnu.' };
  }

  const known: Record<string, boolean> = {};
  for (const field of ALL_MODULE_FIELDS) {
    if (field.tier === 'noyau') continue;
    if (field.key in input.fields) known[field.key] = Boolean(input.fields[field.key]);
  }

  await writeFacilitatorModules(input.userId, known, admin_.id);
  await logAdminAction(admin_.id, 'modules_ceiling_set', 'user', input.userId, {
    closed: Object.entries(known)
      .filter(([, enabled]) => !enabled)
      .map(([key]) => key),
  });

  revalidatePath('/admin/facilitators');
  return { ok: true };
}

export async function deleteFacilitatorAction(input: { userId: string }): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const admin = createAdminClient();
  const { data: target } = await admin.auth.admin.getUserById(input.userId);
  if (target?.user?.email && target.user.email.toLowerCase() === admin_.email?.toLowerCase()) {
    return { ok: false, error: 'Vous ne pouvez pas supprimer votre propre compte.' };
  }

  const { count } = await admin
    .from('game_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('facilitator_id', input.userId);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Ce facilitateur anime encore ${count} session(s). Supprimez ou réattribuez-les d'abord, depuis /admin/sessions.`,
    };
  }

  const { error } = await admin.auth.admin.deleteUser(input.userId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin_.id, 'facilitator_delete', 'user', input.userId, {
    email: target?.user?.email ?? null,
  });
  revalidatePath('/admin/facilitators');

  return { ok: true };
}

/**
 * Connexion en tant qu'un facilitateur, sans connaître son mot de passe. La
 * session super-admin ACTUELLE est mise de côté (cookie httpOnly, 1h) plutôt
 * qu'écrasée : c'est ce qui permet « Revenir au super-admin » de fonctionner
 * en un clic, sans repasser par /login.
 */
export async function impersonateFacilitatorAction(userId: string): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const supabase = await createServerClient();
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();

  if (!adminSession) return { ok: false, error: 'Session super-admin introuvable.' };

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !target.user?.email) {
    return { ok: false, error: 'Facilitateur introuvable.' };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: target.user.email,
  });

  if (linkError || !linkData) {
    return { ok: false, error: "Impossible de générer l'accès." };
  }

  const jar = await cookies();
  jar.set(
    IMPERSONATION_RETURN_COOKIE,
    JSON.stringify({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    }),
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 },
  );
  jar.set(IMPERSONATION_LABEL_COOKIE, admin_.email ?? admin_.id, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    jar.delete(IMPERSONATION_RETURN_COOKIE);
    jar.delete(IMPERSONATION_LABEL_COOKIE);
    return { ok: false, error: 'Échec de la connexion en tant que ce facilitateur.' };
  }

  await logAdminAction(admin_.id, 'impersonate_start', 'user', userId, {
    email: target.user.email,
  });

  redirect('/facilitateur');
}
