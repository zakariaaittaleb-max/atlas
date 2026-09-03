set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0009-A : catalogues d'organisation
--
-- L'organisation devient un objet PAR DAS, et non plus un attribut du groupe.
-- Une équipe qui exploite l'agro-industrie et le numérique ne les structure pas
-- de la même façon : l'un est industriel et centralisé, l'autre est un métier
-- de compétences où la décision doit descendre au terrain.
--
-- Ces trois catalogues sont le vocabulaire commun. Chaque entrée porte une
-- AFFINITÉ par stratégie générique — c'est elle qui permet au moteur de dire si
-- un KPI, un axe ou un poste sert la stratégie déclarée, ou la contredit.
-- L'affinité va de 0 (contre-productif) à 100 (au cœur de la stratégie).
-- =============================================================================

-- --- Les directions d'une entreprise ---------------------------------------
create table direction_catalog (
  key           text primary key,
  name          text not null,
  description   text not null,
  -- Ordre d'affichage dans l'organigramme, du sommet vers l'opérationnel.
  display_order smallint not null
);

insert into direction_catalog (key, name, description, display_order) values
  ('direction_generale', 'Direction générale',
   'Arbitre entre les directions, porte la vision et engage l''entreprise.', 1),
  ('technique', 'Recherche & développement',
   'Conçoit l''offre, fait progresser la qualité intrinsèque du produit.', 2),
  ('production', 'Production & opérations',
   'Transforme, fabrique, tient les coûts et les délais.', 3),
  ('achats', 'Achats & chaîne d''approvisionnement',
   'Négocie l''amont, sécurise les intrants, porte le pouvoir de négociation fournisseur.', 4),
  ('qualite', 'Qualité, hygiène & sécurité',
   'Garantit la conformité et la constance ; sans elle, la différenciation n''est pas crédible.', 5),
  ('commercial', 'Commercial & marketing',
   'Construit la notoriété, négocie l''aval, porte le prix sur le marché.', 6),
  ('si', 'Systèmes d''information',
   'Outille l''automatisation et la circulation de l''information entre DAS.', 7),
  ('finance', 'Finance & contrôle de gestion',
   'Tient la trésorerie, le BFR et l''arbitrage des investissements.', 8),
  ('rh', 'Ressources humaines',
   'Recrute, forme, entretient le climat social et le niveau de compétence.', 9);

-- --- Les indicateurs que chaque direction peut se donner --------------------
--
-- Choisir un KPI, c'est décider de ce qu'on va OPTIMISER — donc de ce qu'on va
-- sacrifier. Un directeur de production suivi sur le coût unitaire et un autre
-- suivi sur le taux de rebut ne prendront pas les mêmes décisions.
create table kpi_catalog (
  key             text primary key,
  direction_key   text not null references direction_catalog(key),
  name            text not null,
  description     text not null,
  unit            text not null check (unit in ('pct', 'mad', 'jours', 'score', 'ratio', 'nombre')),
  -- Sens de progrès : certains KPI s'améliorent en baissant (coût, délai, rebut).
  higher_is_better boolean not null default true,
  -- Affinité 0–100 avec chacune des quatre stratégies génériques.
  affinity_domination_couts      smallint not null check (affinity_domination_couts between 0 and 100),
  affinity_differenciation       smallint not null check (affinity_differenciation between 0 and 100),
  affinity_focus_couts           smallint not null check (affinity_focus_couts between 0 and 100),
  affinity_focus_differenciation smallint not null check (affinity_focus_differenciation between 0 and 100)
);

