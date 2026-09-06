import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { DasScopeProvider } from "@/components/das-scope";
import { TeamNav } from "@/components/team-nav";
import { loadDasScope } from "@/lib/server/das-scope";
import { readSecurityConfig } from "@/lib/security-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas — Simulateur de stratégie d'entreprise",
  description:
    "Atelier pédagogique de stratégie d'entreprise en environnement marocain.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Le domaine piloté est arrêté ICI, une fois, et vaut pour la barre de
  // navigation comme pour la page : les deux lisent le même contexte, donc
  // l'onglet actif et le contenu ne peuvent pas diverger.
  const scope = await loadDasScope();
  const securityConfig = await readSecurityConfig();

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        data-anti-select={securityConfig.css_anti_selection ? "on" : "off"}
      >
        <DasScopeProvider scope={scope}>
          {/* Rend `null` tant que l'utilisateur n'est rattaché à aucune équipe :
              l'écran de connexion reste nu. */}
          <TeamNav />
          {children}
        </DasScopeProvider>
      </body>
    </html>
  );
}
