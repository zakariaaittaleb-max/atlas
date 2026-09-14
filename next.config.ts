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

  /**
   * Le « Cockpit » s'appelle désormais « Dashboard ». Les favoris des
   * participants et les liens déjà distribués en salle pointent encore sur
   * l'ancienne adresse : ils suivent, au lieu d'aboutir sur une 404.
   */
  async redirects() {
    return [{ source: "/cockpit", destination: "/dashboard", permanent: true }];
  },
};

export default nextConfig;
