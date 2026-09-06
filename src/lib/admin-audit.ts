import 'server-only';

import { createAdminClient } from './supabase/server';

/**
 * Journal des actions super-admin sur les comptes facilitateurs et les
 * sessions (voir migration 0021). Ne jamais y consigner un mot de passe ou un
 * jeton — seulement l'action, sa cible, et un détail publiquement montrable
 * à l'auteur lui-même.
 */
export async function logAdminAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('admin_audit_log').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}
