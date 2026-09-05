/**
 * ATLAS — glossaire des termes techniques.
 *
 * ── POURQUOI LES TERMES EXACTS ─────────────────────────────────────────────
 * L'interface disait « ce que tout cela a coûté » là où la discipline dit
 * CHARGES D'EXPLOITATION, et « ce que votre outil rapporte » pour la
 * RENTABILITÉ ÉCONOMIQUE. L'intention était bonne — ne pas larguer une équipe
 * de première année — mais le résultat était l'inverse de l'objectif :
 *
 *   • une paraphrase ne s'apprend pas. Une équipe qui a joué six tours sur
 *     « ce qui reste une fois tout payé » ne sait toujours pas lire un compte
 *     de résultat, et c'est pourtant l'objet du jeu ;
 *   • elle ne se cherche pas. On ne peut ni la retrouver dans un manuel, ni la
 *     dire en soutenance, ni la comparer à ce qu'un enseignant écrit au
 *     tableau ;
 *   • elle est AMBIGUË. « Ce que votre argent coûte » désigne aussi bien le
 *     coût de la dette que le coût moyen pondéré du capital — deux notions
 *     différentes, dont l'une est au programme.
 *
 * Le terme exact est donc affiché, et l'explication vient AU SURVOL : la
 * définition en une phrase, puis un exemple chiffré. On apprend le vocabulaire
 * en le lisant, sans jamais rester bloqué devant.
 *
 * Chaque entrée porte les deux. Un terme sans exemple est une définition de
 * dictionnaire — elle n'apprend rien à qui ne comprend pas déjà.
 */

export interface GlossaryEntry {
  /** Définition en une phrase, sans jargon secondaire. */
  definition: string;
  /** Exemple CHIFFRÉ. C'est lui qui fait comprendre, pas la définition. */
  example: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Compte de résultat ───────────────────────────────────────────────────
  "Chiffre d'affaires": {
    definition: 'La valeur totale de ce que vous avez vendu sur le tour, avant toute déduction.',
    example: '2 millions d’unités vendues à 950 DH font 1,90 Md DH de chiffre d’affaires.',
  },
  "Charges d'exploitation": {
    definition:
      'Tout ce que coûte l’activité du tour : achats, personnel, marketing, R&D, frais de siège et amortissements.',
    example:
      'Sur 100 DH vendus, 82 DH de charges laissent 18 DH de résultat d’exploitation.',
  },
  'Résultat net': {
    definition:
      'Ce qui reste du chiffre d’affaires après toutes les charges, les intérêts et l’impôt. C’est le résultat qui appartient aux actionnaires.',
    example:
      'Un résultat d’exploitation de 180 M DH, moins 30 M d’intérêts et 45 M d’impôt, donne 105 M DH de résultat net.',
  },
  "Flux de trésorerie d'exploitation": {
    definition:
      'L’argent réellement entré en caisse. Il diffère du résultat net : les amortissements ne sortent pas de caisse, les investissements et le besoin en fonds de roulement en sortent.',
    example:
      'Un résultat net de 105 M DH avec 200 M d’investissement donne un flux négatif : bénéficiaire sur le papier, à court de liquidités.',
  },
  "Marge d'exploitation": {
    definition:
      'La part du chiffre d’affaires qui subsiste après les charges d’exploitation, avant intérêts et impôt.',
    example: '18 % signifie 18 DH de marge pour 100 DH vendus.',
  },

