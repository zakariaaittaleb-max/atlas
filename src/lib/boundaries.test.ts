import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Frontière serveur / client, vérifiée statiquement.
 *
 * Critères d'acceptation n°3 et n°5 (doc 00 §15) : aucun module du moteur ne
 * doit être atteignable depuis un composant `"use client"`, et la clé
 * `service_role` ne doit jamais entrer dans un bundle navigateur.
 *
 * Ce test parcourt le graphe d'imports en TRANSITIF : un composant client qui
 * importe un helper « inoffensif » qui importe le moteur est tout aussi
 * fautif, et c'est précisément le genre de chaîne qu'une relecture manque.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Seuls modules de `lib/engine` importables côté client. */
const CLIENT_SAFE_ENGINE_MODULES = new Set(['types']);

/** Modules strictement serveur : leur présence dans un bundle client est une faille. */
const SERVER_ONLY_PREFIXES = ['lib/supabase/server', 'lib/dal', 'lib/server/'];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) files.push(full);
  }
  return files;
}

const ALL_FILES = walk(SRC);

function readSource(file: string): string {
  return readFileSync(file, 'utf8');
}

function isClientFile(file: string): boolean {
  const head = readSource(file).slice(0, 400);
  return /^\s*['"]use client['"]/m.test(head);
}

/** Imports internes (`@/…` ou relatifs), normalisés en chemins absolus. */
function localImports(file: string): string[] {
  const source = readSource(file);
  const specifiers = [...source.matchAll(/(?:^|\s)(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((spec) => spec.startsWith('@/') || spec.startsWith('.'));

  return specifiers.flatMap((spec) => {
    const base = spec.startsWith('@/')
      ? path.join(SRC, spec.slice(2))
      : path.resolve(path.dirname(file), spec);

    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]) {
      try {
        if (statSync(candidate).isFile()) return [candidate];
      } catch {
        // Le candidat n'existe pas : on essaie l'extension suivante.
      }
    }
    return [];
  });
}

/** Ferme transitivement le graphe d'imports à partir d'un fichier. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const imported of localImports(current)) {
      if (seen.has(imported)) continue;
      seen.add(imported);
      queue.push(imported);
    }
  }
  return seen;
}

function relative(file: string): string {
  return path.relative(SRC, file);
}

describe('frontière serveur / client', () => {
  const clientFiles = ALL_FILES.filter(isClientFile);

  it('trouve bien des composants client à contrôler', () => {
    // Garde-fou du garde-fou : si la détection casse, ce test ne doit pas
    // devenir vert en ne vérifiant plus rien.
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it('n’expose aucun module du moteur à un composant client', () => {
    const violations: string[] = [];

    for (const file of clientFiles) {
      for (const reached of reachableFrom(file)) {
        const rel = relative(reached);
        const match = rel.match(/^lib\/engine\/([^/]+)\.tsx?$/);
        if (match && !CLIENT_SAFE_ENGINE_MODULES.has(match[1])) {
          violations.push(`${relative(file)} → ${rel}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('n’expose aucun module strictement serveur à un composant client', () => {
    const violations: string[] = [];

    for (const file of clientFiles) {
      for (const reached of reachableFrom(file)) {
        const rel = relative(reached);
        if (SERVER_ONLY_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
          violations.push(`${relative(file)} → ${rel}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('ne référence la clé service_role que dans des modules serveur', () => {
    const violations: string[] = [];

    for (const file of ALL_FILES) {
      const source = readSource(file);
      if (!source.includes('SUPABASE_SERVICE_ROLE_KEY')) continue;

      const rel = relative(file);
      const isServerModule =
        source.includes("import 'server-only'") || rel.startsWith('app/api/');

      if (!isServerModule) violations.push(rel);
    }

    expect(violations).toEqual([]);
  });

  it('marque « server-only » tout module qui lit la base avec les droits d’administration', () => {
    const violations: string[] = [];

    for (const file of ALL_FILES) {
      const source = readSource(file);
      if (!source.includes('createAdminClient')) continue;
      // Les Route Handlers ne s'exécutent jamais côté client par construction.
      if (relative(file).startsWith('app/api/')) continue;
      // Les pages et layouts sont des Server Components par CONVENTION du
      // framework. On exige quand même `import 'server-only'` : une convention
      // se contourne par un import mal placé, une garde à l'exécution non.
      if (!source.includes("import 'server-only'")) violations.push(relative(file));
    }

    expect(violations).toEqual([]);
  });
});
