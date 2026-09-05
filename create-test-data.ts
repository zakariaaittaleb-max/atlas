/**
 * Crée un facilitateur de test.
 *
 * Ce fichier ne s'exécute PAS tel quel : `@/lib/supabase/server` est marqué
 * `server-only` et lit ses clés depuis l'environnement de Next. Hors du
 * serveur, l'import échoue avant la première ligne utile.
 *
 * La version qui tourne vraiment est `scripts/create-test-data.mjs`, lancée
 * par `node`. Celle-ci est conservée comme référence de la forme attendue.
 */

import { createAdminClient } from './src/lib/supabase/server';

const admin = createAdminClient();

// L'adresse est calculée UNE fois : la recalculer dans le message d'affichage
// donnait un horodatage différent de celui réellement enregistré — et un
// identifiant de connexion qui ne fonctionnait pas.
const email = `test-facilitateur-${Date.now()}@atlas.test`;
const password = 'Test12345!';

const { data: userData, error: userError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (userError) {
  console.error('Erreur création utilisateur:', userError.message);
  process.exit(1);
}

const facilitatorId = userData.user?.id;
if (!facilitatorId) {
  console.error('Aucun identifiant renvoyé.');
  process.exit(1);
}

console.log('✅ Facilitateur créé:', facilitatorId);
console.log('Email:', email);
console.log('Mot de passe:', password);
