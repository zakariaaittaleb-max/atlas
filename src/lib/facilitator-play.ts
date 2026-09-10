/**
 * Nom et forme du cookie posé quand un facilitateur entre dans un groupe pour
 * y jouer. Partagé entre l'action qui l'ouvre, celle qui le referme, et le
 * bandeau de retour affiché dans `layout.tsx` — un seul nom des deux côtés,
 * sinon l'un pose un cookie que l'autre ne sait pas lire.
 *
 * Le cookie ne fait AUTORITÉ sur rien : il ne sert qu'à afficher le bandeau et
 * à savoir vers quelle session revenir. Le droit de jouer, lui, se revérifie en
 * base à chaque écriture.
 */
export const FACILITATOR_PLAY_COOKIE = 'atlas_facilitator_play';

export interface FacilitatorPlayState {
  sessionId: string;
  teamId: string;
  teamName: string;
  visible: boolean;
}

export function parseFacilitatorPlayCookie(
  raw: string | undefined,
): FacilitatorPlayState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FacilitatorPlayState>;
    if (!parsed.sessionId || !parsed.teamId) return null;
    return {
      sessionId: String(parsed.sessionId),
      teamId: String(parsed.teamId),
      teamName: String(parsed.teamName ?? 'votre équipe'),
      visible: parsed.visible !== false,
    };
  } catch {
    return null;
  }
}
