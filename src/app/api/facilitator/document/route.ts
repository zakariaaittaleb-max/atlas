import 'server-only';

/**
 * ATLAS — les documents de séance du facilitateur.
 *
 * ── POURQUOI CE N'EST PAS UN FICHIER STATIQUE ──────────────────────────────
 * Ces deux pages contiennent les PROFILS-CIBLES exacts de l'indice
 * d'alignement : la valeur visée sur chacun des seize axes, pour chacune des
 * quatre stratégies, et le poids de chaque axe dans le score.
 *
 * C'est très précisément ce qu'une équipe utiliserait pour optimiser son
 * indice sans jamais réfléchir à sa stratégie — et cela viderait le jeu de son
 * objet. Le cabinet vend de l'information au prix fort ; la donner à qui
 * devine une URL dans `public/` serait absurde.
 *
 * D'où un Route Handler qui vérifie que l'appelant est bien LE FACILITATEUR DE
 * CETTE SESSION avant de servir quoi que ce soit. Le contrôle vit ici, au plus
 * près de la donnée, et non dans le proxy — qui ne fait que rafraîchir les
 * sessions et serait contourné par un appel direct.
 *
 * ── POURQUOI SERVIR DU HTML BRUT ───────────────────────────────────────────
 * Les deux documents sont ENGENDRÉS depuis le moteur : cibles, poids et
 * coefficients y sont extraits du code, jamais ressaisis. Les réécrire en
 * composants React les ferait diverger à la première recalibration — le défaut
 * même que l'audit a corrigé une douzaine de fois. Une seule source, servie
 * telle quelle, et intégrée par `<iframe>` dans la page de séance.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { getFacilitatorContext } from '@/lib/dal';
import { wrapDocument } from '@/lib/server/document-shell';

/** Liste blanche : le nom du document ne vient JAMAIS du chemin de la requête. */
const DOCUMENTS = {
  moteur: 'moteur-atlas.html',
  simulateur: 'simulateur-atlas.html',
} as const;

type DocumentKey = keyof typeof DOCUMENTS;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const doc = url.searchParams.get('doc') ?? '';
  const sessionId = url.searchParams.get('sessionId') ?? '';

  if (!(doc in DOCUMENTS)) {
    return NextResponse.json({ error: 'Document inconnu.' }, { status: 404 });
  }

  // Le contrôle d'accès, avant toute lecture de disque.
  const context = await getFacilitatorContext(sessionId);
  if (!context) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  }

  // `path.join` sur une valeur de la liste blanche : aucune remontée possible.
  const file = path.join(process.cwd(), 'src', 'content', DOCUMENTS[doc as DocumentKey]);

  let html: string;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    return NextResponse.json(
      { error: 'Document introuvable sur le serveur.' },
      { status: 500 },
    );
  }

  return new NextResponse(wrapDocument(html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Jamais en cache partagé : la réponse dépend de l'identité de l'appelant.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
