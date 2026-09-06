/**
 * Noms de cookies partagés entre l'action qui démarre une connexion en tant
 * que (`admin/facilitators/actions.ts`) et celle qui la termine
 * (`app/actions/end-impersonation.ts`), ainsi que la bannière qui s'affiche
 * tant qu'elle est active (`components/impersonation-banner.tsx` via
 * `layout.tsx`). Un seul et même nom des deux côtés, sinon l'un pose un
 * cookie que l'autre ne sait pas lire.
 */
export const IMPERSONATION_RETURN_COOKIE = 'atlas_impersonation_return';
export const IMPERSONATION_LABEL_COOKIE = 'atlas_impersonation_label';
