import { Fragment } from 'react';
import Link from 'next/link';

import { DasSwitcher } from '@/components/das-scope';
import { PresenceBar } from '@/components/presence-bar';
import { getTeamContext, getRoundState } from '@/lib/dal';
import { formatMadCompact } from '@/lib/format';
import { openScreenHrefs } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { loadPresenceContext } from '@/lib/server/presence-context';

/**
 * Barre de navigation d'équipe.
 *
 * Deux niveaux de navigation maximum (doc 00 §8) : cette barre est le seul
 * niveau, chaque écran est une destination. L'état du tour y figure en
 * permanence — une équipe doit savoir à tout instant si ses décisions sont
 * encore modifiables, sans avoir à ouvrir un onglet pour le découvrir.
 */

/**
 * Les écrans, rangés par NIVEAU DE DÉCISION.
 *
 * Le cahier distingue la stratégie du Groupe de celle de chaque domaine, mais
 * la barre les mélangeait : rien ne disait qu'un prix se décide par DAS et un
 * régime fiscal pour l'entreprise entière. Les deux familles sont désormais
 * séparées visuellement, et le sélecteur de domaine se trouve juste en dessous
 * de la seconde — là où il gouverne effectivement quelque chose.
 */
const GROUP_LINKS = [
  { href: '/cockpit', label: 'Cockpit' },
  { href: '/strategie', label: 'Stratégie du Groupe' },
  { href: '/finance', label: 'Finance du Groupe' },
  { href: '/cession', label: 'Cession & acquisitions' },
] as const;

const DAS_LINKS = [
  { href: '/strategie/das', label: 'Stratégie du DAS' },
  { href: '/organisation', label: 'Organisation & RH' },
  { href: '/marches', label: 'Achats & distribution' },
] as const;

const SHARED_LINKS = [
  { href: '/war-room', label: 'War Room' },
  { href: '/cabinet', label: 'Cabinet' },
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

  const [round, money, presence, modules] = await Promise.all([
    getRoundState(team.sessionId),
    loadMoneyBar(),
    loadPresenceContext(),
    loadEnabledModules(team.sessionId),
  ]);

  // Un écran dont plus aucun champ n'est ouvert n'a rien à montrer : garder son
  // onglet ferait croire à une panne à qui l'ouvrirait. Le Cockpit et la
  // Révélation ne sont pas des écrans de saisie et restent toujours là.
  const openScreens = openScreenHrefs(modules);
  const visible = (href: string) =>
    href === '/cockpit' || href === '/revelation' || openScreens.has(href);
  const status = String(round?.status ?? 'draft');
  const currentRound = Number(round?.current_round ?? 0);
  const open = status === 'round_active' || status === 'onboarding';

  return (
    <nav className="border-b border-(--border) bg-(--surface)">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <span className="font-semibold tracking-tight">Atlas</span>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {[GROUP_LINKS, DAS_LINKS, SHARED_LINKS]
            .map((group) => group.filter((link) => visible(link.href)))
            .filter((group) => group.length > 0)
            .map((group, index) => (
              <Fragment key={group[0].href}>
                {/* Le séparateur appartient au groupe qui SUIT : le poser après
                    chaque groupe laisserait une barre orpheline en fin de ligne
                    dès qu'un groupe est entièrement fermé. */}
                {index > 0 ? (
                  <li aria-hidden className="text-(--foreground-muted)">|</li>
                ) : null}
                {group.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </Fragment>
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
          {presence ? <PresenceBar context={presence} /> : null}
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

      {/* ── Le domaine piloté, en permanence ─────────────────────────────
          Il gouverne la stratégie du DAS, les achats, la distribution,
          l'organisation et les RH. Le laisser implicite, c'était laisser une
          équipe saisir un prix sur le mauvais domaine sans jamais s'en rendre
          compte. */}
      <DasSwitcher />

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
