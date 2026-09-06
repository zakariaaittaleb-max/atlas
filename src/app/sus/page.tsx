import 'server-only';

import { requireTeam } from '@/lib/dal';
import { loadSusAggregate } from '@/lib/server/sus';
import { createAdminClient } from '@/lib/supabase/server';

import { SusView } from './sus-view';

export const metadata = { title: 'Atlas — Questionnaire de satisfaction' };
export const dynamic = 'force-dynamic';

export default async function SusPage() {
  const team = await requireTeam();

  const admin = createAdminClient();
  const [{ data: mine }, aggregate] = await Promise.all([
    admin
      .from('sus_responses')
      .select('score')
      .eq('session_id', team.sessionId)
      .eq('user_id', team.userId)
      .maybeSingle(),
    loadSusAggregate(team.sessionId),
  ]);

  return (
    <SusView
      alreadySubmitted={Boolean(mine)}
      myScore={mine ? Number(mine.score) : null}
      initialAggregate={aggregate}
    />
  );
}
