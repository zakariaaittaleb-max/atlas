'use server';

import 'server-only';

import { requireFacilitator } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

import { ProtocolDataSchema, type ActionResult } from './protocol-data';



/**
 * Sauvegarde en place : une ligne par session, réécrite au fil des quatre
 * phases. Pas d'historique — le cahier du facilitateur décrit l'état courant
 * de la préparation et de l'observation, pas une suite de versions.
 */
export async function saveProtocolAction(input: {
  sessionId: string;
  data: unknown;
}): Promise<ActionResult> {
  const context = await requireFacilitator(input.sessionId);

  const parsed = ProtocolDataSchema.partial().safeParse(input.data);
  if (!parsed.success) return { ok: false, error: 'Données de protocole invalides.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('ux_protocol_notes')
    .upsert(
      {
        session_id: context.sessionId,
        facilitator_id: context.userId,
        data: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' },
    );

  if (error) return { ok: false, error: 'Écriture impossible : ' + error.message };
  return { ok: true };
}
