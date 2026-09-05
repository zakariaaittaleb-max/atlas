import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { wrapDocument } from './document-shell';

/**
 * Les documents de séance sont publiés comme artefacts ET servis par
 * l'application, depuis UN SEUL fichier engendré. L'enveloppe est ce qui rend
 * les deux usages possibles ; si elle coupe au mauvais endroit, le document
 * s'affiche sans style ou avec sa feuille de style en toutes lettres — et la
 * panne ne se voit qu'à l'écran, jamais au typecheck.
 */

const DOCS = ['moteur-atlas.html', 'simulateur-atlas.html'] as const;
const lire = (nom: string) =>
  readFileSync(join(process.cwd(), 'src', 'content', nom), 'utf8');

describe('enveloppe des documents', () => {
  it('produit une page complète', () => {
    const out = wrapDocument('<title>T</title><style>body{color:red}</style><p>corps</p>');
    expect(out.startsWith('<!doctype html><html lang="fr">')).toBe(true);
    expect(out.endsWith('</body></html>')).toBe(true);
  });

  it('met le style dans l’en-tête et le reste dans le corps', () => {
    const out = wrapDocument('<title>T</title><style>body{color:red}</style><p>corps</p>');
    const head = out.slice(out.indexOf('<head>'), out.indexOf('</head>'));
    const body = out.slice(out.indexOf('<body>'), out.indexOf('</body>'));

    expect(head).toContain('<style>body{color:red}</style>');
    expect(head).toContain('<title>T</title>');
    expect(head).not.toContain('<p>corps</p>');
    expect(body).toContain('<p>corps</p>');
    expect(body).not.toContain('<style>');
  });

  it('coupe au PREMIER bloc de style, pas au dernier', () => {
    // Un `</style>` cité dans le corps ne doit pas déplacer la découpe.
    const out = wrapDocument('<style>a{}</style><p>on écrit &lt;/style&gt; ici</p>');
    expect(out.slice(out.indexOf('<body>'))).toContain('on écrit');
    expect(out.slice(0, out.indexOf('</head>'))).toContain('a{}');
  });

  it('ne perd rien : tout le fragment se retrouve dans la page', () => {
    const fragment = '<title>T</title><style>x{}</style><main>contenu</main>';
    const out = wrapDocument(fragment);
    for (const morceau of ['<title>T</title>', '<style>x{}</style>', '<main>contenu</main>']) {
      expect(out).toContain(morceau);
    }
  });

  it('reste lisible sans bloc de style plutôt que de couper au hasard', () => {
    const out = wrapDocument('<p>sans style</p>');
    expect(out).toContain('<body><p>sans style</p></body>');
  });

  it.each(DOCS)('enveloppe correctement %s', (nom) => {
    const fragment = lire(nom);
    // La forme attendue : ni coque, ni style hors de l'en-tête.
    expect(fragment).not.toMatch(/<!doctype|<html\b|<head\b|<body\b/i);

    const out = wrapDocument(fragment);
    const head = out.slice(0, out.indexOf('</head>'));
    const body = out.slice(out.indexOf('<body>'));

    expect(head).toContain('<title>');
    expect(head).toContain('</style>');
    expect(body).not.toContain('</style>');
    expect(body).toContain('<div class="wrap">');
    expect(out.length).toBeGreaterThan(fragment.length);
  });

  it('sert un moteur SANS dépendance de rendu externe', () => {
    // Le schéma était un bloc Mermaid, rendu par le seul runtime des
    // artefacts : servi par l'application — ou ouvert localement — il
    // s'affichait en texte brut. Il est désormais en SVG inline.
    const fragment = lire('moteur-atlas.html');
    expect(fragment).not.toContain('mermaid');
    expect(fragment).toContain('<svg viewBox=');
    expect(fragment).toContain('role="img"');
    expect(fragment).toContain('aria-label=');
  });
});
