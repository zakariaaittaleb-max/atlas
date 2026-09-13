import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { endImpersonationAction } from "@/app/actions/end-impersonation";
import {
  leaveTeamAsFacilitatorAction,
  setFacilitatorVisibilityAction,
} from "@/app/actions/facilitator-play";
import { DasScopeProvider } from "@/components/das-scope";
import { FacilitatorPlayBanner } from "@/components/facilitator-play-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { TeamShell } from "@/components/team-nav";
import { readDisplayConfig } from "@/lib/display-config";
import {
  FACILITATOR_PLAY_COOKIE,
  parseFacilitatorPlayCookie,
} from "@/lib/facilitator-play";
import { IMPERSONATION_LABEL_COOKIE } from "@/lib/impersonation";
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
  const [scope, securityConfig, displayConfig, jar] = await Promise.all([
    loadDasScope(),
    readSecurityConfig(),
    readDisplayConfig(),
    cookies(),
  ]);
  const impersonationLabel = jar.get(IMPERSONATION_LABEL_COOKIE)?.value ?? null;
  const facilitatorPlay = parseFacilitatorPlayCookie(jar.get(FACILITATOR_PLAY_COOKIE)?.value);

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Thème et taille de police viennent de /admin/config, lus côté serveur :
      // la première image est déjà la bonne, sans script ni clignotement. En
      // « système », aucun attribut — `prefers-color-scheme` décide.
      data-theme={displayConfig.theme === "system" ? undefined : displayConfig.theme}
      data-font-scale={displayConfig.fontScale === "grand" ? "grand" : undefined}
    >
      <body
        className="min-h-full flex flex-col"
        data-anti-select={securityConfig.css_anti_selection ? "on" : "off"}
      >
        {impersonationLabel ? (
          <ImpersonationBanner
            adminEmail={impersonationLabel}
            endImpersonationAction={endImpersonationAction}
          />
        ) : null}
        {facilitatorPlay ? (
          <FacilitatorPlayBanner
            sessionId={facilitatorPlay.sessionId}
            teamName={facilitatorPlay.teamName}
            visible={facilitatorPlay.visible}
            leaveAction={leaveTeamAsFacilitatorAction}
            setVisibilityAction={setFacilitatorVisibilityAction}
          />
        ) : null}
        <DasScopeProvider scope={scope}>
          {/* Sans équipe (connexion, facilitateur, admin), la coque rend ses
              enfants tels quels : ces écrans restent nus. */}
          <TeamShell>{children}</TeamShell>
        </DasScopeProvider>
      </body>
    </html>
  );
}
