set search_path = atlas, public, extensions;

-- =============================================================================
-- ATLAS — Migration 0040 : les bilans effacés que 0034 ne pouvait pas réparer,
-- et la dette négative rendue impossible
--
-- ── LE SYMPTÔME ──────────────────────────────────────────────────────────────
-- Sur une session provisionnée avant la refonte du crédit, le curseur « crédit
-- net du tour » ne bougeait pas : sa borne basse valait +3,41 Md et sa borne
-- haute 0. L'ancienne écriture du plan finance déduisait le remboursement de
-- l'encours à chaque sauvegarde ; saisie deux fois, elle a fait passer la dette
-- d'ouverture SOUS ZÉRO. Les capitaux propres, eux, avaient été remis à zéro
-- par le défaut que 0034 décrit.
--
-- ── POURQUOI 0034 N'Y POUVAIT RIEN ───────────────────────────────────────────
-- 0034 recopie le bilan d'une équipe sœur du même pool. Ici, TOUTES les sœurs
-- avaient perdu leurs fonds propres : il n'existait aucune ligne saine d'où
-- recopier.
--
-- ── SUR QUOI ON S'APPUIE ─────────────────────────────────────────────────────
-- La trésorerie d'ouverture, elle, a survécu. Or la dotation dérive les trois
-- postes d'un même chiffre d'affaires de référence :
--     trésorerie     = CA × mois de trésorerie / 12
--     fonds propres  = CA × ratio de fonds propres
--     dette          = fonds propres × ratio de dette
-- Le CA de référence se retrouve donc depuis la trésorerie, et les deux autres
-- postes s'en déduisent avec les paramètres DE LA SESSION — ceux qui étaient en
-- vigueur quand elle a été créée, et non ceux d'aujourd'hui. Aucune valeur
-- n'est inventée, et la dotation reste identique entre équipes d'un même pool,
-- puisqu'elles partagent la même trésorerie de départ.
--
-- La clause est étroite : tour 0, fonds propres nuls ou négatifs, trésorerie
-- positive, et AUCUN tour résolu. Une équipe qui aurait réellement consommé ses
-- fonds propres en jouant n'est jamais touchée.
-- =============================================================================

with cible as (
  select
    b.id,
    b.treasury_start_mad,
    coalesce((select e.value from engine_parameters e
               where e.session_id = t.session_id
                 and e.key = 'endowment.treasury_months_of_revenue'), 2.5)  as mois,
    coalesce((select e.value from engine_parameters e
               where e.session_id = t.session_id
                 and e.key = 'endowment.equity_ratio_of_revenue'), 0.45)   as ratio_fp,
    coalesce((select e.value from engine_parameters e
               where e.session_id = t.session_id
                 and e.key = 'endowment.debt_ratio_of_equity'), 0.07)      as ratio_dette
  from financial_budgets b
  join teams t on t.id = b.team_id
  where b.round_number = 0
    and coalesce(b.equity_mad, 0) <= 0
    and b.treasury_start_mad > 0
    and not exists (
      select 1 from pnl_statements p
       where p.team_id = b.team_id and p.round_number >= 1
    )
)
update financial_budgets b
set equity_mad           = round(c.treasury_start_mad * 12 / c.mois * c.ratio_fp),
    debt_outstanding_mad = round(c.treasury_start_mad * 12 / c.mois * c.ratio_fp * c.ratio_dette)
from cible c
where c.id = b.id;

-- Une dette négative n'a aucun sens comptable : ce serait une créance sur la
-- banque. Les lignes qui en portent encore sont ramenées à zéro, puis la base
-- refuse d'en écrire. Le moteur bornait déjà la clôture ; l'écran et la route
-- lisaient la valeur brute, et c'est elle qui inversait les bornes du curseur.
update financial_budgets set debt_outstanding_mad = 0 where debt_outstanding_mad < 0;

alter table financial_budgets
  drop constraint if exists financial_budgets_debt_non_negative;
alter table financial_budgets
  add constraint financial_budgets_debt_non_negative check (debt_outstanding_mad >= 0);

alter table pnl_statements
  drop constraint if exists pnl_statements_debt_end_non_negative;
alter table pnl_statements
  add constraint pnl_statements_debt_end_non_negative
  check (debt_outstanding_end_mad is null or debt_outstanding_end_mad >= 0);
