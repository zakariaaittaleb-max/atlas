import { describe, expect, it } from 'vitest';

import { createNameFactory, defaultTeamNames } from './company-names';

describe('raisons sociales de l’écosystème', () => {
  it('ne répète jamais un nom dans une même session', () => {
    const factory = createNameFactory(['session-1']);
    const noms = Array.from({ length: 120 }, () => factory.next('agro'));
    expect(new Set(noms).size).toBe(noms.length);
  });

  it('est déterministe : rejouer un provisionnement redonne le même écosystème', () => {
    const a = createNameFactory(['session-1']).next('agro');
    const b = createNameFactory(['session-1']).next('agro');
    expect(a).toBe(b);
  });

  it('donne des graines différentes des écosystèmes différents', () => {
    const a = Array.from({ length: 8 }, () => createNameFactory(['A']).next('btp'));
    const b = Array.from({ length: 8 }, () => createNameFactory(['B']).next('btp'));
    expect(a[0]).not.toBe(b[0]);
  });

  it('colore le vocabulaire selon le secteur', () => {
    // Un fournisseur d'agro ne doit pas s'appeler comme une SSII.
    const factory = createNameFactory(['x']);
    const numeriques = Array.from({ length: 40 }, () => factory.next('numerique')).join(' ');
    expect(numeriques).toMatch(/Systèmes|Cloud|Digital|Data|Logicielle|Cyber|Solutions|Consulting/);
    expect(numeriques).not.toMatch(/Minoteries|Charpentes|Bonneterie/);
  });

  it('nomme les équipes distinctement', () => {
    const noms = defaultTeamNames(6, 'session');
    expect(new Set(noms).size).toBe(6);
  });
});