  // ── Structure financière ─────────────────────────────────────────────────
  'Dette financière': {
    definition: 'Le capital restant dû aux banques, hors intérêts à venir.',
    example: 'Deux crédits de 3 Md et 1,5 Md, dont 500 M remboursés, laissent 4 Md DH.',
  },
  "Ratio d'endettement": {
    definition:
      'La dette financière rapportée aux capitaux propres. Il mesure la part du financement qui vient des banques plutôt que des actionnaires.',
    example:
      '4 Md de dette pour 8 Md de capitaux propres font 50 % : un dirham emprunté pour deux dirhams apportés.',
  },
  'Coût de la dette': {
    definition:
      'Le taux d’intérêt moyen effectivement payé sur l’encours. Il monte avec l’endettement et avec la dégradation de la trésorerie.',
    example: '4 Md de dette à 6,5 % coûtent 260 M DH d’intérêts sur le tour.',
  },
  'Rentabilité économique': {
    definition:
      'Ce que rapporte l’outil industriel avant de savoir comment il est financé : résultat d’exploitation rapporté aux capitaux employés.',
    example: '180 M DH de résultat pour 2 Md de capitaux employés font 9 %.',
  },
  'Effet de levier': {
    definition:
      'Le mécanisme par lequel l’endettement amplifie la rentabilité des actionnaires — dans les deux sens. Il joue en votre faveur tant que la rentabilité économique dépasse le coût de la dette.',
    example:
      'Une rentabilité de 9 % avec une dette à 6,5 % enrichit l’actionnaire. À 11 % de coût, elle l’appauvrit.',
  },
  'Besoin en fonds de roulement': {
    definition:
      'L’argent immobilisé par le cycle d’exploitation : les clients paient après, les fournisseurs veulent être payés avant.',
    example:
      '110 jours de délai sur 5 Md DH de chiffre d’affaires immobilisent environ 1,5 Md DH en permanence.',
  },
  'Capitaux employés': {
    definition:
      'Les moyens durablement engagés dans l’activité : l’outil de production installé, plus le besoin en fonds de roulement.',
    example:
      'Une capacité valorisée 1,8 Md et un BFR de 200 M font 2 Md DH de capitaux employés.',
  },

  // ── Alignement ───────────────────────────────────────────────────────────
  "Indice d'alignement": {
    definition:
      'La cohérence entre ce que vous déclarez vouloir faire et ce que vos décisions font réellement. Il ne mesure pas la performance.',
    example:
      'Déclarer une différenciation puis régler le prix à 20 sur 100 et couper la R&D fait chuter l’indice de 30 points, même si vous gagnez des parts.',
  },
  'Alignement business': {
    definition:
      'La cohérence propre à un domaine : prix, qualité, coûts, échelle, organisation, comparés au profil de la stratégie déclarée.',
    example:
      'Une domination par les coûts vise un prix à 22 sur 100 et une efficience à 88. S’en écarter coûte des points.',
  },
  'Alignement corporate': {
    definition:
      'La cohérence du portefeuille et de la structure : étendue des métiers, proximité entre eux, centralisation, mutualisation, intégration verticale.',
    example:
      'Une structure fonctionnelle avec cinq métiers différents perd 15 points : une direction unique ne peut pas les piloter.',
  },
  'Alignement aux directives': {
    definition:
      'La conformité d’un domaine aux arbitrages du Groupe : rôle dans le portefeuille, mutualisation, fonctions au siège, identité.',
    example:
      'Un domaine déclaré « moteur » qui pèse 30 % du chiffre d’affaires doit capter environ 54 % de l’investissement.',
  },
  'Milieu de gué': {
    definition:
      'Un domaine dont les décisions ne correspondent à AUCUNE stratégie cohérente : ni assez bon marché pour gagner sur les coûts, ni assez distinctif pour justifier un premium.',
    example:
      'Un prix à 60, une qualité à 55 et une R&D à 40 ne servent aucune des quatre stratégies : 12 points de malus.',
  },
  'Dérive stratégique': {
    definition:
      'Des décisions cohérentes — mais avec une AUTRE stratégie que celle annoncée. Une faute de lucidité, non de gestion : re-déclarer au tour suivant l’efface sans coût.',
    example:
      'Vous déclarez une domination par les coûts et exécutez une différenciation : 6 points, effaçables.',
  },
  'Prime de marge': {
    definition:
      'Le bonus de marge accordé à une entreprise cohérente. C’est ce qui permet de perdre des parts de marché et de rester la plus profitable de son pool.',
    example: 'Un indice de 90 rapporte environ 4 points de marge supplémentaires.',
  },

