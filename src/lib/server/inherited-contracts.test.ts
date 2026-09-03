import { describe, expect, it } from 'vitest';

import {
  INHERITED_CHANNEL_MIX,
  INHERITED_SUPPLY_MIX,
  buildInheritedContracts,
} from './inherited-contracts';

const FULL = {
  suppliers: new Map([
    ['discounter', 'S-disc'],
    ['regional_fiable', 'S-reg'],
    ['champion_qualite', 'S-champ'],
    ['geant_captif', 'S-geant'],
    ['nouvel_entrant', 'S-new'],
  ]),
  distributors: new Map([
    ['grande_surface', 'D-gms'],
    ['grossiste_regional', 'D-gros'],
    ['reseau_proximite', 'D-prox'],
    ['plateforme_ecom', 'D-ecom'],
  ]),
};

describe('contrats hérités', () => {
  it('dote toujours au moins un fournisseur et un distributeur', () => {
    const c = buildInheritedContracts(FULL, 1000);
    expect(c.procurement.length).toBeGreaterThan(0);
    expect(c.distribution.length).toBeGreaterThan(0);
  });

  it('couvre la totalité du volume produit en amont', () => {
    const c = buildInheritedContracts(FULL, 1000);
    const total = c.procurement.reduce((a, p) => a + p.committedVolume, 0);
    expect(total).toBeCloseTo(1000, 1);
  });

  it('répartit la totalité des volumes en aval', () => {
    const c = buildInheritedContracts(FULL, 1000);
    const total = c.distribution.reduce((a, d) => a + d.volumeShare, 0);
    expect(total).toBeCloseTo(1, 4);
  });

  it("n'engage ni la grande surface ni la plateforme e-commerce", () => {
    // Le volume minimal de la grande surface vaut 45 % du marché : hors de
    // portée à la dotation. La référencer d'office masquerait l'arbitrage.
    const ids = buildInheritedContracts(FULL, 1000).distribution.map((d) => d.distributorId);
    expect(ids).not.toContain('D-gms');
    expect(ids).not.toContain('D-ecom');
  });

  it('laisse le champion qualité non référencé — la montée en gamme reste à faire', () => {
    const ids = buildInheritedContracts(FULL, 1000).procurement.map((p) => p.supplierId);
    expect(ids).not.toContain('S-champ');
  });

  it('renormalise quand un archétype manque, sans jamais laisser de volume à découvert', () => {
    const partial = {
      suppliers: new Map([['discounter', 'S-disc']]),
      distributors: new Map([['reseau_proximite', 'D-prox']]),
    };
    const c = buildInheritedContracts(partial, 1000);

    expect(c.procurement).toHaveLength(1);
    expect(c.procurement[0].committedVolume).toBeCloseTo(1000, 1);
    expect(c.distribution[0].volumeShare).toBeCloseTo(1, 4);
  });

  it('rend un portefeuille vide plutôt que de désigner un acteur inexistant', () => {
    const c = buildInheritedContracts(
      { suppliers: new Map(), distributors: new Map() },
      1000,
    );
    expect(c.procurement).toEqual([]);
    expect(c.distribution).toEqual([]);
  });

  it('échelonne les volumes avec la taille de l’exercice', () => {
    const small = buildInheritedContracts(FULL, 500);
    const big = buildInheritedContracts(FULL, 1000);
    expect(big.procurement[0].committedVolume).toBeCloseTo(
      small.procurement[0].committedVolume * 2,
      1,
    );
  });

  it('garde des mix normalisés dans la source', () => {
    const supply = Object.values(INHERITED_SUPPLY_MIX).reduce((a, b) => a + b, 0);
    const channel = Object.values(INHERITED_CHANNEL_MIX).reduce((a, b) => a + b, 0);
    expect(supply).toBeCloseTo(1, 6);
    expect(channel).toBeCloseTo(1, 6);
  });
});
