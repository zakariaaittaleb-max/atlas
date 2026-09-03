set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0011 : directives du Groupe et conformité des DAS
-- =============================================================================
--
-- ── LE PROBLÈME QUE CETTE MIGRATION CORRIGE ─────────────────────────────────
--
-- Jusqu'ici, quatre familles de décisions étaient prises UNE SEULE FOIS, au
-- niveau du groupe, alors qu'elles se prennent en réalité à deux étages :
--
--   1. la logique de portefeuille   — le groupe arbitre, chaque DAS se situe
--   2. la mutualisation effective   — le groupe ouvre, chaque DAS adhère
--   3. les fonctions pilotées au siège — le groupe centralise, chaque DAS suit
--      ou résiste
--   4. l'identité stratégique       — le groupe énonce, chaque DAS décline
--
-- Confondre les deux étages efface précisément ce que la stratégie de groupe a
-- d'intéressant à enseigner : une directive n'a de valeur que si les unités la
-- suivent, et une unité qui suit une directive inadaptée détruit de la valeur.
-- Les deux sens coûtent. C'est l'arbitrage central du cours.
--
-- ── CE QUI EN DÉCOULE POUR LE CALCUL ────────────────────────────────────────
--
-- Un quatrième score apparaît, le SAG — score d'alignement au Groupe. Il ne
-- mesure PAS l'obéissance : un DAS qui diverge d'une directive inadaptée perd
-- du SAG mais gagne du SAB. La seule façon d'avoir les deux est de fixer des
-- directives qui conviennent au portefeuille. Voir `alignment.ts`.
-- =============================================================================


-- --- 1. IDENTITÉ STRATÉGIQUE DU GROUPE --------------------------------------
--
-- Le pendant, à l'étage groupe, de `das_org_design.vision/mission`. Comme au
-- niveau DAS, ces énoncés ne sont JAMAIS notés numériquement : ils servent le
-- débriefing. Ce sont les valeurs (déjà présentes) qui pèsent sur le calcul.
alter table team_round_strategy
  add column if not exists vision  text,
  add column if not exists mission text;


-- --- 2. DÉCLINAISON DES DIRECTIVES PAR DAS ----------------------------------
create table das_group_directives (
  id                uuid primary key default extensions.gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  das_id            uuid not null references strategic_units(id) on delete cascade,
  round_number      smallint not null,

  -- ── Logique de portefeuille, étage DAS ──────────────────────────────────
  -- Le rôle que le GROUPE assigne à ce DAS. Il n'y a pas de bon rôle dans
  -- l'absolu : un portefeuille sans « soutien » ni « réserve » est un
  -- portefeuille qui investit partout, donc nulle part.
  portfolio_role    text not null default 'relais'
    check (portfolio_role in ('moteur','relais','soutien','reserve')),

  -- Le mouvement de croissance visé sur ce DAS (Ansoff).
  ansoff_movement   text not null default 'penetration'
    check (ansoff_movement in ('penetration','developpement_marche',
                               'developpement_produit','diversification')),

  -- ── Fonctions pilotées au siège, étage DAS ──────────────────────────────
  -- Ce que CE DAS délègue effectivement. La divergence avec la directive du
  -- groupe (`team_round_strategy.central_*`) est mesurée, dans les deux sens :
  -- un DAS qui garde la main sur des achats que le groupe a centralisés brise
  -- l'économie d'échelle ; un DAS de niche qui délègue tout perd sa réactivité.
  hq_purchasing     boolean not null default false,
  hq_it             boolean not null default false,
  hq_rd             boolean not null default false,
  hq_hr             boolean not null default false,
  hq_finance        boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);

create index on das_group_directives (team_id, round_number);


