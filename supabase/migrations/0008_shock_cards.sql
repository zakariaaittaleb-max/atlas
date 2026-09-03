-- =============================================================================
-- ATLAS — Migration 0008 : catalogue des cartes PESTEL
--
-- Décrit dans `docs/03-referentiel-das.md` §6. Le facilitateur les déclenche
-- depuis sa vue ; elles ne surviennent jamais toutes seules par défaut, parce
-- qu'un choc doit tomber quand la salle est prête à le discuter, pas quand un
-- tirage l'a décidé.
--
-- Rappel de la politique posée en migration 0003 : les équipes voient le NOM et
-- la DESCRIPTION de chaque carte, jamais ses `effects`. Qu'un industriel de
-- l'agro sache qu'une sécheresse peut survenir est réaliste et sain — il doit
-- pouvoir s'y préparer. Connaître d'avance l'amplitude exacte serait un gâchis
-- pédagogique.
--
-- Les `source_reference` ancrent chaque carte dans une institution réelle : au
-- débriefing, le formateur peut renvoyer à la source.
-- =============================================================================

set search_path = atlas, public, extensions;

insert into shock_cards
  (key, pestel_dimension, name, description, nature, target_sectors, effects, duration_rounds, source_reference)
values
  ('infra_majeur', 'politique', 'Programme d''infrastructures majeur',
   'Un vaste programme d''équipement public ouvre des appels d''offres et tire la demande de matériaux, d''engins et d''ingénierie.',
   'opportunite', array['btp','equipement','energie'], '{"market_size_pct": 0.18}'::jsonb, 3, 'Ministère de l''Équipement et de l''Eau'),
  ('loi_finances_investissement', 'politique', 'Loi de finances — incitation à l''investissement',
   'Un dispositif d''amortissement accéléré et de crédit d''impôt allège le coût du capital productif.',
   'opportunite', array[]::text[], '{"rate_delta": -0.005}'::jsonb, 2, 'Loi de finances'),
  ('accord_commercial', 'politique', 'Accord commercial régional élargi',
   'L''abaissement des barrières ouvre des débouchés à l''export et expose davantage le marché intérieur à la concurrence importée.',
   'opportunite', array['textile','agro'], '{"market_size_pct": 0.12}'::jsonb, 0, 'Ministère de l''Industrie et du Commerce'),
  ('souverainete_alimentaire', 'politique', 'Priorité nationale à la souveraineté alimentaire',
   'Un plan de soutien subventionne la capacité de transformation, en contrepartie d''un approvisionnement local.',
   'opportunite', array['agro'], '{"market_size_pct": 0.10, "input_cost_pct": 0.05}'::jsonb, 3, 'Génération Green'),
  ('decentralisation_marches', 'politique', 'Décentralisation des marchés publics régionaux',
   'Les régions du Sud pilotent désormais leurs propres appels d''offres : la couverture régionale devient décisive.',
   'opportunite', array['btp','energie'], '{"market_size_pct": 0.08}'::jsonb, 2, 'Régionalisation avancée'),

  ('resserrement_monetaire', 'economique', 'Resserrement monétaire',
   'Le taux directeur est relevé pour contenir l''inflation. Le coût de la dette augmente pour tout le monde.',
   'menace', array[]::text[], '{"rate_delta": 0.0075}'::jsonb, 2, 'Bank Al-Maghrib'),
  ('detente_monetaire', 'economique', 'Détente monétaire',
   'Le taux directeur est abaissé : le financement de la croissance coûte moins cher.',
   'opportunite', array[]::text[], '{"rate_delta": -0.005}'::jsonb, 2, 'Bank Al-Maghrib'),
  ('flambee_energie', 'economique', 'Flambée des prix de l''énergie',
   'Le renchérissement de l''énergie se répercute sur tous les procédés intensifs.',
   'menace', array['agro','btp','textile'], '{"input_cost_pct": 0.18}'::jsonb, 2, 'Office des Changes'),
  ('ralentissement_europeen', 'economique', 'Ralentissement de la demande européenne',
   'Le principal débouché à l''export se contracte.',
   'menace', array['textile','agro','numerique'], '{"market_size_pct": -0.15}'::jsonb, 2, 'Office des Changes'),
  ('bande_flottement', 'economique', 'Élargissement de la bande de flottement du dirham',
   'Le change devient plus volatil : les importations renchérissent, les exportations gagnent en compétitivité.',
   'menace', array['equipement','textile'], '{"input_cost_pct": 0.07}'::jsonb, 3, 'Bank Al-Maghrib'),
  ('transferts_diaspora', 'economique', 'Reprise des transferts de la diaspora',
   'L''afflux de devises soutient la consommation des ménages et l''investissement immobilier.',
   'opportunite', array['retail','btp','tourisme'], '{"market_size_pct": 0.09}'::jsonb, 1, 'Office des Changes'),

  ('grand_evenement_sportif', 'socioculturel', 'Grand événement sportif international',
   'L''accueil d''une compétition majeure tire l''hébergement, la restauration et les chantiers d''équipement.',
   'opportunite', array['tourisme','btp','retail'], '{"market_size_pct": 0.25}'::jsonb, 3, 'Observatoire du Tourisme'),
  ('marque_propre', 'socioculturel', 'Bascule vers la consommation de marque propre',
   'Les consommateurs arbitrent en faveur du prix : la prime à la marque s''érode.',
   'menace', array['retail','agro'], '{"market_size_pct": -0.03}'::jsonb, 2, 'HCP — enquête de consommation'),
  ('tension_sociale', 'socioculturel', 'Tension sociale sectorielle',
   'Un mouvement revendicatif touche la branche : le climat social se dégrade et les salaires sont sous pression.',
   'menace', array['textile','agro','numerique'], '{"input_cost_pct": 0.06, "capacity_pct": -0.05}'::jsonb, 1, 'Code du travail'),
  ('exigence_sanitaire', 'socioculturel', 'Montée de l''exigence sanitaire',
   'Les attentes de traçabilité et de sécurité alimentaire se durcissent durablement.',
   'menace', array['agro','retail'], '{"quality_floor": 60}'::jsonb, 0, 'ONSSA'),
  ('penurie_competences', 'socioculturel', 'Pénurie de compétences numériques',
   'La concurrence sur les profils qualifiés fait grimper les salaires et la rotation du personnel.',
   'menace', array['numerique'], '{"input_cost_pct": 0.18, "capacity_pct": -0.06}'::jsonb, 3, 'AMDIE'),

  ('automatisation_accessible', 'technologique', 'Automatisation accessible',
   'La baisse du coût des équipements met l''automatisation à portée des entreprises de taille moyenne.',
   'opportunite', array['agro','textile','btp'], '{"input_cost_pct": -0.08}'::jsonb, 0, 'Baromètre de l''Industrie'),
  ('bascule_numerique', 'technologique', 'Bascule du commerce vers le numérique',
   'Le canal en ligne gagne durablement en couverture et en usage.',
   'opportunite', array['retail','textile','tourisme'], '{"market_size_pct": 0.06}'::jsonb, 0, 'ANRT'),
  ('rupture_technologique', 'technologique', 'Rupture technologique sectorielle',
   'Une génération d''équipements rend l''ancienne obsolète : ceux qui n''ont pas investi en R&D décrochent.',
   'menace', array['equipement','energie'], '{"quality_floor": 55}'::jsonb, 2, 'Baromètre de l''Industrie'),
  ('interoperabilite_paiements', 'technologique', 'Interopérabilité des paiements',
   'La généralisation du paiement instantané raccourcit les délais d''encaissement.',
   'opportunite', array['retail','tourisme','numerique'], '{"market_size_pct": 0.03}'::jsonb, 0, 'Bank Al-Maghrib'),

  ('secheresse_severe', 'ecologique', 'Sécheresse sévère',
   'Un déficit pluviométrique majeur comprime la matière première agricole par le haut et par le bas : moins de volume, et plus cher.',
   'menace', array['agro'], '{"market_size_pct": -0.12, "input_cost_pct": 0.22, "capacity_pct": -0.08}'::jsonb, 2, 'HCP — comptes nationaux'),
  ('stress_hydrique', 'ecologique', 'Stress hydrique et quotas industriels',
   'Des quotas de prélèvement sont imposés aux usages industriels ; une mise aux normes est nécessaire.',
   'menace', array['agro','textile','energie'], '{"capacity_pct": -0.10}'::jsonb, 3, 'Agences de bassin hydraulique'),
  ('mecanisme_carbone', 'ecologique', 'Mécanisme carbone à l''import (UE)',
   'L''ajustement carbone aux frontières pénalise les exportations issues de procédés peu efficients.',
   'menace', array['textile','agro','equipement'], '{"market_size_pct": -0.10}'::jsonb, 0, 'Mécanisme d''ajustement carbone aux frontières'),
  ('appel_offres_solaire', 'ecologique', 'Appel d''offres solaire de grande envergure',
   'Un programme d''envergure ouvre le marché à ceux qui disposent de la capacité et de l''ingénierie.',
   'opportunite', array['energie','btp'], '{"market_size_pct": 0.30}'::jsonb, 2, 'MASEN'),
  ('episode_climatique', 'ecologique', 'Épisode climatique extrême régional',
   'Inondations ou canicule paralysent temporairement l''activité d''une région.',
   'menace', array['btp','tourisme','agro'], '{"capacity_pct": -0.20}'::jsonb, 1, 'Direction générale de la météorologie'),

  ('revalorisation_smig', 'legal', 'Revalorisation du SMIG',
   'Le salaire minimum est relevé par décret : la masse salariale augmente, le climat social s''améliore.',
   'menace', array[]::text[], '{"input_cost_pct": 0.04}'::jsonb, 0, 'Décret — SMIG'),
  ('droit_travail_renforce', 'legal', 'Renforcement du droit du travail',
   'Les indemnités de rupture sont alourdies : restructurer coûte nettement plus cher.',
   'menace', array[]::text[], '{"input_cost_pct": 0.03}'::jsonb, 0, 'Code du travail'),
  ('norme_qualite_obligatoire', 'legal', 'Norme qualité sectorielle obligatoire',
   'Une certification devient obligatoire : en deçà du seuil, l''accès au marché est fermé.',
   'menace', array['agro','equipement','energie'], '{"quality_floor": 65}'::jsonb, 0, 'IMANOR'),
  ('controle_concentrations', 'legal', 'Contrôle des concentrations renforcé',
   'Les seuils de notification sont abaissés et les délais d''instruction allongés.',
   'menace', array[]::text[], '{}'::jsonb, 0, 'Conseil de la Concurrence'),
  ('delais_paiement', 'legal', 'Encadrement des délais de paiement',
   'Les retards de règlement sont sanctionnés : le besoin en fonds de roulement se détend.',
   'opportunite', array['btp','equipement'], '{}'::jsonb, 0, 'Loi sur les délais de paiement'),
  ('fiscalite_verte', 'legal', 'Fiscalité verte sur les procédés',
   'Une surtaxe frappe les procédés les moins efficients : automatiser devient un impératif fiscal.',
   'menace', array['agro','btp','textile'], '{"input_cost_pct": 0.09}'::jsonb, 3, 'Loi de finances');

on conflict (key) do update set
  name             = excluded.name,
  description      = excluded.description,
  effects          = excluded.effects,
  target_sectors   = excluded.target_sectors,
  duration_rounds  = excluded.duration_rounds,
  source_reference = excluded.source_reference;
