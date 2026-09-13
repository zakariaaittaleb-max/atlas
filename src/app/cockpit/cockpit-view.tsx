'use client';

/**
 * Le cockpit suit le domaine choisi dans la barre du haut, comme les écrans de
 * saisie. Ce composant n'existe que pour lire ce périmètre : `useDasScope` est
 * un hook client, et la page qui charge les données est un composant serveur.
 */

import { useDasScope } from '@/components/das-scope';
import { DashboardView } from '@/components/dashboard-view';
import type { DashboardContext } from '@/lib/dashboard-types';
import type { DashboardSectionKey, ViewLevel } from '@/lib/display-config-types';

export function CockpitView({
  context,
  sections,
  initialView,
}: {
  context: DashboardContext;
  sections: Record<DashboardSectionKey, boolean>;
  initialView: ViewLevel;
}) {
  const { activeDasId } = useDasScope();
  return (
    <DashboardView
      context={context}
      activeDasId={activeDasId}
      sections={sections}
      initialView={initialView}
    />
  );
}
