/**
 * ATLAS — formatage. Importable côté client (aucune logique de moteur ici).
 *
 * Convention imposée (doc 00 §11) : stockage en `MAD`, affichage en **DH**,
 * espace insécable fine comme séparateur de milliers — « 1 234 567 DH ».
 */

const NBSP = ' ';

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** « 1 234 567 DH ». Arrondi à l'unité : le centime n'a pas de sens ici. */
export function formatMad(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `${sign}${groupThousands(Math.abs(rounded).toString())}${NBSP}DH`;
}

/**
 * Montants d'entreprise : « 12,4 M DH », « 1,9 Md DH ».
 * Au-delà du million, les chiffres exacts empêchent de comparer d'un coup d'œil.
 */
export function formatMadCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';

  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')}${NBSP}Md${NBSP}DH`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')}${NBSP}M${NBSP}DH`;
  return formatMad(value);
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals).replace('.', ',')}${NBSP}%`;
}

export function formatScore(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(decimals).replace('.', ',');
}

export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return groupThousands(Math.round(value).toString());
}

/**
 * Variation par rapport au tour précédent.
 *
 * Chaque KPI affiché DOIT montrer sa variation, jamais une valeur brute isolée
 * (doc 00 §8). Le signe est explicite en plus de la couleur : l'information ne
 * doit pas reposer sur la seule teinte.
 */
export interface Delta {
  value: number;
  label: string;
  direction: 'up' | 'down' | 'flat';
}

export function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
  format: (v: number) => string = (v) => formatScore(v, 1),
): Delta | null {
  if (
    current === null || current === undefined || !Number.isFinite(current) ||
    previous === null || previous === undefined || !Number.isFinite(previous)
  ) {
    return null;
  }

  const diff = current - previous;
  if (Math.abs(diff) < 1e-9) return { value: 0, label: '=', direction: 'flat' };

  return {
    value: diff,
    label: `${diff > 0 ? '↑ +' : '↓ −'}${format(Math.abs(diff))}`,
    direction: diff > 0 ? 'up' : 'down',
  };
}

/**
 * Variation en points de part de marché : « ↑ +5,2 » / « ↓ −6,4 ».
 *
 * Le signe et la flèche sont explicites en plus de la couleur — l'information
 * ne doit jamais reposer sur la seule teinte, a fortiori sur un vidéoprojecteur
 * qui délave les contrastes.
 */
export function formatSharePoints(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return '—';
  const points = Math.abs(delta * 100).toFixed(1).replace('.', ',');
  return `${delta >= 0 ? '↑ +' : '↓ −'}${points}`;
}

const STRATEGY_LABELS: Record<string, string> = {
  domination_couts: 'Domination par les coûts',
  differenciation: 'Différenciation',
  focus_couts: 'Concentration — coûts',
  focus_differenciation: 'Concentration — différenciation',
  specialisation: 'Spécialisation',
  integration_verticale: 'Intégration verticale',
  diversification_liee: 'Diversification liée',
  diversification_conglomerale: 'Diversification conglomérale',
  fonctionnelle: 'Fonctionnelle',
  divisionnelle: 'Divisionnelle',
  matricielle: 'Matricielle',
};

export function strategyLabel(key: string): string {
  return STRATEGY_LABELS[key] ?? key;
}

const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  onboarding: 'Onboarding (T0)',
  round_active: 'Tour en cours',
  round_locked: 'Tour verrouillé',
  round_resolving: 'Calcul en cours',
  round_resolved: 'Résultats publiés',
  completed: 'Session terminée',
};

export function sessionStatusLabel(key: string): string {
  return SESSION_STATUS_LABELS[key] ?? key;
}

const TREASURY_LABELS: Record<string, string> = {
  sain: 'Saine',
  surveillance: 'Sous surveillance',
  restructuration: 'En restructuration',
  liquidation: 'En liquidation',
};

export function treasuryLabel(key: string): string {
  return TREASURY_LABELS[key] ?? key;
}
