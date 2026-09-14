import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fredoka, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { endImpersonationAction } from "@/app/actions/end-impersonation";
import {
  leaveTeamAsFacilitatorAction,
  setFacilitatorVisibilityAction,
} from "@/app/actions/facilitator-play";
import { DasScopeProvider } from "@/components/das-scope";
import { parseThemeChoice, THEME_COOKIE } from "@/lib/appearance";
import { FacilitatorPlayBanner } from "@/components/facilitator-play-banner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { TeamShell } from "@/components/team-nav";
import { readDisplayConfig } from "@/lib/display-config";
import {
  FACILITATOR_PLAY_COOKIE,
  parseFacilitatorPlayCookie,
} from "@/lib/facilitator-play";
import { IMPERSONATION_LABEL_COOKIE } from "@/lib/impersonation";
import { loadTeamVisualStyle } from "@/lib/server/appearance";
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

// Titres du style « ludique » seulement : arrondie, lisible, sans enfantillage.
const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  const [scope, securityConfig, displayConfig, jar, visualStyle] = await Promise.all([
    loadDasScope(),
    readSecurityConfig(),
    readDisplayConfig(),
    cookies(),
    loadTeamVisualStyle(),
  ]);
  // Le choix du participant l'emporte sur le défaut fixé en administration.
  const themeChoice = parseThemeChoice(jar.get(THEME_COOKIE)?.value) ?? displayConfig.theme;
  const impersonationLabel = jar.get(IMPERSONATION_LABEL_COOKIE)?.value ?? null;
  const facilitatorPlay = parseFacilitatorPlayCookie(jar.get(FACILITATOR_PLAY_COOKIE)?.value);

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
      // Thème et taille de police viennent de /admin/config, lus côté serveur :
      // la première image est déjà la bonne, sans script ni clignotement. En
      // « système », aucun attribut — `prefers-color-scheme` décide.
      data-theme={themeChoice === "system" ? undefined : themeChoice}
      // Le style de la session, choisi par le facilitateur (« sobre » par défaut).
      data-style={visualStyle === "ludique" ? "ludique" : undefined}
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
