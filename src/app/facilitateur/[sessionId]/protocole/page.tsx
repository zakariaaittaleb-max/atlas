import 'server-only';

import { notFound } from 'next/navigation';

import { getFacilitatorContext } from '@/lib/dal';
import { loadSusAggregate } from '@/lib/server/sus';
import { createAdminClient } from '@/lib/supabase/server';

import { ProtocoleView } from './protocole-view';
import type { ProtocolData } from './actions';

export const metadata = { title: 'Atlas — Protocole de test d’utilisabilité' };
export const dynamic = 'force-dynamic';

const EMPTY: ProtocolData = {
  facilitator: '', email: '', date: '', location: '', profile: '',
  tasks: [
    "Connexion via codes et découverte de l'interface",
    'Prendre une décision au Plan 1 et la valider',
    'Consulter le diagnostic du cabinet conseil',
    'Vérifier les résultats et la comparaison concurrents',
  ],
  observations: '', friction: '', success: '', duration: '',
  debrief: { q1: '', q2: '', q3: '', q4: '' },
};

export default async function ProtocolePage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const context = await getFacilitatorContext(sessionId);
  if (!context) notFound();

  const admin = createAdminClient();
  const [{ data: notes }, sus] = await Promise.all([
    admin.from('ux_protocol_notes').select('data').eq('session_id', sessionId).maybeSingle(),
    loadSusAggregate(sessionId),
  ]);

  const saved = (notes?.data ?? {}) as Partial<ProtocolData>;
  const initial: ProtocolData = { ...EMPTY, ...saved, debrief: { ...EMPTY.debrief, ...saved.debrief } };

  return (
    <ProtocoleView
      sessionId={sessionId}
      sessionName={context.sessionName}
      initial={initial}
      sus={sus}
    />
  );
}
