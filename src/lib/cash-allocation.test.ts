import { describe, expect, it } from 'vitest';

import { moveShare, referenceShares, sharesFromTransfers, transfersFromShares } from './cash-allocation';

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

describe('referenceShares', () => {
  it('répartit au prorata du chiffre d’affaires', () => {
    const shares = referenceShares([4_615, 5_752, 8_337]);
    expect(sum(shares)).toBeCloseTo(1, 10);
    expect(shares[2]).toBeCloseTo(8_337 / 18_704, 10);
  });

  it('retombe sur des parts égales sans chiffre d’affaires connu', () => {
    expect(referenceShares([null, 0, null])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });
});

describe('moveShare', () => {
  it('garde le total à 100 % et le rang relatif des autres domaines', () => {
    const next = moveShare([0.25, 0.25, 0.5], 0, 0.45);
    expect(sum(next)).toBeCloseTo(1, 10);
    expect(next[0]).toBeCloseTo(0.45, 10);
    expect(next[2] / next[1]).toBeCloseTo(2, 10);
  });

  it('borne une part entre 0 et 100 %', () => {
    const next = moveShare([0.5, 0.5], 1, 1.4);
    expect(next).toEqual([0, 1]);
  });

  it('rend des parts aux autres quand le domaine touché avait tout', () => {
    const next = moveShare([1, 0, 0], 0, 0.4);
    expect(next[1]).toBeCloseTo(0.3, 10);
    expect(next[2]).toBeCloseTo(0.3, 10);
  });
});

describe('transfersFromShares', () => {
  it('produit des transferts de somme exactement nulle', () => {
    const reference = referenceShares([4_615e6, 5_752e6, 8_337e6]);
    const shares = moveShare(reference, 2, 0.31);
    const transfers = transfersFromShares(reference, shares, 18_803_421_977);
    expect(sum(transfers)).toBe(0);
    expect(transfers[2]).toBeLessThan(0);
  });

  it('ne transfère rien à la référence', () => {
    const reference = referenceShares([1, 3]);
    expect(transfersFromShares(reference, reference, 1e9)).toEqual([0, 0]);
  });

  it('retrouve les parts à partir des transferts enregistrés', () => {
    const reference = referenceShares([1, 1]);
    const shares = moveShare(reference, 0, 0.7);
    const transfers = transfersFromShares(reference, shares, 2e9);
    const back = sharesFromTransfers(reference, transfers, 2e9);
    expect(back[0]).toBeCloseTo(0.7, 8);
    expect(back[1]).toBeCloseTo(0.3, 8);
  });
});
