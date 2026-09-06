import 'server-only';

/**
 * ATLAS — configuration des mesures anti-scraping.
 *
 * Quatre mesures, toutes désactivées par défaut en base (migration 0019) :
 * activer ce code ne change donc rien tant qu'un super-admin ne bascule rien
 * depuis `/admin/security`. `proxy.ts` relit cet état à chaque requête ; le
 * cache mémoire évite un aller-retour Supabase systématique, au prix d'un
 * délai de propagation d'au plus `CACHE_TTL_MS`.
 */

import { createAdminClient } from './supabase/server';

export type { SecurityConfigState, SecurityMeasureName } from './security-config-types';
import type { SecurityConfigState, SecurityMeasureName } from './security-config-types';

export const SECURITY_MEASURES: ReadonlyArray<{
  name: SecurityMeasureName;
  label: string;
  description: string;
}> = [
  {
    name: 'strict_auth',
    label: 'Authentification stricte',
    description:
      "Bloque toute page (hors /login) et tout appel /api aux visiteurs sans session Supabase, même anonyme.",
  },
  {
    name: 'security_headers',
    label: 'En-têtes HTTP anti-scraping',
    description:
      'Ajoute Cache-Control, X-Robots-Tag, X-Content-Type-Options et une CSP de base sur chaque réponse.',
  },
  {
    name: 'css_anti_selection',
    label: 'Anti-sélection CSS',
    description:
      'Désactive la sélection, le copier-coller et le glisser sur le contenu (les champs de saisie restent utilisables).',
  },
  {
    name: 'rate_limit_api',
    label: 'Limitation de débit des API',
    description: 'Plafonne chaque IP à 100 requêtes / minute sur /api/*.',
  },
];

const DEFAULT_CONFIG: SecurityConfigState = {
  strict_auth: false,
  security_headers: false,
  css_anti_selection: false,
  rate_limit_api: false,
};

const CACHE_TTL_MS = 15_000;
let cached: { state: SecurityConfigState; expiresAt: number } | null = null;

/**
 * Lit l'état des mesures. `SECURITY_OVERRIDE=off` court-circuite la base :
 * utile en développement pour ne jamais dépendre du réseau, et comme filet de
 * secours en production si une bascule verrouillait l'accès par erreur — il
 * suffit de poser la variable et de redéployer pour tout redésactiver, sans
 * dépendre de la disponibilité de la base elle-même.
 */
export async function readSecurityConfig(): Promise<SecurityConfigState> {
  if (process.env.SECURITY_OVERRIDE === 'off') return DEFAULT_CONFIG;

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.state;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('security_config').select('measure_name, enabled');
    if (error || !data) return cached?.state ?? DEFAULT_CONFIG;

    const state: SecurityConfigState = { ...DEFAULT_CONFIG };
    for (const row of data) {
      const name = row.measure_name as SecurityMeasureName;
      if (name in state) state[name] = Boolean(row.enabled);
    }

    cached = { state, expiresAt: now + CACHE_TTL_MS };
    return state;
  } catch {
    // Supabase injoignable : mieux vaut servir le site avec la dernière
    // configuration connue (ou tout désactivé à froid) que de tout bloquer.
    return cached?.state ?? DEFAULT_CONFIG;
  }
}

export function invalidateSecurityConfigCache(): void {
  cached = null;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ATLAS_SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export async function writeSecurityConfig(
  changes: Partial<SecurityConfigState>,
  actorUserId: string,
): Promise<void> {
  const admin = createAdminClient();

  for (const [measure_name, enabled] of Object.entries(changes) as [
    SecurityMeasureName,
    boolean,
  ][]) {
    await admin
      .from('security_config')
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: actorUserId })
      .eq('measure_name', measure_name);

    await admin.from('security_config_log').insert({
      measure_name,
      enabled,
      changed_by: actorUserId,
    });
  }

  invalidateSecurityConfigCache();
}
