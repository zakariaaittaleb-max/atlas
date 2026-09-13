'use client';

/**
 * ATLAS — sélecteur de domaine d'activité, commun à tous les écrans.
 *
 * ── LE GESTE CENTRAL DE LA SAISIE ──────────────────────────────────────────
 * « Je choisis le domaine sur lequel je travaille, je le renseigne partout,
 * puis je passe au suivant. » Le sélecteur est donc dans la barre de
 * navigation et non dans chaque page : il suit l'équipe d'un écran à l'autre,
 * et le domaine choisi sur la stratégie est encore celui des achats.
 *
 * ── DEUX ÉTATS QUI NE SE DEVINENT PAS ──────────────────────────────────────
 * Un domaine MIS EN VENTE reste piloté jusqu'à la résolution — l'annonce peut
 * être retirée, et le laisser tourner à vide serait une punition qu'on n'a pas
 * décidée. Il est donc listé, avec sa mention.
 *
 * Un domaine ACQUIS en cours de partie se pilote exactement comme les autres.
 * L'écran le signale une fois, au tour de son entrée, puis n'en parle plus :
 * ce n'est pas un domaine de seconde classe.
 */

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { InfoHint } from '@/components/ui/info-hint';
import {
  DAS_COOKIE, DAS_COOKIE_MAX_AGE, resolveActiveDas,
  type DasOption, type DasScope,
} from '@/lib/das-scope';

interface DasScopeValue {
  das: DasOption[];
  activeDasId: string | null;
  activeDas: DasOption | null;
  /** Position dans le parcours, pour « domaine 2 sur 3 ». */
  index: number;
  /** Domaine suivant du portefeuille, ou `null` s'il n'y en a qu'un. */
  next: DasOption | null;
  setActiveDas: (dasId: string) => void;
}

const EMPTY: DasScopeValue = {
  das: [], activeDasId: null, activeDas: null, index: -1, next: null,
  setActiveDas: () => {},
};

const Context = createContext<DasScopeValue>(EMPTY);

export function useDasScope(): DasScopeValue {
  return useContext(Context);
}

export function DasScopeProvider({
  scope, children,
}: { scope: DasScope | null; children: React.ReactNode }) {
  const das = useMemo(() => scope?.das ?? [], [scope]);
  const [activeDasId, setId] = useState<string | null>(scope?.activeDasId ?? null);

  const setActiveDas = useCallback((dasId: string) => {
    setId(dasId);
    // Le serveur relira ce cookie au prochain rendu : la première image d'une
    // nouvelle page est déjà la bonne, sans clignotement après hydratation.
    document.cookie =
      `${DAS_COOKIE}=${encodeURIComponent(dasId)}; path=/; max-age=${DAS_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const value = useMemo<DasScopeValue>(() => {
    // Un domaine cédé entre deux rendus ne doit pas laisser l'écran vide.
    const resolved = resolveActiveDas(das, activeDasId);
    const index = das.findIndex((d) => d.dasId === resolved);
    return {
      das,
      activeDasId: resolved,
      activeDas: index >= 0 ? das[index] : null,
      index,
      next: das.length > 1 ? das[(index + 1) % das.length] : null,
      setActiveDas,
    };
  }, [das, activeDasId, setActiveDas]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Les écrans dont le contenu dépend du domaine piloté.
 *
 * Une LISTE EXPLICITE, et non un test de préfixe : `/strategie` porte le niveau
 * Groupe et `/strategie/das` le niveau domaine, si bien qu'un `startsWith`
 * afficherait le sélecteur sur l'écran qu'il ne gouverne justement pas.
 */
const DAS_SCOPED_ROUTES = new Set(['/strategie/das', '/organisation', '/marches']);

/**
 * Le sélecteur lui-même, tel qu'il figure dans la barre de navigation.
 *
 * Rendu même à un seul domaine : l'équipe doit savoir sur quoi elle agit, et
 * masquer l'indication au tour 1 pour la faire apparaître au tour 4 — quand un
 * rachat aboutit — serait précisément le moment où elle passerait inaperçue.
 *
 * ── MAIS PAS SUR LES ÉCRANS DE GROUPE ──────────────────────────────────────
 * Il se retirait nulle part, y compris sur la stratégie du Groupe, la finance
 * et la cession — des écrans où AUCUN champ ne dépend du domaine affiché. Une
 * barre annonçant « Domaine piloté : Agro-industrie » au-dessus d'un régime
 * fiscal qui vaut pour l'entreprise entière ne fait pas qu'être inutile : elle
 * laisse croire que le choix en dessous ne porte que sur ce métier-là.
 */
export function DasSwitcher() {
  const { das, activeDasId, setActiveDas } = useDasScope();
  const pathname = usePathname();

  if (das.length === 0) return null;
  if (!DAS_SCOPED_ROUTES.has(pathname)) return null;

  return (
    <div className="border-t border-(--border) bg-(--surface)">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-(--foreground-muted)">
          Domaine piloté
          <InfoHint label="Domaine piloté">
            {das.length > 1
              ? 'Stratégie du DAS, achats, distribution, organisation et RH portent sur le domaine choisi ici. Renseignez-le partout, puis passez au suivant.'
              : 'Votre unique domaine. Un rachat sur le marché des acquisitions en ajoutera d’autres ici.'}
          </InfoHint>
        </span>

        <div role="group" aria-label="Domaine d'activité piloté" className="flex flex-wrap gap-2">
          {das.map((d) => {
            const on = d.dasId === activeDasId;
            return (
              <button
                key={d.dasId} type="button"
                aria-pressed={on}
                onClick={() => setActiveDas(d.dasId)}
                className="rounded-lg border px-3.5 py-1.5 text-sm"
                style={{
                  borderColor: on ? 'var(--accent)' : 'var(--border)',
                  background: on ? 'var(--surface-muted)' : undefined,
                  fontWeight: on ? 600 : 400,
                }}
              >
                {/* Le « ✓ » double la couleur : l'état actif ne repose jamais
                    sur la seule teinte, y compris sur un vidéoprojecteur. */}
                {on ? '✓ ' : ''}{d.name}
                {d.status === 'listed_for_sale' ? (
                  <span className="ml-1.5 font-normal text-(--warning)">· en vente</span>
                ) : null}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

/**
 * Bandeau de tête des écrans de saisie : quel domaine, où l'on en est dans le
 * portefeuille, et par où continuer.
 *
 * Le bouton « domaine suivant » matérialise le parcours attendu — finir un
 * domaine avant d'en ouvrir un autre — sans jamais l'imposer.
 */
export function DasHeading({ subtitle }: { subtitle: string }) {
  const { activeDas, das, index, next, setActiveDas } = useDasScope();
  if (!activeDas) return null;

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-(--border) pb-4">
      <div className="min-w-0">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          {das.length > 1 ? `Domaine ${index + 1} sur ${das.length}` : 'Votre domaine'}
        </p>
        <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {activeDas.name}
          {activeDas.status === 'listed_for_sale' ? (
            <span className="ml-3 align-middle text-sm font-normal text-(--warning)">
              mis en vente — piloté jusqu’à la résolution
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-(--foreground-muted)">{subtitle}</p>
      </div>

      {next ? (
        <button
          type="button" onClick={() => setActiveDas(next.dasId)}
          className="rounded-lg border border-(--border) px-4 py-2 text-sm"
        >
          Passer à {next.name} →
        </button>
      ) : null}
    </div>
  );
}
