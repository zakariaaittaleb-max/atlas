import 'server-only';

/**
 * ATLAS — génération de l'écosystème : fournisseurs, distributeurs, cibles.
 *
 * ⚠️ TOUS LES ACTEURS SONT FICTIFS. Les noms sont composés à partir de
 * toponymes et de racines marocaines ; aucune donnée n'est attribuée à une
 * entreprise réelle. C'est un choix de conception : les chiffres doivent servir
 * la pédagogie et suivre des scénarios, pas prétendre décrire des sociétés
 * existantes — ni exposer Atlas à raconter n'importe quoi sur des tiers.
 *
 * Le tirage est DÉTERMINISTE à partir de l'identifiant de session : deux
 * provisionnements de la même session produisent le même écosystème, et un
 * atelier peut être rejoué à l'identique.
 */

import { makeRng, seedFrom, uniform } from '@/lib/engine/math';

import { createNameFactory } from './company-names';

export const REGION_KEYS = [
  'tanger_tetouan_al_hoceima', 'oriental', 'fes_meknes', 'rabat_sale_kenitra',
  'beni_mellal_khenifra', 'casablanca_settat', 'marrakech_safi', 'draa_tafilalet',
  'souss_massa', 'guelmim_oued_noun', 'laayoune_sakia_el_hamra', 'dakhla_oued_ed_dahab',
] as const;

/** Régions où se concentre l'activité de chaque DAS (doc 03 §3). */
const DAS_REGIONS: Record<string, string[]> = {
  agro:       ['beni_mellal_khenifra', 'fes_meknes', 'souss_massa', 'casablanca_settat', 'marrakech_safi'],
  btp:        ['casablanca_settat', 'rabat_sale_kenitra', 'tanger_tetouan_al_hoceima', 'marrakech_safi'],
  tourisme:   ['marrakech_safi', 'souss_massa', 'tanger_tetouan_al_hoceima', 'fes_meknes', 'dakhla_oued_ed_dahab'],
  equipement: ['casablanca_settat', 'tanger_tetouan_al_hoceima', 'rabat_sale_kenitra', 'oriental'],
  retail:     ['casablanca_settat', 'rabat_sale_kenitra', 'marrakech_safi', 'fes_meknes', 'tanger_tetouan_al_hoceima'],
  textile:    ['tanger_tetouan_al_hoceima', 'casablanca_settat', 'fes_meknes', 'oriental'],
  energie:    ['souss_massa', 'laayoune_sakia_el_hamra', 'draa_tafilalet', 'oriental', 'dakhla_oued_ed_dahab'],
  numerique:  ['casablanca_settat', 'rabat_sale_kenitra', 'fes_meknes', 'marrakech_safi'],
};


/** Archétypes de fournisseurs (doc 03 §5.1) — chacun porte son propre piège. */
const SUPPLIER_ARCHETYPES = [
  { key: 'discounter',        priceIndex: 0.80, reliability: 45, quality: 40, switching: 20 },
  { key: 'regional_fiable',   priceIndex: 0.98, reliability: 78, quality: 65, switching: 45 },
  { key: 'champion_qualite',  priceIndex: 1.25, reliability: 92, quality: 90, switching: 70 },
  // Bon marché, mais on ne peut plus en sortir : le coût de changement écrase
  // le pouvoir de négociation.
  { key: 'geant_captif',      priceIndex: 0.92, reliability: 85, quality: 72, switching: 85 },
  { key: 'nouvel_entrant',    priceIndex: 0.85, reliability: 55, quality: 70, switching: 15 },
] as const;

/** Archétypes de distributeurs (doc 03 §5.2). */
const DISTRIBUTOR_ARCHETYPES = [
  // Meilleure couverture, marge la plus lourde, rapport de force écrasant :
  // le pouvoir de l'acheteur de Porter, rendu palpable.
  { key: 'grande_surface',    coverage: 0.65, margin: 0.28, strength: 88, service: 70, minVolumeFactor: 0.45 },
  { key: 'grossiste_regional',coverage: 0.30, margin: 0.16, strength: 45, service: 60, minVolumeFactor: 0.15 },
  { key: 'reseau_proximite',  coverage: 0.22, margin: 0.20, strength: 30, service: 65, minVolumeFactor: 0.05 },
  { key: 'plateforme_ecom',   coverage: 0.45, margin: 0.22, strength: 72, service: 78, minVolumeFactor: 0.08 },
] as const;