  // ── Marché ───────────────────────────────────────────────────────────────
  'Part de marché': {
    definition:
      'La fraction du marché du domaine que vous captez. Elle est à somme nulle : ce qu’une équipe gagne, une autre le perd.',
    example: 'Trois équipes à 33 % chacune ne laissent rien à une quatrième sans qu’elles cèdent.',
  },
  'Marché adressable': {
    definition:
      'La part du marché que vos segments servis vous ouvrent réellement. Servir un segment de plus l’élargit ; n’en servir qu’un le restreint.',
    example:
      'Ne servir que le premium bio, à 10 % du marché, plafonne vos ventes à 10 % du volume total.',
  },
  'Positionnement prix': {
    definition:
      'Votre prix exprimé en pourcentage du prix de marché. 0 vend à 60 % du marché, 50 au prix du marché, 100 à 140 %.',
    example: 'Un positionnement à 25 vend à 80 % du prix de marché.',
  },
  'Élasticité prix': {
    definition:
      'La sensibilité de la demande au prix. Plus elle est forte, plus un écart au prix médian déplace de volume.',
    example:
      'À élasticité 2, vendre 10 % sous le marché fait gagner deux fois plus de compétitivité qu’à élasticité 1.',
  },
  'Barrière à l’entrée': {
    definition:
      'Ce qui protège les entreprises installées d’un nouvel entrant : capital requis, savoir-faire, licences, réseau constitué.',
    example:
      'Une barrière élevée pénalise une arrivée au tour 4 — l’acquisition est le moyen de la contourner.',
  },
  'Menace des substituts': {
    definition:
      'Le risque que la demande se déplace vers une autre réponse au même besoin, hors de votre filière.',
    example:
      'Dans le textile la pression atteint 80 sur 100 — le substitut est le même vêtement fabriqué ailleurs. Dans le BTP elle tombe à 20 : on ne remplace pas un ouvrage.',
  },
  'Taux de rupture': {
    definition:
      'La part de la demande que vous n’avez pas pu servir faute de capacité. Elle dégrade votre notoriété au tour suivant.',
    example:
      'Une demande de 12 M d’unités pour 10 M de capacité laisse 17 % de rupture.',
  },
  'Taux d’utilisation': {
    definition:
      'La part de votre capacité effectivement employée. En dessous du seuil de rentabilité, les coûts fixes ne sont plus absorbés.',
    example:
      'Une usine à 55 % d’utilisation supporte des coûts fixes calibrés pour 100 %.',
  },

  // ── Filière ──────────────────────────────────────────────────────────────
  'Intégration verticale': {
    definition:
      'Le contrôle des maillons amont ou aval de votre propre filière, par contrat ou par rachat.',
    example:
      'Racheter un distributeur couvrant 50 % du territoire fait passer votre contrôle du canal de 40 à 100, et supprime les 22 % de marge qu’il prélevait.',
  },
  'Intégration amont': {
    definition:
      'Le rachat d’un fournisseur. Sa marge cesse de sortir de la maison et votre approvisionnement est sécurisé.',
    example:
      'Un fournisseur intégré rend plus qu’une remise de volume, qui plafonne à 18 %.',
  },
  'Intégration aval': {
    definition:
      'Le rachat d’un distributeur. Sa couverture rejoint votre réseau propre et il ne prélève plus de marge.',
    example:
      'Un distributeur couvrant 50 % du territoire fait passer votre contrôle du canal de 40 à 100.',
  },
  'Pouvoir de négociation': {
    definition:
      'Votre capacité à imposer vos conditions à un fournisseur ou un distributeur. Il dépend du volume que vous pesez chez lui et des alternatives dont vous disposez.',
    example:
      'Engager 40 % de la capacité d’un fournisseur qui a quatre concurrents crédibles obtient une remise proche du maximum.',
  },
  'Couverture de distribution': {
    definition:
      'La part du territoire où votre offre est disponible. Elle plafonne votre part de marché : on ne vend pas là où on n’est pas distribué.',
    example:
      'Deux distributeurs couvrant chacun 50 % ne couvrent pas 100 % : leurs zones se recoupent.',
  },

