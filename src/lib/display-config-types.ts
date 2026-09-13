/**
 * ATLAS — configuration d'affichage, types et valeurs par défaut.
 *
 * Module pur, sans dépendance serveur : le panneau `/admin/config` (client)
 * et le cockpit l'importent tels quels, comme `security-config-types.ts`.
 *
 * ── RIEN N'EST SUPPRIMÉ, TOUT EST RANGÉ ────────────────────────────────────
 * Masquer une section retire son onglet du cockpit, pas ses données : elles
 * restent calculées, exportées, et réapparaissent à l'identique dès que la
 * section est rallumée.
 */

export type DashboardSectionKey =
  | 'sante'
  | 'portefeuille'
  | 'strategie'
  | 'concurrence'
  | 'matrices';

/**
 * Niveau de lecture du cockpit. Ce ne sont PAS des rôles : chaque membre d'une
 * équipe choisit la profondeur qui lui convient au moment où il consulte.
 */
export type ViewLevel = 'pilote' | 'gestionnaire' | 'analyste';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type FontScale = 'standard' | 'grand';

export interface DisplayConfig {
  sections: Record<DashboardSectionKey, boolean>;
  /** « Vous disposez de » et « Il vous reste » dans la barre d'argent. */
  showBudget: boolean;
  /** Crédit tiré ce tour et crédits en cours. */
  showCredits: boolean;
  defaultView: ViewLevel;
  theme: ThemeChoice;
  fontScale: FontScale;
}

export const DASHBOARD_SECTIONS: ReadonlyArray<{
  key: DashboardSectionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'sante',
    label: 'Santé du Groupe',
    description: 'Trésorerie, chiffre d’affaires, résultat, marge, climat social — et leur trajectoire.',
  },
  {
    key: 'portefeuille',
    label: 'Portefeuille',
    description: 'Poids et marge de chaque domaine, et la trajectoire du domaine piloté.',
  },
  {
    key: 'strategie',
    label: 'Stratégie',
    description: 'Cohérence stratégique : indice d’alignement, audit du cabinet, axes les plus coûteux.',
  },
  {
    key: 'concurrence',
    label: 'Concurrence',
    description: 'Parts de marché des équipes de la ligue, quand l’étude concurrentielle a été achetée.',
  },
  {
    key: 'matrices',
    label: 'Matrices',
    description: 'BCG, Balanced Scorecard, cinq forces de Porter, McKinsey / GE.',
  },
];

export const VIEW_LEVELS: ReadonlyArray<{ key: ViewLevel; label: string; description: string }> = [
  {
    key: 'pilote',
    label: 'Pilote',
    description: 'L’essentiel : quatre indicateurs et ce qui demande votre attention.',
  },
  {
    key: 'gestionnaire',
    label: 'Gestionnaire',
    description: 'Toutes les analyses, rangées par thème et repliées.',
  },
  {
    key: 'analyste',
    label: 'Analyste',
    description: 'Les données brutes, tour par tour, exportables en CSV.',
  },
];

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  sections: { sante: true, portefeuille: true, strategie: true, concurrence: true, matrices: true },
  showBudget: true,
  showCredits: true,
  defaultView: 'gestionnaire',
  theme: 'system',
  fontScale: 'standard',
};

/** Cookie du niveau de lecture choisi : lu par le serveur, donc aucun flash au rechargement. */
export const VIEW_COOKIE = 'atlas.view';
/** Cookie de la navigation latérale repliée. */
export const NAV_COOKIE = 'atlas.nav';
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const VIEW_KEYS = new Set<string>(VIEW_LEVELS.map((v) => v.key));

export function parseViewLevel(value: unknown): ViewLevel | null {
  return typeof value === 'string' && VIEW_KEYS.has(value) ? (value as ViewLevel) : null;
}

/**
 * Relit un document stocké, clé par clé.
 *
 * Toute clé absente ou mal typée reprend sa valeur par défaut : un document
 * écrit par une version antérieure — ou abîmé à la main — ne doit jamais
 * masquer une section par accident.
 */
export function parseDisplayConfig(raw: unknown): DisplayConfig {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sections = (source.sections && typeof source.sections === 'object'
    ? source.sections
    : {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  return {
    sections: Object.fromEntries(
      DASHBOARD_SECTIONS.map((s) => [s.key, bool(sections[s.key], true)]),
    ) as Record<DashboardSectionKey, boolean>,
    showBudget: bool(source.showBudget, DEFAULT_DISPLAY_CONFIG.showBudget),
    showCredits: bool(source.showCredits, DEFAULT_DISPLAY_CONFIG.showCredits),
    defaultView: parseViewLevel(source.defaultView) ?? DEFAULT_DISPLAY_CONFIG.defaultView,
    theme:
      source.theme === 'light' || source.theme === 'dark' || source.theme === 'system'
        ? source.theme
        : DEFAULT_DISPLAY_CONFIG.theme,
    fontScale: source.fontScale === 'grand' ? 'grand' : 'standard',
  };
}
