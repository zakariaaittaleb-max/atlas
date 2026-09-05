import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Term } from './term';

/**
 * L'infobulle est le seul endroit où le vocabulaire technique s'explique. Une
 * régression y est silencieuse : le terme s'affiche quand même, simplement
 * sans moyen de savoir ce qu'il veut dire.
 *
 * Ces tests portent sur le rendu RÉEL du composant, au repos. L'ouverture au
 * survol relève du navigateur et n'est pas simulée ici.
 */
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('Term', () => {
  it('affiche le terme EXACT, pas une paraphrase', () => {
    expect(html(<Term>Rentabilité économique</Term>)).toContain('Rentabilité économique');
  });

  it('rend un bouton — focusable au clavier, annoncé par un lecteur d’écran', () => {
    // Un `title` natif serait inaccessible au clavier, invisible sur tactile
    // et illisible sur vidéoprojecteur. D'où un vrai élément actionnable.
    const out = html(<Term>Résultat net</Term>);
    expect(out).toContain('<button');
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-expanded="false"');
  });

  it('reste fermé au repos : l’explication ne pollue pas la lecture', () => {
    const out = html(<Term>Résultat net</Term>);
    expect(out).not.toContain('role="tooltip"');
  });

  it('affiche tel quel un terme absent du glossaire, sans casser la page', () => {
    // L'oubli se voit au test de couverture, jamais en salle.
    const out = html(<Term>Terme jamais défini</Term>);
    expect(out).toContain('Terme jamais défini');
    expect(out).not.toContain('<button');
  });

  it('tolère les deux apostrophes', () => {
    expect(html(<Term>Chiffre d’affaires</Term>)).toContain('<button');
    expect(html(<Term>{"Chiffre d'affaires"}</Term>)).toContain('<button');
  });
});
