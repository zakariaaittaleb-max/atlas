import { describe, expect, it } from 'vitest';

import {
  colorIndexByTeam,
  dasComposition,
  dasOrder,
  groupWeights,
  type DasSummary,
  type ShareInput,
} from './reveal';

/**
 * Le jeu de données reproduit le défaut signalé : un groupe présent sur trois
 * domaines, un autre sur un seul. C'est ce cas qui faisait apparaître la même
 * équipe trois fois dans la même barre, pour une somme de 200 %.
 */
function fixture(): { rows: ShareInput[]; summaries: DasSummary[] } {
  const rows: ShareInput[] = [
    // Tour 2 — El Kaf joue trois domaines, Théo un seul.
    { teamId: 'el-kaf', dasId: 'agro', roundNumber: 2, marketSharePct: 0.35, revenueMad: 40e9 },
    { teamId: 'theo', dasId: 'agro', roundNumber: 2, marketSharePct: 0.35, revenueMad: 40e9 },
    { teamId: 'el-kaf', dasId: 'distri', roundNumber: 2, marketSharePct: 0.52, revenueMad: 8e9 },
    { teamId: 'el-kaf', dasId: 'textile', roundNumber: 2, marketSharePct: 0.52, revenueMad: 12e9 },
    // Tour 1 — pour les écarts et le point de départ de l'animation.
    { teamId: 'el-kaf', dasId: 'agro', roundNumber: 1, marketSharePct: 0.30, revenueMad: 30e9 },
    { teamId: 'theo', dasId: 'agro', roundNumber: 1, marketSharePct: 0.40, revenueMad: 50e9 },
    { teamId: 'el-kaf', dasId: 'distri', roundNumber: 1, marketSharePct: 0.52, revenueMad: 8e9 },
    { teamId: 'el-kaf', dasId: 'textile', roundNumber: 1, marketSharePct: 0.52, revenueMad: 12e9 },
  ];

  const summaries: DasSummary[] = [
    { dasId: 'agro', roundNumber: 2, marketSizeMad: 158e9, unservedShare: 0, installedShare: 0.30 },
    { dasId: 'distri', roundNumber: 2, marketSizeMad: 62e9, unservedShare: 0.28, installedShare: 0.20 },
    { dasId: 'textile', roundNumber: 2, marketSizeMad: 50e9, unservedShare: 0.33, installedShare: 0.15 },
    { dasId: 'agro', roundNumber: 1, marketSizeMad: 173e9, unservedShare: 0, installedShare: 0.30 },
    { dasId: 'distri', roundNumber: 1, marketSizeMad: 60e9, unservedShare: 0.28, installedShare: 0.20 },
    { dasId: 'textile', roundNumber: 1, marketSizeMad: 48e9, unservedShare: 0.33, installedShare: 0.15 },
  ];

  return { rows, summaries };
}