insert into kpi_catalog
  (key, direction_key, name, description, unit, higher_is_better,
   affinity_domination_couts, affinity_differenciation, affinity_focus_couts, affinity_focus_differenciation) values

  -- Direction générale
  ('dg_croissance_ca', 'direction_generale', 'Croissance du chiffre d''affaires',
   'Mesure l''expansion. Neutre stratégiquement : tout le monde veut croître.', 'pct', true, 60, 60, 55, 55),
  ('dg_marge_ebitda', 'direction_generale', 'Taux de marge d''EBITDA',
   'Rentabilité opérationnelle. Le juge de paix d''une stratégie de différenciation.', 'pct', true, 55, 85, 60, 88),
  ('dg_part_de_marche', 'direction_generale', 'Part de marché',
   'La mesure du leadership en volume. Cœur de la domination par les coûts.', 'pct', true, 92, 45, 40, 25),
  ('dg_roce', 'direction_generale', 'Rentabilité des capitaux engagés',
   'Ce que rapporte chaque dirham immobilisé. Discipline d''allocation.', 'pct', true, 70, 70, 75, 70),

  -- Recherche & développement
  ('rd_part_ca_nouveaux', 'technique', 'Part du CA issue des nouveautés',
   'Ce que rapportent les produits lancés depuis moins de deux ans.', 'pct', true, 25, 95, 20, 92),
  ('rd_delai_mise_marche', 'technique', 'Délai de mise sur le marché',
   'Vitesse à transformer une idée en offre vendable.', 'jours', false, 30, 82, 35, 90),
  ('rd_cout_rd_sur_ca', 'technique', 'Intensité de R&D',
   'Effort de recherche rapporté au chiffre d''affaires.', 'pct', true, 20, 92, 22, 88),
  ('rd_taux_reussite_projets', 'technique', 'Taux d''aboutissement des projets',
   'Discipline d''exécution de la R&D — éviter de financer des impasses.', 'pct', true, 55, 70, 55, 65),

  -- Production & opérations
  ('prod_cout_unitaire', 'production', 'Coût de revient unitaire',
   'L''indicateur roi de la domination par les coûts.', 'mad', false, 96, 30, 88, 25),
  ('prod_taux_utilisation', 'production', 'Taux d''utilisation des capacités',
   'Absorption des coûts fixes. Sur-capacité et surchauffe coûtent toutes deux.', 'pct', true, 88, 45, 80, 40),
  ('prod_taux_rebut', 'production', 'Taux de rebut',
   'Constance de la fabrication. Une différenciation ne survit pas à l''irrégularité.', 'pct', false, 45, 88, 48, 90),
  ('prod_delai_cycle', 'production', 'Délai de cycle de production',
   'Réactivité industrielle : servir vite un segment exigeant.', 'jours', false, 50, 70, 55, 85),
  ('prod_taux_service', 'production', 'Taux de service client',
   'Livrer ce qui a été promis, quand promis.', 'pct', true, 65, 80, 70, 88),

  -- Achats & chaîne d'approvisionnement
  ('ach_indice_prix_achat', 'achats', 'Indice de prix d''achat',
   'Ce que vous payez vos intrants, rapporté au marché.', 'ratio', false, 94, 35, 90, 30),
  ('ach_taux_rupture', 'achats', 'Taux de rupture d''approvisionnement',
   'Fiabilité de l''amont. Un fournisseur bon marché qui rompt coûte plus cher.', 'pct', false, 70, 82, 72, 85),
  ('ach_qualite_intrants', 'achats', 'Qualité des intrants',
   'La qualité perçue commence chez le fournisseur.', 'score', true, 35, 92, 38, 94),
  ('ach_dependance_fournisseur', 'achats', 'Dépendance au premier fournisseur',
   'Part du principal fournisseur. Concentrer donne du pouvoir et crée du risque.', 'pct', false, 55, 60, 58, 62),

  -- Qualité, hygiène & sécurité
  ('qua_taux_conformite', 'qualite', 'Taux de conformité',
   'Part de la production conforme au cahier des charges.', 'pct', true, 55, 92, 58, 94),
  ('qua_cout_non_qualite', 'qualite', 'Coût de la non-qualité',
   'Ce que coûtent les rebuts, retours et réclamations.', 'mad', false, 82, 70, 80, 68),
  ('qua_certifications', 'qualite', 'Certifications obtenues',
   'Sésames d''accès à certains segments et marchés d''export.', 'nombre', true, 40, 88, 45, 85),

  -- Commercial & marketing
  ('com_prix_moyen', 'commercial', 'Prix de vente moyen',
   'Le premium que le marché accepte de payer.', 'mad', true, 25, 92, 35, 95),
  ('com_notoriete', 'commercial', 'Notoriété spontanée',
   'La marque que le client cite sans qu''on la lui souffle.', 'score', true, 55, 90, 40, 80),
  ('com_cout_acquisition', 'commercial', 'Coût d''acquisition client',
   'Ce que coûte un client de plus.', 'mad', false, 88, 45, 85, 50),
  ('com_taux_fidelisation', 'commercial', 'Taux de fidélisation',
   'Cœur d''une stratégie de niche : peu de clients, gardés longtemps.', 'pct', true, 45, 78, 60, 94),
  ('com_couverture_distribution', 'commercial', 'Couverture de distribution',
   'Part du marché physiquement atteignable. On ne vend pas où l''on n''est pas.', 'pct', true, 90, 55, 45, 30),

  -- Systèmes d'information
  ('si_taux_automatisation', 'si', 'Taux d''automatisation des processus',
   'Substitution du variable par du fixe. Décisif à grande échelle.', 'pct', true, 90, 50, 75, 40),
  ('si_cout_si_sur_ca', 'si', 'Coût du SI rapporté au CA', 'Discipline de dépense informatique.', 'pct', false, 82, 50, 80, 48),
  ('si_disponibilite', 'si', 'Disponibilité des systèmes',
   'Un système indisponible arrête la production comme une panne machine.', 'pct', true, 70, 75, 70, 75),

  -- Finance & contrôle de gestion
  ('fin_marge_brute', 'finance', 'Taux de marge brute',
   'Ce que laisse chaque vente après coût direct.', 'pct', true, 60, 92, 65, 94),
  ('fin_bfr_jours', 'finance', 'Besoin en fonds de roulement',
   'Le cash immobilisé dans le cycle. Ce qui tue les entreprises rentables.', 'jours', false, 85, 60, 82, 58),
  ('fin_ratio_endettement', 'finance', 'Ratio d''endettement',
   'Levier financier. Il amplifie les gains comme les pertes.', 'ratio', false, 70, 65, 72, 68),
  ('fin_cash_conversion', 'finance', 'Cycle de conversion de trésorerie',
   'Délai entre le décaissement fournisseur et l''encaissement client.', 'jours', false, 88, 62, 85, 60),

  -- Ressources humaines
  ('rh_masse_salariale_sur_ca', 'rh', 'Masse salariale rapportée au CA',
   'Poids du travail dans la structure de coût.', 'pct', false, 92, 40, 88, 35),
  ('rh_turnover', 'rh', 'Taux de rotation du personnel',
   'Perdre ses experts, c''est perdre ce qui justifiait le premium.', 'pct', false, 50, 90, 52, 92),
  ('rh_heures_formation', 'rh', 'Heures de formation par personne',
   'Investissement en compétence.', 'nombre', true, 40, 88, 45, 90),
  ('rh_climat_social', 'rh', 'Indice de climat social',
   'Ce qui décide si un plan se met en œuvre ou se sabote.', 'score', true, 65, 78, 68, 80),
  ('rh_part_experts', 'rh', 'Part des experts et cadres',
   'Structure de compétence de l''effectif.', 'pct', true, 30, 90, 35, 94);

