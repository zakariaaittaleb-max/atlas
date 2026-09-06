import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createAdminClient } from './supabase/server';

const LIST_USERS_SAFETY_CAP = 500;

/**
 * `listUsers({ perPage: 200 })` échoue en bloc (« Database error finding
 * users ») dès qu'UN SEUL compte du projet a une ligne malformée côté GoTrue —
 * constaté en pratique sur ce projet avec un compte de test. Le chemin rapide
 * reste la requête groupée ; en cas d'échec, on retombe sur un parcours
 * page par page (perPage: 1), qui isole et saute le seul compte fautif au
 * lieu de faire disparaître TOUS les facilitateurs de la liste.
 */
async function listAllUsersResilient(
  admin: ReturnType<typeof createAdminClient>,
): Promise<User[]> {
  const bulk = await admin.auth.admin.listUsers({ perPage: 200 });
  if (!bulk.error && bulk.data) return bulk.data.users;

  const users: User[] = [];
  for (let page = 1; page <= LIST_USERS_SAFETY_CAP; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1, page });
    if (error) continue; // exactement ce compte-là est sauté, pas les autres
    if (!data || data.users.length === 0) break;
    users.push(...data.users);
  }
  return users;
}

/**
 * Tous les utilisateurs Supabase Auth, non-anonymes en tête. Un facilitateur
 * EST par construction un compte non-anonyme : les participants n'existent
 * qu'en anonyme (voir join-form.tsx), donc aucune colonne « rôle » n'est
 * nécessaire pour distinguer les deux.
 */
export async function listFacilitatorUsers(): Promise<User[]> {
  const users = await listAllUsersResilient(createAdminClient());
  return users.filter((u) => !u.is_anonymous);
}

export function isBanned(user: Pick<User, 'banned_until'>): boolean {
  if (!user.banned_until) return false;
  const until = new Date(user.banned_until);
  return Number.isNaN(until.getTime()) || until.getTime() > Date.now();
}

/** id → e-mail, pour afficher un auteur d'audit lisible plutôt qu'un UUID. */
export async function buildUserEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const users = await listAllUsersResilient(createAdminClient());
    for (const u of users) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch {
    // Enrichissement d'affichage seulement : son absence ne doit jamais
    // empêcher une page d'audit de rendre (avec des id bruts).
  }
  return map;
}
