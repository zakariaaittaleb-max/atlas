'use client';

/**
 * Qui est là.
 *
 * Une équipe travaillait jusqu'ici sans savoir si ses coéquipiers étaient
 * connectés — trois personnes autour d'une table pouvaient saisir la même
 * décision trois fois, ou attendre une quatrième déjà partie.
 *
 * La présence passe par Supabase Realtime, pas par la base : elle est vraie à
 * la seconde et ne laisse aucune trace à nettoyer quand un onglet se ferme.
 * Deux canaux, et cette séparation porte une règle de confidentialité :
 * le canal de SESSION ne transporte qu'un identifiant d'équipe — de quoi
 * compter les autres groupes, jamais de quoi les nommer ; le canal d'ÉQUIPE ne
 * transporte les prénoms qu'entre coéquipiers.
 */

import { useEffect, useMemo, useState } from 'react';

import type { PresenceContext } from '@/lib/presence-types';
import { createClient } from '@/lib/supabase/client';

export function PresenceBar({ context }: { context: PresenceContext }) {
  const [onlineIds, setOnlineIds] = useState<readonly string[]>([]);
  const [countsByTeam, setCountsByTeam] = useState<Record<string, number>>({});

  const { sessionId, teamId, userId, hidden } = context;

  useEffect(() => {
    const supabase = createClient();

    // La clé de présence est l'identifiant de l'utilisateur, pas celui de la
    // connexion : deux onglets ouverts par la même personne comptent pour une.
    const teamChannel = supabase.channel(`atlas-team-${teamId}`, {
      config: { presence: { key: userId } },
    });
    teamChannel
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(Object.keys(teamChannel.presenceState()));
      })
      .subscribe(async (status) => {
        // Un facilitateur discret écoute sans s'annoncer.
        if (status === 'SUBSCRIBED' && !hidden) await teamChannel.track({});
      });

    const sessionChannel = supabase.channel(`atlas-session-${sessionId}`, {
      config: { presence: { key: userId } },
    });
    sessionChannel
      .on('presence', { event: 'sync' }, () => {
        const state = sessionChannel.presenceState<{ teamId?: string }>();
        const counts: Record<string, number> = {};
        for (const entries of Object.values(state)) {
          const team = entries[0]?.teamId;
          if (team) counts[team] = (counts[team] ?? 0) + 1;
        }
        setCountsByTeam(counts);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !hidden) await sessionChannel.track({ teamId });
      });

    return () => {
      void supabase.removeChannel(teamChannel);
      void supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, teamId, userId, hidden]);

  const online = useMemo(() => new Set(onlineIds), [onlineIds]);
  const ownOnline = context.roster.filter((member) => online.has(member.userId)).length;
  const others = context.teams.filter((team) => team.id !== teamId);

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 hover:underline">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: context.teamColor.hex }}
        />
        <span className="tabular">
          {ownOnline} connecté{ownOnline > 1 ? 's' : ''}
        </span>
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-(--border) bg-(--surface) p-4 text-sm shadow-lg">
        <p className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: context.teamColor.hex }}
          />
          {context.teamName}
          <span className="text-(--foreground-muted)">({context.teamColor.label})</span>
        </p>

        <ul className="mt-3 space-y-1.5">
          {context.roster.map((member) => {
            const isSelf = member.userId === context.userId;
            // Un facilitateur discret ne s'annonce sur aucun canal : il ne peut
            // donc pas se voir « en ligne ». Le dire « hors ligne » ressemblerait
            // à une panne — c'est son propre choix de discrétion qu'il lit ici.
            const isOnline = online.has(member.userId) || (isSelf && hidden);
            const status = isSelf && hidden ? 'discret' : isOnline ? 'en ligne' : 'hors ligne';
            return (
              <li key={member.userId} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      isSelf && hidden
                        ? 'var(--warning)'
                        : isOnline
                          ? 'var(--positive)'
                          : 'var(--border)',
                  }}
                />
                <span className={isOnline ? '' : 'text-(--foreground-muted)'}>
                  {member.name}
                  {isSelf ? ' (vous)' : ''}
                </span>
                {member.isFacilitator ? (
                  <span className="rounded bg-(--surface-muted) px-1.5 py-0.5 text-xs text-(--foreground-muted)">
                    Facilitateur
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-(--foreground-muted)">
                  {status}
                </span>
              </li>
            );
          })}
        </ul>

        {hidden ? (
          <p className="mt-3 rounded-lg bg-(--surface-muted) px-3 py-2 text-xs text-(--foreground-muted)">
            Vous êtes en mode discret : le groupe ne vous voit pas dans cette liste.
          </p>
        ) : null}

        {others.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
              Autres groupes
            </p>
            <ul className="mt-2 space-y-1.5">
              {others.map((team) => (
                <li key={team.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: team.color.hex }}
                  />
                  <span>{team.name}</span>
                  <span className="ml-auto tabular text-(--foreground-muted)">
                    {countsByTeam[team.id] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  );
}