-- --- Les axes stratégiques ---------------------------------------------------
--
-- Une équipe en retient TROIS. C'est la traduction opérationnelle de sa vision,
-- et le moteur y lit sa cohérence — là où un texte libre ne pourrait pas être
-- noté honnêtement.
create table strategic_axis_catalog (
  key           text primary key,
  name          text not null,
  description   text not null,
  affinity_domination_couts      smallint not null check (affinity_domination_couts between 0 and 100),
  affinity_differenciation       smallint not null check (affinity_differenciation between 0 and 100),
  affinity_focus_couts           smallint not null check (affinity_focus_couts between 0 and 100),
  affinity_focus_differenciation smallint not null check (affinity_focus_differenciation between 0 and 100)
);

insert into strategic_axis_catalog
  (key, name, description,
   affinity_domination_couts, affinity_differenciation, affinity_focus_couts, affinity_focus_differenciation) values
  ('excellence_operationnelle', 'Excellence opérationnelle',
   'Faire mieux avec moins, à chaque étape du processus.', 95, 45, 88, 40),
  ('reduction_couts', 'Réduction structurelle des coûts',
   'Attaquer la structure de coût, pas seulement les dépenses.', 96, 25, 90, 22),
  ('automatisation_industrielle', 'Automatisation industrielle',
   'Substituer du capital au travail pour tenir le coût unitaire.', 92, 48, 78, 35),
  ('innovation_produit', 'Innovation produit',
   'Faire ce que les autres ne savent pas encore faire.', 25, 96, 28, 94),
  ('montee_en_gamme', 'Montée en gamme',
   'Déplacer l''offre vers le haut du marché.', 20, 92, 30, 95),
  ('capital_humain', 'Développement du capital humain',
   'La compétence comme actif principal.', 35, 90, 40, 92),
  ('fidelisation_client', 'Fidélisation et intimité client',
   'Garder longtemps plutôt que conquérir large.', 45, 78, 62, 95),
  ('specialisation_niche', 'Spécialisation sur une niche',
   'Servir un segment étroit mieux que les généralistes.', 22, 55, 92, 94),
  ('expansion_geographique', 'Expansion géographique',
   'Étendre la couverture, région par région.', 85, 60, 35, 28),
  ('diversification_offre', 'Élargissement de la gamme',
   'Couvrir davantage de besoins sur le même marché.', 78, 65, 25, 22),
  ('integration_amont', 'Intégration amont',
   'Contrôler ses intrants plutôt que les acheter.', 72, 68, 70, 66),
  ('digitalisation', 'Digitalisation de la relation client',
   'Déplacer le canal et la donnée vers le numérique.', 70, 75, 62, 72),
  ('developpement_durable', 'Développement durable',
   'Inscrire l''activité dans les contraintes environnementales à venir.', 55, 80, 55, 78),
  ('partenariats_strategiques', 'Partenariats stratégiques',
   'Obtenir par l''alliance ce qu''on ne peut bâtir seul.', 62, 78, 60, 75);

grant select on direction_catalog, kpi_catalog, strategic_axis_catalog to authenticated;

alter table direction_catalog       enable row level security;
alter table kpi_catalog             enable row level security;
alter table strategic_axis_catalog  enable row level security;

-- Ces catalogues sont le vocabulaire du jeu : ils doivent être lisibles de tous
-- les participants. Les AFFINITÉS, elles, révèlent le barème — mais les
-- masquer serait contre-productif : une équipe doit pouvoir raisonner sur
-- « quel KPI sert quelle stratégie », c'est précisément l'apprentissage visé.
create policy read_directions on direction_catalog for select to authenticated using (true);
create policy read_kpis       on kpi_catalog       for select to authenticated using (true);
create policy read_axes       on strategic_axis_catalog for select to authenticated using (true);
