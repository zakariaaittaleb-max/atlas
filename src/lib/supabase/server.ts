import 'server-only';

/**
 * Clients Supabase côté serveur.
 *
 * DEUX clients, et la distinction est une exigence de sécurité, pas une
 * commodité :
 *
 *   • `createServerClient()` — clé anonyme, porte le JWT de l'utilisateur,
 *     soumis à la RLS. C'est le client par défaut pour tout ce qui lit des
 *     données au nom d'un utilisateur.
 *
 *   • `createAdminClient()` — clé `service_role`, CONTOURNE la RLS.
 *     Réservé au moteur de résolution, au provisioning et à la validation des
 *     codes d'accès. Toute donnée qu'il lit est potentiellement celle d'une
 *     autre équipe : ne jamais renvoyer son résultat brut à un client.
 */

import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient as createRawClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';

import { ATLAS_SCHEMA } from './schema';

export async function createServerClient() {
  const cookieStore = await cookies();

  // Un appel programmatique (script de provisionnement, test de bout en bout)
  // porte son identité dans l'en-tête `Authorization` plutôt que dans un cookie.
  // On la transmet au client, de sorte que la RLS s'applique avec la BONNE
  // identité — plutôt que de contourner par la clé d'administration, ce qui
  // ferait perdre la seconde ligne de défense.
  const authorization = (await headers()).get('authorization');
  const bearer = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization
    : undefined;

  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: ATLAS_SCHEMA },
      ...(bearer ? { global: { headers: { Authorization: bearer } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component : le rafraîchissement de session
            // est alors assuré par `proxy.ts`, et l'écriture ici est sans objet.
          }
        },
      },
    },
  );
}

/**
 * Client `service_role`. Ne jamais l'importer depuis un composant client :
 * le test `no-client-engine.test.ts` échouerait, et surtout la clé fuiterait
 * dans le bundle navigateur.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY absente. Le moteur ne peut pas s’exécuter sans elle, ' +
        'et elle ne doit jamais être préfixée NEXT_PUBLIC_.',
    );
  }

  return createRawClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    db: { schema: ATLAS_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
