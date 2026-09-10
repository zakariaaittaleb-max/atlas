"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getFacilitatorContext, getUser } from '@/lib/dal';
import { ALL_MODULE_FIELDS } from '@/lib/modules-catalog';
import {
  deletePreset,
  loadFacilitatorCeiling,
  savePreset,
  writeSessionModules,
} from '@/lib/server/modules';

export type ModulesActionResult = { ok: true } | { ok: false; error: string };

/**
 * Ce qu'une session ouvre.
 *
 * Deux filtres, et le second est le moins évident : on n'écrit RIEN pour un
 * champ que le super-admin a fermé. Écrire `false` fonctionnerait aujourd'hui
 * mais figerait la fermeture — le jour où le super-admin rouvre le champ, la
 * session le garderait clos sans que personne comprenne pourquoi. L'absence de
 * ligne vaut ouvert : c'est ce qui rend le plafond réversible.
 */
export async function setSessionModulesAction(input: {
  sessionId: string;
  fields: Record<string, boolean>;
}): Promise<ModulesActionResult> {
  const context = await getFacilitatorContext(input.sessionId);
  if (!context) return { ok: false, error: 'Accès refusé.' };

  const ceiling = await loadFacilitatorCeiling(context.userId);

  const fields: Record<string, boolean> = {};
  for (const field of ALL_MODULE_FIELDS) {
    if (field.tier === 'noyau') continue;
    if (ceiling.get(field.key) === false) continue;
    if (field.key in input.fields) fields[field.key] = Boolean(input.fields[field.key]);
  }

  await writeSessionModules(input.sessionId, fields, context.userId);

  // Les écrans des équipes changent de forme : c'est tout le layout qu'il faut
  // réinvalider, pas seulement la page de pilotage.
  revalidatePath('/', 'layout');
  return { ok: true };
}

const PresetName = z.string().trim().min(1).max(60);

export async function saveModulePresetAction(input: {
  name: string;
  fields: Record<string, boolean>;
}): Promise<ModulesActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  const parsed = PresetName.safeParse(input.name);
  if (!parsed.success) return { ok: false, error: 'Donnez un nom à ce préréglage.' };

  const keys = ALL_MODULE_FIELDS.filter(
    (field) => field.tier !== 'noyau' && input.fields[field.key],
  ).map((field) => field.key);

  await savePreset(user.id, parsed.data, keys);
  revalidatePath('/facilitateur', 'layout');
  return { ok: true };
}

export async function deleteModulePresetAction(input: {
  presetId: string;
}): Promise<ModulesActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Non authentifié.' };

  if (!z.string().uuid().safeParse(input.presetId).success) {
    return { ok: false, error: 'Préréglage inconnu.' };
  }

  await deletePreset(user.id, input.presetId);
  revalidatePath('/facilitateur', 'layout');
  return { ok: true };
}
