/**
 * Types purs, importables depuis un composant `"use client"` — contrairement à
 * `facilitator-capabilities.ts` qui embarque le client `service_role`.
 */

export type FacilitatorCapability = 'join_team_as_player';

export type FacilitatorCapabilityState = Record<FacilitatorCapability, boolean>;

export const FACILITATOR_CAPABILITIES: ReadonlyArray<{
  name: FacilitatorCapability;
  label: string;
  description: string;
}> = [
  {
    name: 'join_team_as_player',
    label: 'Entrer dans un groupe comme participant',
    description:
      "Autorise le facilitateur à rejoindre une de ses équipes et à y jouer réellement — ses saisies comptent comme celles du groupe. Il choisit d'y être visible ou discret.",
  },
];

/**
 * L'absence de réglage vaut AUTORISÉ. Une capacité nouvelle est donc utilisable
 * dès son déploiement, et le super-admin la retire explicitement à qui de
 * droit ; l'inverse rendrait la fonctionnalité muette pour tout le monde tant
 * qu'une ligne n'aurait pas été créée pour chaque facilitateur.
 */
export const DEFAULT_FACILITATOR_CAPABILITIES: FacilitatorCapabilityState = {
  join_team_as_player: true,
};
