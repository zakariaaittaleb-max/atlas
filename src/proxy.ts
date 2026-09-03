/**
 * Rafraîchissement de la session Supabase à chaque requête.
 *
 * Nommé `proxy` et non `middleware` : Next.js 16 a renommé la convention pour
 * clarifier qu'il s'agit d'une frontière réseau. Le runtime est `nodejs` et
 * n'est pas configurable.
 *
 * Ce fichier ne fait QUE prolonger la session. Il ne décide d'aucune
 * autorisation : les contrôles d'accès vivent dans `lib/dal.ts` et dans les
 * politiques RLS, au plus près de la donnée. Un contrôle placé ici seul serait
 * contournable par un appel direct à une Server Function.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Ne pas retirer cet appel : c'est lui qui déclenche le rafraîchissement du
  // jeton. Sans lui, les sessions expirent en pleine séance.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
