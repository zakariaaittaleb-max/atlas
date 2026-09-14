import 'server-only';

import { cache } from 'react';

import { parseVisualStyle, type VisualStyle } from '@/lib/appearance';
import { getTeamContext } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Le style de la session de l'équipe connectée ; « sobre » hors équipe.
 *
 * Lu par la clé de service : la colonne n'est pas exposée aux équipes, et elle
 * ne dit rien d'autre que l'habillage choisi par le facilitateur.
 */
export const loadTeamVisualStyle = cache(async (): Promise<VisualStyle> => {
  const team = await getTeamContext();
  if (!team) return 'corporate';

  const { data } = await createAdminClient()
    .from('game_sessions')
    .select('visual_style')
    .eq('id', team.sessionId)
    .maybeSingle();
  return parseVisualStyle(data?.visual_style);
});
