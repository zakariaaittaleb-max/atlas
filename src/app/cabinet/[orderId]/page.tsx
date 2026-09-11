import { notFound } from 'next/navigation';

import { STUDY_BASE_PRICES } from '@/lib/engine/consulting';
import { requireTeam } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

import { StudyReport } from './study-report';

export const metadata = { title: 'Atlas — Rapport d’étude' };
export const dynamic = 'force-dynamic';

export default async function StudyReportPage({
  params,
}: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const team = await requireTeam();

  // Lecture par le client ANONYME, donc soumise à la RLS : une équipe ne peut
  // pas ouvrir le rapport d'une autre, même en devinant l'identifiant.
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from('consulting_orders')
    .select('id, study_key, tier, das_id, target_actor_id, round_number, price_paid_mad, error_margin, payload')
    .eq('id', orderId)
    .eq('team_id', team.teamId)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: study }, { data: das }, { data: target }] = await Promise.all([
    supabase.from('consulting_studies').select('name, description')
      .eq('key', String(order.study_key)).maybeSingle(),
    order.das_id
      ? supabase.from('strategic_units').select('name').eq('id', String(order.das_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    order.target_actor_id
      ? supabase.from('ecosystem_actors').select('name')
          .eq('id', String(order.target_actor_id)).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const payload = order.payload as {
    subjects?: unknown[];
    notes?: string[];
    auditRows?: unknown[];
    auditVerdict?: string;
  } | null;

  return (
    <StudyReport
      studyName={String(study?.name ?? order.study_key)}
      studyDescription={String(study?.description ?? '')}
      scopeLabel={
        target?.name ? String(target.name)
        : das?.name ? String(das.name)
        : 'Niveau Groupe'
      }
      tier={String(order.tier)}
      errorMargin={Number(order.error_margin)}
      roundNumber={Number(order.round_number)}
      priceMad={Number(order.price_paid_mad)}
      catalogPriceMad={STUDY_BASE_PRICES[String(order.study_key)] ?? 0}
      orderId={String(order.id)}
      subjects={(payload?.subjects ?? []) as never[]}
      notes={payload?.notes ?? []}
      auditVerdict={payload?.auditVerdict ?? null}
    />
  );
}
