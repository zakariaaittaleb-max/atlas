set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0041 : ce que 0022_ux_protocol_sus ne créait pas
--
-- Le code du questionnaire écrit `sus_responses.user_id` et traite une réponse
-- en double comme « déjà répondu » (code 23505). La migration livrée avec lui
-- ne créait ni la colonne ni l'unicité : la base de travail les a reçues à la
-- main, mais une base reconstruite depuis le dépôt faisait échouer la page
-- /sus dès sa lecture.
--
-- Idempotente : sans effet sur une base qui les porte déjà.
-- =============================================================================

alter table sus_responses
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Une réponse par participant et par session. Partielle : une réponse sans
-- participant identifié reste possible et ne se compare à rien.
create unique index if not exists sus_responses_session_user_idx
  on sus_responses (session_id, user_id)
  where user_id is not null;