/** Trajectoires d'évolution (doc 03 §5.4). */
export type Scenario =
  | 'croissance_stable' | 'montee_en_puissance' | 'declin_silencieux'
  | 'tension_capacitaire' | 'cible_opportune' | 'choc_exogene';

const SCENARIOS: Scenario[] = [
  'croissance_stable', 'croissance_stable', 'montee_en_puissance',
  // Le `declin_silencieux` est la trajectoire pédagogique clé : seule l'étude
  // approfondie révèle la santé financière qui s'érode. Une équipe qui prend la
  // note express subira la rupture au tour 4 sans l'avoir vue venir.
  'declin_silencieux', 'tension_capacitaire', 'cible_opportune',
];

export interface ActorSeed {
  actorType: 'fournisseur' | 'distributeur' | 'partenaire_techno' | 'cible_acquisition';
  name: string;
  regionKey: string;
  archetype: string;
  scenario: Scenario;
  scenarioTriggerRound: number | null;
  rounds: ActorRoundSeed[];
}

export interface ActorRoundSeed {
  roundNumber: number;
  revenueMad: number;
  capacityUnits: number;
  priceIndex: number;
  reliability: number;
  qualityContribution: number;
  coveragePct: number | null;
  requiredMarginPct: number | null;
  serviceLevel: number | null;
  negotiatingStrength: number | null;
  minimumVolume: number;
  switchingCost: number;
  financialHealth: number;
  divestAppetite: number;
}

const clamp100 = (v: number) => Math.min(Math.max(v, 0), 100);

/** Applique la trajectoire d'un acteur, tour après tour. */
function trajectory(
  scenario: Scenario,
  round: number,
  base: { revenue: number; capacity: number; priceIndex: number; reliability: number; health: number },
) {
  const t = round;
  switch (scenario) {
    case 'montee_en_puissance':
      return { revenue: base.revenue * (1 + 0.15 * t), capacity: base.capacity * (1 + 0.20 * t),
               priceIndex: base.priceIndex * (1 + 0.03 * t), reliability: clamp100(base.reliability + 2 * t),
               health: clamp100(base.health + 3 * t) };
    case 'declin_silencieux':
      // La fiabilité chute de 10 points par tour, mais seule la santé financière
      // le laisse deviner à l'avance — et elle est réservée au palier approfondi.
      return { revenue: base.revenue * Math.pow(0.92, t), capacity: base.capacity * Math.pow(0.95, t),
               priceIndex: base.priceIndex * (1 + 0.02 * t), reliability: clamp100(base.reliability - 10 * t),
               health: clamp100(base.health - 14 * t) };
    case 'tension_capacitaire':
      return { revenue: base.revenue * (1 + 0.08 * t), capacity: base.capacity * (1 + 0.02 * t),
               priceIndex: base.priceIndex * (1 + 0.12 * t), reliability: clamp100(base.reliability - 3 * t),
               health: clamp100(base.health + 1 * t) };
    case 'cible_opportune':
      return { revenue: base.revenue * Math.pow(0.96, t), capacity: base.capacity,
               priceIndex: base.priceIndex, reliability: clamp100(base.reliability - 2 * t),
               health: clamp100(base.health - 8 * t) };
    default:
      return { revenue: base.revenue * (1 + 0.06 * t), capacity: base.capacity * (1 + 0.04 * t),
               priceIndex: base.priceIndex * (1 + 0.02 * t), reliability: base.reliability,
               health: base.health };
  }
}

/**
 * Génère l'écosystème d'un DAS : 5 fournisseurs, 4 distributeurs,
 * 2 partenaires technologiques et 2 cibles d'acquisition.
 */
