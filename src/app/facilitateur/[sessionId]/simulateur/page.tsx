import 'server-only';

import { DocumentFrame } from '../document-frame';

export const metadata = { title: 'Atlas — Simulateur d’impacts' };
export const dynamic = 'force-dynamic';

export default async function SimulateurPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  return (
    <DocumentFrame
      sessionId={sessionId}
      doc="simulateur"
      title="Simulateur d’impacts"
      lede="Déplacez une décision et montrez ce qu’elle déplace ailleurs. Les coefficients sont
        extraits du moteur : ce que la salle voit bouger ici est ce que la résolution calcule.
        L’outil du débriefing, quand une équipe conteste un résultat."
      siblingHref={`/facilitateur/${sessionId}/moteur`}
      siblingLabel="Cartographie du moteur"
    />
  );
}
