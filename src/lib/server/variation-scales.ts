import 'server-only';

/**
 * ATLAS — les fourchettes des curseurs de variation, réglables par session.
 *
 * L'absence de ligne vaut « bornes par défaut » (voir migration 0024) : un
 * facilitateur qui ne touche à rien joue les fourchettes calées sur la
 * pratique, et celui qui veut brider les licenciements ou ouvrir grand les
 * investissements n'écrit que la famille concernée.
 */

import { cache } from 'react';

import {
  DEFAULT_SCALES,
  type VariationFamily,
  type VariationScale,
} from '../variation-scale';
import { createAdminClient } from '../supabase/server';

export type VariationScales = Readonly<Record<string, VariationScale>>;

export const loadVariationScales = cache(
  async (sessionId: string): Promise<VariationScales> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from('session_variation_scales')
      .select('family, min_pct, max_pct, flat, faible, moyenne, forte')
      .eq('session_id', sessionId);

    const scales: Record<string, VariationScale> = { ...DEFAULT_SCALES };
    for (const row of data ?? []) {
      const family = String(row.family) as VariationFamily;
      if (!(family in DEFAULT_SCALES)) continue;
      scales[family] = {
        bounds: { min: Number(row.min_pct), max: Number(row.max_pct) },
        thresholds: {
          flat: Number(row.flat),
          faible: Number(row.faible),
          moyenne: Number(row.moyenne),
          forte: Number(row.forte),
        },
      };
    }
    return scales;
  },
);

export async function writeVariationScales(
  sessionId: string,
  scales: Readonly<Record<string, VariationScale>>,
  actorUserId: string,
): Promise<void> {
  const rows = Object.entries(scales)
    .filter(([family]) => family in DEFAULT_SCALES)
    .map(([family, scale]) => ({
      session_id: sessionId,
      family,
      // Le plancher dur : une borne plus basse produirait un montant négatif.
      min_pct: Math.min(Math.max(scale.bounds.min, -100), 0),
      max_pct: Math.min(Math.max(scale.bounds.max, 0), 1000),
      flat: scale.thresholds.flat,
      faible: scale.thresholds.faible,
      moyenne: scale.thresholds.moyenne,
      forte: scale.thresholds.forte,
      updated_at: new Date().toISOString(),
      updated_by: actorUserId,
    }));

  if (rows.length === 0) return;

  const admin = createAdminClient();
  await admin
    .from('session_variation_scales')
    .upsert(rows, { onConflict: 'session_id,family' });
}

/** Remet une session aux fourchettes par défaut. */
export async function resetVariationScales(sessionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('session_variation_scales').delete().eq('session_id', sessionId);
}
