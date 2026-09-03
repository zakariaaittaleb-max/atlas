import Link from 'next/link';

import { getTeamContext, getRoundState } from '@/lib/dal';
import { formatMadCompact } from '@/lib/format';
import { loadMoneyBar } from '@/lib/server/money-bar';

/**
 * Barre de navigation d'équipe.
 *
 * Deux niveaux de navigation maximum (doc 00 §8) : cette barre est le seul
 * niveau, chaque écran est une destination. L'état du tour y figure en
 * permanence — une équipe doit savoir à tout instant si ses décisions sont
 * encore modifiables, sans avoir à ouvrir un onglet pour le découvrir.
 */

const LINKS = [
  { href: '/cockpit', label: 'Cockpit' },
  { href: '/strategie', label: 'Stratégie' },
  { href: '/organisation', label: 'Organisation' },
  { href: '/marches', label: 'Achats & distribution' },
  { href: '/finance', label: 'Organisation & finance' },
  { href: '/war-room', label: 'War Room' },
  { href: '/cabinet', label: 'Cabinet' },
  { href: '/cession', label: 'Cession' },
  { href: '/revelation', label: 'Révélation' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Session non ouverte',
  onboarding: 'Onboarding — décisions ouvertes',
  round_active: 'Décisions ouvertes',
  round_locked: 'Tour verrouillé',
  round_resolving: 'Calcul en cours',
  round_resolved: 'Résultats publiés',
  completed: 'Session terminée',
};

export async function TeamNav() {
  const team = await getTeamContext();
  if (!team) return null;

  const [round, money] = await Promise.all([
    getRoundState(team.sessionId),
    loadMoneyBar(),
  ]);
  const status = String(round?.status ?? 'draft');
  const currentRound = Number(round?.current_round ?? 0);
  const open = status === 'round_active' || status === 'onboarding';

  return (
    <nav className="border-b border-(--border) bg-(--surface)">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <span className="font-semibold tracking-tight">Atlas</span>

        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {/* Le dossier initial reste accessible tout au long de la partie :
              les trames de matrices servent jusqu'au débriefing. */}
          <a href="/api/export?type=dossier_initial" className="hover:underline">
            Dossier initial
          </a>
          <a href="/api/export?type=resultats_tour" className="hover:underline">
            Mes résultats
          </a>
          <span className="tabular text-(--foreground-muted)">
            {currentRound === 0 ? 'T0' : `Tour ${currentRound}`}
          </span>
          {/* L'état est porté par un point ET par du texte : jamais par la
              seule couleur, y compris sur un vidéoprojecteur délavé. */}
          <span
            className="flex items-center gap-1.5"
            style={{ color: open ? 'var(--positive)' : 'var(--warning)' }}
          >
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-current" />
            {STATUS_LABELS[status] ?? status}
          </span>

          {/* En POST : une déconnexion en GET pourrait être déclenchée par un
              lien préchargé ou une image. */}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      {/* ── L'argent, en permanence ──────────────────────────────────────
          Une équipe engageait des dépenses sur quatre écrans sans jamais voir
          la somme, et découvrait le dépassement à la résolution. Ces trois
          nombres la suivent partout. */}
      {money ? (
        <div className="border-t border-(--border) bg-(--surface-muted)">
          <div className="tabular mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center gap-x-6 gap-y-1.5 px-6 py-2 text-sm">
            <span>
              <span className="text-(--foreground-muted)">Vous disposez de </span>
              <strong>{formatMadCompact(money.availableMad)}</strong>
              {money.drawnThisRoundMad > 0 ? (
                <span className="text-(--foreground-muted)">
                  {' '}(dont {formatMadCompact(money.drawnThisRoundMad)} de crédit pris)
                </span>
              ) : null}
            </span>

            <span>
              <span className="text-(--foreground-muted)">Engagé ce tour </span>
              <strong
                style={{
                  color:
                    money.engagedMad > money.availableMad ? 'var(--negative)' : undefined,
                }}
              >
                {formatMadCompact(money.engagedMad)}
              </strong>
            </span>

            <span>
              <span className="text-(--foreground-muted)">Il vous reste </span>
              <strong
                style={{
                  color:
                    money.availableMad - money.engagedMad < 0 ? 'var(--negative)' : undefined,
                }}
              >
                {formatMadCompact(money.availableMad - money.engagedMad)}
              </strong>
            </span>

            {money.debtOutstandingMad > 0 ? (
              <span>
                <span className="text-(--foreground-muted)">Crédits en cours </span>
                <strong>{formatMadCompact(money.debtOutstandingMad)}</strong>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
