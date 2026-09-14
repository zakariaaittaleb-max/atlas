import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import { loadEnabledModules } from '@/lib/server/modules';
import { createServerClient } from '@/lib/supabase/server';

import {
  CessionView, type DueDiligenceFields, type IntegrationTarget, type OwnListing,
  type PublicListing, type SellableDas,
} from './cession-view';

export const metadata = { title: 'Atlas — Cession & acquisitions' };
export const dynamic = 'force-dynamic';

export default async function CessionPage() {
  const team = await requireTeam();
  const round = await getRoundState(team.sessionId);
  const roundNumber = (round?.current_round as number) ?? 0;
  const open = decisionsAreOpen(round?.status as string);
  const modules = await loadEnabledModules(team.sessionId);

  const supabase = await createServerClient();

  // Les due diligences déjà payées. Le chiffre d'affaires et la marge d'une
  // cible ne s'affichent QUE si l'équipe les a achetés : c'est exactement ce
  // que le cabinet vend, et l'offrir gratuitement viderait la due diligence de
  // son objet. Le livrable est celui figé à la commande, bruit compris.
  const { data: dueDiligences } = await supabase
    .from('consulting_orders')
    .select('target_actor_id, tier, error_margin, round_number, payload')
    .eq('team_id', team.teamId)
    .eq('study_key', 'due_diligence')
    .order('round_number', { ascending: false });

  const [
    { data: units }, { data: ownListings }, { data: interest },
    { data: market }, { data: myBids }, { data: targets }, { data: myOffers },
    { data: links }, { data: segments },
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
      // Le référentiel des segments : il dit ce qu'un domaine vend, et il est
      // public — c'est le marché, pas un secret d'équipe.
      supabase.from('market_segments').select('das_id, name'),
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
      // Une cible située dans un domaine DÉJÀ exploité n'est plus écartée :
      // c'est une CONSOLIDATION, et le référentiel financier la demande
      // explicitement — « acquisition d'un concurrent pour consolider un DAS
      // existant », pour le pouvoir de fixation des prix qu'elle procure.
      // Les positions s'additionnent alors au lieu de se remplacer
      // (migration 0037).
      targets={(targets ?? [])
        .map((t) => ({
          targetActorId: String(t.target_actor_id),
          targetName: String(t.target_name),
          dasName: String(t.das_name),
          regionKey: t.region_key ? String(t.region_key) : null,
          sizeClass: String(t.size_class ?? 'moyenne') as 'petite' | 'moyenne' | 'grande',
          // Les segments du domaine disent ce que l'entreprise vend. Ils sont
          // publics — c'est le référentiel du marché, pas un secret d'équipe.
          segments: (segments ?? [])
            .filter((s) => String(s.das_id) === String(t.das_id))
            .map((s) => String(s.name)),
          // Ce que la place en dit, gratuitement (migration 0044) : à afficher
          // en infobulle avant même d'avoir payé une due diligence au cabinet.
          marketBand: {
            revenueMinMad: Number(t.revenue_band_min_mad ?? 0),
            revenueMaxMad: Number(t.revenue_band_max_mad ?? 0),
            marketShareBand: t.market_share_band ? String(t.market_share_band) : null,
            headcountApprox: Number(t.headcount_approx ?? 0),
            healthBand: t.health_band ? (String(t.health_band) as 'fragile' | 'correcte' | 'solide') : null,
          },
          // L'équipe doit savoir ce qu'elle fait : entrer dans un métier neuf,
          // ou renforcer une position qu'elle tient déjà.
          consolidation: sellable.some((d) => d.dasId === String(t.das_id)),
        }))}
      myOffers={(myOffers ?? [])
        .filter((o) => String(o.status) === 'sealed')
        .map((o) => ({
          targetActorId: String(o.target_actor_id),
          offerMad: Number(o.offer_mad),
          integrationBudgetMad: Number(o.integration_budget_mad),
        }))}
      modules={modules}
      dueDiligences={(dueDiligences ?? [])
        .filter((o) => o.target_actor_id)
        .map((o) => {
          const payload = o.payload as {
            subjects?: { fields?: unknown[] }[];
          } | null;
          return {
            targetActorId: String(o.target_actor_id),
            tier: String(o.tier),
            errorMargin: Number(o.error_margin),
            roundNumber: Number(o.round_number),
            fields: (payload?.subjects?.[0]?.fields ?? []) as DueDiligenceFields,
          };
        })}
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
