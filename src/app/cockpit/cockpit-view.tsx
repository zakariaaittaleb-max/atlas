'use client';

/**
 * Le cockpit suit le domaine choisi dans la barre du haut, comme les écrans de
 * saisie. Ce composant n'existe que pour lire ce périmètre : `useDasScope` est
 * un hook client, et la page qui charge les données est un composant serveur.
 */

import { useDasScope } from '@/components/das-scope';
import { DashboardView } from '@/components/dashboard-view';
import type { DashboardContext } from '@/lib/dashboard-types';

export function CockpitView({ context }: { context: DashboardContext }) {
  const { activeDasId } = useDasScope();
  return <DashboardView context={context} activeDasId={activeDasId} />;
}
