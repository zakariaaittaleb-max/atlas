/**
 * Doublure de `server-only` pour les tests.
 *
 * Le vrai paquet est fourni par Next.js et lève à la compilation s'il atteint
 * un bundle navigateur. Sous vitest il n'est pas résoluble, ce qui rendait
 * INTESTABLE tout module serveur — provisionnement, exécution des missions de
 * conseil, chargement des instantanés. Cette doublure lève la contrainte pour
 * les tests sans affaiblir la garantie : `boundaries.test.ts` continue de
 * vérifier statiquement qu'aucun de ces modules n'est atteignable côté client.
 */
export {};
