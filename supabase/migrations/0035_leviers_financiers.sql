-- =============================================================================
-- ATLAS — Migration 0035 : le catalogue des leviers financiers
--
-- Six décisions de niveau Groupe, avec pour chacune ce qu'elle produit quand
-- elle réussit, ce qu'elle détruit quand elle échoue, et le mécanisme
-- financier qui l'explique. Le texte est celui du référentiel fourni par le
-- facilitateur, repris mot pour mot : c'est lui qui sera discuté en salle.
--
-- En base et non dans le code, comme les autres référentiels du jeu
-- (`direction_catalog`, `kpi_catalog`, `strategic_axis_catalog`, `shock_cards`) :
-- un formateur doit pouvoir en retoucher la formulation pour sa promotion sans
-- attendre un déploiement.
--
-- `screen` et `field_key` relient chaque levier à l'endroit où il se décide.
-- Un levier sans champ est un levier que le jeu n'outille pas encore, et la
-- colonne le dit plutôt que de le laisser deviner.
-- =============================================================================

set search_path = atlas, public, extensions;

create table if not exists financial_lever_catalog (
  key             text primary key,
  category        text not null,
  action_label    text not null,
  success_note    text not null,
  risk_note       text not null,
  rationale_note  text not null,
  /** Écran où le levier se décide. Null = pas encore outillé. */
  screen          text,
  /** Champ de décision correspondant, au vocabulaire du catalogue de modules. */
  field_key       text,
  display_order   smallint not null default 0
);

alter table financial_lever_catalog enable row level security;

-- Référentiel public pour toute équipe connectée : c'est du matériel
-- pédagogique, pas une donnée de jeu.
create policy read_levers on financial_lever_catalog for select to authenticated using (true);
grant select on financial_lever_catalog to authenticated;

insert into financial_lever_catalog (
  key, category, action_label, success_note, risk_note, rationale_note,
  screen, field_key, display_order)
values
  ('cash_pooling', 'Allocation',
   'Transfert de trésorerie (Cash Pooling) du DAS "Vache à lait" vers le DAS "Étoile".',
   'Croissance accélérée des parts de marché du DAS cible (ROCE > Coût du capital).',
   'Assèchement du BFR du DAS historique, entraînant une perte de compétitivité.',
   'Optimisation du coût du capital interne plutôt que de recourir à un financement externe coûteux.',
   '/finance', 'finance.cash_pooling', 1),

  ('emission_dette', 'Financement',
   'Émission de dette (Obligations) pour financer la R&D d''un DAS "Dilemme".',
   'Effet de levier positif maximisant la rentabilité financière (ROE) pour l''actionnaire.',
   'Effet massue (destruction de valeur) si le ROI du DAS devient inférieur au taux d''intérêt.',
   'La dette offre un bouclier fiscal, rendant son coût net historiquement inférieur à celui des capitaux propres.',
   '/finance', 'finance.credit', 2),

  ('spin_off', 'M&A (Cession)',
   'Spin-off (scission) ou revente d''un DAS en déclin ("Poids mort").',
   'Afflux massif de liquidités (Cash-in) et recentrage sur le cœur de métier du groupe.',
   'Perte d''économies d''envergure partagées (fonctions support) ; signal de détresse aux marchés.',
   'Élimination de la décote de holding, la valorisation post-scission dépassant souvent la somme des entités.',
   '/cession', 'cession.listing', 3),

  ('acquisition_consolidation', 'M&A (Croissance)',
   'Acquisition d''un concurrent pour consolider un DAS existant.',
   'Monopole ou oligopole local accroissant fortement le pouvoir de fixation des prix (Pricing power).',
   'Choc culturel, perte des talents clés, ou surpaiement initial (prime d''acquisition excessive).',
   'Les primes d''acquisition détruisent mathématiquement la valeur si les synergies ne sont pas parfaitement exécutées.',
   '/cession', 'cession.acquisition', 4),

  ('retention_benefices', 'Distribution',
   'Rétention totale des bénéfices (0% de dividendes distribués).',
   'Capacité d''autofinancement (CAF) maximale pour de lourds investissements industriels.',
   'Chute brutale du cours de l''action due à la fuite des actionnaires de rendement.',
   'Politique justifiée uniquement si le groupe dispose d''un portefeuille de projets avec un TRI exceptionnellement élevé.',
   '/finance', 'finance.dividend', 5),

  ('levee_capital', 'Financement',
   'Levée de fonds propres auprès des actionnaires.',
   'Assise financière élargie : la capacité d''endettement suit les fonds propres, et le risque se partage.',
   'Dilution du contrôle et frais d''émission payés même si les projets financés déçoivent.',
   'Les fonds propres coûtent plus cher que la dette — pas de bouclier fiscal — mais ne s''exigent pas à échéance fixe.',
   '/finance', 'finance.capital_raise', 6)
on conflict (key) do update set
  category = excluded.category,
  action_label = excluded.action_label,
  success_note = excluded.success_note,
  risk_note = excluded.risk_note,
  rationale_note = excluded.rationale_note,
  screen = excluded.screen,
  field_key = excluded.field_key,
  display_order = excluded.display_order;

comment on table financial_lever_catalog is
  'Référentiel des leviers financiers de niveau Groupe : action, conséquence de '
  'réussite, risque majeur, mécanisme. Matériel de débriefing, retouchable par '
  'le formateur sans déploiement.';