-- --- 3. ADHÉSION D'UN DAS AUX RESSOURCES MUTUALISÉES ------------------------
--
-- Le groupe construit des plateformes (`shared_platforms`) et désigne les DAS
-- concernés. Ce n'est qu'une OFFRE : l'adhésion réelle se décide ici, DAS par
-- DAS. Un groupe qui bâtit une centrale d'achat que personne n'utilise a payé
-- une plateforme et n'a acheté aucune synergie.
--
-- ── LA STANDARDISATION, ET POURQUOI ELLE VIENT APRÈS ────────────────────────
-- On ne standardise que ce qu'on a d'abord mutualisé : standardiser un procédé
-- resté propre à un DAS, c'est figer une exception. La standardisation est donc
-- conditionnée à l'adhésion, et c'est elle — et elle seule — qui autorise à
-- réduire l'effectif de la fonction sans perte de qualité. Sans elle, la même
-- réduction dégrade la qualité et le climat social.
create table das_shared_resources (
  id                uuid primary key default extensions.gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  das_id            uuid not null references strategic_units(id) on delete cascade,
  round_number      smallint not null,

  -- Même vocabulaire que `shared_platforms.platform_type` : les deux tables
  -- décrivent les deux faces d'une seule décision.
  resource_key      text not null check (resource_key in
    ('si_commun','plateforme_logistique','centre_rd','centrale_achat',
     'force_commerciale','usine_partagee','centre_services_partages','marque_ombrelle')),

  -- 0 = ce DAS n'y recourt pas ; 100 = il y a basculé entièrement.
  -- Un degré, et non un booléen : une adhésion partielle est le cas courant,
  -- et c'est elle qui produit les coûts de coordination sans les économies.
  adoption_level    smallint not null default 0
    check (adoption_level between 0 and 100),

  -- Interdit sans adhésion : voir le commentaire ci-dessus.
  standardised      boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (team_id, das_id, round_number, resource_key),
  constraint standardise_requires_adoption
    check (not standardised or adoption_level >= 50)
);

create index on das_shared_resources (team_id, round_number);


-- --- 4. SCORE D'ALIGNEMENT AU GROUPE ----------------------------------------
--
-- Stocké à part plutôt qu'ajouté à `alignment_scores` : celui-ci est global à
-- l'équipe, alors que le SAG est par DAS. Le confondre reproduirait exactement
-- la confusion d'étages que cette migration corrige.
create table das_group_alignment (
  id                uuid primary key default extensions.gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  das_id            uuid not null references strategic_units(id) on delete cascade,
  round_number      smallint not null,

  sag_score         numeric not null check (sag_score between 0 and 100),
  role_fit          numeric,
  mutualisation_fit numeric,
  hq_fit            numeric,
  identity_fit      numeric,

  -- Ce qui rend le score lisible au débriefing : la phrase qui dit dans quel
  -- sens ça diverge. Un score sans explication ne s'enseigne pas.
  divergence_note   text,

  created_at        timestamptz not null default now(),
  unique (team_id, das_id, round_number)
);

create index on das_group_alignment (team_id, round_number);


-- --- 5. VERROUILLAGE (politique posée en 0003 : refus par défaut) -----------
alter table das_group_directives  enable row level security;
alter table das_shared_resources  enable row level security;
alter table das_group_alignment   enable row level security;

-- Les décisions : lisibles et modifiables par les membres de l'équipe.
create policy das_group_directives_team on das_group_directives
  for all to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()))
  with check (team_id in (select team_id from team_members where user_id = auth.uid()));

create policy das_shared_resources_team on das_shared_resources
  for all to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()))
  with check (team_id in (select team_id from team_members where user_id = auth.uid()));

-- Le score : lecture seule. Il est écrit par la résolution, sous `service_role`,
-- qui n'est pas soumis à la RLS. Aucune politique d'écriture n'est donc
-- nécessaire, et ne pas en créer est le point : une équipe ne se note pas.
create policy das_group_alignment_read on das_group_alignment
  for select to authenticated
  using (team_id in (select team_id from team_members where user_id = auth.uid()));

grant select, insert, update, delete on das_group_directives to authenticated;
grant select, insert, update, delete on das_shared_resources  to authenticated;
grant select                          on das_group_alignment  to authenticated;
