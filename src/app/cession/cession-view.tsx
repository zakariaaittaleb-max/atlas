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
 *
 * Quatre marchés sur une page : vendre, entrer dans un domaine, intégrer sa
 * filière, racheter un domaine en vente. La synthèse dit en tête ce qui est en
 * cours ; chaque marché est un bloc repliable, et les mécanismes (plancher de
 * liquidité, perte d'intégration, prix de réserve) sont sous les « + ».
 */

import { ChevronDown, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { NumberInput } from '@/components/decision-shell';
import { DisclosureList } from '@/components/disclosure-list';
import { Accordion } from '@/components/ui/accordion';
import { ChoiceCard, GroupLegend } from '@/components/ui/form-controls';
import { InfoHint } from '@/components/ui/info-hint';
import { StatCard } from '@/components/ui/stat-card';
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
  /**
   * Taille de l'entreprise, en trois classes.
   *
   * Ce qu'un acquéreur sait AVANT d'ouvrir les livres : tout le monde voit si
   * un concurrent est gros ou petit, personne ne connaît son chiffre d'affaires.
   * Les montants restent ce que le cabinet vend.
   */
  sizeClass?: 'petite' | 'moyenne' | 'grande';
  /**
   * Ce que le domaine vend réellement : ses segments de clientèle.
   *
   * Absents pour un maillon de la filière : la vue d'intégration n'expose ni
   * la taille ni le marché d'un fournisseur, et la carte s'adapte plutôt que
   * d'afficher un blanc.
   */
  segments?: string[];
  /**
   * Vrai quand la cible est dans un domaine que l'équipe exploite déjà.
   *
   * Ce n'est plus une entrée mais une CONSOLIDATION : les positions
   * s'additionnent, et c'est le pouvoir de fixation des prix qu'on achète.
   */
  consolidation?: boolean;
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
  const targetIds = new Set(targets.map((t) => t.targetActorId));
  const entryOffers = myOffers.filter((o) => targetIds.has(o.targetActorId)).length;
  const linkOffers = myOffers.length - entryOffers;
  const ownedLinks = integrationTargets.filter((l) => l.ownedByMe).length;

  const showSell = isOn(modules, 'cession.sell');
  const showAcquire = isOn(modules, 'cession.acquire');
  const showIntegration = isOn(modules, 'cession.integration');
  const showBid = isOn(modules, 'cession.bid');

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-wider text-(--accent-text) uppercase">
          Tour {roundNumber} · niveau Groupe
        </p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-(--heading)">
          Cession &amp; acquisitions
          <InfoHint label="Cession et acquisitions">
            Céder un DAS libère de la trésorerie et recentre votre portefeuille. Racheter permet
            d’entrer d’un coup dans un domaine, de consolider une position ou d’intégrer sa
            filière. Toutes les offres sont <strong>scellées</strong> : personne ne voit celles des
            autres.
          </InfoHint>
        </h1>
      </header>

      <div className="space-y-4">
        {!decisionsOpen ? (
          <Alert tone="warning">
            Le tour est verrouillé : le marché de cession est clos jusqu’au tour suivant.
          </Alert>
        ) : null}
        {error ? <Alert tone="negative">{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Vos DAS en vente"
            value={`${ownListings.length} / ${sellable.length}`}
            note={
              ownListings.reduce((acc, l) => acc + l.bidCount, 0) > 0
                ? `${ownListings.reduce((acc, l) => acc + l.bidCount, 0)} offre(s) reçue(s)`
                : 'Aucune offre reçue'
            }
          />
          <StatCard
            label="Vos offres d’acquisition"
            value={String(myOffers.length + myBids.length)}
            note={`${entryOffers} entrée · ${linkOffers} filière · ${myBids.length} rachat`}
          />
          <StatCard
            label="Maillons détenus"
            value={String(ownedLinks)}
            note={`${integrationTargets.length} maillon(s) dans vos filières`}
          />
          <StatCard
            label="Annonces du pool"
            value={String(market.length)}
            note="DAS mis en vente par vos concurrents"
          />
        </div>

        {/* ── Vendre ────────────────────────────────────────────────────────── */}
        {showSell ? (
          <Accordion
            title="Vendre un DAS"
            indicators={{ topic: 'cession-vente' }}
            defaultOpen={ownListings.length > 0}
            summary={`${ownListings.length} en vente`}
            hint="Céder un DAS libère de la trésorerie et recentre votre portefeuille. L’acheteur non joueur offre toujours moins qu’un concurrent rationnel : c’est un plancher de liquidité, pas une bonne affaire."
          >
            {sellable.length === 0 ? (
              <p className="text-sm text-(--foreground-muted)">Vous ne détenez aucun DAS actif.</p>
            ) : (
              <ul className="space-y-3">
                {sellable.map((das) => {
                  const listing = ownListings.find((l) => l.dasId === das.dasId);
                  return (
                    <li key={das.dasId} className="rounded-lg border border-(--border) p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-base font-semibold">
                          {das.name}
                          {listing ? (
                            <span className="rounded-full bg-(--warning-subtle) px-2 py-0.5 text-xs font-semibold text-(--warning)">
                              en vente
                            </span>
                          ) : null}
                        </h3>
                        {!listing ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => send({ action: 'list', dasId: das.dasId })}
                            className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium enabled:hover:border-(--border-strong) disabled:opacity-40"
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
          </Accordion>
        ) : null}

        {/* ── Acquérir pour ENTRER dans un nouveau domaine ─────────────────── */}
        {showAcquire ? (
          <Accordion
            title="Entrer dans un nouveau domaine"
            indicators={{ topic: 'cession-acquisition' }}
            summary={`${targets.length} cible${targets.length > 1 ? 's' : ''} · ${entryOffers} offre${entryOffers > 1 ? 's' : ''}`}
            hint={
              <>
                Racheter une entreprise, c’est entrer d’un coup avec une part de marché constituée —
                le moyen de contourner la barrière d’entrée qui pénalise les arrivées tardives. Mais
                vous héritez d’une organisation que vous n’avez pas conçue : sans budget
                d’intégration, près de la moitié de ce que vous payez part en fumée.
                <span className="mt-2 block">
                  Les chiffres de ces cibles — chiffre d’affaires, capacité et surtout passifs non
                  déclarés — s’obtiennent en due diligence au cabinet. Acquérir à l’aveugle est un
                  choix, pas un oubli.
                </span>
              </>
            }
          >
            {targets.length === 0 ? (
              <p className="text-sm text-(--foreground-muted)">
                Aucune cible dans un domaine que vous n’exploitez pas encore.
              </p>
            ) : (
              <ul className="space-y-3">
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
          </Accordion>
        ) : null}

        {/* ── Intégrer un maillon de sa PROPRE filière ─────────────────────── */}
        {showIntegration ? (
          <Accordion
            title="Intégrer votre filière"
            indicators={{ topic: 'cession-acquisition' }}
            summary={`${integrationTargets.length} maillon${integrationTargets.length > 1 ? 's' : ''} · ${ownedLinks} détenu${ownedLinks > 1 ? 's' : ''}`}
            hint={
              <>
                Racheter un <strong>fournisseur</strong> supprime la marge qu’il prélevait et
                sécurise votre approvisionnement : vous ne négociez plus contre lui, vous le possédez.
                Racheter un <strong>distributeur</strong> fait passer sa couverture du canal tiers à
                votre réseau propre — il ne prélève plus de marge et n’impose plus de volume minimal.
                <span className="mt-2 block">
                  Au-delà du prix, vous immobilisez du capital dans un maillon qu’il faut faire
                  tourner, et l’opération déplace votre indice d’alignement : elle sert une
                  intégration verticale, elle contredit une domination par les coûts.
                </span>
              </>
            }
          >
            {integrationTargets.length === 0 ? (
              <p className="text-sm text-(--foreground-muted)">
                Aucun maillon intégrable : ce bloc ne liste que les fournisseurs et distributeurs des
                domaines que vous exploitez.
              </p>
            ) : (
              <ul className="space-y-3">
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
          </Accordion>
        ) : null}

        {/* ── Acheter un DAS mis en vente par une concurrente ──────────────── */}
        {showBid ? (
          <Accordion
            title="DAS en vente dans votre pool"
            indicators={{ topic: 'cession-acquisition' }}
            defaultOpen={market.length > 0}
            summary={`${market.length} annonce${market.length > 1 ? 's' : ''} · ${myBids.length} offre${myBids.length > 1 ? 's' : ''}`}
            hint="Les offres sont scellées : vous ne voyez ni celles des autres équipes, ni ce que l’acheteur non joueur propose au vendeur. Budgétez votre intégration — sans elle, un rachat détruit jusqu’à 45 % de ce que vous venez de payer."
          >
            {market.length === 0 ? (
              <p className="text-sm text-(--foreground-muted)">
                Aucune annonce ouverte dans votre pool à ce tour.
              </p>
            ) : (
              <ul className="space-y-3">
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
          </Accordion>
        ) : null}
      </div>
    </main>
  );
}

function Alert({ tone, children }: { tone: 'negative' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
        tone === 'negative' ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--warning-subtle) text-(--warning)'
      }`}
    >
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
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
    <div className="mt-4 border-t border-(--border) pt-4">
      <dl className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-(--surface-muted) px-4 py-3">
          <dt className="flex items-center gap-1.5 text-sm text-(--foreground-muted)">
            Offre de l’acheteur non joueur
            <InfoHint label="Offre de l’acheteur non joueur">
              Visible de vous seul. Ferme et immédiate.
            </InfoHint>
          </dt>
          <dd className="tabular mt-1 font-mono text-2xl font-semibold">
            {formatMadCompact(listing.npcOfferMad)}
          </dd>
        </div>
        <div className="rounded-lg bg-(--surface-muted) px-4 py-3">
          <dt className="flex items-center gap-1.5 text-sm text-(--foreground-muted)">
            Offres reçues de vos concurrents
            <InfoHint label="Offres reçues">
              Leur montant vous restera inconnu jusqu’au dénouement.
            </InfoHint>
          </dt>
          <dd className="tabular mt-1 font-mono text-2xl font-semibold">{listing.bidCount}</dd>
        </div>
      </dl>

      <fieldset disabled={disabled}>
        <GroupLegend title="Votre décision pour ce tour">
          Le choix est arrêté avant le verrouillage du tour — vous pariez sans connaître les
          montants.
        </GroupLegend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ['npc', 'Céder à l’acheteur non joueur'],
            ['best_bid', 'Retenir la meilleure offre'],
            ['withdraw', 'Retirer l’annonce'],
          ] as const).map(([value, label]) => (
            <ChoiceCard
              key={value}
              title={label}
              selected={listing.sellerChoice === value}
              onSelect={() => onSend({ action: 'choice', listingId: listing.listingId, choice: value })}
            />
          ))}
        </div>
      </fieldset>

      {listing.sellerChoice === 'best_bid' && listing.bidCount === 0 ? (
        <p className="mt-3 text-sm text-(--warning)">
          Aucune offre reçue : à défaut, la cession se fera à l’acheteur non joueur.
        </p>
      ) : null}
    </div>
  );
}

/**
 * La perte de valeur à l'intégration, et le budget qui la limite.
 *
 * Doc 02 §11 : le budget d'intégration se juge par rapport à 20 % du prix payé.
 * Le chiffre reste visible — c'est la conséquence de la saisie ; le mécanisme
 * est sous le « + ».
 */
function IntegrationLoss({ offer, integration }: { offer: number; integration: number }) {
  if (offer <= 0) return null;
  const ratio = integration / (0.2 * offer);
  const loss = Math.min(Math.max(0.45 - 0.4 * ratio, 0.05), 0.45);
  const heavy = loss > 0.25;

  return (
    <p className="tabular mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${
          heavy ? 'bg-(--negative-subtle) text-(--negative)' : 'bg-(--positive-subtle) text-(--positive)'
        }`}
      >
        {heavy ? <TriangleAlert aria-hidden className="h-3.5 w-3.5" /> : null}
        Perte de valeur à l’intégration : {formatPct(loss, 0)}
      </span>
      <InfoHint label="Perte de valeur à l’intégration">
        Part de marché, capacité et notoriété s’érodent au même rythme. Sans budget d’intégration,
        vous détruisez près de la moitié de ce que vous payez ; un budget égal à 20 % du prix payé
        la ramène à 5 %.
        {integration > 0 ? ` Votre budget couvre ${formatPct(ratio, 0)} de cette référence.` : ''}
      </InfoHint>
    </p>
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

  return (
    <li className="rounded-lg border border-(--border) p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {listing.das_name}
          <InfoHint label="Ce qui n’est pas communiqué">
            Les coûts, la trésorerie et le motif de la vente ne sont pas communiqués. Une due
            diligence auprès du cabinet révèle les passifs non déclarés.
          </InfoHint>
        </h3>
        <p className="text-sm text-(--meta)">cédé par {listing.seller_team_name}</p>
      </div>

      <dl className="tabular mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Fact label="Part de marché" value={formatPct(s.marketSharePct, 1)} />
        <Fact
          label="Chiffre d’affaires"
          value={`${formatMadCompact(s.revenueBandMinMad)} – ${formatMadCompact(s.revenueBandMaxMad)}`}
        />
        <Fact label="Capacité installée" value={`${formatUnits(s.capacityUnits)} u.`} />
        <Fact label="Effectif" value={formatUnits(s.headcount)} />
        <Fact label="Qualité perçue" value={s.qualityBand} />
        <Fact label="Notoriété" value={s.notorietyBand} />
        <Fact label="Segments servis" value={String(s.segments.length || '—')} />
        <Fact label="Détenu depuis" value={`${s.roundsHeld} tour(s)`} />
      </dl>

      <form
        className="mt-4 border-t border-(--border) pt-4"
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
            <NumberInput value={offerValue} onChange={(v) => setOffer(String(v))} className="mt-1.5 w-full" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Budget d’intégration (DH)</span>
            <NumberInput value={integrationValue} onChange={(v) => setIntegration(String(v))} className="mt-1.5 w-full" />
          </label>
        </div>

        <IntegrationLoss offer={offerValue} integration={integrationValue} />

        <button
          type="submit"
          disabled={disabled || offerValue < 1}
          className="mt-4 rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
        >
          {existingBid ? 'Modifier mon offre scellée' : 'Déposer une offre scellée'}
        </button>
      </form>
    </li>
  );
}

const SIZE_LABELS = {
  grande: ['Grande entreprise', 'Plus de 8 % du marché de son domaine : une reprise qui change votre position d’un coup, et qui s’intègre lourdement.'],
  moyenne: ['Entreprise moyenne', 'Entre 2 et 8 % du marché de son domaine.'],
  petite: ['Petite entreprise', 'Moins de 2 % du marché de son domaine : une porte d’entrée, pas une position.'],
} as const;

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
  const size = target.sizeClass ? SIZE_LABELS[target.sizeClass] : null;

  return (
    <li className={`rounded-lg border p-4 ${existingOffer ? 'border-(--accent)' : 'border-(--border)'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {badge ? (
            <span className="rounded bg-(--accent-subtle) px-1.5 py-0.5 text-xs font-semibold tracking-wide text-(--accent-text) uppercase">
              {badge}
            </span>
          ) : null}
          {target.targetName}
          {target.consolidation ? (
            <span className="inline-flex items-center gap-1 rounded bg-(--positive-subtle) px-1.5 py-0.5 text-xs font-semibold tracking-wide text-(--positive) uppercase">
              Consolidation
              <InfoHint label="Consolidation">
                Vous exploitez déjà ce domaine. Sa part de marché s’ajoutera à la vôtre, ce qui
                renforce votre pouvoir de fixation des prix — au prix du choc d’intégration : vous
                absorbez une position commerciale, pas une marque ni un savoir-faire.
              </InfoHint>
            </span>
          ) : null}
          {existingOffer ? (
            <span className="rounded-full bg-(--accent-subtle) px-2 py-0.5 text-xs font-semibold text-(--accent-text)">
              offre déposée
            </span>
          ) : null}
        </h3>
        <p className="text-sm text-(--meta) capitalize">
          {target.dasName}
          {target.regionKey ? ` · ${target.regionKey.replace(/_/g, ' ')}` : ''}
        </p>
      </div>

      {/* ── Ce que l'entreprise fait, et de quelle taille ──────────────────
          L'écran proposait d'acheter une société en n'en disant que le nom, le
          domaine et la région. On décide d'une acquisition sur ce qu'elle fait
          et sur son poids, pas sur son état civil. */}
      {size || (target.segments && target.segments.length > 0) ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {size ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded bg-(--surface-muted) px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase ring-1 ring-(--border)">
                {size[0]}
              </span>
              <InfoHint label={size[0]}>{size[1]}</InfoHint>
            </span>
          ) : null}
          {target.segments && target.segments.length > 0 ? (
            <span className="text-(--foreground-muted)">
              <span className="font-medium text-(--foreground)">Son marché : </span>
              {target.segments.join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}

      {owned ? (
        <p className={`mt-3 text-sm font-medium ${owned === 'moi' ? 'text-(--positive)' : 'text-(--warning)'}`}>
          {owned === 'moi'
            ? 'Vous détenez ce maillon : il ne prélève plus de marge et ne négocie plus contre vous.'
            : 'Racheté par une autre équipe — son nouveau propriétaire décide de ce qu’il vous vend.'}
        </p>
      ) : null}

      {/* Les chiffres avant le formulaire : on lit, puis on chiffre. */}
      <TargetStats targetActorId={target.targetActorId} dueDiligences={dueDiligences} />

      {owned ? null : (
        <form
          className="mt-4 border-t border-(--border) pt-4"
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
              <span className="flex items-center gap-2 text-sm font-medium">
                Votre offre (DH)
                <InfoHint label="Prix de réserve">
                  La cible a un prix de réserve : en deçà, elle refuse et personne n’acquiert.
                </InfoHint>
              </span>
              <NumberInput value={offerValue} onChange={(v) => setOffer(String(v))} className="mt-1.5 w-full" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Budget d’intégration (DH)</span>
              <NumberInput value={integrationValue} onChange={(v) => setIntegration(String(v))} className="mt-1.5 w-full" />
            </label>
          </div>

          <IntegrationLoss offer={offerValue} integration={integrationValue} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit" disabled={disabled || offerValue < 1}
              className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
            >
              {existingOffer ? 'Modifier mon offre scellée' : 'Déposer une offre scellée'}
            </button>
            {existingOffer ? (
              <button
                type="button" disabled={disabled}
                onClick={() => onSend({ action: 'withdraw', targetActorId: target.targetActorId })}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-(--foreground-muted) enabled:hover:bg-(--negative-subtle) enabled:hover:text-(--negative) disabled:opacity-40"
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
    <div className="rounded-lg bg-(--surface-muted) px-3 py-2">
      <dt className="text-sm text-(--foreground-muted)">{label}</dt>
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
    <details className="group mt-3 rounded-lg bg-(--surface-muted) [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium">
        <span className="flex-1">
          Chiffres de la cible
          <span className="ml-2 font-normal text-(--foreground-muted)">
            {study
              ? `${TIER_LABELS[study.tier] ?? study.tier} · tour ${study.roundNumber}`
              : 'due diligence non commandée'}
          </span>
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 text-(--foreground-muted) transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div className="border-t border-(--border) px-4 py-3">
        {study ? (
          <>
            <DisclosureList fields={study.fields} />
            <p className="mt-3 flex items-center gap-2 border-t border-(--border) pt-2 text-xs text-(--foreground-muted)">
              Chiffres figés à la commande, marge d’erreur comprise.
              <InfoHint label="Précision de la due diligence">
                Un palier supérieur les resserre et couvre les passifs non déclarés.
              </InfoHint>
            </p>
          </>
        ) : (
          <p className="text-sm text-(--foreground-muted)">
            Chiffre d’affaires, part de marché, marge et passifs s’achètent au{' '}
            <Link href="/cabinet" className="font-medium text-(--accent-text) underline">cabinet</Link>, en due
            diligence. Sans elle, vous enchérissez sur un nom.
          </p>
        )}
      </div>
    </details>
  );
}
