/**
 * ATLAS — catalogue des champs de décision activables.
 *
 * Atlas est trop grand pour un atelier de trois heures. Ce catalogue permet de
 * n'en jouer qu'une partie : chaque champ de saisie peut être fermé, et l'écran
 * se raccourcit d'autant. Un écran dont plus rien n'est ouvert disparaît même de
 * la barre de navigation — le jeu rétrécit vraiment, il ne se grise pas.
 *
 * ── TROIS NIVEAUX, ET POURQUOI ─────────────────────────────────────────────
 * Écran → catégorie → champ. La catégorie n'a aucun effet : elle regroupe pour
 * que le panneau de réglage reste lisible à soixante-huit interrupteurs. Ce sont
 * les CHAMPS qui s'ouvrent et se ferment, parce que « garder les RH sans
 * l'organigramme » est exactement le genre d'arbitrage qu'un formateur veut
 * faire et qu'un interrupteur par écran interdit.
 *
 * ── LE NOYAU ───────────────────────────────────────────────────────────────
 * Cinq champs n'ont pas d'interrupteur. Sans stratégie générique, sans prix et
 * sans segments servis, le moteur n'a pas d'assiette pour calculer une part de
 * marché ; sans effectifs, pas de masse salariale ; sans révélation, la séance
 * n'a pas de fin. Les fermer ne simplifierait pas le jeu, il le supprimerait.
 *
 * ── CE QUE DEVIENT UN CHAMP FERMÉ ──────────────────────────────────────────
 * Le calcul ne disparaît pas avec le champ : il lui faut une valeur. C'est
 * `neutral` qui la décrit — et elle ne s'applique qu'à un champ JAMAIS ouvert.
 * Un champ refermé en cours de partie conserve la dernière valeur saisie par
 * l'équipe (voir `server/modules.ts`) : couper les acquisitions au tour 4 ne
 * doit pas dissoudre celles du tour 3.
 *
 * Module pur, sans dépendance serveur : le panneau `"use client"` de /admin s'en
 * sert autant que le résolveur serveur.
 */

/** Poids pédagogique, qui gouverne les préréglages livrés. */
export type ModuleTier = 'noyau' | 'standard' | 'avance';

export interface ModuleField {
  /** Identifiant stable, stocké en base. Ne jamais le renommer. */
  key: string;
  label: string;
  tier: ModuleTier;
  /** Ce que le moteur retient si le champ n'a jamais été ouvert. */
  neutral: string;
  /**
   * Ouvert tant que personne n'a réglé quoi que ce soit. Vrai par défaut.
   *
   * L'absence de ligne vaut OUVERT partout ailleurs, et c'est ce qui rend un
   * champ nouvellement déployé jouable sans créer une ligne par facilitateur et
   * par session. Quelques capacités doivent pourtant s'OPTER : sortir les
   * données du jeu en est une. Un formateur décide de le permettre ; il ne le
   * découvre pas parce que personne ne l'a fermé.
   */
  defaultOpen?: boolean;
}

export interface ModuleCategory {
  key: string;
  label: string;
  fields: readonly ModuleField[];
}

export interface ModuleScreen {
  key: string;
  label: string;
  /** Onglet correspondant : masqué quand aucun champ de l'écran n'est ouvert. */
  href: string;
  categories: readonly ModuleCategory[];
}

