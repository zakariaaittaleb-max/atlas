import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCALES,
  clampVariation,
  referenceOr,
  valueFromVariation,
  variationFromValue,
  variationLabel,
} from './variation-scale';

describe('échelle de variation', () => {
  it('dit le même mot à des pourcentages différents selon la famille', () => {
    // Tout l'intérêt de l'échelle relative : +20 % est le maximum atteignable
    // sur les salaires et une broutille sur le marketing. Un seuil exprimé en
    // points de pourcentage aurait qualifié les deux de la même façon.
    expect(variationLabel(20, DEFAULT_SCALES.salaire)).toBe('Hausse maximale');
    expect(variationLabel(20, DEFAULT_SCALES.marketing)).toBe('Faible hausse');
  });

  it('réserve « Supprimé » à la disparition complète du poste', () => {
    expect(variationLabel(-100, DEFAULT_SCALES.marketing)).toBe('Supprimé');
    expect(variationLabel(-90, DEFAULT_SCALES.marketing)).toBe('Très forte baisse');
  });

  it('nomme « Inchangé » ce qui ne bouge pas assez pour compter', () => {
    expect(variationLabel(0, DEFAULT_SCALES.investissement)).toBe('Inchangé');
    expect(variationLabel(1, DEFAULT_SCALES.investissement)).toBe('Inchangé');
    expect(variationLabel(-1, DEFAULT_SCALES.investissement)).toBe('Inchangé');
  });

  it('ne descend jamais sous zéro, quelle que soit la borne demandée', () => {
    // Une borne à −200 % produirait un budget négatif : le plancher est dur.
    expect(clampVariation(-250, { min: -200, max: 300 })).toBe(-100);
    expect(valueFromVariation(1000, -100)).toBe(0);
  });

  it('respecte les bornes de la famille', () => {
    expect(clampVariation(90, DEFAULT_SCALES.salaire.bounds)).toBe(20);
    expect(clampVariation(-40, DEFAULT_SCALES.salaire.bounds)).toBe(-5);
  });

  it('fait l’aller-retour entre montant et pourcentage', () => {
    const reference = 4_000_000;
    const pct = 37.5;
    const amount = valueFromVariation(reference, pct);
    expect(amount).toBe(5_500_000);
    expect(variationFromValue(reference, amount)).toBeCloseTo(pct, 6);
  });

  it('retombe sur la dotation quand le tour précédent était à zéro', () => {
    // Sans ce repli, une équipe qui coupe un poste ne pourrait plus jamais y
    // revenir : tout pourcentage de zéro vaut zéro.
    expect(referenceOr(0, 250_000)).toBe(250_000);
    expect(referenceOr(80_000, 250_000)).toBe(80_000);
  });
});
