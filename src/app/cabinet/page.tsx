import { STUDY_BASE_PRICES, STUDY_TIERS, studyPrice, TIER_PROFILES } from '@/lib/engine/consulting';
import { buildParams } from '@/lib/engine/params';
import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { createServerClient } from '@/lib/supabase/server';

import { CabinetView, type OrderedStudy, type StudyOffer } from './cabinet-view';

export const metadata = { title: 'Atlas — Cabinet de conseil' };
export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const open = decisionsAreOpen(round?.status as string);

  const supabase = await createServerClient();

  const [{ data: studies }, { data: das }, { data: orders }, { data: targets }] = await Promise.all([
    supabase.from('consulting_studies').select('key, name, description, base_price_mad, scope'),
    supabase.from('strategic_units').select('id, name').order('name'),
    supabase
      .from('consulting_orders')
      .select('id, study_key, tier, das_id, round_number, price_paid_mad, error_margin, payload')
      .eq('team_id', team.teamId)
      .order('created_at', { ascending: false }),
    supabase
      .from('ecosystem_actors')
      .select('id, name, das_id')
      .eq('actor_type', 'cible_acquisition')
      .order('name'),
  ]);

  // Les prix sont calculés côté serveur à partir des paramètres de la session :
  // le facilitateur peut durcir ou assouplir le curseur entre deux promotions.
  const params = buildParams();

  // Le catalogue du cabinet est réglé par le facilitateur : une étude fermée
  // n'est pas grisée, elle n'est pas au catalogue. Les commandes déjà passées
  // restent lisibles plus bas — on ne réécrit pas l'histoire d'un tour joué.
  const modules = await loadEnabledModules(team.sessionId);

  const offers: StudyOffer[] = (studies ?? [])
    .filter((s) => isOn(modules, `cabinet.${String(s.key)}`))
    .map((s) => ({
      key: String(s.key),
      name: String(s.name),
      description: String(s.description ?? ''),
      scope: String(s.scope) as StudyOffer['scope'],
      tiers: STUDY_TIERS.map((tier) => ({
        tier,
        label: TIER_PROFILES[tier].label,
        priceMad: studyPrice(
          STUDY_BASE_PRICES[String(s.key)] ?? Number(s.base_price_mad),
          tier,
          params,
        ),
        errorMargin: TIER_PROFILES[tier].errorMargin,
        includesWeakSignals: TIER_PROFILES[tier].includesWeakSignals,
        bandCount: TIER_PROFILES[tier].bandCount,
      })),
    }));

  return (
    <CabinetView
      roundNumber={roundNumber}
      decisionsOpen={open}
      offers={offers}
      das={(das ?? []).map((d) => ({ id: String(d.id), name: String(d.name) }))}
      targets={(targets ?? []).map((t) => ({
        id: String(t.id), name: String(t.name), dasId: String(t.das_id),
      }))}
      orders={(orders ?? []).map((o) => ({
        orderId: String(o.id),
        studyKey: String(o.study_key),
        studyName: offers.find((s) => s.key === String(o.study_key))?.name ?? String(o.study_key),
        tier: String(o.tier),
        dasId: o.das_id ? String(o.das_id) : null,
        roundNumber: Number(o.round_number),
        priceMad: Number(o.price_paid_mad),
        errorMargin: Number(o.error_margin),
        // Le livrable FIGÉ à la commande : une équipe doit relire au tour 5 ce
        // qu'elle a acheté au tour 2, avec les mêmes chiffres — y compris s'ils
        // étaient faux. C'est la matière du débriefing.
        subjects: ((o.payload as { subjects?: unknown[] } | null)?.subjects ?? []) as
          OrderedStudy['subjects'],
        notes: ((o.payload as { notes?: string[] } | null)?.notes ?? []),
      })) as OrderedStudy[]}
    />
  );
}
