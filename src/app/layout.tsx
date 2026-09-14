import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fredoka, Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

import { endImpersonationAction } from "@/app/actions/end-impersonation";
import {
  leaveTeamAsFacilitatorAction,
  setFacilitatorVisibilityAction,
} from "@/app/actions/facilitator-play";
import { DasScopeProvider } from "@/components/das-scope";
import { I18nProvider } from "@/components/i18n-provider";
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
import { DEFAULT_LOCALE, dirOf } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";
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

// L'arabe : Geist n'en porte pas les glyphes.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
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
  const [scope, securityConfig, displayConfig, jar, visualStyle, chosenLocale] = await Promise.all([
    loadDasScope(),
    readSecurityConfig(),
    readDisplayConfig(),
    cookies(),
    loadTeamVisualStyle(),
    getLocale(),
  ]);
  // Premier incrément des langues : les écrans d'équipe sont traduits, pas
  // encore le pilotage ni la connexion. Hors équipe, on reste en français
  // plutôt que d'afficher du français de droite à gauche.
  const locale = scope ? chosenLocale : DEFAULT_LOCALE;
  // Le choix du participant l'emporte sur le défaut fixé en administration.
  const themeChoice = parseThemeChoice(jar.get(THEME_COOKIE)?.value) ?? displayConfig.theme;
  const impersonationLabel = jar.get(IMPERSONATION_LABEL_COOKIE)?.value ?? null;
  const facilitatorPlay = parseFacilitatorPlayCookie(jar.get(FACILITATOR_PLAY_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} ${notoArabic.variable} h-full antialiased`}
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
        <I18nProvider locale={locale}>
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
        </I18nProvider>
      </body>
    </html>
  );
}
