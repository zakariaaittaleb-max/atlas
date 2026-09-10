"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getFacilitatorContext } from '@/lib/dal';
import {
  resetVariationScales,
  writeVariationScales,
} from '@/lib/server/variation-scales';
import { DEFAULT_SCALES, type VariationScale } from '@/lib/variation-scale';

export type ScalesActionResult = { ok: true } | { ok: false; error: string };

/**
 * Fourchettes des curseurs pour une session.
 *
 * Les seuils doivent rester croissants, sinon `variationLabel` renverrait des
 * mots dans le désordre — « forte hausse » avant « faible hausse ». On les
 * réordonne plutôt que de refuser : le facilitateur règle des molettes, il ne
 * remplit pas un formulaire.
 */
export async function setVariationScalesAction(input: {
  sessionId: string;
  scales: Record<string, VariationScale>;
}): Promise<ScalesActionResult> {
  const context = await getFacilitatorContext(input.sessionId);
  if (!context) return { ok: false, error: 'Accès refusé.' };

  const clean: Record<string, VariationScale> = {};
  for (const [family, scale] of Object.entries(input.scales)) {
    if (!(family in DEFAULT_SCALES)) continue;
    const t = [
      scale.thresholds.flat,
      scale.thresholds.faible,
      scale.thresholds.moyenne,
      scale.thresholds.forte,
    ]
      .map((v) => Math.min(Math.max(Number(v) || 0, 0), 1))
      .sort((a, b) => a - b);

    clean[family] = {
      bounds: {
        min: Math.min(Math.max(Number(scale.bounds.min) || 0, -100), 0),
        max: Math.min(Math.max(Number(scale.bounds.max) || 0, 0), 1000),
      },
      thresholds: { flat: t[0], faible: t[1], moyenne: t[2], forte: t[3] },
    };
  }

  await writeVariationScales(input.sessionId, clean, context.userId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function resetVariationScalesAction(input: {
  sessionId: string;
}): Promise<ScalesActionResult> {
  const context = await getFacilitatorContext(input.sessionId);
  if (!context) return { ok: false, error: 'Accès refusé.' };

  await resetVariationScales(input.sessionId);
  revalidatePath('/', 'layout');
  return { ok: true };
}
