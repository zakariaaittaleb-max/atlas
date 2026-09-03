/**
 * Déconnexion.
 *
 * Termine la session Supabase et efface les cookies. Utile en salle : plusieurs
 * promotions se succèdent sur les mêmes postes, et une équipe ne doit pas
 * retrouver la session de la précédente.
 *
 * En POST délibérément : une déconnexion en GET pourrait être déclenchée par
 * une image ou un lien préchargé.
 */

import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL('/login', request.url), {
    // 303 : le navigateur repasse en GET après un POST.
    status: 303,
  });
}
