-- =============================================================================
-- ATLAS — Migration 0051 : le marché de cession en temps réel
--
-- Depuis la migration 0050, une cession ou une acquisition se conclut en cours
-- de tour. Les autres équipes ne le voyaient qu'en rechargeant leur page : une
-- annonce déjà vendue restait affichée, un domaine racheté n'apparaissait pas
-- dans la barre de l'acheteur.
--
-- Chaque changement du marché inscrit désormais un ÉVÉNEMENT, diffusé par
-- Supabase Realtime aux équipes de la session, qui rechargent alors leurs
-- données par le chemin normal. L'événement ne porte que des identifiants :
-- ni montant, ni domaine. Le contenu reste lu à travers la RLS habituelle.
-- =============================================================================

set search_path = atlas, public, extensions;

create table if not exists market_events (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references game_sessions(id) on delete cascade,
  kind          text not null check (kind in ('annonce', 'offre', 'portefeuille', 'cible')),
  -- L'équipe à l'origine du changement : la sienne a déjà rechargé.
  actor_team_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists market_events_session on market_events (session_id, created_at);

alter table market_events enable row level security;

drop policy if exists session_reads_market_events on market_events;
create policy session_reads_market_events on market_events
  for select to authenticated
  using (session_id in (
    select atlas_team_session(t.t)
    from unnest(array(select atlas_team_ids())) as t(t)
  ));

grant select on market_events to authenticated;

create or replace function atlas_emit_market_event()
returns trigger
language plpgsql security definer set search_path = atlas, public as $$
declare
  v_session uuid;
  v_actor uuid;
  v_kind text;
begin
  if tg_table_name = 'das_listings' then
    v_session := new.session_id;
    v_actor := new.seller_team_id;
    v_kind := 'annonce';
  elsif tg_table_name = 'das_bids' then
    select l.session_id into v_session from das_listings l where l.id = new.listing_id;
    v_actor := new.bidder_team_id;
    v_kind := 'offre';
  elsif tg_table_name = 'team_units' then
    select t.session_id into v_session from teams t where t.id = new.team_id;
    v_actor := new.team_id;
    v_kind := 'portefeuille';
  else
    v_session := new.session_id;
    v_actor := new.owner_team_id;
    v_kind := 'cible';
  end if;

  if v_session is not null then
    insert into market_events (session_id, kind, actor_team_id)
    values (v_session, v_kind, v_actor);
    -- Le journal ne sert qu'à diffuser : on ne garde que la dernière heure.
    delete from market_events
    where session_id = v_session and created_at < now() - interval '1 hour';
  end if;
  return new;
end;
$$;

drop trigger if exists market_event_listings on das_listings;
create trigger market_event_listings
  after insert or update of status on das_listings
  for each row execute function atlas_emit_market_event();

drop trigger if exists market_event_bids on das_bids;
create trigger market_event_bids
  after insert or update of offer_mad, integration_budget_mad, status on das_bids
  for each row execute function atlas_emit_market_event();

drop trigger if exists market_event_units on team_units;
create trigger market_event_units
  after insert or update of status on team_units
  for each row execute function atlas_emit_market_event();

drop trigger if exists market_event_actors on ecosystem_actors;
create trigger market_event_actors
  after update of owner_team_id, market_open on ecosystem_actors
  for each row
  when (old.owner_team_id is distinct from new.owner_team_id
        or old.market_open is distinct from new.market_open)
  execute function atlas_emit_market_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'atlas' and tablename = 'market_events'
  ) then
    alter publication supabase_realtime add table atlas.market_events;
  end if;
end $$;
