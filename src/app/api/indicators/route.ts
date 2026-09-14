/**
 * Indicateurs d'aide à la décision, servis à la demande.
 *
 * Chaque bloc de décision porte un bouton « Indicateurs » : il ouvre les
 * chiffres qui éclairent CETTE décision — un prix se juge à la part de marché
 * et à la marge, un volume d'achat au stock et aux ventes perdues. Les charger
 * à l'ouverture plutôt qu'avec la page garde les écrans de saisie aussi légers
 * qu'avant : la plupart des blocs ne seront jamais ouverts.
 *
 * La donnée est celle du dashboard (`loadDashboardContext`), lue avec le client
 * de l'équipe, donc soumise à la RLS : une équipe n'obtient ici rien qu'elle ne
 * voie déjà sur son tableau de bord. La sélection et la mise en forme vivent
 * dans `lib/decision-indicators.ts`, pure et testée.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getTeamContext } from '@/lib/dal';
import { INDICATOR_TOPICS, buildIndicatorSheet } from '@/lib/decision-indicators';
import { loadDashboardContext } from '@/lib/server/dashboard-context';

const Query = z.object({
  topic: z.enum(INDICATOR_TOPICS),
  das: z.string().min(1).max(64).nullable(),
});

export async function GET(request: Request) {
  const team = await getTeamContext();
  if (!team) {
    return NextResponse.json({ error: 'Session expirée : reconnectez-vous.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    topic: url.searchParams.get('topic'),
    das: url.searchParams.get('das'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Demande d’indicateurs invalide.' }, { status: 400 });
  }

  const context = await loadDashboardContext();
  return NextResponse.json(
    buildIndicatorSheet(context, parsed.data.topic, parsed.data.das),
    // Un chiffre de la veille sous une décision d'aujourd'hui serait pire que
    // pas de chiffre : aucune mise en cache, ni navigateur ni intermédiaire.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
