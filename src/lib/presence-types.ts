/**
 * Types purs de la présence, importables depuis un composant `"use client"` —
 * contrairement à `server/presence-context.ts`, qui lit la base avec la clé
 * `service_role`.
 */

import type { TeamColor } from './team-colors';

export interface PresenceMember {
  userId: string;
  name: string;
  isFacilitator: boolean;
}

export interface PresenceTeam {
  id: string;
  name: string;
  color: TeamColor;
}

export interface PresenceContext {
  sessionId: string;
  userId: string;
  teamId: string;
  teamName: string;
  teamColor: TeamColor;
  /** Prénom de l'utilisateur courant, tel qu'il sera diffusé à son équipe. */
  selfName: string;
  /** Vrai si le facilitateur joue ici et a choisi de rester discret. */
  hidden: boolean;
  /** Son groupe, nominativement. */
  roster: PresenceMember[];
  /** Tous les groupes de la session, pour le code couleurs et les effectifs. */
  teams: PresenceTeam[];
}
