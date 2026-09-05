import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Les documents de séance du facilitateur — cartographie du moteur et
   * simulateur d'impacts — sont du HTML engendré, lu à l'exécution par
   * `/api/facilitator/document`.
   *
   * Ils vivent dans `src/content/` et NON dans `public/` : ils donnent les
   * profils-cibles exacts de l'indice d'alignement, et un fichier statique
   * serait lisible par toute équipe qui devine l'URL. Le revers, c'est qu'ils
   * ne sont pas des modules — rien ne les tire dans la trace de fichiers d'une
   * compilation autonome, et la route les chercherait en vain en production.
   */
  outputFileTracingIncludes: {
    "/api/facilitator/document": ["./src/content/**"],
  },
};

export default nextConfig;
