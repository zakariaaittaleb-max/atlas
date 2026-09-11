-- =============================================================================
-- ATLAS — Migration 0034 : réparation des bilans d'ouverture effacés
--
-- L'écriture du plan finance dérivait le bilan du tour EXACTEMENT précédent.
-- Une équipe qui enregistrait une décision au tour 0 — pendant l'onboarding —
-- ne trouvait aucune ligne au tour −1 et retombait sur le repli `?? 0` : sa
-- propre ligne de dotation était réécrite avec des capitaux propres et une
-- dette à ZÉRO.
--
-- La cause est corrigée (l'écriture ne touche plus le bilan d'une ligne
-- existante), mais les parties déjà provisionnées gardent la cicatrice. On la
-- referme ici.
--
-- ── SUR QUOI ON S'APPUIE ────────────────────────────────────────────────────
-- La dotation est IDENTIQUE pour toutes les équipes d'une même ligue : c'est
-- la promesse du provisionnement. Une ligne à zéro se répare donc avec celle
-- d'une équipe sœur du même pool, au même tour. Aucune valeur n'est inventée.
--
-- La clause est volontairement étroite : seules les lignes du tour 0 dont les
-- capitaux propres sont nuls ALORS QU'une sœur du même pool en a, sont touchées.
-- Une équipe réellement à zéro — ce qui n'arrive pas à la dotation — ne l'est
-- que si toutes ses sœurs le sont aussi, et rien ne bouge alors.
-- =============================================================================

set search_path = atlas, public, extensions;

with soeurs as (
  select
    b.id,
    (array_agg(s.equity_mad order by s.equity_mad desc))[1]            as equity_ref,
    (array_agg(s.debt_outstanding_mad order by s.equity_mad desc))[1]  as debt_ref,
    (array_agg(s.treasury_start_mad order by s.equity_mad desc))[1]    as treasury_ref
  from financial_budgets b
  join teams t        on t.id = b.team_id
  join financial_budgets s on s.round_number = b.round_number
  join teams st       on st.id = s.team_id
                     and st.pool_id = t.pool_id
                     and st.id <> t.id
  where b.round_number = 0
    and coalesce(b.equity_mad, 0) = 0
    and coalesce(s.equity_mad, 0) > 0
  group by b.id
)
update financial_budgets b
set equity_mad           = soeurs.equity_ref,
    debt_outstanding_mad = soeurs.debt_ref,
    treasury_start_mad   = soeurs.treasury_ref
from soeurs
where soeurs.id = b.id;
