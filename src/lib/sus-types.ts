/**
 * ATLAS — formes de données du questionnaire SUS, lisibles côté client.
 *
 * Elles vivaient dans `lib/server/sus.ts`, module `server-only` : les écrans
 * client du questionnaire et du protocole l'importaient pour ses seuls types,
 * ce qui suffisait à le faire entrer dans leur graphe d'imports — et avec lui
 * `lib/dal` et le client Supabase de service. `boundaries.test.ts` le refuse,
 * type ou pas. Les formes sont donc ici ; le chargement reste au serveur.
 */

export interface SusResponseRow {
  label: string;
  score: number;
  comment: string;
  createdAt: string;
}

export interface SusAggregate {
  count: number;
  average: number | null;
  responses: SusResponseRow[];
}

export type SubmitSusResult =
  | { ok: true; score: number; aggregate: SusAggregate }
  | { ok: false; error: string };
