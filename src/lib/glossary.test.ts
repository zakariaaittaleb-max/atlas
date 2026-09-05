import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { GLOSSARY, isDefined, lookup } from './glossary';

/**
 * Un terme employé à l'écran et absent du glossaire s'affiche sans infobulle :
 * l'équipe lit « rentabilité économique » et n'a aucun moyen de savoir ce que
 * c'est. La panne est SILENCIEUSE — le composant ne casse pas, il se tait.
 *
 * Ce test parcourt le code de l'application et vérifie que chaque terme
 * réellement employé est documenté.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.tsx') && !full.endsWith('.test.tsx') ? [full] : [];
  });
}

const employes = (() => {
  const found = new Set<string>();
  for (const file of sourceFiles(join(process.cwd(), 'src', 'app'))) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/<Term>([^<{]+)<\/Term>/g)) found.add(m[1].trim());
    // La citation OUVRANTE délimite : sans quoi `term="Chiffre d'affaires"`
    // se coupe à l'apostrophe et cherche « Chiffre d » au glossaire.
    for (const m of code.matchAll(/\bterm=(["'])(.*?)\1/g)) found.add(m[2].trim());
  }
  return [...found];
})();

describe('glossaire', () => {
  it('documente chaque terme employé à l’écran', () => {
    const manquants = employes.filter((t) => !isDefined(t));
    expect(manquants, `termes sans définition : ${manquants.join(' · ')}`).toEqual([]);
  });

  it('trouve les termes quelle que soit la forme de l’apostrophe', () => {
    // Le français typographique écrit U+2019, le code tape souvent l'apostrophe
    // droite. Les deux se ressemblent à l'œil et diffèrent à l'octet.
    expect(lookup("Chiffre d'affaires")).toBeDefined();
    expect(lookup('Chiffre d’affaires')).toBeDefined();
    expect(lookup('chiffre d’affaires')).toBeDefined();
  });

  it('donne à chaque terme une définition ET un exemple chiffré', () => {
    for (const [terme, entry] of Object.entries(GLOSSARY)) {
      expect(entry.definition.length, terme).toBeGreaterThan(40);
      // Un terme sans exemple est une définition de dictionnaire : elle
      // n'apprend rien à qui ne comprend pas déjà.
      expect(entry.example, terme).toMatch(/\d/);
    }
  });

  it('n’explique pas un terme par lui-même', () => {
    // « La marge d'exploitation est la marge de l'exploitation » n'apprend rien.
    for (const [terme, entry] of Object.entries(GLOSSARY)) {
      const mot = terme.split(/[\s’']/)[0].toLowerCase();
      if (mot.length < 6) continue;
      expect(entry.definition.toLowerCase().startsWith(mot), terme).toBe(false);
    }
  });

  it('couvre au moins un terme employé — le test ne passe pas à vide', () => {
    expect(employes.length).toBeGreaterThan(5);
  });
});
