import 'server-only';

/**
 * Ce qu'un participant a le droit de savoir des autres.
 *
 * Deux niveaux, délibérément différents :
 *
 *   • **Son groupe, en détail** — les prénoms de ceux qui travaillent avec lui.
 *     Une équipe qui décide ensemble doit savoir qui est là.
 *   • **Les autres groupes, en nombre seulement** — combien sont connectés,
 *     jamais qui. Le principe directeur de la RLS (§12 du schéma) est que rien
 *     d'une équipe adverse ne transpire ; la liste nominative de ses membres ne
 *     ferait pas exception.
 *
 * D'où la séparation en deux canaux temps réel côté navigateur : le canal de
 * session ne transporte QUE des identifiants d'équipe, le canal d'équipe ne
 * transporte les prénoms qu'à ceux qui y ont déjà droit.
 */

import { getTeamContext } from '../dal';
import type { PresenceContext, PresenceMember } from '../presence-types';
import { assignTeamColors } from '../team-colors';
import { createAdminClient } from '../supabase/server';

export async function loadPresenceContext(): Promise<PresenceContext | null> {
  const team = await getTeamContext();
  if (!team) return null;

  const admin = createAdminClient();
  const [{ data: teams }, { data: members }] = await Promise.all([
    admin.from('teams').select('id, name').eq('session_id', team.sessionId),
    admin
      .from('team_members')
      .select('user_id, display_name, is_facilitator, facilitator_visible')
      .eq('team_id', team.teamId),
  ]);

  const coloured = assignTeamColors(
    (teams ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
  );

  const roster: PresenceMember[] = (members ?? [])
    // Un facilitateur en mode discret est absent de la liste pour tout le monde
    // sauf pour lui-même : sinon « discret » ne voudrait rien dire.
    .filter(
      (row) =>
        !row.is_facilitator ||
        row.facilitator_visible ||
        String(row.user_id) === team.userId,
    )
    .map((row) => ({
      userId: String(row.user_id),
      name: String(row.display_name ?? 'Participant'),
      isFacilitator: Boolean(row.is_facilitator),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const self = (members ?? []).find((row) => String(row.user_id) === team.userId);

  return {
    sessionId: team.sessionId,
    userId: team.userId,
    teamId: team.teamId,
    teamName: team.teamName,
    teamColor:
      coloured.find((t) => t.id === team.teamId)?.color ?? coloured[0]?.color ??
      { hex: 'var(--accent)', label: 'bleu' },
    selfName: String(team.displayName ?? 'Participant'),
    hidden: Boolean(self?.is_facilitator) && !self?.facilitator_visible,
    roster,
    teams: coloured.map(({ id, name, color }) => ({ id, name, color })),
  };
}
