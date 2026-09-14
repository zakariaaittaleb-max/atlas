/**
 * ATLAS — soumettre son tour, ou retirer sa soumission.
 *
 * La soumission est refusée tant qu'une décision obligatoire manque : c'est la
 * même liste que la barre du bas et que la navigation (`missingDecisions`), si
 * bien qu'une équipe ne peut pas soumettre ce que l'écran lui dit incomplet.
 *
 * Elle ne fige rien. Les saisies restent modifiables jusqu'au verrouillage ; la
 * soumission dit au facilitateur que l'équipe a fini de débattre.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decisionsAreOpen, getRoundState, getTeamContext } from '@/lib/dal';
import { loadDecisionContext, missingDecisions } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { createAdminClient } from '@/lib/supabase/server';

const Body = z.object({ action: z.enum(['submit', 'withdraw']) });

export async function POST(request: Request) {
  const team = await getTeamContext();
  if (!team) {
    return NextResponse.json({ error: 'Connectez-vous à votre équipe pour soumettre un tour.' }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  if (team.isLiquidated) {
    return NextResponse.json({ error: 'Votre groupe a été liquidé : il ne soumet plus de tour.' }, { status: 409 });
  }

  const round = await getRoundState(team.sessionId);
  if (!decisionsAreOpen(round?.status as string)) {
    return NextResponse.json(
      { error: 'Le tour est verrouillé : la soumission ne peut plus changer.' },
      { status: 409 },
    );
  }
  const roundNumber = Number(round?.current_round ?? 0);
  const admin = createAdminClient();

  if (parsed.data.action === 'withdraw') {
    const { error } = await admin
      .from('team_round_submissions')
      .delete()
      .eq('team_id', team.teamId)
      .eq('round_number', roundNumber);
    if (error) return NextResponse.json({ error: `Retrait impossible : ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, submittedAt: null });
  }

  const [context, modules] = await Promise.all([
    loadDecisionContext(),
    loadEnabledModules(team.sessionId),
  ]);
  const missing = missingDecisions(context, modules);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Il manque encore : ${missing.map((m) => m.label).join(', ')}.`,
        missing,
      },
      { status: 409 },
    );
  }

  const submittedAt = new Date().toISOString();
  const { error } = await admin.from('team_round_submissions').upsert(
    {
      team_id: team.teamId,
      round_number: roundNumber,
      submitted_at: submittedAt,
      submitted_by: team.userId,
    },
    { onConflict: 'team_id,round_number' },
  );
  if (error) return NextResponse.json({ error: `Soumission impossible : ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, submittedAt });
}
