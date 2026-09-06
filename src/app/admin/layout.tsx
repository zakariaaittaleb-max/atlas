import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getUser } from '@/lib/dal';
import { isSuperAdminEmail } from '@/lib/security-config';

const ADMIN_LINKS = [
  { href: '/admin/security', label: 'Sécurité' },
  { href: '/admin/facilitators', label: 'Facilitateurs' },
  { href: '/admin/sessions', label: 'Sessions' },
] as const;

/**
 * Porte unique du panneau super-admin : chaque page sous `/admin` en hérite,
 * plutôt que de revérifier chacune de son côté (et de risquer d'en oublier
 * une). 404 et non redirection : un visiteur qui devine l'URL sans être
 * super-admin ne doit même pas apprendre que la page existe.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || !isSuperAdminEmail(user.email)) notFound();

  return (
    <div>
      <div className="border-b border-(--border) bg-(--surface)">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/facilitateur"
              className="flex items-center gap-2 font-medium text-(--foreground-muted) hover:text-(--foreground)"
            >
              <span aria-hidden>←</span> Retour aux sessions
            </Link>
            <span aria-hidden className="text-(--foreground-muted)">|</span>
            {ADMIN_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>

          {/* En POST : une déconnexion en GET pourrait être déclenchée par un
              lien préchargé ou une image. */}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-sm hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      {children}
    </div>
  );
}
