"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getUser } from '@/lib/dal';
import { writeDisplayConfig } from '@/lib/display-config';
import { parseDisplayConfig, type DisplayConfig } from '@/lib/display-config-types';
import { isSuperAdminEmail } from '@/lib/security-config';

export type UpdateDisplayConfigResult = { ok: true } | { ok: false; error: string };

/**
 * Enregistre la configuration d'affichage complète.
 *
 * Le thème et la taille de police sont posés par le layout racine : on
 * revalide donc tout l'arbre, pas seulement cette page.
 */
export async function updateDisplayConfigAction(
  next: DisplayConfig,
): Promise<UpdateDisplayConfigResult> {
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  try {
    await writeDisplayConfig(parseDisplayConfig(next), user.id);
  } catch (error) {
    return {
      ok: false,
      error: `L’enregistrement a échoué : ${error instanceof Error ? error.message : 'erreur inconnue'}. Réessayez.`,
    };
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}
