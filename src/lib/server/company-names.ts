import 'server-only';

/**
 * ATLAS — génération des raisons sociales de l'écosystème.
 *
 * ⚠️ TOUS LES ACTEURS SONT FICTIFS. Aucun nom ne désigne une entreprise réelle,
 * et aucune donnée n'est attribuée à une société existante. Ce module compose
 * des noms VRAISEMBLABLES à partir de morphologies observées dans le tissu
 * économique marocain, sans jamais recopier une raison sociale.
 *
 * Une version antérieure nommait les acteurs d'après les régions — « Sebou
 * Holding », « Tensift Comptoir ». Le résultat sonnait faux et se répétait :
 * douze toponymes pour cent acteurs. Les entreprises marocaines réelles
 * relèvent en fait de quatre registres bien distincts :
 *
 *   1. PATRONYMIQUE      « Sefrioui Industries », « Groupe Bennani »
 *   2. SIGLE             « SOMACIM », « SNEPCO » — très courant dans l'industrie
 *   3. DESCRIPTIF        « Comptoir Métallurgique du Sud », « Aluminium du Maroc »
 *   4. ARABE / MODERNE   « Al Amane Distribution », « Nakhil Agro », « Involia »
 *
 * Le générateur mélange les quatre, avec un vocabulaire propre à chaque secteur :
 * un fournisseur d'agro ne doit pas s'appeler comme une SSII.
 */

import { makeRng, seedFrom } from '@/lib/engine/math';

/** Patronymes marocains courants, utilisés comme marques d'entreprise. */
const PATRONYMES = [
  'Sefrioui', 'Bennani', 'Berrada', 'Lahlou', 'Alami', 'Tazi', 'Kettani',
  'Cherkaoui', 'Amrani', 'Idrissi', 'Naciri', 'Ouazzani', 'Mekouar', 'Zniber',
  'Bouazza', 'Skalli', 'Fassi', 'Chraibi', 'Benslimane', 'Guessous',
  'Lamrani', 'Sqalli', 'Belkadi', 'Hakkaoui', 'Tahiri', 'Benkirane',
  'Slaoui', 'Bencheikh', 'Rachidi', 'Filali',
];

/** Racines arabes usuelles dans les raisons sociales. */
const RACINES_ARABES = [
  'Al Amane', 'Al Manar', 'Dar Assalam', 'Nakhil', 'Yasmine', 'Nour',
  'Al Boustane', 'Rissala', 'Al Wifak', 'Sahara Nour', 'Zitoune', 'Al Khaima',
  'Bab Rayan', 'Riad Al Andalous', 'Assalam', 'Al Firdaous',
];

/** Formes modernes : coinages courts, à la manière des groupes récents. */
const COINAGES = [
  'Involia', 'Maghrelia', 'Netixa', 'Optima', 'Verdania', 'Solaris',
  'Novatis', 'Cerelia', 'Textilia', 'Deltia', 'Arkam', 'Zenith',
  'Averia', 'Palmis', 'Ondia', 'Karam',
];

/** Suffixes juridiques ou d'activité, par registre. */
const SUFFIXES_GENERIQUES = [
  'Industries', 'Groupe', 'Holding', 'Négoce', 'Compagnie', 'Partenaires',
  'Développement', 'Services', 'Trading', 'International',
];

