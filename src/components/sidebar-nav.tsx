'use client';

import {
  BriefcaseBusiness,
  ChevronDown,
  Compass,
  Download,
  Factory,
  Gauge,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';

import { NAV_COOKIE, PREFERENCE_COOKIE_MAX_AGE } from '@/lib/display-config-types';

export interface NavGroup {
  id: string;
  label: string;
  icon: keyof typeof ICONS;
  links: { href: string; label: string; dasScoped?: boolean }[];
}

const ICONS = {
  cockpit: Gauge,
  strategie: Compass,
  operations: Factory,
  conseils: BriefcaseBusiness,
};

interface SidebarProps {
  teamName: string;
  groups: NavGroup[];
  roundLabel: string;
  statusLabel: string;
  decisionsOpen: boolean;
  showSurvey: boolean;
  showAdmin: boolean;
  initialCollapsed: boolean;
}

/**
 * Navigation latérale des équipes.
 *
 * Trois états : dépliée (libellés), repliée en rail d'icônes (plus de place
 * pour les graphiques, choix retenu par cookie donc sans flash), et tiroir
 * modal sous 1024 px. Les groupes se replient un à un ; celui qui contient
 * l'écran courant ne peut pas disparaître de la vue.
 */
export function SidebarNav(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(props.initialCollapsed);
  const drawer = useRef<HTMLDialogElement>(null);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax`;
  }

  return (
    <>
      {/* ── Sous 1024 px : un bandeau et un tiroir ─────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-(--border) bg-(--surface) px-4 py-2.5 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => drawer.current?.showModal()}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-(--surface-muted)"
        >
          <Menu aria-hidden className="h-5 w-5" />
          Menu
        </button>
        <span className="truncate font-semibold text-(--heading)">Atlas · {props.teamName}</span>
        <StatusDot open={props.decisionsOpen} label={`${props.roundLabel} · ${props.statusLabel}`} compact />
      </div>

      <dialog
        ref={drawer}
        aria-label="Navigation"
        onClick={(event) => {
          if (event.target === drawer.current) drawer.current?.close();
        }}
        className="m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none border-r border-(--border) bg-(--surface) p-0 text-(--foreground) backdrop:bg-black/40 open:flex open:flex-col lg:hidden"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-(--heading)">Atlas · {props.teamName}</span>
          <button
            type="button"
            onClick={() => drawer.current?.close()}
            aria-label="Fermer le menu"
            className="rounded-lg p-2 hover:bg-(--surface-muted)"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <NavBody {...props} collapsed={false} onNavigate={() => drawer.current?.close()} />
      </dialog>

      {/* ── À partir de 1024 px : la barre latérale ────────────────────── */}
      <aside
        aria-label="Navigation principale"
        className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-(--border) bg-(--surface) transition-[width] duration-200 ease-out lg:flex print:hidden"
        style={{ width: collapsed ? 'var(--sidebar-rail)' : 'var(--sidebar-width)' }}
      >
        <div className={`flex items-center gap-2 px-3 pt-4 pb-3 ${collapsed ? 'flex-col' : ''}`}>
          <div className={`min-w-0 flex-1 ${collapsed ? 'text-center' : 'px-2'}`}>
            <p className="text-lg font-bold tracking-tight text-(--heading)">
              {collapsed ? 'A' : 'Atlas'}
            </p>
            {collapsed ? null : (
              <p className="truncate text-xs text-(--foreground-muted)">{props.teamName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Déplier la navigation' : 'Replier la navigation'}
            title={collapsed ? 'Déplier la navigation' : 'Replier la navigation'}
            className="rounded-lg p-2 text-(--foreground-muted) hover:bg-(--surface-muted) hover:text-(--foreground)"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="h-5 w-5" />
            ) : (
              <PanelLeftClose aria-hidden className="h-5 w-5" />
            )}
          </button>
        </div>

        <NavBody
          {...props}
          collapsed={collapsed}
          onExpandRequest={() => {
            if (collapsed) toggleCollapsed();
          }}
        />
      </aside>
    </>
  );
}

function NavBody({
  groups, roundLabel, statusLabel, decisionsOpen, showSurvey, showAdmin,
  collapsed, onNavigate, onExpandRequest,
}: SidebarProps & {
  collapsed: boolean;
  onNavigate?: () => void;
  onExpandRequest?: () => void;
}) {
  const pathname = usePathname();
  const [closed, setClosed] = useState<Set<string>>(new Set());

  // L'écran courant est le lien au chemin le plus long qui préfixe l'URL :
  // `/strategie/das` ne doit pas allumer `/strategie`.
  const activeHref = groups
    .flatMap((g) => g.links.map((l) => l.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className={`mx-3 mb-3 rounded-lg bg-(--surface-muted) ${collapsed ? 'flex justify-center p-2' : 'px-3 py-2.5'}`}>
        <StatusDot open={decisionsOpen} label={`${roundLabel} · ${statusLabel}`} compact={collapsed} />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-1">
          {groups.map((group) => {
            const Icon = ICONS[group.icon];
            const single = group.links.length === 1 && group.links[0].label === group.label;
            const containsActive = group.links.some((l) => l.href === activeHref);
            const isOpen = !closed.has(group.id) || containsActive;

            if (single || collapsed) {
              const target = group.links[0];
              const active = single ? target.href === activeHref : containsActive;
              return (
                <li key={group.id}>
                  {single ? (
                    <NavLink href={target.href} active={active} collapsed={collapsed} onNavigate={onNavigate} title={group.label}>
                      <Icon aria-hidden className="h-5 w-5 shrink-0" />
                      {collapsed ? <span className="sr-only">{group.label}</span> : group.label}
                    </NavLink>
                  ) : (
                    <button
                      type="button"
                      title={group.label}
                      onClick={() => {
                        setClosed((prev) => { const n = new Set(prev); n.delete(group.id); return n; });
                        onExpandRequest?.();
                      }}
                      className={`flex w-full justify-center rounded-lg p-2.5 ${active ? 'bg-(--accent-subtle) text-(--accent-text)' : 'text-(--foreground-muted) hover:bg-(--surface-muted) hover:text-(--foreground)'}`}
                    >
                      <Icon aria-hidden className="h-5 w-5" />
                      <span className="sr-only">{group.label}</span>
                    </button>
                  )}
                </li>
              );
            }

            return (
              <li key={group.id} className="pt-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`nav-${group.id}`}
                  disabled={containsActive}
                  onClick={() => toggle(group.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold tracking-wider text-(--foreground-muted) uppercase hover:bg-(--surface-muted) disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'} ${containsActive ? 'opacity-0' : ''}`}
                  />
                </button>
                {isOpen ? (
                  <ul id={`nav-${group.id}`} className="reveal mt-0.5 space-y-0.5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <NavLink href={link.href} active={link.href === activeHref} onNavigate={onNavigate} indent>
                          <span className="min-w-0 flex-1 truncate">{link.label}</span>
                          {link.dasScoped ? (
                            <span
                              title="Porte sur le domaine piloté"
                              className="rounded bg-(--surface-muted) px-1.5 py-0.5 text-[0.6875rem] font-semibold text-(--foreground-muted) ring-1 ring-(--border)"
                            >
                              DAS
                            </span>
                          ) : null}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        <hr className="my-4 border-(--border)" />

        <ul className="space-y-0.5">
          {/* Le dossier initial reste accessible tout au long de la partie :
              les trames de matrices servent jusqu'au débriefing. */}
          <li>
            <UtilityLink href="/api/export?type=dossier_initial" icon={Download} label="Dossier initial" collapsed={collapsed} download />
          </li>
          <li>
            <UtilityLink href="/api/export?type=resultats_tour" icon={Download} label="Mes résultats" collapsed={collapsed} download />
          </li>
          {showSurvey ? (
            <li>
              <UtilityLink href="/sus" icon={MessageSquareText} label="Questionnaire de satisfaction" collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ) : null}
          {showAdmin ? (
            <li>
              <UtilityLink href="/admin/config" icon={SlidersHorizontal} label="Configuration admin" collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ) : null}
        </ul>
      </nav>

      <div className="border-t border-(--border) p-3">
        {/* En POST : une déconnexion en GET pourrait être déclenchée par un
            lien préchargé ou une image. */}
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            title="Se déconnecter"
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-(--foreground-muted) hover:bg-(--negative-subtle) hover:text-(--negative) ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut aria-hidden className="h-5 w-5 shrink-0" />
            {collapsed ? <span className="sr-only">Se déconnecter</span> : 'Se déconnecter'}
          </button>
        </form>
      </div>
    </>
  );
}

function NavLink({
  href, active, collapsed = false, indent = false, onNavigate, title, children,
}: {
  href: string;
  active: boolean;
  collapsed?: boolean;
  indent?: boolean;
  onNavigate?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg py-2 text-sm transition-colors duration-150 ${
        collapsed ? 'justify-center px-2.5' : indent ? 'pr-2.5 pl-9' : 'px-2.5'
      } ${
        active
          ? 'bg-(--accent-subtle) font-semibold text-(--accent-text)'
          : 'font-medium text-(--foreground) hover:bg-(--surface-muted)'
      }`}
    >
      {children}
    </Link>
  );
}

function UtilityLink({
  href, icon: Icon, label, collapsed, download = false, onNavigate,
}: {
  href: string;
  icon: typeof Download;
  label: string;
  collapsed: boolean;
  download?: boolean;
  onNavigate?: () => void;
}) {
  const className = `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-(--foreground-muted) hover:bg-(--surface-muted) hover:text-(--foreground) ${collapsed ? 'justify-center' : ''}`;
  const content = (
    <>
      <Icon aria-hidden className="h-5 w-5 shrink-0" />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </>
  );
  // Un export est un fichier, pas un écran : lien simple, sans routage client.
  return download ? (
    <a href={href} title={label} className={className}>{content}</a>
  ) : (
    <Link href={href} title={label} onClick={onNavigate} className={className}>{content}</Link>
  );
}

function StatusDot({ open, label, compact = false }: { open: boolean; label: string; compact?: boolean }) {
  // L'état est porté par un point ET par du texte : jamais par la seule couleur.
  return (
    <span
      title={label}
      className={`flex items-center gap-2 text-sm font-medium ${open ? 'text-(--positive)' : 'text-(--warning)'}`}
    >
      <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
        {open ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40 motion-reduce:hidden" /> : null}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <span className={compact ? 'sr-only' : ''}>{label}</span>
    </span>
  );
}
