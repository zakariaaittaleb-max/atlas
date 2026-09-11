import 'server-only';

/**
 * ATLAS — résolution de l'état des modules.
 *
 * Deux étages se composent, et le plus restrictif gagne :
 *
 *   plafond du facilitateur (super-admin)  ∩  choix de la session (facilitateur)
 *
 * Dans les deux étages, l'absence de ligne vaut OUVERT (voir migration 0023).
 * Un facilitateur ne peut donc pas ouvrir ce que le super-admin lui a fermé,
 * mais il n'a rien à faire pour jouer un champ que personne n'a restreint.
 */

import { cache } from 'react';

import { ALL_MODULE_FIELDS } from '../modules-catalog';
import type { EnabledModules } from '../modules-state';
import { createAdminClient } from '../supabase/server';

/** Préfixe des capacités qui portent un module, dans `facilitator_capabilities`. */
const CAPABILITY_PREFIX = 'module:';

export function moduleCapability(fieldKey: string): string {
  return `${CAPABILITY_PREFIX}${fieldKey}`;
}

export const loadEnabledModules = cache(
  async (sessionId: string): Promise<EnabledModules> => {
    const admin = createAdminClient();

    const { data: session } = await admin
      .from('game_sessions')
      .select('facilitator_id')
      .eq('id', sessionId)
      .maybeSingle();

    const [ceiling, perSession] = await Promise.all([
      session?.facilitator_id
        ? loadFacilitatorCeiling(String(session.facilitator_id))
        : Promise.resolve(new Map<string, boolean>()),
      loadSessionChoices(sessionId),
    ]);

    const state: Record<string, boolean> = {};
    for (const field of ALL_MODULE_FIELDS) {
      // Les deux étages ne disent pas la même chose, et les confondre fermait
      // définitivement les capacités à ouvrir : le PLAFOND est une permission —
      // absent, le super-admin n'a rien restreint, donc c'est autorisé. Le
      // CHOIX DE SESSION est une activation — et c'est lui seul que
      // `defaultOpen: false` laisse fermé tant qu'un facilitateur ne l'a pas
      // demandé. Appliquer le défaut au plafond rendait le réglage de session
      // inopérant : le facilitateur cochait la case et rien ne se passait.
      const allowedByAdmin = ceiling.get(field.key) ?? true;
      const openedBySession = perSession.get(field.key) ?? (field.defaultOpen ?? true);
      state[field.key] = allowedByAdmin && openedBySession;
    }
    return state;
  },
);

/** Le plafond seul — ce que le panneau du facilitateur peut lui proposer. */
export const loadFacilitatorCeiling = cache(
  async (facilitatorId: string): Promise<Map<string, boolean>> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from('facilitator_capabilities')
      .select('capability, enabled')
      .eq('facilitator_id', facilitatorId)
      .like('capability', `${CAPABILITY_PREFIX}%`);

    const ceiling = new Map<string, boolean>();
    for (const row of data ?? []) {
      ceiling.set(String(row.capability).slice(CAPABILITY_PREFIX.length), Boolean(row.enabled));
    }
    return ceiling;
  },
);

/** Le plafond de plusieurs facilitateurs d'un coup, pour le panneau /admin. */
export async function loadCeilingsFor(
  facilitatorIds: readonly string[],
): Promise<Map<string, EnabledModules>> {
  const byFacilitator = new Map<string, EnabledModules>();
  if (facilitatorIds.length === 0) return byFacilitator;

  const admin = createAdminClient();
  const { data } = await admin
    .from('facilitator_capabilities')
    .select('facilitator_id, capability, enabled')
    .in('facilitator_id', [...facilitatorIds])
    .like('capability', `${CAPABILITY_PREFIX}%`);

  const closed = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (row.enabled) continue;
    const id = String(row.facilitator_id);
    const key = String(row.capability).slice(CAPABILITY_PREFIX.length);
    if (!closed.has(id)) closed.set(id, new Set());
    closed.get(id)!.add(key);
  }

  for (const id of facilitatorIds) {
    const shut = closed.get(id) ?? new Set<string>();
    const state: Record<string, boolean> = {};
    for (const field of ALL_MODULE_FIELDS) state[field.key] = !shut.has(field.key);
    byFacilitator.set(id, state);
  }
  return byFacilitator;
}

/** Le super-admin pose le plafond d'un facilitateur. */
export async function writeFacilitatorModules(
  facilitatorId: string,
  fields: Record<string, boolean>,
  actorUserId: string,
): Promise<void> {
  const rows = Object.entries(fields).map(([key, enabled]) => ({
    facilitator_id: facilitatorId,
    capability: moduleCapability(key),
    enabled,
    updated_at: new Date().toISOString(),
    updated_by: actorUserId,
  }));
  if (rows.length === 0) return;

  const admin = createAdminClient();
  await admin
    .from('facilitator_capabilities')
    .upsert(rows, { onConflict: 'facilitator_id,capability' });
}

export const loadSessionChoices = cache(
  async (sessionId: string): Promise<Map<string, boolean>> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from('session_modules')
      .select('field_key, enabled')
      .eq('session_id', sessionId);

    const choices = new Map<string, boolean>();
    for (const row of data ?? []) {
      choices.set(String(row.field_key), Boolean(row.enabled));
    }
    return choices;
  },
);

/**
 * Écrit le choix d'une session pour un lot de champs.
 *
 * On écrit une ligne par champ, `enabled` explicite, y compris pour les champs
 * ouverts : appliquer un préréglage doit produire un état complet et lisible,
 * pas un mélange de lignes explicites et d'absences interprétées.
 */
export async function writeSessionModules(
  sessionId: string,
  fields: Record<string, boolean>,
  actorUserId: string,
): Promise<void> {
  const rows = Object.entries(fields).map(([field_key, enabled]) => ({
    session_id: sessionId,
    field_key,
    enabled,
    updated_at: new Date().toISOString(),
    updated_by: actorUserId,
  }));
  if (rows.length === 0) return;

  const admin = createAdminClient();
  await admin.from('session_modules').upsert(rows, { onConflict: 'session_id,field_key' });
}

export interface SavedPreset {
  id: string;
  name: string;
  fields: string[];
}

export async function loadSavedPresets(facilitatorId: string): Promise<SavedPreset[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('module_presets')
    .select('id, name, field_keys')
    .eq('facilitator_id', facilitatorId)
    .order('name');

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    fields: Array.isArray(row.field_keys) ? (row.field_keys as string[]).map(String) : [],
  }));
}

export async function savePreset(
  facilitatorId: string,
  name: string,
  fields: readonly string[],
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('module_presets').upsert(
    { facilitator_id: facilitatorId, name, field_keys: [...fields] },
    { onConflict: 'facilitator_id,name' },
  );
}

export async function deletePreset(facilitatorId: string, presetId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('module_presets')
    .delete()
    .eq('id', presetId)
    .eq('facilitator_id', facilitatorId);
}
