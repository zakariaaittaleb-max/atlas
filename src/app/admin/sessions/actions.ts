"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { logAdminAction } from '@/lib/admin-audit';
import { getUser } from '@/lib/dal';
import { isSuperAdminEmail } from '@/lib/security-config';
import { createAdminClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireSuperAdmin() {
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) return null;
  return user;
}

const RenameSession = z.object({
  sessionId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
});

export async function renameSessionAction(input: {
  sessionId: string;
  name: string;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const parsed = RenameSession.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Nom invalide (3 caractères minimum).' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('game_sessions')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.sessionId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin_.id, 'session_rename', 'game_session', parsed.data.sessionId, {
    name: parsed.data.name,
  });
  revalidatePath('/admin/sessions');

  return { ok: true };
}

export async function reassignSessionAction(input: {
  sessionId: string;
  facilitatorId: string;
}): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('game_sessions')
    .update({ facilitator_id: input.facilitatorId })
    .eq('id', input.sessionId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin_.id, 'session_reassign', 'game_session', input.sessionId, {
    facilitatorId: input.facilitatorId,
  });
  revalidatePath('/admin/sessions');

  return { ok: true };
}

export async function deleteSessionAction(input: { sessionId: string }): Promise<ActionResult> {
  const admin_ = await requireSuperAdmin();
  if (!admin_) return { ok: false, error: 'Accès refusé.' };

  const admin = createAdminClient();
  const { error } = await admin.from('game_sessions').delete().eq('id', input.sessionId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin_.id, 'session_delete', 'game_session', input.sessionId, {});
  revalidatePath('/admin/sessions');

  return { ok: true };
}
