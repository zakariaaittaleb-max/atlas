/**
 * Provisionnement d'une session — réservé au facilitateur.
 *
 * Crée en un appel la session, ses pools, les DAS retenus, l'écosystème fictif
 * et les équipes dotées à l'identique. Rend les codes d'accès à distribuer en
 * salle.
 *
 * L'appelant devient le facilitateur de la session qu'il crée. Le super-admin
 * (`/admin`) peut réattribuer une session après coup, mais la création reste
 * toujours au nom de qui l'exécute — y compris quand c'est le super-admin
 * lui-même, connecté « en tant que » un facilitateur.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUser } from '@/lib/dal';
import { DAS_CATALOG } from '@/lib/server/das-catalog';
import { provisionSession } from '@/lib/server/provision';
import { ALL_MODULE_FIELDS, MODULE_PRESETS } from '@/lib/modules-catalog';
import { writeSessionModules } from '@/lib/server/modules';
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
  // L'univers de marché : tous ces secteurs sont provisionnés, avec leur
  // écosystème et leurs segments, qu'une équipe les exploite ou non.
  sectorKeys: z.array(z.enum(SECTOR_KEYS)).min(1).max(8),
  // Le portefeuille de départ, commun à toutes les équipes. Il doit être un
  // SOUS-ENSEMBLE des secteurs ouverts : attribuer un domaine non provisionné
  // produirait une équipe rattachée à un DAS inexistant. Absent, on retombe sur
  // le premier secteur ouvert — le comportement historique.
  startingSectorKeys: z.array(z.enum(SECTOR_KEYS)).min(1).max(8).optional(),
  // Préréglage de modules appliqué d'entrée : le formateur choisit l'ampleur du
  // jeu à la création, et l'affine ensuite depuis l'écran de pilotage.
  modulePreset: z.enum(MODULE_PRESETS.map((p) => p.key) as [string, ...string[]]).optional(),
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

  // Vérifié ICI plutôt que dans `provisionSession` : à ce stade rien n'est
  // écrit, alors qu'un échec en cours de provisionnement laisserait une session
  // à moitié créée derrière lui.
  const outside = (parsed.data.startingSectorKeys ?? [])
    .filter((k) => !parsed.data.sectorKeys.includes(k));
  if (outside.length > 0) {
    return NextResponse.json(
      {
        error:
          'Le portefeuille de départ contient des domaines qui ne sont pas ouverts '
          + `à cette session : ${outside.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await provisionSession(createAdminClient(), {
      ...parsed.data,
      facilitatorId: user.id,
    });

    const preset = MODULE_PRESETS.find((p) => p.key === parsed.data.modulePreset);
    if (preset && result.sessionId) {
      // On écrit une ligne par champ, `enabled` explicite : un état complet se
      // relit, un mélange de lignes et d'absences s'interprète.
      const open = new Set(preset.fields);
      const fields: Record<string, boolean> = {};
      for (const field of ALL_MODULE_FIELDS) {
        if (field.tier !== 'noyau') fields[field.key] = open.has(field.key);
      }
      await writeSessionModules(String(result.sessionId), fields, user.id);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json(
      { error: `Provisionnement interrompu : ${message}` },
      { status: 500 },
    );
  }
}
