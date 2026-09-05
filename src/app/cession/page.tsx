import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import { createServerClient } from '@/lib/supabase/server';

import {
  CessionView, type IntegrationTarget, type OwnListing, type PublicListing, type SellableDas,
} from './cession-view';

export const metadata = { title: 'Atlas — Marché de cession' };
export const dynamic = 'force-dynamic';

export default async function CessionPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const open = decisionsAreOpen(round?.status as string);

  const supabase = await createServerClient();

  const [
    { data: units }, { data: ownListings }, { data: interest },
    { data: market }, { data: myBids }, { data: targets }, { data: myOffers },
    { data: links },
  ] =
    await Promise.all([
      // Portefeuille de l'équipe. `strategic_units` n'expose que l'identité du
      // DAS aux joueurs — ses paramètres économiques restent au moteur.
      supabase
        .from('team_units')
        .select('das_id, status, launched_round, strategic_units(id, name, sector_key)')
        .eq('team_id', team.teamId)
        .in('status', ['active', 'listed_for_sale']),
      // Ses propres annonces : c'est la SEULE lecture qui expose l'offre NPC,
      // et la politique `seller_full_access` la restreint au vendeur.
      supabase
        .from('das_listings')
        .select('id, das_id, npc_offer_mad, seller_choice, status, public_snapshot')
        .eq('seller_team_id', team.teamId)
        .eq('round_number', roundNumber)
        .eq('status', 'open'),
      supabase.from('das_listing_interest').select('listing_id, bid_count'),
      // Annonces des concurrents : fiche publique uniquement, l'offre NPC en est
      // physiquement absente.
      supabase.from('das_listings_public').select('*').eq('round_number', roundNumber),
      supabase
        .from('das_bids')
        .select('listing_id, offer_mad, integration_budget_mad')
        .eq('bidder_team_id', team.teamId)
        .eq('round_number', roundNumber),
      // Cibles acquérables : identité seulement. Leurs chiffres s'achètent en
      // due diligence — acquérir à l'aveugle est un choix, pas un oubli.
      supabase.from('acquisition_targets_public').select('*'),
      supabase
        .from('acquisition_offers')
        .select('target_actor_id, offer_mad, integration_budget_mad, status')
        .eq('bidder_team_id', team.teamId)
        .eq('round_number', roundNumber),
      // Maillons intégrables : les fournisseurs et distributeurs des domaines
      // que l'équipe EXPLOITE. Identité seulement — capacité, fiabilité et
      // marge exigée restent au cabinet.
      supabase.from('integration_targets_public').select('*'),
    ]);

  const interestByListing = new Map(
    (interest ?? []).map((r) => [String(r.listing_id), Number(r.bid_count ?? 0)]),
  );
  const listedDasIds = new Set((ownListings ?? []).map((l) => String(l.das_id)));

  const sellable: SellableDas[] = (units ?? [])
    .map((u) => {
      const das = u.strategic_units as unknown as { id: string; name: string } | null;
      return das ? { dasId: das.id, name: das.name, alreadyListed: listedDasIds.has(das.id) } : null;
    })
    .filter((d): d is SellableDas => d !== null);

  return (
    <CessionView
      roundNumber={roundNumber}
      decisionsOpen={open}
      sellable={sellable}
      ownListings={(ownListings ?? []).map((l) => ({
        listingId: String(l.id),
        dasId: String(l.das_id),
        dasName: sellable.find((d) => d.dasId === String(l.das_id))?.name ?? 'DAS',
        npcOfferMad: Number(l.npc_offer_mad ?? 0),
        sellerChoice: String(l.seller_choice) as OwnListing['sellerChoice'],
        bidCount: interestByListing.get(String(l.id)) ?? 0,
      }))}
      market={(market ?? []) as unknown as PublicListing[]}
      myBids={(myBids ?? []).map((b) => ({
        listingId: String(b.listing_id),
        offerMad: Number(b.offer_mad),
        integrationBudgetMad: Number(b.integration_budget_mad),
      }))}
      // On n'entre pas par acquisition dans un domaine qu'on exploite déjà :
      // ce serait une consolidation, et le mécanisme prévu pour cela est le
      // rachat d'un DAS mis en vente par une concurrente.
      targets={(targets ?? [])
        .filter((t) => !sellable.some((d) => d.dasId === String(t.das_id)))
        .map((t) => ({
          targetActorId: String(t.target_actor_id),
          targetName: String(t.target_name),
          dasName: String(t.das_name),
          regionKey: t.region_key ? String(t.region_key) : null,
        }))}
      myOffers={(myOffers ?? [])
        .filter((o) => String(o.status) === 'sealed')
        .map((o) => ({
          targetActorId: String(o.target_actor_id),
          offerMad: Number(o.offer_mad),
          integrationBudgetMad: Number(o.integration_budget_mad),
        }))}
      integrationTargets={(links ?? []).map((l): IntegrationTarget => ({
        targetActorId: String(l.target_actor_id),
        targetName: String(l.target_name),
        dasName: String(l.das_name),
        regionKey: l.region_key ? String(l.region_key) : null,
        actorType: String(l.actor_type) as IntegrationTarget['actorType'],
        alreadyOwned: Boolean(l.already_owned),
        ownedByMe: Boolean(l.owned_by_me),
      }))}
    />
  );
}