export const MODULE_SCREENS: readonly ModuleScreen[] = [
  {
    key: 'strategie',
    label: 'Stratégie du Groupe',
    href: '/strategie',
    categories: [
      {
        key: 'portefeuille',
        label: 'Logique de portefeuille',
        fields: [
          {
            key: 'strategie.corporate_strategy',
            label: 'Stratégie corporate (spécialisation, intégration, diversification)',
            tier: 'standard',
            neutral: 'Spécialisation',
          },
        ],
      },
      {
        key: 'structure',
        label: 'Structure',
        fields: [
          {
            key: 'strategie.structure_type',
            label: 'Forme de structure du Groupe',
            tier: 'standard',
            neutral: 'Fonctionnelle',
          },
        ],
      },
      {
        key: 'centralisation',
        label: 'Fonctions pilotées au siège',
        fields: [
          { key: 'strategie.central_purchasing', label: 'Achats centralisés', tier: 'standard', neutral: 'Décentralisés' },
          { key: 'strategie.central_it', label: 'Informatique centralisée', tier: 'standard', neutral: 'Décentralisée' },
          { key: 'strategie.central_rd', label: 'R&D centralisée', tier: 'standard', neutral: 'Décentralisée' },
          { key: 'strategie.central_hr', label: 'RH centralisées', tier: 'standard', neutral: 'Décentralisées' },
          { key: 'strategie.central_finance', label: 'Finance centralisée', tier: 'standard', neutral: 'Centralisée' },
        ],
      },
      {
        key: 'mutualisation',
        label: 'Mutualisation effective',
        fields: [
          { key: 'strategie.shared_production', label: 'Production partagée', tier: 'avance', neutral: 'Aucune' },
          { key: 'strategie.shared_rd', label: 'R&D mutualisée', tier: 'avance', neutral: 'Aucune' },
        ],
      },
      {
        key: 'identite',
        label: 'Identité du Groupe',
        fields: [
          { key: 'strategie.value1', label: 'Première valeur communiquée', tier: 'standard', neutral: 'Fiabilité de service' },
          { key: 'strategie.value2', label: 'Seconde valeur communiquée', tier: 'standard', neutral: 'Efficience opérationnelle' },
          { key: 'strategie.vision', label: 'Vision du Groupe (texte libre)', tier: 'avance', neutral: 'Non renseignée' },
          { key: 'strategie.mission', label: 'Mission du Groupe (texte libre)', tier: 'avance', neutral: 'Non renseignée' },
        ],
      },
    ],
  },

  {
    key: 'das',
    label: 'Stratégie du DAS',
    href: '/strategie/das',
    categories: [
      {
        key: 'positionnement',
        label: 'Positionnement concurrentiel',
        fields: [
          { key: 'das.generic_strategy', label: 'Stratégie générique', tier: 'noyau', neutral: '—' },
          { key: 'das.price_position', label: 'Positionnement prix', tier: 'noyau', neutral: '—' },
          { key: 'das.served_segments', label: 'Segments servis', tier: 'noyau', neutral: '—' },
        ],
      },
      {
        key: 'investissements',
        label: 'Investissements du tour',
        fields: [
          { key: 'das.capex_capacity', label: 'Outil de production', tier: 'standard', neutral: 'Aucun investissement' },
          { key: 'das.capex_automation', label: 'Automatisation', tier: 'standard', neutral: 'Aucun investissement' },
          { key: 'das.capex_own_network', label: 'Réseau de vente propre', tier: 'avance', neutral: 'Aucun investissement' },
        ],
      },
      {
        key: 'innovation',
        label: 'Innovation',
        fields: [
          { key: 'das.rd_budget', label: 'Budget R&D', tier: 'standard', neutral: 'Aucun budget' },
          { key: 'das.declare_blue_ocean', label: 'Déclaration d’océan bleu', tier: 'avance', neutral: 'Jamais déclaré' },
        ],
      },
      {
        key: 'commercial',
        label: 'Commercial',
        fields: [
          { key: 'das.marketing_budget', label: 'Budget marketing', tier: 'standard', neutral: 'Aucun budget' },
        ],
      },
    ],
  },

  {
    key: 'marches',
    label: 'Achats & distribution',
    href: '/marches',
    categories: [
      {
        key: 'achats',
        label: 'Amont',
        fields: [
          {
            key: 'marches.procurement',
            label: 'Contrats fournisseurs',
            tier: 'standard',
            neutral: 'Approvisionnement au prix du marché, sans contrat',
          },
        ],
      },
      {
        key: 'distribution',
        label: 'Aval',
        fields: [
          {
            key: 'marches.distribution',
            label: 'Contrats distributeurs',
            tier: 'standard',
            neutral: 'Vente directe, sans effet de réseau',
          },
        ],
      },
    ],
  },

  {
    key: 'organisation',
    label: 'Organisation & RH',
    href: '/organisation',
    categories: [
      {
        key: 'directives',
        label: 'Déclinaison des directives du Groupe',
        fields: [
          { key: 'org.portfolio_role', label: 'Rôle du domaine dans le portefeuille', tier: 'standard', neutral: 'Relais' },
          { key: 'org.hq_purchasing', label: 'Adhésion aux achats du siège', tier: 'avance', neutral: 'Non adhérent' },
          { key: 'org.hq_it', label: 'Adhésion à l’informatique du siège', tier: 'avance', neutral: 'Non adhérent' },
          { key: 'org.hq_rd', label: 'Adhésion à la R&D du siège', tier: 'avance', neutral: 'Non adhérent' },
          { key: 'org.hq_hr', label: 'Adhésion aux RH du siège', tier: 'avance', neutral: 'Non adhérent' },
          { key: 'org.hq_finance', label: 'Adhésion à la finance du siège', tier: 'avance', neutral: 'Non adhérent' },
        ],
      },
      {
        key: 'effectifs',
        label: 'Effectifs et rémunération',
        fields: [
          { key: 'org.hire_operateurs', label: 'Recrutement d’opérateurs', tier: 'noyau', neutral: '—' },
          { key: 'org.hire_techniciens', label: 'Recrutement de techniciens', tier: 'noyau', neutral: '—' },
          { key: 'org.hire_experts', label: 'Recrutement d’experts', tier: 'noyau', neutral: '—' },
          { key: 'org.hire_cadres', label: 'Recrutement de cadres', tier: 'noyau', neutral: '—' },
          { key: 'org.layoffs', label: 'Départs', tier: 'noyau', neutral: '—' },
          { key: 'org.avg_salary', label: 'Salaire brut moyen', tier: 'noyau', neutral: '—' },
          { key: 'org.internal_transfers', label: 'Transferts internes entrants', tier: 'avance', neutral: 'Aucun transfert' },
        ],
      },
      {
        key: 'formation',
        label: 'Formation',
        fields: [
          { key: 'org.training_budget', label: 'Budget de formation', tier: 'standard', neutral: 'Aucun budget' },
          { key: 'org.training_focus', label: 'Orientation de la formation', tier: 'standard', neutral: 'Technique' },
          { key: 'org.claim_ofppt', label: 'Réclamation OFPPT', tier: 'avance', neutral: 'Non réclamée' },
          { key: 'org.claim_giac', label: 'Réclamation GIAC', tier: 'avance', neutral: 'Non réclamée' },
          { key: 'org.skills_audit', label: 'Audit de compétences', tier: 'avance', neutral: 'Non commandé' },
        ],
      },
      {
        key: 'restructuration',
        label: 'Restructuration',
        fields: [
          { key: 'org.restructuring', label: 'Opération de restructuration', tier: 'avance', neutral: 'Aucune' },
        ],
      },
      {
        key: 'conception',
        label: 'Conception organisationnelle',
        fields: [
          { key: 'org.delegation', label: 'Niveau de délégation', tier: 'standard', neutral: 'Médian' },
          { key: 'org.axes', label: 'Trois axes stratégiques', tier: 'standard', neutral: 'Aucun axe retenu' },
        ],
      },
      {
        key: 'organigramme',
        label: 'Organigramme',
        fields: [
          { key: 'org.positions', label: 'Postes et niveaux hiérarchiques', tier: 'avance', neutral: 'Aucun poste conçu' },
        ],
      },
      {
        key: 'pilotage',
        label: 'Pilotage par direction',
        fields: [
          { key: 'org.kpis', label: 'Indicateurs suivis par direction', tier: 'avance', neutral: 'Aucun indicateur' },
          { key: 'org.budgets', label: 'Répartition des moyens par direction', tier: 'standard', neutral: 'Répartition égale' },
        ],
      },
      {
        key: 'ressources_partagees',
        label: 'Ressources partagées',
        fields: [
          { key: 'org.shared_resources', label: 'Adhésion aux plateformes mutualisées', tier: 'avance', neutral: 'Aucune adhésion' },
        ],
      },
    ],
  },

  {
    key: 'finance',
    label: 'Finance du Groupe',
    href: '/finance',
    categories: [
      {
        key: 'siege',
        label: 'Siège',
        fields: [
          {
            key: 'finance.opex',
            label: 'Frais de fonctionnement du siège',
            tier: 'standard',
            neutral: 'Aucun frais de siège',
          },
        ],
      },
      {
        key: 'credit',
        label: 'Financement',
        fields: [
          // Un seul champ là où il y en avait deux : tirer et rembourser sont
          // les deux sens du même geste, bornés par la capacité d'endettement.
          { key: 'finance.credit', label: 'Crédit net du tour', tier: 'standard',
            neutral: 'Aucun mouvement de dette' },
          { key: 'finance.capital_raise', label: 'Levée de fonds propres', tier: 'avance',
            neutral: 'Pas d’appel aux actionnaires', defaultOpen: false },
          { key: 'finance.dividend', label: 'Dividende', tier: 'avance',
            neutral: 'Aucune distribution', defaultOpen: false },
          { key: 'finance.cash_pooling', label: 'Transferts de trésorerie entre domaines',
            tier: 'avance', neutral: 'Trésorerie mutualisée sans arbitrage explicite',
            defaultOpen: false },
        ],
      },
    ],
  },

  {
    key: 'cession',
    label: 'Cession & acquisitions',
    href: '/cession',
    categories: [
      {
        key: 'portefeuille',
        label: 'Sortie',
        fields: [
          { key: 'cession.sell', label: 'Mettre un domaine en vente', tier: 'avance', neutral: 'Portefeuille figé' },
        ],
      },
      {
        key: 'acquisition',
        label: 'Entrée',
        fields: [
          { key: 'cession.acquire', label: 'Entrer dans un nouveau domaine', tier: 'avance', neutral: 'Pas de diversification' },
          { key: 'cession.integration', label: 'Intégrer sa filière', tier: 'avance', neutral: 'Pas d’intégration verticale' },
        ],
      },
      {
        key: 'encheres',
        label: 'Marché secondaire',
        fields: [
          { key: 'cession.bid', label: 'Enchérir sur un domaine mis en vente', tier: 'avance', neutral: 'Pas de marché secondaire' },
        ],
      },
    ],
  },

  {
    key: 'cabinet',
    label: 'Cabinet de conseil',
    href: '/cabinet',
    categories: [
      {
        key: 'etudes',
        label: 'Études au catalogue',
        fields: [
          { key: 'cabinet.pestel_sectoriel', label: 'PESTEL sectoriel', tier: 'standard', neutral: 'Hors catalogue' },
          { key: 'cabinet.concurrentielle', label: 'Étude concurrentielle', tier: 'standard', neutral: 'Hors catalogue' },
          { key: 'cabinet.panel_conso', label: 'Panel consommateurs', tier: 'standard', neutral: 'Hors catalogue' },
          { key: 'cabinet.benchmark_fourn', label: 'Benchmark fournisseurs', tier: 'avance', neutral: 'Hors catalogue' },
          { key: 'cabinet.benchmark_distri', label: 'Benchmark distributeurs', tier: 'avance', neutral: 'Hors catalogue' },
          { key: 'cabinet.audit_alignement', label: 'Audit d’alignement', tier: 'standard', neutral: 'Hors catalogue' },
          { key: 'cabinet.due_diligence', label: 'Due diligence', tier: 'avance', neutral: 'Hors catalogue' },
        ],
      },
      {
        key: 'sorties',
        label: 'Sorties de rapport',
        fields: [
          {
            key: 'cabinet.rapport_imprimable',
            label: 'Impression des rapports d’étude',
            tier: 'avance',
            neutral: 'Rapports consultables à l’écran seulement',
            defaultOpen: false,
          },
          {
            key: 'cabinet.export_analytique',
            label: 'Export analytique (table à plat, Power BI)',
            tier: 'avance',
            neutral: 'Rapports consultables à l’écran seulement',
            defaultOpen: false,
          },
        ],
      },
    ],
  },

  {
    key: 'war_room',
    label: 'War Room',
    href: '/war-room',
    categories: [
      {
        key: 'evenements',
        label: 'Crises et opportunités',
        fields: [
          { key: 'warroom.events', label: 'Réponse aux événements', tier: 'standard', neutral: 'Aucun événement déclenché' },
        ],
      },
    ],
  },
];

