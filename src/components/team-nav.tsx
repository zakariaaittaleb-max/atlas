import { cookies } from 'next/headers';

import { DasSwitcher } from '@/components/das-scope';
import { PresenceBar } from '@/components/presence-bar';
import { SidebarNav, type NavGroup } from '@/components/sidebar-nav';
import { getRoundState, getTeamContext, getUser } from '@/lib/dal';
import { readDisplayConfig } from '@/lib/display-config';
import { NAV_COOKIE } from '@/lib/display-config-types';
import { formatMadCompact } from '@/lib/format';
import { openScreenHrefs } from '@/lib/modules-state';
import { isSuperAdminEmail } from '@/lib/security-config';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { loadPresenceContext } from '@/lib/server/presence-context';

/**
 * Coque des écrans d'équipe : navigation latérale + barre de contexte.
 *
 * ── POURQUOI UNE BARRE LATÉRALE ────────────────────────────────────────────
 * La barre horizontale alignait onze liens, deux exports, la présence, l'état
 * du tour et la déconnexion sur une ou deux lignes selon la largeur : rien n'y
 * disait ce qui allait ensemble. La barre latérale range les écrans par
 * NIVEAU DE DÉCISION et se replie en rail d'icônes quand on a besoin de place.
 *
 * ── CE QUI RESTE EN HAUT ───────────────────────────────────────────────────
 * L'argent et le domaine piloté accompagnent la saisie, pas la navigation :
 * ils restent au-dessus du contenu qu'ils gouvernent, sur tous les écrans.
 */

/** Les écrans, rangés par niveau de décision (doc 00 §8 : deux niveaux au plus). */
const GROUPS: NavGroup[] = [
  {
    id: 'cockpit',
    label: 'Cockpit',
    icon: 'cockpit',
    links: [{ href: '/cockpit', label: 'Cockpit' }],
  },
  {
    id: 'strategie',
    label: 'Stratégie',
    icon: 'strategie',
    links: [
      { href: '/strategie', label: 'Stratégie du Groupe' },
      { href: '/finance', label: 'Finance du Groupe' },
      { href: '/cession', label: 'Cession & acquisitions' },
    ],
  },
  {
    // Tout ce qui se décide domaine par domaine, stratégie comprise : le groupe
    // porte le nom du niveau de décision, comme « Stratégie » porte le Groupe.
    id: 'das',
    label: 'DAS',
    icon: 'operations',
    links: [
      { href: '/strategie/das', label: 'Stratégie du DAS', dasScoped: true },
      { href: '/organisation', label: 'Organisation & RH', dasScoped: true },
      { href: '/marches', label: 'Achats & distribution', dasScoped: true },
      { href: '/war-room', label: 'War Room' },
    ],
  },
  {
    id: 'conseils',
    label: 'Conseils',
    icon: 'conseils',
    links: [
      { href: '/cabinet', label: 'Cabinet' },
      { href: '/revelation', label: 'Révélation' },
    ],
  },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Session non ouverte',
  onboarding: 'Onboarding — décisions ouvertes',
  round_active: 'Décisions ouvertes',
  round_locked: 'Tour verrouillé',
  round_resolving: 'Calcul en cours',
  round_resolved: 'Résultats publiés',
  completed: 'Session terminée',
};

export async function TeamShell({ children }: { children: React.ReactNode }) {
  const team = await getTeamContext();
  // Pas d'équipe (connexion, facilitateur, admin) : l'écran reste nu.
  if (!team) return <>{children}</>;

  const [round, money, presence, modules, config, user, jar] = await Promise.all([
    getRoundState(team.sessionId),
    loadMoneyBar(),
    loadPresenceContext(),
    loadEnabledModules(team.sessionId),
    readDisplayConfig(),
    getUser(),
    cookies(),
  ]);

  // Un écran dont plus aucun champ n'est ouvert n'a rien à montrer : garder son
  // lien ferait croire à une panne à qui l'ouvrirait. Le Cockpit et la
  // Révélation ne sont pas des écrans de saisie et restent toujours là.
  const openScreens = openScreenHrefs(modules);
  const visible = (href: string) =>
    href === '/cockpit' || href === '/revelation' || openScreens.has(href);
  const groups = GROUPS
    .map((group) => ({ ...group, links: group.links.filter((link) => visible(link.href)) }))
    .filter((group) => group.links.length > 0);

  const status = String(round?.status ?? 'draft');
  const currentRound = Number(round?.current_round ?? 0);
  const open = status === 'round_active' || status === 'onboarding';

  return (
    <div className="min-h-0 flex-1 lg:flex">
      <SidebarNav
        teamName={team.teamName}
        groups={groups}
        roundLabel={currentRound === 0 ? 'T0' : `Tour ${currentRound}`}
        statusLabel={STATUS_LABELS[status] ?? status}
        decisionsOpen={open}
        showSurvey={visible('/sus')}
        showAdmin={isSuperAdminEmail(user?.email)}
        initialCollapsed={jar.get(NAV_COOKIE)?.value === 'collapsed'}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 border-b border-(--border) bg-(--surface)/95 backdrop-blur print:hidden">
          {/* ── L'argent, en permanence ──────────────────────────────────
              Une équipe engageait des dépenses sur quatre écrans sans jamais
              voir la somme, et découvrait le dépassement à la résolution. */}
          <div className="tabular mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-baseline gap-x-8 gap-y-1.5 px-6 py-2.5 text-sm">
            {money ? (
              <>
              {config.showBudget ? (
                <MoneyItem label="Vous disposez de" value={formatMadCompact(money.availableMad)}>
                  {config.showCredits && money.drawnThisRoundMad > 0 ? (
                    <span className="text-xs text-(--meta)">
                      dont {formatMadCompact(money.drawnThisRoundMad)} de crédit pris
                    </span>
                  ) : null}
                </MoneyItem>
              ) : null}
              <MoneyItem
                label="Engagé ce tour"
                value={formatMadCompact(money.engagedMad)}
                tone={config.showBudget && money.engagedMad > money.availableMad ? 'negative' : undefined}
              />
              {config.showBudget ? (
                <MoneyItem
                  label="Il vous reste"
                  value={formatMadCompact(money.availableMad - money.engagedMad)}
                  tone={money.availableMad - money.engagedMad < 0 ? 'negative' : undefined}
                />
              ) : null}
              {config.showCredits && money.debtOutstandingMad > 0 ? (
                <MoneyItem label="Crédits en cours" value={formatMadCompact(money.debtOutstandingMad)} />
              ) : null}
              </>
            ) : null}
            {/* Un seul abonnement de présence par onglet : le canal temps réel
                refuse un second abonné au même nom. */}
            {presence ? (
              <span className="ml-auto self-center">
                <PresenceBar context={presence} />
              </span>
            ) : null}
          </div>

          {/* ── Le domaine piloté, là où il gouverne la saisie ─────────── */}
          <DasSwitcher />
        </div>

        {children}
      </div>
    </div>
  );
}

function MoneyItem({
  label, value, tone, children,
}: {
  label: string;
  value: string;
  tone?: 'negative';
  children?: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-(--foreground-muted)">{label}</span>
      <strong
        className={`font-mono font-semibold ${tone === 'negative' ? 'text-(--negative)' : 'text-(--foreground)'}`}
      >
        {/* Le dépassement se lit aussi sans couleur : il porte un signe. */}
        {value}
      </strong>
      {children}
    </span>
  );
}