export function generateEcosystem(
  sessionId: string,
  sectorKey: string,
  marketVolumeUnits: number,
  maxRounds: number,
): ActorSeed[] {
  const rng = makeRng(seedFrom(sessionId, sectorKey, 'ecosystem'));
  const regions = DAS_REGIONS[sectorKey] ?? [...REGION_KEYS];
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

  // Les raisons sociales viennent d'un générateur qui mêle quatre registres
  // réels — patronymique, sigle, descriptif, arabe — avec un vocabulaire propre
  // à chaque secteur. Une version antérieure nommait tout d'après les régions,
  // ce qui sonnait faux et se répétait au bout de douze acteurs.
  const names = createNameFactory([sessionId, sectorKey, 'ecosystem']);
  const uniqueName = (): string => names.next(sectorKey);

  const buildRounds = (
    base: { revenue: number; capacity: number; priceIndex: number; reliability: number;
            quality: number; health: number; switching: number },
    scenario: Scenario,
    channel: { coverage: number; margin: number; strength: number; service: number; minVolume: number } | null,
  ): ActorRoundSeed[] =>
    Array.from({ length: maxRounds + 1 }, (_, roundNumber) => {
      const t = trajectory(scenario, roundNumber, base);
      return {
        roundNumber,
        revenueMad: Math.round(t.revenue),
        capacityUnits: Math.round(t.capacity),
        priceIndex: Number(t.priceIndex.toFixed(4)),
        reliability: Math.round(t.reliability),
        qualityContribution: Math.round(base.quality),
        coveragePct: channel ? Number(channel.coverage.toFixed(4)) : null,
        requiredMarginPct: channel ? Number(channel.margin.toFixed(4)) : null,
        serviceLevel: channel ? channel.service : null,
        negotiatingStrength: channel ? channel.strength : null,
        minimumVolume: channel ? Math.round(channel.minVolume) : 0,
        switchingCost: Math.round(base.switching),
        financialHealth: Math.round(t.health),
        divestAppetite: Math.round(
          scenario === 'cible_opportune' ? clamp100(45 + 12 * roundNumber) : uniform(rng, 5, 40),
        ),
      };
    });

  const actors: ActorSeed[] = [];

  for (const archetype of SUPPLIER_ARCHETYPES) {
    const scenario = archetype.key === 'discounter' ? 'declin_silencieux' : pick(SCENARIOS);
    const capacity = marketVolumeUnits * uniform(rng, 0.25, 0.6);
    actors.push({
      actorType: 'fournisseur',
      name: uniqueName(),
      regionKey: pick(regions),
      archetype: archetype.key,
      scenario,
      scenarioTriggerRound: scenario === 'choc_exogene' ? Math.ceil(uniform(rng, 2, maxRounds)) : null,
      rounds: buildRounds(
        { revenue: capacity * uniform(rng, 40, 90), capacity,
          priceIndex: archetype.priceIndex, reliability: archetype.reliability,
          quality: archetype.quality, health: uniform(rng, 55, 90),
          switching: archetype.switching },
        scenario, null),
    });
  }

  for (const archetype of DISTRIBUTOR_ARCHETYPES) {
    const scenario = pick(SCENARIOS);
    actors.push({
      actorType: 'distributeur',
      name: uniqueName(),
      regionKey: pick(regions),
      archetype: archetype.key,
      scenario,
      scenarioTriggerRound: null,
      rounds: buildRounds(
        { revenue: marketVolumeUnits * uniform(rng, 30, 80), capacity: marketVolumeUnits,
          priceIndex: 1, reliability: 80, quality: 60, health: uniform(rng, 60, 92), switching: 30 },
        scenario,
        { coverage: archetype.coverage, margin: archetype.margin, strength: archetype.strength,
          service: archetype.service,
          // Le volume minimal est proportionnel au marché : la grande surface
          // nationale reste inaccessible à une petite équipe.
          minVolume: marketVolumeUnits * archetype.minVolumeFactor }),
    });
  }

  for (let i = 0; i < 2; i += 1) {
    actors.push({
      actorType: 'partenaire_techno',
      name: uniqueName(),
      regionKey: pick(regions),
      archetype: 'partenaire_technologique',
      scenario: 'croissance_stable',
      scenarioTriggerRound: null,
      rounds: buildRounds(
        { revenue: marketVolumeUnits * uniform(rng, 5, 15), capacity: marketVolumeUnits * 0.1,
          priceIndex: 1.1, reliability: 85, quality: 88, health: uniform(rng, 70, 95), switching: 55 },
        'croissance_stable', null),
    });
  }

  for (let i = 0; i < 2; i += 1) {
    actors.push({
      actorType: 'cible_acquisition',
      name: uniqueName(),
      regionKey: pick(regions),
      archetype: 'cible',
      scenario: 'cible_opportune',
      scenarioTriggerRound: null,
      rounds: buildRounds(
        { revenue: marketVolumeUnits * uniform(rng, 8, 25), capacity: marketVolumeUnits * uniform(rng, 0.05, 0.15),
          priceIndex: 1, reliability: 70, quality: 62, health: uniform(rng, 30, 60), switching: 40 },
        'cible_opportune', null),
    });
  }

  return actors;
}
