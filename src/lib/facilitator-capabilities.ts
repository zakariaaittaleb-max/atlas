import 'server-only';

/**
 * ATLAS — ce qu'un facilitateur a le droit de faire, réglé par le super-admin.
 *
 * Distinct de `security-config.ts`, qui porte des mesures GLOBALES de sécurité :
 * ici le réglage est nominatif, facilitateur par facilitateur. La table est
 * volontairement générique (`capability text`) pour accueillir les modules
 * d'écran à venir sans nouvelle migration.
 */

import { logAdminAction } from './admin-audit';
import {
  DEFAULT_FACILITATOR_CAPABILITIES,
  type FacilitatorCapability,
  type FacilitatorCapabilityState,
} from './facilitator-capabilities-types';
import { createAdminClient } from './supabase/server';

export {
  FACILITATOR_CAPABILITIES,
  DEFAULT_FACILITATOR_CAPABILITIES,
} from './facilitator-capabilities-types';
export type {
  FacilitatorCapability,
  FacilitatorCapabilityState,
} from './facilitator-capabilities-types';

export async function readFacilitatorCapabilities(
  facilitatorId: string,
): Promise<FacilitatorCapabilityState> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('facilitator_capabilities')
    .select('capability, enabled')
    .eq('facilitator_id', facilitatorId);

  const state: FacilitatorCapabilityState = { ...DEFAULT_FACILITATOR_CAPABILITIES };
  for (const row of data ?? []) {
    const name = String(row.capability) as FacilitatorCapability;
    if (name in state) state[name] = Boolean(row.enabled);
  }
  return state;
}

/** Version d'appoint quand un seul droit est en jeu. */
export async function facilitatorCan(
  facilitatorId: string,
  capability: FacilitatorCapability,
): Promise<boolean> {
  const state = await readFacilitatorCapabilities(facilitatorId);
  return state[capability];
}

/** Les réglages de plusieurs facilitateurs d'un coup, pour le panneau /admin. */
export async function readCapabilitiesFor(
  facilitatorIds: readonly string[],
): Promise<Map<string, FacilitatorCapabilityState>> {
  const byFacilitator = new Map<string, FacilitatorCapabilityState>(
    facilitatorIds.map((id) => [id, { ...DEFAULT_FACILITATOR_CAPABILITIES }]),
  );
  if (facilitatorIds.length === 0) return byFacilitator;

  const admin = createAdminClient();
  const { data } = await admin
    .from('facilitator_capabilities')
    .select('facilitator_id, capability, enabled')
    .in('facilitator_id', [...facilitatorIds]);

  for (const row of data ?? []) {
    const state = byFacilitator.get(String(row.facilitator_id));
    const name = String(row.capability) as FacilitatorCapability;
    if (state && name in state) state[name] = Boolean(row.enabled);
  }
  return byFacilitator;
}

export async function writeFacilitatorCapability(
  facilitatorId: string,
  capability: FacilitatorCapability,
  enabled: boolean,
  actorUserId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('facilitator_capabilities').upsert(
    {
      facilitator_id: facilitatorId,
      capability,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: actorUserId,
    },
    { onConflict: 'facilitator_id,capability' },
  );

  await logAdminAction(
    actorUserId,
    enabled ? 'capability_grant' : 'capability_revoke',
    'user',
    facilitatorId,
    { capability },
  );
}