describe('poids des groupes', () => {
  it('ne compte chaque groupe qu’une fois, tous domaines confondus', () => {
    const weights = groupWeights(fixture().rows, 2);

    expect(weights.map((w) => w.teamId)).toEqual(['el-kaf', 'theo']);
    // 60 Md sur 100 Md cumulés : le multi-domaines pèse plus que sa part agro.
    expect(weights[0].weight).toBeCloseTo(0.6, 6);
    expect(weights[1].weight).toBeCloseTo(0.4, 6);
  });

  it('somme à 100 % du chiffre d’affaires du pool', () => {
    const total = groupWeights(fixture().rows, 2).reduce((acc, w) => acc + w.weight, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('mesure le poids du tour précédent sur la même base', () => {
    const weights = groupWeights(fixture().rows, 2);
    const elKaf = weights.find((w) => w.teamId === 'el-kaf')!;

    // Tour 1 : 50 Md sur 100 Md. Le groupe a donc gagné dix points de poids.
    expect(elKaf.previousWeight).toBeCloseTo(0.5, 6);
    expect(elKaf.weight - elKaf.previousWeight).toBeCloseTo(0.1, 6);
  });

  it('compte les domaines où le groupe réalise du chiffre d’affaires', () => {
    const weights = groupWeights(fixture().rows, 2);
    expect(weights.find((w) => w.teamId === 'el-kaf')!.dasCount).toBe(3);
    expect(weights.find((w) => w.teamId === 'theo')!.dasCount).toBe(1);
  });

  it('ne fait pas surgir de zéro un groupe absent du tour précédent', () => {
    const rows: ShareInput[] = [
      { teamId: 'ancien', dasId: 'agro', roundNumber: 2, marketSharePct: 0.4, revenueMad: 60e9 },
      { teamId: 'nouveau', dasId: 'agro', roundNumber: 2, marketSharePct: 0.3, revenueMad: 40e9 },
      { teamId: 'ancien', dasId: 'agro', roundNumber: 1, marketSharePct: 0.5, revenueMad: 50e9 },
    ];
    const nouveau = groupWeights(rows, 2).find((w) => w.teamId === 'nouveau')!;
    expect(nouveau.previousWeight).toBeCloseTo(nouveau.weight, 9);
  });
});

describe('composition d’un domaine', () => {
  it('ne retient que les équipes présentes sur ce domaine', () => {
    const { rows, summaries } = fixture();

    expect(dasComposition('agro', rows, summaries, 2).teams.map((t) => t.teamId))
      .toEqual(['el-kaf', 'theo']);
    expect(dasComposition('textile', rows, summaries, 2).teams.map((t) => t.teamId))
      .toEqual(['el-kaf']);
  });

  it('ferme la comptabilité du marché à 100 %', () => {
    const { rows, summaries } = fixture();
    for (const dasId of ['agro', 'distri', 'textile']) {
      expect(dasComposition(dasId, rows, summaries, 2).total).toBeCloseTo(1, 6);
    }
  });

  it('nomme la part des installés et celle que personne n’a servie', () => {
    const { rows, summaries } = fixture();
    const distri = dasComposition('distri', rows, summaries, 2);

    expect(distri.installedShare).toBeCloseTo(0.2, 6);
    expect(distri.unservedShare).toBeCloseTo(0.28, 6);
    // La seule équipe du domaine n'en détient que la moitié : le reste
    // appartient aux installés et au marché non servi, pas à elle.
    expect(distri.teams[0].share).toBeCloseTo(0.52, 6);
  });

  it('classe les équipes par part décroissante', () => {
    const rows: ShareInput[] = [
      { teamId: 'petit', dasId: 'agro', roundNumber: 2, marketSharePct: 0.2, revenueMad: 1 },
      { teamId: 'grand', dasId: 'agro', roundNumber: 2, marketSharePct: 0.5, revenueMad: 1 },
      { teamId: 'moyen', dasId: 'agro', roundNumber: 2, marketSharePct: 0.3, revenueMad: 1 },
    ];
    expect(dasComposition('agro', rows, [], 2).teams.map((t) => t.teamId))
      .toEqual(['grand', 'moyen', 'petit']);
  });

  /**
   * L'animation part de la répartition du tour précédent. Interpoler d'une
   * partition de 1 vers une autre garde la barre pleine à chaque image ; c'est
   * pourquoi les trois tranches ont leur valeur d'origine.
   */
  it('part du tour précédent, tranches extérieures comprises', () => {
    const { rows, summaries } = fixture();
    const agro = dasComposition('agro', rows, summaries, 2);

    expect(agro.teams.find((t) => t.teamId === 'el-kaf')!.previousShare).toBeCloseTo(0.30, 6);
    expect(agro.teams.find((t) => t.teamId === 'theo')!.previousShare).toBeCloseTo(0.40, 6);
    expect(agro.previousInstalledShare).toBeCloseTo(0.30, 6);

    const depart =
      agro.teams.reduce((acc, t) => acc + t.previousShare, 0) +
      agro.previousInstalledShare +
      agro.previousUnservedShare;
    expect(depart).toBeCloseTo(1, 6);
  });

  it('partage à égalité la portion disputée au premier tour', () => {
    const rows: ShareInput[] = [
      { teamId: 'a', dasId: 'agro', roundNumber: 1, marketSharePct: 0.5, revenueMad: 1 },
      { teamId: 'b', dasId: 'agro', roundNumber: 1, marketSharePct: 0.2, revenueMad: 1 },
    ];
    const summaries: DasSummary[] = [
      { dasId: 'agro', roundNumber: 1, marketSizeMad: 1, unservedShare: 0.1, installedShare: 0.2 },
    ];
    const agro = dasComposition('agro', rows, summaries, 1);

    // 70 % disputés entre deux équipes : 35 % chacune au départ, et la barre
    // reste pleine — un tiers du marché entier l'aurait fait déborder.
    for (const team of agro.teams) expect(team.previousShare).toBeCloseTo(0.35, 6);
    const depart =
      agro.teams.reduce((acc, t) => acc + t.previousShare, 0) +
      agro.previousInstalledShare +
      agro.previousUnservedShare;
    expect(depart).toBeCloseTo(1, 6);
  });

  it('signale une comptabilité qui ne ferme pas', () => {
    // Données d'un tour résolu avant que la part des installés n'existe :
    // l'écran doit pouvoir le détecter au lieu d'empiler un trou muet.
    const rows: ShareInput[] = [
      { teamId: 'a', dasId: 'agro', roundNumber: 2, marketSharePct: 0.35, revenueMad: 1 },
    ];
    expect(dasComposition('agro', rows, [], 2).total).toBeCloseTo(0.35, 6);
  });
});

describe('ordre et couleurs', () => {
  it('présente les domaines du plus gros marché au plus petit', () => {
    const { rows, summaries } = fixture();
    expect(dasOrder(rows, summaries, 2)).toEqual(['agro', 'distri', 'textile']);
  });

  it('donne à chaque groupe une couleur stable, indépendante du classement', () => {
    const { rows } = fixture();
    const index = colorIndexByTeam(rows);

    expect(index.get('el-kaf')).toBe(0);
    expect(index.get('theo')).toBe(1);
    // Le même calcul sur les lignes d'un seul domaine rend le même rang :
    // une équipe garde sa couleur de barre en barre.
    expect(colorIndexByTeam(rows.filter((r) => r.dasId === 'agro')).get('theo')).toBe(1);
  });
});
