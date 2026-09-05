import { describe, expect, it } from 'vitest';

import { latestAtMost, servedSegmentsOrDefault } from './reconduction';

/**
 * Ces tests gardent l'invariant le plus important du jeu : L'ÉCRAN ET LE MOTEUR
 * LISENT LA MÊME DÉCISION. Ils ont divergé — l'interface reconduisait, le
 * moteur repartait de valeurs neutres — et rien ne pouvait le révéler à
 * l'équipe, puisque les deux affichages étaient cohérents avec eux-mêmes.
 */

describe('latestAtMost', () => {
  const rows = [
    { round_number: 1, prix: 20 },
    { round_number: 3, prix: 70 },
    { round_number: 5, prix: 40 },
  ];

  it('retient la décision du tour même quand elle existe', () => {
    expect(latestAtMost(rows, 3)?.prix).toBe(70);
  });

  it('RECONDUIT la dernière décision connue quand le tour est vierge', () => {
    // Le cœur de l'affaire : ne rien ressaisir n'est pas ne rien décider.
    expect(latestAtMost(rows, 4)?.prix).toBe(70);
  });

  it('ignore les tours postérieurs', () => {
    // Une résolution rejouée ne doit pas voir le futur.
    expect(latestAtMost(rows, 2)?.prix).toBe(20);
  });

  it('rend null quand l’équipe n’a jamais rien saisi', () => {
    expect(latestAtMost(rows, 0)).toBeNull();
    expect(latestAtMost([], 5)).toBeNull();
    expect(latestAtMost(null, 5)).toBeNull();
  });

  it('ne dépend pas de l’ordre des lignes', () => {
    const desordre = [...rows].reverse();
    expect(latestAtMost(desordre, 4)?.prix).toBe(70);
  });
});

describe('servedSegmentsOrDefault', () => {
  const catalogue = ['grand_public', 'export', 'premium'];

  it('garde les segments déclarés', () => {
    expect(servedSegmentsOrDefault(['export', 'premium'], catalogue))
      .toEqual(['export', 'premium']);
  });

  it('ne rend JAMAIS une liste vide', () => {
    // Une liste vide ferme tout accès au marché depuis que la part adressable
    // dépend réellement des segments servis. Aucun des cas qui y mènent ne
    // signifie « je renonce au marché ».
    expect(servedSegmentsOrDefault([], catalogue)).toEqual(['grand_public']);
    expect(servedSegmentsOrDefault(null, catalogue)).toEqual(['grand_public']);
    expect(servedSegmentsOrDefault(undefined, catalogue)).toEqual(['grand_public']);
  });

  it('écarte les clés que le catalogue ne reconnaît plus', () => {
    // Un domaine acquis peut porter des segments d'un référentiel antérieur :
    // les honorer ouvrirait un marché qui n'existe plus.
    expect(servedSegmentsOrDefault(['segment_disparu', 'premium'], catalogue))
      .toEqual(['premium']);
  });

  it('retombe sur le défaut quand AUCUNE clé déclarée n’existe plus', () => {
    expect(servedSegmentsOrDefault(['a', 'b'], catalogue)).toEqual(['grand_public']);
  });

  it('rend une liste vide sur un catalogue vide, faute de mieux', () => {
    // Un domaine sans segment au catalogue est un défaut de référentiel, pas
    // une décision d'équipe : inventer une clé serait pire.
    expect(servedSegmentsOrDefault(['x'], [])).toEqual([]);
  });
});
