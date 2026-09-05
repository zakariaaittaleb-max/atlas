import 'server-only';

import { DocumentFrame } from '../document-frame';

export const metadata = { title: 'Atlas — Cartographie du moteur' };
export const dynamic = 'force-dynamic';

export default async function MoteurPage({
  params,
}: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  return (
    <DocumentFrame
      sessionId={sessionId}
      doc="moteur"
      title="Cartographie du moteur"
      lede="Chaque variable saisie, la colonne qui la porte, le calcul qui la consomme, et le
        décalage temporel qui la rend enseignable. De quoi répondre en séance à « pourquoi
        ai-je perdu des parts alors que j’ai investi ? » sans ouvrir le code."
      siblingHref={`/facilitateur/${sessionId}/simulateur`}
      siblingLabel="Simulateur d’impacts"
    />
  );
}
