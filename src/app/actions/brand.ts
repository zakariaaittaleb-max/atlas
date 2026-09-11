"use server";

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getTeamContext } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

export type BrandResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * L'équipe baptise — ou rebaptise — un de ses domaines.
 *
 * Un domaine s'appelait « Agro-industrie » pour tout le monde : le nom du
 * SECTEUR. Trois équipes sur le même marché pilotaient trois affaires portant
 * le même nom, et aucune ne pouvait dire « notre marque » en salle.
 *
 * L'écriture passe par le client ANONYME, donc par la RLS : la politique de
 * `team_units` n'autorise que les lignes de l'équipe, et c'est elle qui garde
 * l'accès plutôt qu'un contrôle recopié ici. Un identifiant de domaine emprunté
 * ne modifie donc rien.
 *
 * Un nom vide EFFACE la marque : on retombe sur le nom du secteur, ce qui est
 * un état légitime et non une erreur de saisie.
 */
export async function renameBrandAction(input: {
  dasId: string;
  brandName: string;
}): Promise<BrandResult> {
  const team = await getTeamContext();
  if (!team) return { ok: false, error: 'Non authentifié.' };

  const name = input.brandName.trim().slice(0, 40);
  const supabase = await createServerClient();

  const { error } = await supabase
    .from('team_units')
    .update({ brand_name: name.length > 0 ? name : null })
    .eq('team_id', team.teamId)
    .eq('das_id', input.dasId);

  if (error) return { ok: false, error: `Renommage refusé : ${error.message}` };

  revalidatePath('/', 'layout');
  return { ok: true, name };
}