/** Vocabulaire descriptif par secteur — c'est lui qui donne sa couleur au nom. */
const DESCRIPTIFS: Record<string, string[]> = {
  agro: ['Conserves', 'Semences', 'Huileries', 'Minoteries', 'Agro-Transformation',
         'Coopérative Agricole', 'Comptoir Céréalier', 'Laiteries', 'Primeurs'],
  btp: ['Matériaux', 'Bétons', 'Travaux Publics', 'Charpentes', 'Comptoir Métallurgique',
        'Préfabriqué', 'Génie Civil', 'Carrières', 'Aciers'],
  tourisme: ['Hôtellerie', 'Resorts', 'Voyages', 'Réceptif', 'Loisirs',
             'Résidences', 'Événementiel', 'Transport Touristique'],
  equipement: ['Équipements', 'Machines-Outils', 'Manutention', 'Pièces Techniques',
               'Comptoir Industriel', 'Maintenance', 'Hydraulique', 'Levage'],
  retail: ['Distribution', 'Grande Distribution', 'Cash & Carry', 'Approvisionnement',
           'Centrale d’Achat', 'Libre-Service', 'Commerce'],
  textile: ['Confection', 'Filatures', 'Bonneterie', 'Tissages', 'Maille',
            'Textile Technique', 'Habillement', 'Teintures'],
  energie: ['Énergies', 'Solaire', 'Éolien', 'Efficacité Énergétique',
            'Ingénierie Énergétique', 'Réseaux', 'Photovoltaïque'],
  numerique: ['Systèmes', 'Ingénierie Logicielle', 'Data', 'Cloud', 'Digital',
              'Solutions', 'Consulting IT', 'Cybersécurité'],
};

/** Fragments de sigles, composés en 2 ou 3 syllabes. */
const SIGLE_TETES = ['SO', 'CO', 'MA', 'SI', 'NO', 'AL', 'TRA', 'PRO', 'UNI', 'GE'];
const SIGLE_CORPS = ['MA', 'CI', 'NE', 'DI', 'TEX', 'FER', 'BAT', 'GRA', 'VER', 'LAC'];
const SIGLE_QUEUES = ['CO', 'SA', 'MAR', 'IND', 'TEC', 'PRO', 'EX', 'AL'];

export type NameRegister = 'patronymique' | 'sigle' | 'descriptif' | 'arabe' | 'moderne';

/**
 * Fabrique de noms déterministe et sans répétition.
 *
 * Le tirage est seedé : rejouer un provisionnement redonne le même écosystème,
 * ce qui permet de comparer deux promotions sur exactement le même terrain.
 */
export function createNameFactory(seedParts: (string | number)[]) {
  const rng = makeRng(seedFrom(...seedParts));
  const used = new Set<string>();

  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];

  function compose(sectorKey: string): string {
    const descriptifs = DESCRIPTIFS[sectorKey] ?? SUFFIXES_GENERIQUES;

    // Les cinq registres sont tirés avec des poids : le patronymique et le
    // descriptif dominent le tissu réel, les coinages restent minoritaires.
    const draw = rng();
    if (draw < 0.30) {
      return `${pick(PATRONYMES)} ${pick(descriptifs)}`;
    }
    if (draw < 0.50) {
      return `${pick(descriptifs)} ${rng() < 0.5 ? 'du Maroc' : 'Maghreb'}`;
    }
    if (draw < 0.68) {
      return `${pick(SIGLE_TETES)}${pick(SIGLE_CORPS)}${pick(SIGLE_QUEUES)}`;
    }
    if (draw < 0.86) {
      return `${pick(RACINES_ARABES)} ${pick(descriptifs)}`;
    }
    return `${pick(COINAGES)} ${pick(SUFFIXES_GENERIQUES)}`;
  }

  return {
    /** Un nom unique pour ce secteur. Jamais deux fois le même dans une session. */
    next(sectorKey: string): string {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const name = compose(sectorKey);
        if (!used.has(name)) {
          used.add(name);
          return name;
        }
      }
      // Filet de sécurité : un suffixe numérique plutôt qu'une collision.
      const fallback = `${compose(sectorKey)} ${used.size + 1}`;
      used.add(fallback);
      return fallback;
    },
  };
}

/**
 * Noms d'entreprises pour les ÉQUIPES, quand le facilitateur n'en fournit pas.
 * Registre volontairement plus corporate : ce sont des groupes, pas des PME.
 */
export function defaultTeamNames(count: number, seed: string): string[] {
  const rng = makeRng(seedFrom(seed, 'teams'));
  const pool = [...PATRONYMES];
  const suffixes = ['Group', 'Holding', 'Industries', 'Corporation', 'Partners', 'Invest'];
  const names: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    const [patronyme] = pool.splice(index, 1);
    names.push(`${patronyme} ${suffixes[i % suffixes.length]}`);
  }
  return names;
}
