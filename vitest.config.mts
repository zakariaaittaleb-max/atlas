import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Les composants se testent aussi : `.tsx` compris.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      // fileURLToPath, et surtout pas `new URL(...).pathname` : le chemin de ce
      // projet contient des espaces (« iCloud Drive (Archive) ») que pathname
      // encode en %20, ce qui casse silencieusement l'alias.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` est fourni par Next.js et introuvable sous vitest. Sans
      // cette doublure, aucun module serveur n'est testable — et c'est là que
      // vivent le provisionnement et les livrables du cabinet.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
});
