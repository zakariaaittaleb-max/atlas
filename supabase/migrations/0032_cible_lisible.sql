-- =============================================================================
-- ATLAS — Migration 0032 : une cible d'acquisition devient lisible
--
-- L'écran de cession proposait d'acheter une entreprise en n'en disant que le
-- nom, son domaine et sa région. Décider d'une acquisition sur trois lignes
-- d'état civil n'est pas un exercice de stratégie.
--
-- La vue publique gagne donc ce qu'un acquéreur sait AVANT d'ouvrir les livres :
--
--   • sa TAILLE, en trois classes. Tout le monde sait si un concurrent est gros
--     ou petit ; personne ne connaît son chiffre d'affaires exact. La classe se
--     calcule sur la part du marché du domaine qu'il sert : moins de 2 %,
--     jusqu'à 8 %, au-delà. Les chiffres précis — marge, santé financière,
--     appétit à vendre — restent ce que le cabinet VEND, et la due diligence
--     garde donc toute sa raison d'être ;
--   • depuis combien de tours elle est SUR LE MARCHÉ, qui dit si le vendeur
--     commence à s'impatienter.
--
-- ── SECURITY DEFINER ASSUMÉ, comme la vue d'origine ──────────────────────────
--
-- La clause WHERE est l'unique garde, et c'est délibéré : `authenticated` n'a
-- de SELECT que sur sept colonnes d'`ecosystem_actors` — ni `market_open`, ni
-- quoi que ce soit dans `ecosystem_actor_rounds`, dont le chiffre d'affaires
-- est précisément ce que le cabinet VEND.
--
-- Le premier essai de cette migration imposait `security_invoker = true`. La
-- vue s'est mise à ne rien rendre du tout : PostgREST renvoyait « permission
-- denied », le client recevait `null`, et l'écran affichait « aucune cible ».
-- Un refus d'accès qui ressemble à une absence de données est le pire mode de
-- défaillance qu'on puisse écrire — il ne se voit qu'en ouvrant l'écran.
-- =============================================================================

set search_path = atlas, public, extensions;

drop view if exists acquisition_targets_public;

create view acquisition_targets_public as
select
  a.id                        as target_actor_id,
  a.session_id,
  a.das_id,
  u.name                      as das_name,
  u.sector_key,
  a.name                      as target_name,
  a.region_key,
  -- Le dernier chiffre d'affaires connu, rapporté à la taille du marché du
  -- domaine : on n'expose que la CLASSE, jamais le montant.
  case
    when u.base_market_size_mad is null or u.base_market_size_mad <= 0 then 'moyenne'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.02 then 'petite'
    when coalesce(r.revenue_mad, 0) / u.base_market_size_mad < 0.08 then 'moyenne'
    else 'grande'
  end                         as size_class
from ecosystem_actors a
join strategic_units u on u.id = a.das_id
left join lateral (
  select rr.revenue_mad
  from ecosystem_actor_rounds rr
  where rr.actor_id = a.id
  order by rr.round_number desc
  limit 1
) r on true
where a.actor_type = 'cible_acquisition'
  and a.market_open
  and a.session_id in (
    select atlas_team_session(t.t) from unnest(array(select atlas_team_ids())) t(t)
  );

grant select on acquisition_targets_public to authenticated;

comment on view acquisition_targets_public is
  'Cibles d''acquisition ouvertes par le facilitateur. security definer assumé : '
  'la clause WHERE est l''unique garde. N''expose que ce qu''un acquéreur sait '
  'avant d''ouvrir les livres — identité, domaine, région et CLASSE de taille. '
  'Les montants restent vendus par le cabinet : ne jamais y ajouter une colonne '
  'sans se demander si la due diligence la vend.';
