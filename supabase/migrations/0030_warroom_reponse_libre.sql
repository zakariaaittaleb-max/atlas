-- =============================================================================
-- ATLAS — Migration 0030 : la War Room passe à la réponse libre
--
-- Les équipes choisissaient parmi quatre postures — ignorer, atténuer,
-- absorber, retourner — dont le coût et l'efficacité étaient tabulés. Une crise
-- se jouait donc au clic, et la meilleure réponse se devinait sans jamais
-- l'écrire. C'est l'inverse de ce qu'un atelier de stratégie doit faire
-- travailler.
--
-- Désormais l'équipe RÉDIGE son plan et engage un budget. Le facilitateur lit
-- chaque plan et arbitre lui-même ce qu'il vaut, par un curseur de −100 % à
-- +200 % : l'événement peut être évité, subi comme par tout le monde, ou payé
-- trois fois plus cher. C'est un jugement humain, tenu par une personne qui a
-- le texte sous les yeux — pas une table de correspondance.
--
-- `cost_mad` devient le budget engagé par l'équipe : la colonne existait déjà
-- et le moteur la débitait déjà. `response` n'est plus écrite mais reste
-- lisible : les parties déjà jouées gardent leur histoire.
-- =============================================================================

set search_path = atlas, public, extensions;

alter table shock_responses
  add column if not exists plan text,
  add column if not exists impact_pct numeric not null default 0
    check (impact_pct between -100 and 200),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

-- Les quatre postures ne sont plus imposées : une réponse peut n'être qu'un
-- texte. La contrainte de valeur reste pour les lignes qui en portent une.
alter table shock_responses alter column response drop not null;

comment on column shock_responses.plan is
  'Le plan rédigé par l''équipe. Lu par le facilitateur, jamais interprété par le moteur.';
comment on column shock_responses.impact_pct is
  'Arbitrage du facilitateur, en pourcentage : −100 = événement évité, 0 = subi '
  'comme annoncé, +200 = trois fois plus fort. S''applique aux leviers de CETTE '
  'carte pour CETTE équipe.';
comment on column shock_responses.cost_mad is
  'Budget engagé par l''équipe sur sa réponse. Débité que la carte s''avère '
  'bénigne ou non : c''est le prix de l''assurance.';
