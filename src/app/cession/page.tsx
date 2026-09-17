import 'server-only';

import { priceGuide, type Interval } from '@/lib/acquisition-guide';
import { decisionsAreOpen, getRoundState, requireTeam } from '@/lib/dal';
import { STUDY_BASE_PRICES, STUDY_TIERS, TIER_PROFILES, studyPrice } from '@/lib/engine/consulting';
import { buildParams } from '@/lib/engine/params';
import { isOn } from '@/lib/modules-state';
import { loadDecisionContext } from '@/lib/server/decision-context';
import { loadEnabledModules } from '@/lib/server/modules';
import { loadMoneyBar } from '@/lib/server/money-bar';
import { createAdminClient, createServerClient } from '@/lib/supabase/server';

import {
  CessionView, type ConcludedDeal, type DueDiligence, type DueDiligenceFields, type IntegrationTarget,
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
    { data: units }, { data: ownListings },
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
      // Annonces des concurrents : fiche publique uniquement, l'offre NPC en est
      // physiquement absente.
      supabase.from('das_listings_public').select('*').eq('round_number', roundNumber),
      supabase
        .from('das_bids')
        .select('listing_id, offer_mad, integration_budget_mad, status')
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

  const listedDasIds = new Set((ownListings ?? []).map((l) => String(l.das_id)));

  const sellable: SellableDas[] = (units ?? [])
    .map((u) => {
      const das = u.strategic_units as unknown as { id: string; name: string } | null;
      return das ? { dasId: das.id, name: das.name, alreadyListed: listedDasIds.has(das.id) } : null;
    })
    .filter((d): d is SellableDas => d !== null);

  // ── Les repères d'une offre ────────────────────────────────────────────────
  const studies: DueDiligence[] = (dueDiligences ?? [])
    .filter((o) => o.target_actor_id)
    .map((o) => {
      const payload = o.payload as { subjects?: { fields?: unknown[] }[] } | null;
      return {
        targetActorId: String(o.target_actor_id),
        tier: String(o.tier),
        errorMargin: Number(o.error_margin),
        roundNumber: Number(o.round_number),
        fields: (payload?.subjects?.[0]?.fields ?? []) as DueDiligenceFields,
      };
    });

  // Le multiple de valorisation du secteur n'est pas lisible par les équipes
  // (`strategic_units` n'expose que l'identité) : il est lu ici, côté serveur,
  // et ne quitte la page que fondu dans une fourchette de prix.
  const admin = createAdminClient();
  const [{ data: valuations }, { data: actors }, money, decision] = await Promise.all([
    admin.from('strategic_units').select('id, name, valuation_multiple').eq('session_id', team.sessionId),
    admin.from('ecosystem_actors').select('id, das_id, actor_type, name')
      .eq('session_id', team.sessionId)
      .in('actor_type', ['cible_acquisition', 'fournisseur', 'distributeur']),
    loadMoneyBar(),
    // Mémoïsé pour la requête : la navigation l'a déjà chargé.
    loadDecisionContext(),
  ]);
  // Les offres REÇUES, montants compris : le vendeur conclut en les lisant.
  // Lues avec la clé de service — la RLS réserve chaque offre à son auteur —
  // et limitées aux annonces de l'équipe.
  const ownListingIds = (ownListings ?? []).map((l) => String(l.id));
  const [{ data: receivedBids }, { data: dealRows }] = await Promise.all([
    admin.from('das_bids').select('id, listing_id, bidder_team_id, offer_mad')
      .in('listing_id', ownListingIds.length > 0 ? ownListingIds : [crypto.randomUUID()])
      .eq('status', 'sealed')
      .order('offer_mad', { ascending: false }),
    admin.from('deal_cash_movements')
      .select('id, kind, amount_mad, das_id, counterparty_team_id, target_actor_id')
      .eq('team_id', team.teamId).eq('round_number', roundNumber)
      .order('created_at'),
  ]);
  const teamIdsToName = [...new Set([
    ...(receivedBids ?? []).map((b) => String(b.bidder_team_id)),
    ...(dealRows ?? []).filter((d) => d.counterparty_team_id).map((d) => String(d.counterparty_team_id)),
  ])];
  const { data: namedTeams } = await admin.from('teams').select('id, name')
    .in('id', teamIdsToName.length > 0 ? teamIdsToName : [crypto.randomUUID()]);
  const teamName = new Map((namedTeams ?? []).map((t) => [String(t.id), String(t.name)]));
  const dasName = new Map((valuations ?? []).map((u) => [String(u.id), String(u.name)]));

  const multipleByDas = new Map(
    (valuations ?? []).map((u) => [String(u.id), Number(u.valuation_multiple ?? 5)]),
  );
  const actorById = new Map(
    (actors ?? []).map((a) => [String(a.id), { dasId: String(a.das_id), type: String(a.actor_type) }]),
  );

  // La plus récente étude de la cible, puisque la liste est triée par tour
  // décroissant : un palier supérieur racheté ensuite la remplace.
  const guideFor = (actorId: string, publicRevenue: Interval | null) => {
    const actor = actorById.get(actorId);
    if (!actor) return null;
    const study = studies.find((d) => d.targetActorId === actorId) ?? null;
    return priceGuide({
      multiple: multipleByDas.get(actor.dasId) ?? 5,
      actorType: actor.type,
      publicRevenue,
      study,
    });
  };

  const params = buildParams();
  const dueDiligenceTiers = isOn(modules, 'cabinet.due_diligence')
    ? STUDY_TIERS.map((tier) => ({
        tier,
        label: TIER_PROFILES[tier].label,
        priceMad: studyPrice(STUDY_BASE_PRICES.due_diligence, tier, params),
        errorMargin: TIER_PROFILES[tier].errorMargin,
        includesWeakSignals: TIER_PROFILES[tier].includesWeakSignals,
      }))
    : [];

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
        bids: (receivedBids ?? [])
          .filter((b) => String(b.listing_id) === String(l.id))
          .map((b) => ({
            bidId: String(b.id),
            bidderTeamName: teamName.get(String(b.bidder_team_id)) ?? 'Équipe',
            offerMad: Number(b.offer_mad),
          })),
      }))}
      market={(market ?? []) as unknown as PublicListing[]}
      myBids={(myBids ?? []).filter((b) => String(b.status) === 'sealed').map((b) => ({
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
          priceGuide: guideFor(String(t.target_actor_id), {
            lower: Number(t.revenue_band_min_mad ?? 0),
            upper: Number(t.revenue_band_max_mad ?? 0),
          }),
        }))}
      myOffers={(myOffers ?? [])
        .map((o) => ({
          targetActorId: String(o.target_actor_id),
          status: String(o.status),
          offerMad: Number(o.offer_mad),
          integrationBudgetMad: Number(o.integration_budget_mad),
        }))}
      modules={modules}
      deals={(dealRows ?? []).map((d) => ({
        id: String(d.id),
        kind: String(d.kind) as ConcludedDeal['kind'],
        amountMad: Number(d.amount_mad),
        dasName: d.das_id ? dasName.get(String(d.das_id)) ?? 'DAS' : 'DAS',
        counterpartyName: d.counterparty_team_id ? teamName.get(String(d.counterparty_team_id)) ?? null : null,
        targetName: d.target_actor_id
          ? (actors ?? []).find((a) => String(a.id) === String(d.target_actor_id))?.name ?? null
          : null,
      }))}
      buyingPower={{
        remainingMad: money ? money.availableMad - money.engagedMad : 0,
        creditMad: decision.financeLimits.capacityAvailableMad,
      }}
      dueDiligenceTiers={dueDiligenceTiers}
      dueDiligences={studies}
      integrationTargets={(links ?? []).map((l): IntegrationTarget => ({
        targetActorId: String(l.target_actor_id),
        targetName: String(l.target_name),
        dasName: String(l.das_name),
        regionKey: l.region_key ? String(l.region_key) : null,
        actorType: String(l.actor_type) as IntegrationTarget['actorType'],
        alreadyOwned: Boolean(l.already_owned),
        ownedByMe: Boolean(l.owned_by_me),
        priceGuide: guideFor(String(l.target_actor_id), null),
      }))}
    />
  );
}
