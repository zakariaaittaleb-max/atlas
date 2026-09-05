import { describe, expect, it } from 'vitest';

import { resolveDistribution, resolveProcurement } from './channels';
import { makeRng } from './math';
import { buildParams } from './params';
import type { DistributorOffer, SupplierOffer } from './types';

/**
 * ATLAS — intégration verticale par rachat de maillon.
 *
 * Le marché des acquisitions ne permettait qu'ENTRER dans un domaine. Il
 * manquait l'autre moitié de la croissance externe, et c'est celle que le
 * cahier met au cœur d'une des quatre stratégies corporate : « contrôler les
 * maillons amont et aval de sa propre filière » n'était réalisable qu'à coups
 * de CAPEX sur un réseau de vente. Racheter le maillon — le geste que fait une
 * entreprise réelle — était impossible.
 */

const params = buildParams();

const fournisseur = (over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  actorId: 'f1', priceIndex: 1.0, reliability: 70, qualityContribution: 60,
  capacityUnits: 1_000_000, switchingCost: 30, minimumVolume: 0, ...over,
});

const distributeur = (over: Partial<DistributorOffer> = {}): DistributorOffer => ({
  actorId: 'd1', coveragePct: 0.5, requiredMarginPct: 0.22, negotiatingStrength: 60,
  serviceLevel: 70, minimumVolume: 0, ...over,
});

describe('intégration amont — racheter son fournisseur', () => {
  const achat = (supplier: SupplierOffer) =>
    resolveProcurement([{ supplier, committedVolume: 500_000 }], 4, makeRng(1), params);

  it('capte plus que la meilleure remise de volume', () => {
    // C'est ce qui rend l'opération attractive : on ne négocie pas une remise,
    // on supprime la marge d'un intermédiaire.
    const contrat = achat(fournisseur());
    const detenu = achat(fournisseur({ ownedByTeam: true, integrationQuality: 1 }));

    expect(detenu.priceIndex).toBeLessThan(contrat.priceIndex);
    expect(1 - detenu.priceIndex).toBeGreaterThan(params['procurement.max_discount']);
  });

  it('n’accorde AUCUN pouvoir de négociation contre soi-même', () => {
    expect(achat(fournisseur({ ownedByTeam: true })).results[0].bargainingPower).toBe(100);
  });

  it('réduit le risque de rupture sans jamais l’annuler', () => {
    // Un maillon intégré ne rompt plus pour désaccord commercial ; le risque
    // industriel, lui, ne s’achète pas.
    const fragile = achat(fournisseur({ reliability: 30 }));
    const integre = achat(fournisseur({ reliability: 30, ownedByTeam: true, integrationQuality: 1 }));

    expect(integre.disruption).toBeLessThan(fragile.disruption);
    expect(integre.disruption).toBeGreaterThan(0);
  });

  it('ne rend presque rien quand l’intégration n’a pas été financée', () => {
    // Racheter sans budget, c'est posséder une entreprise qu'on ne sait pas
    // faire tourner. Le budget d'intégration est une décision, pas une
    // formalité — et ce test est ce qui l'empêche de le redevenir.
    const rate = achat(fournisseur({ ownedByTeam: true, integrationQuality: 0.05 }));
    const reussi = achat(fournisseur({ ownedByTeam: true, integrationQuality: 1 }));

    expect(1 - rate.priceIndex).toBeLessThan((1 - reussi.priceIndex) / 5);
  });
});

describe('intégration aval — racheter son distributeur', () => {
  const vente = (d: DistributorOffer, share = 0.6) =>
    resolveDistribution([{ distributor: d, volumeShare: share }], 60, 0, 1_000_000, params);

  it('fait passer sa couverture du canal TIERS au réseau propre', () => {
    // C'est le seul chemin par lequel l'opération atteint l'axe de contrôle du
    // canal — et donc l'intégration verticale du groupe. Aucun calcul séparé,
    // donc aucune divergence possible entre les deux.
    expect(vente(distributeur()).channelControl).toBeCloseTo(40, 6);
    expect(vente(distributeur({ ownedByTeam: true })).channelControl).toBeCloseTo(100, 6);
  });

  it('supprime la marge prélevée, sans supprimer le coût d’exploitation', () => {
    // Ramener la ligne à zéro ferait de l'intégration un gain sans
    // contrepartie : entrepôts, camions et forces de vente restent à payer.
    const tiers = vente(distributeur()).avgMarginPct;
    const detenu = vente(distributeur({ ownedByTeam: true, integrationQuality: 1 })).avgMarginPct;

    expect(detenu).toBeLessThan(tiers);
    expect(detenu).toBeGreaterThan(0);
  });

  it('n’impose plus de volume minimal : une filiale ne rationne pas sa mère', () => {
    const exigeant = distributeur({ minimumVolume: 10_000_000 });
    const tiers = vente(exigeant).coverage;
    const detenu = vente({ ...exigeant, ownedByTeam: true }).coverage;

    expect(tiers).toBeLessThan(detenu);
  });

  it('laisse un réseau coûteux quand l’intégration a échoué', () => {
    const rate = vente(distributeur({ ownedByTeam: true, integrationQuality: 0 })).avgMarginPct;
    const reussi = vente(distributeur({ ownedByTeam: true, integrationQuality: 1 })).avgMarginPct;

    expect(rate).toBeGreaterThan(reussi);
  });
});
