#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const adminUrl = process.env.SUPABASE_URL || 'https://mzqleykmqbotbmwbgfpb.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY env var required');
  process.exit(1);
}

// Créer un client admin avec la clé service role
const admin = createClient(adminUrl, serviceKey, {
  db: { schema: 'atlas' },
  auth: { persistSession: false },
});

try {
  const timestamp = Date.now();
  const email = `test-facilitateur-${timestamp}@atlas.test`;
  const password = 'Test12345!';

  console.log('📝 Création d\'un utilisateur facilitateur de test...');

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }

  if (!data.user) {
    console.error('❌ Pas d\'utilisateur retourné');
    process.exit(1);
  }

  const facilitatorId = data.user.id;
  console.log('✅ Utilisateur créé avec succès!');
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('ACCÈS FACILITATEUR');
  console.log('═══════════════════════════════════════');
  console.log(`Email:    ${email}`);
  console.log(`Mot de passe: ${password}`);
  console.log(`ID utilisateur: ${facilitatorId}`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('📋 Prochaine étape: créer une session');
  console.log('   - Connexion en tant que facilitateur');
  console.log('   - Navigation vers /facilitateur');
  console.log('   - Création d\'une session avec teams');

  process.exit(0);
} catch (error) {
  console.error('❌ Erreur non gérée:', error instanceof Error ? error.message : error);
  process.exit(1);
}
