'use client';

/**
 * ATLAS — marché de cession de DAS.
 *
 * L'écran matérialise la conviction n°2 du cahier : « on ne meurt jamais sans
 * avoir pu se battre ». Une équipe étranglée peut céder un DAS pour se refaire
 * une trésorerie plutôt que de regarder les autres jouer pendant deux heures.
 *
 * Trois asymétries d'information sont MISES EN SCÈNE, parce qu'elles sont
 * l'arbitrage lui-même :
 *   • le vendeur seul voit l'offre de l'acheteur non joueur ;
 *   • il sait combien d'offres il a reçues, jamais leur montant ;
 *   • les acheteurs ne voient qu'une fiche limitée, et s'ignorent entre eux.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { NumberInput } from '@/components/decision-shell';
import { DisclosureList } from '@/components/disclosure-list';
import type { FieldDisclosure } from '@/lib/consulting-types';
import { isOn, type EnabledModules } from '@/lib/modules-state';
import { formatMadCompact, formatPct, formatUnits } from '@/lib/format';

export interface SellableDas {
  dasId: string;
  name: string;
  alreadyListed: boolean;
}

export interface OwnListing {
  listingId: string;
  dasId: string;
  dasName: string;
  npcOfferMad: number;
  sellerChoice: 'npc' | 'best_bid' | 'withdraw';
  bidCount: number;
}

export interface PublicListing {
  listing_id: string;
  das_name: string;
  seller_team_name: string;
  public_snapshot: {
    dasName: string;
    segments: string[];
    marketSharePct: number;
    revenueBandMinMad: number;
    revenueBandMaxMad: number;
    capacityUnits: number;
    headcount: number;
    qualityBand: string;
    notorietyBand: string;
    roundsHeld: number;
  };
}

/**
 * Un maillon de sa PROPRE filière : un fournisseur ou un distributeur d'un
 * domaine que l'équipe exploite déjà.
 *
 * Rien à voir avec une cible d'entrée. On n'y gagne aucune part de marché — on
 * y gagne de ne plus payer d'intermédiaire, et de contrôler son
 * approvisionnement ou son canal.
 */
export interface IntegrationTarget {
  targetActorId: string;
  targetName: string;
  dasName: string;
  regionKey: string | null;
  actorType: 'fournisseur' | 'distributeur';
  alreadyOwned: boolean;
  ownedByMe: boolean;
}

export interface AcquisitionTarget {
  targetActorId: string;
  targetName: string;
  dasName: string;
  regionKey: string | null;
}

interface MyOffer {
  targetActorId: string;
  offerMad: number;
  integrationBudgetMad: number;
}

interface MyBid {
  listingId: string;
  offerMad: number;
  integrationBudgetMad: number;
}

