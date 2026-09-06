'use server';

import 'server-only';

import { z } from 'zod';

import { requireFacilitator } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true } | { ok: false; error: string };

const ProtocolData = z.object({
  facilitator: z.string().max(200).default(''),
  email: z.string().max(200).default(''),
  date: z.string().max(100).default(''),
  location: z.string().max(200).default(''),
  profile: z.string().max(4000).default(''),
  tasks: z.array(z.string().max(500)).max(8).default([]),
  observations: z.string().max(8000).default(''),
  friction: z.string().max(8000).default(''),
  success: z.string().max(8000).default(''),
  duration: z.string().max(20).default(''),
  debrief: z
    .object({
      q1: z.string().max(4000).default(''),
      q2: z.string().max(4000).default(''),
      q3: z.string().max(4000).default(''),
      q4: z.string().max(4000).default(''),
    })
    .default({ q1: '', q2: '', q3: '', q4: '' }),
});

export type ProtocolData = z.infer<typeof ProtocolData>;

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

  const parsed = ProtocolData.partial().safeParse(input.data);
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
