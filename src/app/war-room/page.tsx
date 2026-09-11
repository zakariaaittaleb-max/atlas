import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

import { WarRoomView, type ActiveShock } from './war-room-view';

export const metadata = { title: 'Atlas — War Room' };
export const dynamic = 'force-dynamic';

export default async function WarRoomPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;

  const supabase = await createServerClient();

  // `market_shocks` n'est lisible qu'une fois le choc SURVENU (politique
  // `read_triggered_shocks`), et `shock_cards` n'expose que le nom et la
  // description — jamais les effets. Une équipe voit ce qui lui tombe dessus,
  // pas son amplitude exacte.
  const [{ data: shocks }, { data: cards }, { data: das }, { data: responses }, { data: pnl }] =
    await Promise.all([
      supabase.from('market_shocks').select('id, card_key, das_id, round_number, rounds_remaining')
        .order('round_number', { ascending: false }),
      supabase.from('shock_cards').select('key, name, description, nature, pestel_dimension, source_reference'),
      supabase.from('strategic_units').select('id, name'),
      supabase.from('shock_responses').select('shock_id, plan, cost_mad')
        .eq('team_id', team.teamId),
      supabase.from('pnl_statements').select('revenue_mad')
        .eq('team_id', team.teamId).eq('round_number', roundNumber - 1).maybeSingle(),
    ]);

  const cardByKey = new Map((cards ?? []).map((c) => [String(c.key), c]));
  const dasByName = new Map((das ?? []).map((d) => [String(d.id), String(d.name)]));
  const responseByShock = new Map(
    (responses ?? []).map((r) => [
      String(r.shock_id),
      { plan: r.plan ? String(r.plan) : null, budgetMad: Number(r.cost_mad ?? 0) },
    ]),
  );

  const active: ActiveShock[] = (shocks ?? []).map((s) => {
    const card = cardByKey.get(String(s.card_key));
    return {
      shockId: String(s.id),
      name: String(card?.name ?? s.card_key),
      description: String(card?.description ?? ''),
      nature: String(card?.nature ?? 'menace'),
      dimension: String(card?.pestel_dimension ?? ''),
      source: card?.source_reference ? String(card.source_reference) : null,
      dasName: dasByName.get(String(s.das_id)) ?? '—',
      roundNumber: Number(s.round_number),
      roundsRemaining: Number(s.rounds_remaining),
      plan: responseByShock.get(String(s.id))?.plan ?? null,
      budgetMad: responseByShock.get(String(s.id))?.budgetMad ?? 0,
    };
  });

  return (
    <WarRoomView
      roundNumber={roundNumber}
      decisionsOpen={decisionsAreOpen(round?.status as string)}
      shocks={active}
      previousRevenueMad={Number(pnl?.revenue_mad ?? 0)}
    />
  );
}
