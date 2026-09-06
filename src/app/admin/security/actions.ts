"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getUser } from '@/lib/dal';
import {
  isSuperAdminEmail,
  readSecurityConfig,
  SECURITY_MEASURES,
  writeSecurityConfig,
  type SecurityConfigState,
} from '@/lib/security-config';

export type UpdateSecurityConfigResult = { ok: true } | { ok: false; error: string };

/**
 * Reçoit l'état désiré des quatre bascules et n'écrit (et ne journalise) que
 * celles qui ont réellement changé — sinon chaque clic sur « Appliquer »
 * ajouterait quatre lignes de journal même quand rien n'a bougé.
 */
export async function updateSecurityConfigAction(
  next: SecurityConfigState,
): Promise<UpdateSecurityConfigResult> {
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const current = await readSecurityConfig();
  const changes: Partial<SecurityConfigState> = {};
  for (const measure of SECURITY_MEASURES) {
    if (current[measure.name] !== next[measure.name]) {
      changes[measure.name] = next[measure.name];
    }
  }

  if (Object.keys(changes).length > 0) {
    await writeSecurityConfig(changes, user.id);
    revalidatePath('/admin/security');
  }

  return { ok: true };
}
