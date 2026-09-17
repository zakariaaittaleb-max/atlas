-- Retirer un DAS de la vente prend effet immédiatement.
--
-- « Retirer l'annonce » n'enregistrait qu'un choix de vendeur (`seller_choice =
-- 'withdraw'`) : l'annonce restait `open` et le DAS `listed_for_sale` jusqu'à
-- la résolution — affiché « en vente » partout alors que l'équipe l'avait
-- retiré. L'API retire désormais sur-le-champ ; on répare les annonces restées
-- dans cet état intermédiaire.

set search_path = atlas, public;

update das_bids b
set status = 'withdrawn'
from das_listings l
where b.listing_id = l.id
  and l.status = 'open'
  and l.seller_choice = 'withdraw'
  and b.status = 'sealed';

update team_units tu
set status = 'active'
from das_listings l
where l.status = 'open'
  and l.seller_choice = 'withdraw'
  and tu.team_id = l.seller_team_id
  and tu.das_id = l.das_id
  and tu.status = 'listed_for_sale';

update das_listings
set status = 'withdrawn'
where status = 'open'
  and seller_choice = 'withdraw';
