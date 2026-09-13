/**
 * Le cahier du protocole de test : son schéma et sa forme, lisibles côté client.
 *
 * Sortis de `actions.ts` : l'écran client importait le type depuis le fichier
 * d'actions serveur, qui importe `lib/dal` et le client Supabase de service.
 * Un fichier `'use server'` ne peut de toute façon exporter que des fonctions
 * asynchrones ; le schéma zod n'y avait pas sa place.
 */

import { z } from 'zod';

export const ProtocolDataSchema = z.object({
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

export type ProtocolData = z.infer<typeof ProtocolDataSchema>;

export type ActionResult = { ok: true } | { ok: false; error: string };
