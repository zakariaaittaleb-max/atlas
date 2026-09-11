import 'server-only';

/**
 * Portefeuille de DAS de l'équipe, et celui qu'elle pilote en ce moment.
 *
 * Lecture par le client ANONYME, donc soumise à la RLS : une équipe ne peut
 * structurellement pas voir le portefeuille d'une autre, même si le code en
 * faisait la demande.
 *
 * Le cookie n'est jamais cru sur parole — il est confronté au portefeuille réel
 * par `resolveActiveDas`. Un identifiant forgé retombe sur le premier domaine.
 */

import { cookies } from 'next/headers';

import { getTeamContext } from '@/lib/dal';
import { DAS_COOKIE, resolveActiveDas, type DasOption, type DasScope } from '@/lib/das-scope';
import { createServerClient } from '@/lib/supabase/server';

export async function loadDasScope(): Promise<DasScope | null> {
  const team = await getTeamContext();
  if (!team) return null;

  const supabase = await createServerClient();
  const { data: units } = await supabase
    .from('team_units')
    .select('das_id, status, launched_round, brand_name, strategic_units(id, name, sector_key)')
    .eq('team_id', team.teamId)
    .in('status', ['active', 'listed_for_sale']);

  const das: DasOption[] = (units ?? [])
    .map((u) => {
      const unit = u.strategic_units as unknown as
        { id: string; name: string; sector_key: string } | null;
      if (!unit) return null;
      const launchedRound = Number(u.launched_round ?? 0);
      const brandName = u.brand_name ? String(u.brand_name) : null;
      return {
        dasId: String(u.das_id),
        // La marque prime à l'affichage ; le secteur reste disponible à côté.
        name: brandName ?? unit.name,
        activityName: unit.name,
        brandName,
        sectorKey: unit.sector_key,
        status: (String(u.status) === 'listed_for_sale' ? 'listed_for_sale' : 'active') as
          DasOption['status'],
        launchedRound,
        // Le tour 0 est la dotation ; au-delà, le domaine a été acheté.
        acquired: launchedRound > 0,
      };
    })
    .filter((d): d is DasOption => d !== null)
    // Ordre stable : la dotation d'abord, les acquisitions dans l'ordre où
    // elles sont entrées. Un ordre qui change à chaque rendu ferait bouger les
    // onglets sous le curseur.
    .sort((a, b) => a.launchedRound - b.launchedRound || a.name.localeCompare(b.name, 'fr'));

  const wanted = (await cookies()).get(DAS_COOKIE)?.value ?? null;

  return { das, activeDasId: resolveActiveDas(das, wanted) };
}