/** Toutes les clés du catalogue, dans l'ordre d'affichage. */
export const ALL_MODULE_FIELDS: readonly ModuleField[] = MODULE_SCREENS.flatMap((screen) =>
  screen.categories.flatMap((category) => category.fields),
);

const FIELD_BY_KEY = new Map(ALL_MODULE_FIELDS.map((field) => [field.key, field]));

export function moduleField(key: string): ModuleField | undefined {
  return FIELD_BY_KEY.get(key);
}

/** Les champs sans interrupteur : toujours ouverts, où que soit le réglage. */
export const CORE_MODULE_KEYS: ReadonlySet<string> = new Set(
  ALL_MODULE_FIELDS.filter((field) => field.tier === 'noyau').map((field) => field.key),
);

/** Écran auquel appartient un champ — sert à masquer les onglets vides. */
export const SCREEN_BY_FIELD: ReadonlyMap<string, string> = new Map(
  MODULE_SCREENS.flatMap((screen) =>
    screen.categories.flatMap((category) =>
      category.fields.map((field) => [field.key, screen.key] as const),
    ),
  ),
);

/**
 * Préréglages livrés.
 *
 * « Découverte » n'est pas le noyau seul : une séance où l'on ne règle que le
 * prix et les effectifs n'enseigne rien du reste. C'est la plus petite partie
 * qui reste une partie — positionnement, un investissement, un budget
 * marketing, les contrats, la formation, deux études.
 */
