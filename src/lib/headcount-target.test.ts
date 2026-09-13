import { describe, expect, it } from 'vitest';

import { hiresOf, retargetHeadcount } from './headcount-target';

const vide = {
  hireOperateurs: 0, hireTechniciens: 0, hireExperts: 0, hireCadres: 0,
  internalTransfersIn: 0, layoffs: 0,
};

/** L'effectif visé que l'écran recalcule après la modification. */
const cible = (hr: typeof vide, current: number) =>
  Math.max(current + hiresOf(hr) - hr.layoffs, 0);

describe('traduire un effectif visé en recrutements et en départs', () => {
  it('fait RÉELLEMENT monter l’effectif : le « + » ne revient plus au point de départ', () => {
    const apres = { ...vide, ...retargetHeadcount(vide, 64_464, 64_474, 'hireOperateurs') };
    expect(apres.hireOperateurs).toBe(10);
    expect(cible(apres, 64_464)).toBe(64_474);
  });

  it('verse l’écart au profil que la session ouvre', () => {
    const apres = { ...vide, ...retargetHeadcount(vide, 1_000, 1_040, 'hireTechniciens') };
    expect(apres.hireTechniciens).toBe(40);
    expect(apres.hireOperateurs).toBe(0);
  });

  it('respecte la répartition déjà faite et n’ajoute que le manque', () => {
    const reparti = { ...vide, hireExperts: 30, hireCadres: 10 };
    const apres = { ...reparti, ...retargetHeadcount(reparti, 1_000, 1_060, 'hireOperateurs') };
    expect(apres.hireExperts).toBe(30);
    expect(apres.hireCadres).toBe(10);
    expect(apres.hireOperateurs).toBe(20);
    expect(cible(apres, 1_000)).toBe(1_060);
  });

  it('retire d’abord les opérateurs quand on redescend au-dessus de l’effectif en place', () => {
    const reparti = { ...vide, hireOperateurs: 25, hireExperts: 15 };
    const apres = { ...reparti, ...retargetHeadcount(reparti, 1_000, 1_020, 'hireOperateurs') };
    expect(apres.hireOperateurs).toBe(5);
    expect(apres.hireExperts).toBe(15);
    expect(cible(apres, 1_000)).toBe(1_020);
  });

  it('touche aux transferts internes en dernier : ce sont des décisions nominatives', () => {
    const reparti = { ...vide, hireCadres: 5, internalTransfersIn: 10 };
    const apres = { ...reparti, ...retargetHeadcount(reparti, 1_000, 1_008, 'hireOperateurs') };
    expect(apres.hireCadres).toBe(0);
    expect(apres.internalTransfersIn).toBe(8);
  });

  it('convertit une baisse en départs, sans recrutement concomitant', () => {
    const reparti = { ...vide, hireOperateurs: 40 };
    const apres = { ...reparti, ...retargetHeadcount(reparti, 1_000, 950, 'hireOperateurs') };
    expect(apres.layoffs).toBe(50);
    expect(hiresOf(apres)).toBe(0);
    expect(cible(apres, 1_000)).toBe(950);
  });

  it('efface les départs dès qu’on remonte', () => {
    const coupe = { ...vide, layoffs: 30 };
    const apres = { ...coupe, ...retargetHeadcount(coupe, 1_000, 1_010, 'hireOperateurs') };
    expect(apres.layoffs).toBe(0);
    expect(cible(apres, 1_000)).toBe(1_010);
  });

  it('ne dépasse pas l’effectif en place quand la session ferme le recrutement', () => {
    const apres = { ...vide, ...retargetHeadcount(vide, 1_000, 1_050, null) };
    expect(cible(apres, 1_000)).toBe(1_000);
  });
});