  // ── Ressources humaines ──────────────────────────────────────────────────
  'Climat social': {
    definition:
      'L’état du corps social : charge de travail, rémunération, formation, brutalité des restructurations. Il commande la rotation, donc la compétence.',
    example:
      'Licencier 10 % de l’effectif coûte une dizaine de points de climat, qui se répercutent deux tours plus tard sur la productivité.',
  },
  'Indice de compétence': {
    definition:
      'Le niveau de maîtrise moyen des équipes. La formation le fait monter, le recrutement externe et la rotation le diluent.',
    example:
      'Recruter 20 % d’effectif en externe dilue l’indice de plusieurs points le temps de l’intégration.',
  },
  'Indice de charge': {
    definition:
      'Le rapport entre la demande à produire et ce que l’effectif peut absorber. 100 signifie un équilibre exact.',
    example: 'Un indice à 140 signifie 40 % de travail de plus que l’effectif ne peut porter.',
  },
  'Masse salariale': {
    definition:
      'Le coût complet du personnel : salaires bruts et charges patronales, sur l’ensemble du tour.',
    example: '68 000 personnes à 5 800 DH bruts mensuels représentent environ 5,7 Md DH par an.',
  },
  'Indemnité de licenciement': {
    definition:
      'Le coût légal d’une rupture, fonction de l’ancienneté. Il se paie d’avance, alors que l’économie de masse salariale n’arrive qu’après.',
    example:
      'Licencier 500 personnes ayant huit ans d’ancienneté coûte immédiatement plusieurs dizaines de millions.',
  },
  // ── Effectifs et pilotage social ─────────────────────────────────────────
  'Effectif de départ': {
    definition: 'Le nombre de personnes en poste à l’ouverture de l’exercice, avant tout mouvement.',
    example: 'Un domaine ouvrant à 24 000 personnes qui en recrute 400 et en perd 150 clôture à 24 250.',
  },
  "Variation d'effectif": {
    definition:
      'Le solde des mouvements décidés sur le tour : recrutements et transferts entrants, moins départs et licenciements.',
    example: '+400 recrutements et −150 licenciements donnent une variation de +250.',
  },
  'Effectif de clôture': {
    definition: 'Le nombre de personnes en poste à la fin de l’exercice, après tous les mouvements.',
    example: '24 000 en ouverture et +250 de variation donnent 24 250 en clôture.',
  },
  'Salaire brut moyen': {
    definition:
      'Le salaire mensuel brut moyen versé, avant charges patronales. Il commande le climat social et le coût des indemnités.',
    example: 'Payer 6 500 DH plutôt que 5 800 améliore le climat, et alourdit la masse salariale de 12 %.',
  },
  'Charges patronales': {
    definition:
      'Les cotisations versées par l’employeur en plus du salaire brut. Elles s’ajoutent au coût réel de chaque poste.',
    example: 'Un salaire brut de 5 800 DH coûte environ 7 000 DH une fois les charges ajoutées.',
  },
  'SMIG': {
    definition:
      'Le salaire minimum légal. Descendre en dessous est impossible ; s’en approcher dégrade le climat social.',
    example: 'Un salaire moyen à 1,2 fois le SMIG situe l’entreprise parmi les moins-disantes de son pool.',
  },
  'Budget de formation': {
    definition:
      'La somme consacrée à la montée en compétence. Son effet est différé et partiellement remboursable par l’OFPPT.',
    example: 'Consacrer 3 % de la masse salariale à la formation fait gagner plusieurs points de compétence.',
  },
  'Taux de rotation': {
    definition:
      'La part de l’effectif qui quitte l’entreprise sur le tour. Elle emporte d’abord les plus qualifiés.',
    example: 'Un taux de 18 % sur 24 000 personnes fait partir 4 300 salariés, dont les mieux formés.',
  },
  'Productivité par tête': {
    definition: 'Le nombre d’unités qu’une personne produit sur le tour, standardisation et automatisation comprises.',
    example: 'Une capacité de 12 M d’unités pour 24 000 personnes donne 500 unités par tête.',
  },
  'Niveau de standardisation': {
    definition:
      'Le degré d’uniformisation des procédés, issu des ressources mutualisées effectivement adoptées. C’est le seul chemin par lequel un effectif se réduit sans perte de qualité.',
    example: 'Un niveau de 60 autorise environ 10 % de postes en moins à qualité constante.',
  },
  "Niveau d'automatisation": {
    definition:
      'La part du processus prise en charge par la machine. Elle abaisse le coût variable, alourdit les coûts fixes, et inquiète le corps social quand elle progresse vite.',
    example: 'Passer de 30 à 55 en un tour abaisse le coût unitaire et coûte une dizaine de points de climat.',
  },
};

/**
 * Recherche insensible à la forme de l'apostrophe.
 *
 * Le français typographique écrit « chiffre d’affaires » avec U+2019, le code
 * tape souvent « d'affaires » avec l'apostrophe droite. Les deux se ressemblent
 * à l'œil et diffèrent à l'octet : une clé écrite d'une façon et appelée de
 * l'autre ne correspond à rien, silencieusement. C'est exactement le genre
 * d'écart qui ne se voit qu'en salle, devant une infobulle qui n'apparaît pas.
 *
 * On normalise donc au lieu de compter sur la discipline.
 */
const normalise = (s: string) => s.replace(/[\u2018\u2019\u02BC]/g, "'").trim().toLowerCase();

const INDEX = new Map(Object.entries(GLOSSARY).map(([k, v]) => [normalise(k), v]));

export function lookup(term: string): GlossaryEntry | undefined {
  return INDEX.get(normalise(term));
}

/** Le terme est-il documenté ? Sert au test de couverture. */
export function isDefined(term: string): boolean {
  return INDEX.has(normalise(term));
}
