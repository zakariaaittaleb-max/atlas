/**
 * Provisionnement d'une session — réservé au facilitateur.
 *
 * Crée en un appel la session, ses pools, les DAS retenus, l'écosystème fictif
 * et les équipes dotées à l'identique. Rend les codes d'accès à distribuer en
 * salle.
 *
 * L'appelant devient le facilitateur de la session qu'il crée : il n'y a pas de
 * rôle « administrateur » global dans Atlas, chaque session a le sien.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/dal';
import { DAS_CATALOG } from '@/lib/server/das-catalog';
import { provisionSession } from '@/lib/server/provision';
import { createAdminClient } from '@/lib/supabase/server';

export const maxDuration = 120;

const SECTOR_KEYS = DAS_CATALOG.map((d) => d.sectorKey) as [string, ...string[]];

const ProvisionRequest = z.object({
  sessionName: z.string().trim().min(3).max(120),
  pools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        teamNames: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
      }),
    )
    .min(1)
    .max(3),
  // Le premier secteur est celui imposé à toutes les équipes en T0.
  sectorKeys: z.array(z.enum(SECTOR_KEYS)).min(1).max(8),
  plannedRounds: z.number().int().min(3).max(10).default(3),
  maxRounds: z.number().int().min(3).max(10).default(10),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const parsed = ProvisionRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Requête invalide.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.plannedRounds > parsed.data.maxRounds) {
    return NextResponse.json(
      { error: 'Le nombre de tours prévus dépasse le maximum autorisé.' },
      { status: 400 },
    );
  }

  try {
    const result = await provisionSession(createAdminClient(), {
      ...parsed.data,
      facilitatorId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Provisionnement interrompu : ${message}` },
      { status: 500 },
    );
  }
}