export interface ModulePreset {
  key: string;
  label: string;
  description: string;
  fields: readonly string[];
}

const DECOUVERTE_EXTRA = [
  'strategie.corporate_strategy',
  'strategie.value1',
  'strategie.value2',
  'das.capex_capacity',
  'das.marketing_budget',
  'marches.procurement',
  'marches.distribution',
  'org.training_budget',
  'org.training_focus',
  'finance.credit',
  'cabinet.pestel_sectoriel',
  'cabinet.concurrentielle',
  'warroom.events',
];

export const MODULE_PRESETS: readonly ModulePreset[] = [
  {
    key: 'decouverte',
    label: 'Découverte',
    description:
      'La plus petite partie qui reste une partie : positionner, investir, contracter, recruter. Pour une demi-journée ou un public qui n’a jamais joué.',
    fields: [...CORE_MODULE_KEYS, ...DECOUVERTE_EXTRA],
  },
  {
    key: 'standard',
    label: 'Standard',
    description:
      'Tout sauf les modules avancés — ni organigramme, ni acquisitions, ni fiscalité, ni ressources mutualisées. Le calibrage de référence.',
    fields: ALL_MODULE_FIELDS.filter((field) => field.tier !== 'avance').map((f) => f.key),
  },
  {
    key: 'complet',
    label: 'Complet',
    description: 'Tous les champs du catalogue. Pour un cursus long, sur plusieurs séances.',
    fields: ALL_MODULE_FIELDS.map((field) => field.key),
  },
];