export function CessionView({
  roundNumber, decisionsOpen, sellable, ownListings, market, myBids, targets, myOffers,
  integrationTargets, modules, dueDiligences,
}: {
  roundNumber: number;
  modules: EnabledModules;
  dueDiligences: DueDiligence[];
  decisionsOpen: boolean;
  sellable: SellableDas[];
  ownListings: OwnListing[];
  market: PublicListing[];
  myBids: MyBid[];
  targets: AcquisitionTarget[];
  myOffers: MyOffer[];
  integrationTargets: IntegrationTarget[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || pending || !decisionsOpen;

  async function send(body: Record<string, unknown>, endpoint = '/api/divest') {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Opération refusée.');
        setBusy(false);
        return;
      }
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible. Rien n’a été envoyé.');
      setBusy(false);
    }
  }

  const bidByListing = new Map(myBids.map((b) => [b.listingId, b]));

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Tour {roundNumber}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Marché de cession</h1>
        <p className="mt-3 max-w-3xl text-(--foreground-muted)">
          Céder un DAS libère de la trésorerie et recentre votre portefeuille. L’acheteur non
          joueur offre toujours moins qu’un concurrent rationnel : c’est un plancher de
          liquidité, pas une bonne affaire.
        </p>
      </header>

      {!decisionsOpen ? (
        <p className="mb-8 rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
          Le tour est verrouillé : le marché de cession est clos jusqu’au tour suivant.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-8 rounded-lg border border-(--negative) px-4 py-3 text-sm text-(--negative)">
          {error}
        </p>
      ) : null}

      {/* ── Vendre ────────────────────────────────────────────────────────── */}
      {isOn(modules, 'cession.sell') ? (
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-medium">Vos DAS</h2>

        {sellable.length === 0 ? (
          <p className="rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
            Vous ne détenez aucun DAS actif.
          </p>
        ) : (
          <ul className="space-y-4">
            {sellable.map((das) => {
              const listing = ownListings.find((l) => l.dasId === das.dasId);
              return (
                <li key={das.dasId} className="rounded-xl border border-(--border) bg-(--surface) p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h3 className="text-lg font-medium">{das.name}</h3>
                    {!listing ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => send({ action: 'list', dasId: das.dasId })}
                        className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium disabled:opacity-40"
                      >
                        Mettre en vente
                      </button>
                    ) : null}
                  </div>

                  {listing ? <ListingPanel listing={listing} disabled={disabled} onSend={send} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      ) : null}

      {/* ── Acquérir pour ENTRER dans un nouveau domaine ─────────────────── */}
      {isOn(modules, 'cession.acquire') ? (
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-medium">Entrer dans un nouveau domaine</h2>
        <p className="mb-4 max-w-3xl text-sm text-(--foreground-muted)">
          Racheter une entreprise, c’est entrer d’un coup avec une part de marché constituée —
          le moyen de contourner la barrière d’entrée qui pénalise les arrivées tardives.
          Mais vous héritez d’une organisation que vous n’avez pas conçue : sans budget
          d’intégration, près de la moitié de ce que vous payez part en fumée.
        </p>
        <p className="mb-4 max-w-3xl rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
          Les chiffres de ces cibles ne sont pas affichés : chiffre d’affaires, capacité et
          surtout <strong>passifs non déclarés</strong> s’obtiennent en{' '}
          <a href="/cabinet" className="underline">due diligence</a>. Acquérir à l’aveugle est un
          choix, pas un oubli.
        </p>

        {targets.length === 0 ? (
          <p className="rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
            Aucune cible dans un domaine que vous n’exploitez pas encore.
          </p>
        ) : (
          <ul className="space-y-4">
            {targets.map((target) => (
              <AcquisitionCard
                key={target.targetActorId}
                target={target}
                dueDiligences={dueDiligences}
                existingOffer={myOffers.find((o) => o.targetActorId === target.targetActorId)}
                disabled={disabled}
                onSend={(body) => send(body, '/api/acquisitions')}
              />
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {/* ── Intégrer un maillon de sa PROPRE filière ─────────────────────── */}
      {isOn(modules, 'cession.integration') ? (
      <section className="mb-10">
        <h2 className="mb-2 text-xl font-medium">Intégrer votre filière</h2>
        <p className="mb-4 max-w-3xl text-sm text-(--foreground-muted)">
          Racheter un <strong>fournisseur</strong> supprime la marge qu’il prélevait et sécurise
          votre approvisionnement : vous ne négociez plus contre lui, vous le possédez.
          Racheter un <strong>distributeur</strong> fait passer sa couverture du canal tiers à
          votre réseau propre — il ne prélève plus de marge et n’impose plus de volume minimal.
        </p>
        <p className="mb-4 max-w-3xl rounded-lg border border-(--border) px-4 py-3 text-sm text-(--foreground-muted)">
          Ce que cela coûte, au-delà du prix : vous immobilisez du capital dans un maillon
          qu’il faut désormais faire tourner, et l’opération <strong>déplace votre indice
          d’alignement</strong>. Elle sert une stratégie d’intégration verticale ; elle
          contredit une domination par les coûts, qui vise un contrôle du canal faible.
          Le moteur relèvera l’un comme l’autre.
        </p>

        {integrationTargets.length === 0 ? (
          <p className="rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
            Aucun maillon intégrable : cette section ne liste que les fournisseurs et
            distributeurs des domaines que vous exploitez.
          </p>
        ) : (
          <ul className="space-y-4">
            {integrationTargets.map((link) => (
              <AcquisitionCard
                key={link.targetActorId}
                target={{
                  targetActorId: link.targetActorId,
                  targetName: link.targetName,
                  dasName: link.dasName,
                  regionKey: link.regionKey,
                }}
                dueDiligences={dueDiligences}
                badge={link.actorType === 'fournisseur' ? 'Amont' : 'Aval'}
                owned={link.ownedByMe ? 'moi' : link.alreadyOwned ? 'autre' : null}
                existingOffer={myOffers.find((o) => o.targetActorId === link.targetActorId)}
                disabled={disabled}
                onSend={(body) => send(body, '/api/acquisitions')}
              />
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {/* ── Acheter un DAS mis en vente par une concurrente ──────────────── */}
      {isOn(modules, 'cession.bid') ? (
      <section>
        <h2 className="mb-2 text-xl font-medium">DAS en vente dans votre pool</h2>
        <p className="mb-4 max-w-3xl text-sm text-(--foreground-muted)">
          Les offres sont <strong>scellées</strong> : vous ne voyez ni celles des autres
          équipes, ni ce que l’acheteur non joueur propose au vendeur. Budgétez votre
          intégration — sans elle, un rachat détruit jusqu’à 45 % de ce que vous venez de payer.
        </p>

        {market.length === 0 ? (
          <p className="rounded-xl border border-(--border) bg-(--surface) p-6 text-(--foreground-muted)">
            Aucune annonce ouverte dans votre pool à ce tour.
          </p>
        ) : (
          <ul className="space-y-4">
            {market.map((l) => (
              <MarketCard
                key={l.listing_id}
                listing={l}
                existingBid={bidByListing.get(l.listing_id)}
                disabled={disabled}
                onSend={send}
              />
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </main>
  );
}

/** Panneau du vendeur : l'offre NPC, l'intérêt reçu, et le choix — en aveugle. */
function ListingPanel({
  listing, disabled, onSend,
}: {
  listing: OwnListing;
  disabled: boolean;
  onSend: (body: Record<string, unknown>) => void;
}) {
  return (
    <div className="mt-5 border-t border-(--border) pt-5">
      <dl className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-(--foreground-muted)">Offre de l’acheteur non joueur</dt>
          <dd className="tabular mt-1 text-2xl font-semibold">
            {formatMadCompact(listing.npcOfferMad)}
          </dd>
          <p className="mt-1 text-xs text-(--foreground-muted)">
            Visible de vous seul. Ferme et immédiate.
          </p>
        </div>
        <div>
          <dt className="text-sm text-(--foreground-muted)">Offres reçues de vos concurrents</dt>
          <dd className="tabular mt-1 text-2xl font-semibold">{listing.bidCount}</dd>
          <p className="mt-1 text-xs text-(--foreground-muted)">
            Leur montant vous restera inconnu jusqu’au dénouement.
          </p>
        </div>
      </dl>

      <fieldset disabled={disabled} className="mb-4">
        <legend className="mb-2 text-sm font-medium">Votre décision pour ce tour</legend>
        <div className="flex flex-wrap gap-2">
          {([
            ['npc', 'Céder à l’acheteur non joueur'],
            ['best_bid', 'Retenir la meilleure offre reçue'],
            ['withdraw', 'Retirer l’annonce'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onSend({ action: 'choice', listingId: listing.listingId, choice: value })}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
              style={{
                borderColor: listing.sellerChoice === value ? 'var(--accent)' : 'var(--border)',
                background: listing.sellerChoice === value ? 'var(--surface-muted)' : undefined,
                fontWeight: listing.sellerChoice === value ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-sm text-(--foreground-muted)">
        {listing.sellerChoice === 'best_bid' && listing.bidCount === 0
          ? 'Aucune offre reçue : à défaut, la cession se fera à l’acheteur non joueur.'
          : 'Le choix est arrêté avant le verrouillage du tour — vous pariez sans connaître les montants.'}
      </p>
    </div>
  );
}

/** Fiche publique d'un DAS en vente, et formulaire d'offre scellée. */
function MarketCard({
  listing, existingBid, disabled, onSend,
}: {
  listing: PublicListing;
  existingBid: MyBid | undefined;
  disabled: boolean;
  onSend: (body: Record<string, unknown>) => void;
}) {
  const s = listing.public_snapshot;
  const [offer, setOffer] = useState(existingBid ? String(existingBid.offerMad) : '');
  const [integration, setIntegration] = useState(
    existingBid ? String(existingBid.integrationBudgetMad) : '',
  );

  const offerValue = Number(offer);
  const integrationValue = Number(integration || 0);
  // Doc 02 §11 : le budget d'intégration se juge par rapport à 20 % du prix payé.
  const integrationRatio = offerValue > 0 ? integrationValue / (0.2 * offerValue) : 0;
  const valueLoss = Math.min(Math.max(0.45 - 0.4 * integrationRatio, 0.05), 0.45);

  return (
    <li className="rounded-xl border border-(--border) bg-(--surface) p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-medium">{listing.das_name}</h3>
        <p className="text-sm text-(--foreground-muted)">cédé par {listing.seller_team_name}</p>
      </div>

      <dl className="tabular mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <Fact label="Part de marché" value={formatPct(s.marketSharePct, 1)} />
        <Fact
          label="Chiffre d’affaires"
          value={`${formatMadCompact(s.revenueBandMinMad)} – ${formatMadCompact(s.revenueBandMaxMad)}`}
        />
        <Fact label="Capacité installée" value={`${formatUnits(s.capacityUnits)} unités`} />
        <Fact label="Effectif" value={formatUnits(s.headcount)} />
        <Fact label="Qualité perçue" value={s.qualityBand} />
        <Fact label="Notoriété" value={s.notorietyBand} />
        <Fact label="Segments servis" value={String(s.segments.length || '—')} />
        <Fact label="Détenu depuis" value={`${s.roundsHeld} tour(s)`} />
      </dl>

      <p className="mt-4 text-xs text-(--foreground-muted)">
        Les coûts, la trésorerie et le motif de la vente ne sont pas communiqués. Une due
        diligence auprès du cabinet révèle les passifs non déclarés.
      </p>

      <form
        className="mt-5 border-t border-(--border) pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSend({
            action: 'bid',
            listingId: listing.listing_id,
            offerMad: offerValue,
            integrationBudgetMad: integrationValue,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Votre offre (DH)</span>
            <NumberInput
              value={offerValue} onChange={(v) => setOffer(String(v))}
              className="mt-1.5 w-full"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Budget d’intégration (DH)</span>
            <NumberInput
              value={integrationValue} onChange={(v) => setIntegration(String(v))}
              className="mt-1.5 w-full"
            />
          </label>
        </div>

        {offerValue > 0 ? (
          <p
            className="tabular mt-3 text-sm"
            style={{ color: valueLoss > 0.25 ? 'var(--negative)' : 'var(--positive)' }}
          >
            Perte de valeur estimée à l’intégration : {formatPct(valueLoss, 0)}
            <span className="ml-2 font-normal text-(--foreground-muted)">
              — {integrationValue === 0
                ? 'sans budget d’intégration, vous détruisez près de la moitié de ce que vous payez'
                : `soit ${formatPct(integrationRatio, 0)} du budget de référence`}
            </span>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={disabled || offerValue < 1}
          className="mt-4 rounded-lg bg-(--accent) px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {existingBid ? 'Modifier mon offre scellée' : 'Déposer une offre scellée'}
        </button>
      </form>
    </li>
  );
}

/** Fiche d'une cible acquérable, et formulaire d'offre scellée. */
function AcquisitionCard({
  target, existingOffer, disabled, onSend, badge, owned, dueDiligences,
}: {
  target: AcquisitionTarget;
  dueDiligences: DueDiligence[];
  existingOffer: MyOffer | undefined;
  disabled: boolean;
  onSend: (body: Record<string, unknown>) => void;
  /** « Amont » ou « Aval » pour un maillon de filière. */
  badge?: string;
  /** Un maillon déjà racheté n'est plus sur le marché. */
  owned?: 'moi' | 'autre' | null;
}) {
  const [offer, setOffer] = useState(existingOffer ? String(existingOffer.offerMad) : '');
  const [integration, setIntegration] = useState(
    existingOffer ? String(existingOffer.integrationBudgetMad) : '',
  );

  const offerValue = Number(offer);
  const integrationValue = Number(integration || 0);
  const integrationRatio = offerValue > 0 ? integrationValue / (0.2 * offerValue) : 0;
  const valueLoss = Math.min(Math.max(0.45 - 0.4 * integrationRatio, 0.05), 0.45);

  return (
    <li className="rounded-xl border border-(--border) bg-(--surface) p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="flex items-baseline gap-2.5 text-lg font-medium">
          {badge ? (
            <span
              className="rounded border px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              {badge}
            </span>
          ) : null}
          {target.targetName}
        </h3>
        <p className="text-sm text-(--foreground-muted)">
          {target.dasName}
          {target.regionKey ? ` · ${target.regionKey.replace(/_/g, ' ')}` : ''}
        </p>
      </div>

      {owned ? (
        <p className="mt-3 text-sm" style={{ color: owned === 'moi' ? 'var(--positive)' : 'var(--warning)' }}>
          {owned === 'moi'
            ? 'Vous détenez ce maillon : il ne prélève plus de marge et ne négocie plus contre vous.'
            : 'Racheté par une autre équipe. Il n’est plus indépendant — et son nouveau propriétaire décide de ce qu’il vous vend.'}
        </p>
      ) : null}

      {/* Les chiffres avant le formulaire : on lit, puis on chiffre. */}
      <TargetStats targetActorId={target.targetActorId} dueDiligences={dueDiligences} />

      {owned ? null : (
      <form
        className="mt-5 border-t border-(--border) pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSend({
            action: 'bid',
            targetActorId: target.targetActorId,
            offerMad: offerValue,
            integrationBudgetMad: integrationValue,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Votre offre (DH)</span>
            <NumberInput
              value={offerValue} onChange={(v) => setOffer(String(v))}
              className="mt-1.5 w-full"
            />
            <span className="mt-1 block text-xs text-(--foreground-muted)">
              La cible a un prix de réserve : en deçà, elle refuse et personne n’acquiert.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Budget d’intégration (DH)</span>
            <NumberInput
              value={integrationValue} onChange={(v) => setIntegration(String(v))}
              className="mt-1.5 w-full"
            />
          </label>
        </div>

        {offerValue > 0 ? (
          <p
            className="tabular mt-3 text-sm"
            style={{ color: valueLoss > 0.25 ? 'var(--negative)' : 'var(--positive)' }}
          >
            Perte de valeur estimée à l’intégration : {formatPct(valueLoss, 0)}
            <span className="ml-2 font-normal text-(--foreground-muted)">
              — part de marché, capacité et notoriété s’érodent au même rythme.
            </span>
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit" disabled={disabled || offerValue < 1}
            className="rounded-lg bg-(--accent) px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {existingOffer ? 'Modifier mon offre scellée' : 'Déposer une offre scellée'}
          </button>
          {existingOffer ? (
            <button
              type="button" disabled={disabled}
              onClick={() => onSend({ action: 'withdraw', targetActorId: target.targetActorId })}
              className="rounded-lg border border-(--border) px-4 py-2.5 text-sm disabled:opacity-40"
            >
              Retirer mon offre
            </button>
          ) : null}
        </div>
      </form>
      )}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-(--foreground-muted)">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

export type DueDiligenceFields = FieldDisclosure[];

export interface DueDiligence {
  targetActorId: string;
  tier: string;
  errorMargin: number;
  roundNumber: number;
  fields: DueDiligenceFields;
}

const TIER_LABELS: Record<string, string> = {
  express: 'note express',
  standard: 'étude standard',
  approfondie: 'étude approfondie',
};

/**
 * Les chiffres d'une cible, dépliables — et payants.
 *
 * Décider d'un montant d'enchère sans connaître le chiffre d'affaires ni la
 * marge de ce qu'on achète est un pari, pas une décision. Mais ces chiffres
 * sont précisément ce que le cabinet vend : les offrir viderait la due
 * diligence de son objet. Le panneau existe donc toujours ; son contenu
 * dépend de ce que l'équipe a payé, et il annonce sa propre marge d'erreur.
 */
function TargetStats({
  targetActorId,
  dueDiligences,
}: {
  targetActorId: string;
  dueDiligences: DueDiligence[];
}) {
  // La plus récente : une équipe peut avoir racheté l'étude à un palier
  // supérieur, et c'est alors celle-là qui vaut.
  const study = dueDiligences.find((d) => d.targetActorId === targetActorId);

  return (
    <details className="mt-3 rounded-lg border border-(--border) bg-(--surface-muted)">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium">
        Chiffres de la cible
        <span className="ml-2 font-normal text-(--foreground-muted)">
          {study
            ? `${TIER_LABELS[study.tier] ?? study.tier} · tour ${study.roundNumber}`
            : 'due diligence non commandée'}
        </span>
      </summary>

      <div className="border-t border-(--border) px-4 py-3">
        {study ? (
          <>
            <DisclosureList fields={study.fields} />
            <p className="mt-3 border-t border-(--border) pt-2 text-xs text-(--foreground-muted)">
              Ces chiffres sont ceux figés à la commande, marge d’erreur comprise. Un
              palier supérieur les resserre et couvre les passifs non déclarés.
            </p>
          </>
        ) : (
          <p className="text-sm text-(--foreground-muted)">
            Chiffre d’affaires, part de marché, marge et passifs de cette cible
            s’achètent au <a href="/cabinet" className="underline">cabinet</a>, en due
            diligence. Sans elle, vous enchérissez sur un nom.
          </p>
        )}
      </div>
    </details>
  );
}
