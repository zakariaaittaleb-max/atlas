-- =============================================================================
-- ATLAS — Migration 0005 : exposition du schéma à PostgREST
--
-- Sans cela, l'API renvoie « Invalid schema: atlas » (PGRST106) sur chaque
-- requête, et l'application entière est hors service.
--
-- Le tableau de bord (Settings → API → Exposed schemas) écrit exactement ce
-- réglage ; le faire en SQL le rend reproductible sur un nouvel environnement,
-- au lieu de dépendre d'un clic à ne pas oublier.
--
-- ⚠️ `public` et `graphql_public` DOIVENT rester dans la liste : ce réglage
-- remplace la valeur, il ne s'y ajoute pas. Les omettre couperait l'API des
-- autres applications hébergées dans le même projet.
-- =============================================================================

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, atlas';

-- PostgREST relit sa configuration et son cache de schéma sur ces signaux.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
