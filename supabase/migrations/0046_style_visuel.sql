set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0046 : le style visuel d'une session
--
-- Deux publics, deux atmosphères : des cadres attendent l'austérité d'un outil
-- de pilotage, une promotion d'étudiants joue plus volontiers dans un décor de
-- jeu. Le facilitateur choisit, session par session, entre le style « sobre »
-- (corporate, par défaut) et le style « ludique ».
--
-- Le style ne change ni les règles, ni les chiffres, ni leur lisibilité : les
-- deux palettes tiennent les mêmes contrastes (WCAG 2.2 AA).
-- =============================================================================

alter table game_sessions
  add column if not exists visual_style text not null default 'corporate';

alter table game_sessions drop constraint if exists game_sessions_visual_style_check;
alter table game_sessions
  add constraint game_sessions_visual_style_check check (visual_style in ('corporate', 'ludique'));

comment on column game_sessions.visual_style is
  'Style visuel des écrans d''équipe et du projecteur : corporate (sobre) ou ludique. Choisi par le facilitateur.';
