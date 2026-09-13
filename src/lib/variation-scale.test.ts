import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCALES,
  clampVariation,
  floorOf,
  referenceOf,
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
    expect(valueFromVariation(referenceOf(1000, 0), -100)).toBe(0);
  });

  it('respecte les bornes de la famille', () => {
    expect(clampVariation(90, DEFAULT_SCALES.salaire.bounds)).toBe(20);
    expect(clampVariation(-40, DEFAULT_SCALES.salaire.bounds)).toBe(-5);
  });

  it('fait l’aller-retour entre montant et pourcentage', () => {
    const reference = referenceOf(4_000_000, 0);
    const pct = 37.5;
    const amount = valueFromVariation(reference, pct);
    expect(amount).toBe(5_500_000);
    expect(variationFromValue(reference, amount)).toBeCloseTo(pct, 6);
  });

  // ── La valeur héritée est « Inchangé », même quand elle vaut zéro ──────
  // Une seule référence servait de point « inchangé » ET d'unité : un poste
  // coupé à zéro ne remontait plus, ou s'ouvrait sur « Supprimé » en désignant
  // la dotation comme valeur inchangée.
  it('pose le curseur sur « Inchangé » à la valeur héritée, même nulle', () => {
    const coupe = referenceOf(0, 250_000);
    expect(valueFromVariation(coupe, 0)).toBe(0);
    expect(variationFromValue(coupe, 0)).toBe(0);
    expect(variationLabel(variationFromValue(coupe, 0), DEFAULT_SCALES.marketing)).toBe('Inchangé');
  });

  it('permet de remonter depuis zéro : +100 % rend la dotation', () => {
    const coupe = referenceOf(0, 250_000);
    expect(valueFromVariation(coupe, 100)).toBe(250_000);
    expect(valueFromVariation(coupe, 40)).toBe(100_000);
    expect(variationFromValue(coupe, 100_000)).toBeCloseTo(40, 6);
  });

  it('ne propose aucune baisse depuis zéro : il n’y a rien à baisser', () => {
    const coupe = referenceOf(0, 250_000);
    expect(floorOf(coupe, DEFAULT_SCALES.marketing.bounds)).toBe(0);
    expect(clampVariation(-60, DEFAULT_SCALES.marketing.bounds, coupe)).toBe(0);
  });

  it('calcule exactement comme avant quand la valeur héritée est positive', () => {
    const herite = referenceOf(80_000, 250_000);
    expect(valueFromVariation(herite, 50)).toBe(120_000);
    expect(valueFromVariation(herite, -100)).toBe(0);
    expect(floorOf(herite, DEFAULT_SCALES.marketing.bounds)).toBe(-100);
  });
});
