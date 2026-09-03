/**
 * ATLAS — schéma Postgres de l'application.
 *
 * Le projet Supabase « Apps » héberge plusieurs applications. Atlas vit donc
 * dans un schéma dédié plutôt que dans `public` : des noms aussi génériques que
 * `teams`, `regions` ou `market_segments` entreraient sinon en collision avec
 * la prochaine application déposée dans le même projet.
 *
 * Tous les clients Supabase doivent être construits avec `db: { schema }`, sans
 * quoi PostgREST cherche dans `public` et renvoie 404 sur chaque table.
 */
export const ATLAS_SCHEMA = 'atlas' as const;
