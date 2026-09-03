-- =============================================================================
-- ATLAS — Migration 0007 : sceller réellement le marché de cession
--
-- Défaut corrigé : `pool_reads_open_listings` accordait un SELECT sur la LIGNE
-- ENTIÈRE de `das_listings` à tout le pool. Or cette ligne porte
-- `npc_offer_mad` — l'offre de l'acheteur non joueur, qui doit rester connue du
-- seul vendeur (doc 00 §7). Un concurrent la lisant saurait exactement à quel
-- prix surenchérir d'un dirham, et l'enchère perdait tout intérêt.
--
-- Même famille de défaut que la table de résultats : une politique RLS ouvre une
-- LIGNE, jamais une colonne.
-- =============================================================================

set search_path = atlas, public, extensions;

drop policy pool_reads_open_listings on das_listings;
drop view if exists das_listings_public;

-- Le vendeur garde l'accès complet à ses propres annonces (policy
-- `seller_full_access`, inchangée) : lui seul voit l'offre NPC.

create view das_listings_public as
select
  l.id            as listing_id,
  l.session_id,
  l.das_id,
  u.name          as das_name,
  l.seller_team_id,
  t.name          as seller_team_name,
  l.round_number,
  l.public_snapshot,
  l.created_at
from das_listings l
join teams t           on t.id = l.seller_team_id
join strategic_units u on u.id = l.das_id
where l.status = 'open'
  and t.pool_id in (select atlas_pool_ids())
  -- Une équipe ne se voit pas proposer sa propre annonce à l'achat.
  and l.seller_team_id not in (select atlas_team_ids());

grant select on das_listings_public to authenticated;

comment on view das_listings_public is
  'Fiche publique d''un DAS en vente. L''offre de l''acheteur non joueur '
  '(npc_offer_mad) est PHYSIQUEMENT absente : la connaître permettrait de '
  'surenchérir d''un dirham et viderait l''enchère de son sens.';

-- Nombre d'offres reçues, sans leur montant : le vendeur doit savoir si son
-- annonce a suscité de l'intérêt, sans pouvoir en déduire les prix. Il arrête
-- son choix EN AVEUGLE — c'est tout l'arbitrage entre la liquidité certaine du
-- NPC et le pari du marché.
create view das_listing_interest as
select
  l.id            as listing_id,
  l.seller_team_id,
  count(b.id)     as bid_count
from das_listings l
left join das_bids b on b.listing_id = l.id and b.status = 'sealed'
where l.seller_team_id in (select atlas_team_ids())
group by l.id, l.seller_team_id;

grant select on das_listing_interest to authenticated;
