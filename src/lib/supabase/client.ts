'use client';

/**
 * Client Supabase navigateur — clé anonyme, soumis à la RLS.
 *
 * Ce client ne peut lire que ce que les politiques de la section 12 du schéma
 * autorisent : les données de l'équipe de l'utilisateur, et les résultats
 * agrégés du pool une fois le tour résolu. Jamais les décisions d'une autre
 * équipe, jamais une offre de cession scellée.
 */

import { createBrowserClient } from '@supabase/ssr';

import { ATLAS_SCHEMA } from './schema';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: ATLAS_SCHEMA } },
  );
}
