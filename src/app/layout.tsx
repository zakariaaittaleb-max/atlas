import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TeamNav } from "@/components/team-nav";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Rend `null` tant que l'utilisateur n'est rattaché à aucune équipe :
            l'écran de connexion reste nu. */}
        <TeamNav />
        {children}
      </body>
    </html>
  );
}
