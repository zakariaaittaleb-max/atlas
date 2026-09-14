set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0047 : le facilitateur choisit ce que la salle voit
--
-- Pendant 45 à 60 minutes de tour, le projecteur n'affichait qu'« Aucun
-- résultat publié ». Il devient un outil d'animation : le facilitateur choisit
-- la scène projetée depuis sa barre de conduite.
--
--   • auto        — suit l'état du tour (avancement, calcul, classement) ;
--   • avancement  — équipes ayant soumis, temps restant ;
--   • carte       — la crise ou l'opportunité en cours ;
--   • classement  — les parts de marché publiées ;
--   • pause       — un écran neutre, pour un échange en salle.
--
-- Le projecteur est déjà abonné aux mises à jour de `game_sessions` : changer
-- de scène le rafraîchit sans que personne ne touche l'écran du mur.
-- =============================================================================

alter table game_sessions
  add column if not exists projector_scene text not null default 'auto',
  add column if not exists projector_shock_id uuid references market_shocks(id) on delete set null;

alter table game_sessions drop constraint if exists game_sessions_projector_scene_check;
alter table game_sessions
  add constraint game_sessions_projector_scene_check
  check (projector_scene in ('auto', 'avancement', 'carte', 'classement', 'pause'));

comment on column game_sessions.projector_scene is
  'Scène projetée, choisie par le facilitateur : auto, avancement, carte, classement ou pause.';
comment on column game_sessions.projector_shock_id is
  'Carte projetée quand la scène est « carte » ; la plus récente de la session à défaut.';
