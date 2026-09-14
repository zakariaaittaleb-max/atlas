import 'server-only';

/**
 * ATLAS — configuration d'affichage, lecture et écriture.
 *
 * Même mécanique que `security-config.ts` : une ligne en base (migration 0042),
 * un cache mémoire court pour ne pas interroger Supabase à chaque rendu, et un
 * repli sur les valeurs par défaut si la base ne répond pas — mieux vaut un
 * dashboard complet qu'un dashboard vide.
 */

import { createAdminClient } from './supabase/server';

import {
  DEFAULT_DISPLAY_CONFIG,
  parseDisplayConfig,
  type DisplayConfig,
} from './display-config-types';

export type { DisplayConfig } from './display-config-types';

const CACHE_TTL_MS = 15_000;
let cached: { state: DisplayConfig; expiresAt: number } | null = null;

export async function readDisplayConfig(): Promise<DisplayConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.state;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('display_config')
      .select('settings')
      .eq('id', 'global')
      .maybeSingle();
    if (error) return cached?.state ?? DEFAULT_DISPLAY_CONFIG;

    const state = parseDisplayConfig(data?.settings);
    cached = { state, expiresAt: now + CACHE_TTL_MS };
    return state;
  } catch {
    return cached?.state ?? DEFAULT_DISPLAY_CONFIG;
  }
}

export async function writeDisplayConfig(next: DisplayConfig, actorUserId: string): Promise<void> {
  const admin = createAdminClient();
  // Normalisé avant écriture : on ne stocke jamais une clé que la lecture
  // ignorerait.
  const settings = parseDisplayConfig(next);

  const { error } = await admin
    .from('display_config')
    .upsert({
      id: 'global',
      settings,
      updated_at: new Date().toISOString(),
      updated_by: actorUserId,
    });
  if (error) throw new Error(error.message);

  await admin.from('display_config_log').insert({ settings, changed_by: actorUserId });
  cached = null;
}
