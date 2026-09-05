/**
 * ATLAS — ressources humaines, DAS par DAS.
 *
 * ── POURQUOI PAR DAS ───────────────────────────────────────────────────────
 * Une conserverie et une société de services n'ont ni la même pyramide, ni la
 * même productivité, ni la même sensibilité à la formation. Piloter un effectif
 * unique au niveau du groupe revenait à demander une seule politique salariale
 * pour des métiers qui n'ont rien en commun.
 *
 * ── LA CHAÎNE, EN UNE PHRASE ───────────────────────────────────────────────
 * La demande crée une CHARGE DE TRAVAIL ; l'effectif, la productivité, la
 * standardisation et l'automatisation l'absorbent. Ce qui reste — surcharge ou
 * sous-charge — dégrade le climat social, qui dégrade la productivité du tour
 * suivant. C'est une boucle, et elle est lente : c'est ce qui la rend
 * enseignable.
 *
 * ── CE QUI COÛTE VRAIMENT ──────────────────────────────────────────────────
 * Licencier n'est pas gratuit. Les indemnités suivent l'article 53 du Code du
 * travail marocain, en heures de salaire par année d'ancienneté. Une équipe qui
 * « ajuste ses effectifs » découvre que le geste se paie d'avance, en trésorerie
 * et en climat social, alors que le gain de masse salariale n'arrive qu'après.
 *
 * Module PUR : aucun accès base, aucun aléa.
 */

import { clamp100, mean } from './math';
import { param, type EngineParams } from './params';

// ---------------------------------------------------------------------------
// Indemnités de rupture — article 53 du Code du travail
// ---------------------------------------------------------------------------

/**
 * Heures de salaire dues PAR ANNÉE d'ancienneté, par tranche.
 *
 * Le barème est cumulatif par tranche, comme un barème d'impôt : cinq ans à
 * 96 h, puis les suivantes à 144 h, etc. Appliquer le taux de la tranche
 * atteinte à toute l'ancienneté surestimerait l'indemnité de moitié.
 */
export const SEVERANCE_BRACKETS: { upToYears: number; hoursPerYear: number }[] = [
  { upToYears: 5, hoursPerYear: 96 },
  { upToYears: 10, hoursPerYear: 144 },
  { upToYears: 15, hoursPerYear: 192 },
  { upToYears: Infinity, hoursPerYear: 240 },
];

/** Heures travaillées dans un mois : 44 h/semaine × 52 / 12. */
export const HOURS_PER_MONTH = 191;

/**
 * Indemnité de licenciement d'UN salarié, en dirhams.
 *
 * Inclut le préavis, dû quelle que soit l'ancienneté : l'omettre ferait croire
 * qu'un licenciement récent est presque gratuit.
 */
export function severancePerHead(
  monthlySalaryMad: number,
  seniorityYears: number,
  noticeMonths = 2,
): number {
  let remaining = Math.max(seniorityYears, 0);
  let previousCap = 0;
  let hours = 0;

  for (const bracket of SEVERANCE_BRACKETS) {
    if (remaining <= 0) break;
    const span = Math.min(remaining, bracket.upToYears - previousCap);
    hours += span * bracket.hoursPerYear;
    remaining -= span;
    previousCap = bracket.upToYears;
  }

  const hourlyRate = monthlySalaryMad / HOURS_PER_MONTH;
  return hours * hourlyRate + noticeMonths * monthlySalaryMad;
}

// ---------------------------------------------------------------------------
// Financements publics de la formation
// ---------------------------------------------------------------------------

/**
 * Remboursement OFPPT au titre des Contrats Spéciaux de Formation.
 *
 * L'entreprise cotise 1,6 % de sa masse salariale à la taxe de formation
 * professionnelle ; les CSF lui en restituent une part au prorata des actions
 * engagées. Le plafond est donc adossé à la MASSE SALARIALE, pas au budget de
 * formation : dépenser trois fois son droit de tirage ne rembourse pas trois
 * fois. C'est ce plafond qui rend la décision arbitrable.
 */
export function ofpptReimbursement(
  trainingBudgetMad: number,
  payrollMad: number,
  params: EngineParams,
): number {
  const ceiling = payrollMad * param(params, 'hr.ofppt_payroll_rate');
  const rate = param(params, 'hr.ofppt_reimbursement_rate');
  return Math.min(trainingBudgetMad * rate, ceiling);
}

/**
 * Concours du GIAC sectoriel.
 *
 * Le GIAC ne finance PAS la formation : il finance l'INGÉNIERIE qui la précède
 * — le diagnostic, l'analyse des besoins, le plan. D'où le conditionnement au
 * bilan de compétences. Une équipe qui réclame le GIAC sans avoir commandé de
 * bilan demande un remboursement pour une prestation qu'elle n'a pas faite.
 */
export function giacSupport(
  skillsAuditOrdered: boolean,
  payrollMad: number,
  params: EngineParams,
): number {
  if (!skillsAuditOrdered) return 0;
  return payrollMad * param(params, 'hr.giac_rate');
}

// ---------------------------------------------------------------------------
// Charge de travail
// ---------------------------------------------------------------------------

export interface WorkloadInput {
  /** Volume à produire ce tour, en unités. */
  demandUnits: number;
  headcount: number;
  /** Unités par tête et par tour, hors effets de standardisation. */
  baseProductivity: number;
  standardisationLevel: number;
  automationLevel: number;
  skillIndex: number;
}

/**
 * Indice de charge : 100 = l'effectif absorbe exactement la demande.
 *
 * Standardisation et automatisation réduisent la charge à effectif constant —
 * c'est le lien que la mutualisation rend possible : on ne standardise que ce
 * qu'on a d'abord mutualisé, et c'est la standardisation qui autorise ensuite à
 * réduire l'effectif SANS perdre en qualité.
 *
 * L'automatisation allège plus fort que la standardisation (0,45 contre 0,30) :
 * une machine remplace des heures, une procédure ne fait que les raccourcir.
 */
export function workloadIndex(input: WorkloadInput): number {
  const effectiveHeads = Math.max(input.headcount, 1);

  const relief =
    1 -
    0.30 * (clamp100(input.standardisationLevel) / 100) -
    0.45 * (clamp100(input.automationLevel) / 100);

  // La compétence rend chacun plus efficace, mais dans une fourchette étroite :
  // ±15 %. Sans plancher, un effectif non formé n'aurait plus aucune capacité.
  const skillFactor = 0.85 + 0.30 * (clamp100(input.skillIndex) / 100);

  const capacity = effectiveHeads * input.baseProductivity * skillFactor;
  if (capacity <= 0) return 200;

  return Math.min((input.demandUnits / capacity) * 100 * Math.max(relief, 0.25), 200);
}

// ---------------------------------------------------------------------------
// Climat social
// ---------------------------------------------------------------------------

export interface ClimateInput {
  previousClimat: number;
  workloadIndex: number;
  /** Part de l'effectif recrutée ce tour, 0–1. */
  hiringRatio: number;
  /** Part de l'effectif licenciée ce tour, 0–1. */
  layoffRatio: number;
  /** Budget de formation rapporté à la masse salariale, 0–1. */
  trainingIntensity: number;
  /** Multiplicateur de climat issu de l'orientation de formation. */
  trainingFocusClimat?: number;
  /** Salaire proposé rapporté au salaire du tour précédent. */
  salaryRatio: number;
  automationDelta: number;
  restructuring: 'aucune' | 'reorganisation' | 'externalisation' | 'fermeture_site';
}

/** Coût en points de climat d'une restructuration, par nature. */
export const RESTRUCTURING_CLIMATE_COST = {
  aucune: 0,
  reorganisation: 6,
  externalisation: 18,
  fermeture_site: 30,
} as const;

/**
 * Climat social du tour, entre 0 et 100.
 *
 * Retour à la moyenne délibéré : sans lui, une équipe ayant fauté une fois
 * resterait punie jusqu'à la fin de la partie, et le jeu n'enseignerait plus
 * comment on redresse un climat — seulement comment on le casse.
 */
export function nextClimatSocial(input: ClimateInput, params: EngineParams): number {
  const inertia = param(params, 'hr.climate_inertia');
  let climat = input.previousClimat * inertia + 60 * (1 - inertia);

  // Surcharge : au-delà de 110, chaque point coûte. En deçà de 80, l'ennui et
  // le sentiment d'inutilité coûtent aussi, moitié moins.
  if (input.workloadIndex > 110) {
    climat -= (input.workloadIndex - 110) * 0.35;
  } else if (input.workloadIndex < 80) {
    climat -= (80 - input.workloadIndex) * 0.18;
  }

  // Recruter vite désorganise : au-delà de 20 % de l'effectif en un tour,
  // l'intégration ne suit plus.
  if (input.hiringRatio > 0.20) climat -= (input.hiringRatio - 0.20) * 60;

  // Licencier casse le climat de ceux qui restent, pas seulement de ceux qui
  // partent. Le premier départ coûte déjà, indépendamment du volume.
  if (input.layoffRatio > 0) climat -= 8 + input.layoffRatio * 90;

  climat -= RESTRUCTURING_CLIMATE_COST[input.restructuring];

  // Former et payer améliorent, avec des rendements décroissants.
  climat += Math.min(
    input.trainingIntensity * 220 * (input.trainingFocusClimat ?? 1),
    12,
  );
  climat += Math.max(Math.min((input.salaryRatio - 1) * 45, 10), -18);

  // Automatiser sans former inquiète. Le malus est atténué quand la formation
  // accompagne : c'est exactement le geste qui distingue une modernisation
  // d'un plan social déguisé.
  if (input.automationDelta > 0) {
    const cushioned = Math.min(input.trainingIntensity * 120, 1);
    climat -= input.automationDelta * 0.25 * (1 - cushioned);
  }

  return clamp100(climat);
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * Taux de rotation subie, 0–1.
 *
 * Un climat dégradé fait partir les gens, et ce sont les plus qualifiés qui
 * partent en premier — ils ont un marché. Le taux plancher est incompressible :
 * même une entreprise irréprochable perd des salariés.
 */
export function turnoverRate(
  climatSocial: number,
  skillIndex: number,
  params: EngineParams,
): number {
  const floor = param(params, 'hr.turnover_floor');
  const gap = Math.max(60 - clamp100(climatSocial), 0) / 60;
  const mobility = 0.6 + 0.8 * (clamp100(skillIndex) / 100);
  return Math.min(floor + gap * gap * 0.35 * mobility, 0.6);
}

// ---------------------------------------------------------------------------
// Compétence
// ---------------------------------------------------------------------------

export interface SkillInput {
  previousSkill: number;
  trainingIntensity: number;
  skillsAuditOrdered: boolean;
  /** Multiplicateur issu de l'orientation de formation. 1 = neutre. */
  focusMultiplier?: number;
  hiringRatio: number;
  /** Part de l'effectif recrutée depuis un autre DAS du même groupe, 0–1. */
  internalHiringRatio: number;
  turnoverRate: number;
}

/**
 * Indice de compétence du tour suivant, 0–100.
 *
 * Trois enseignements y sont encodés :
 *   • former sans diagnostic rend moins que former après un bilan — d'où le
 *     bonus conditionné au bilan de compétences, qui est aussi ce que le GIAC
 *     finance ;
 *   • recruter à l'extérieur dilue le niveau moyen le temps de l'intégration ;
 *   • recruter dans un autre DAS du groupe ne dilue pas : la personne connaît
 *     déjà la maison. C'est l'intérêt d'un marché interne.
 */
export function nextSkillIndex(input: SkillInput, params: EngineParams): number {
  const decay = param(params, 'hr.skill_decay');
  let skill = input.previousSkill * (1 - decay);

  const auditBonus = input.skillsAuditOrdered ? 1.35 : 1;
  skill += Math.min(
    input.trainingIntensity * 260 * auditBonus * (input.focusMultiplier ?? 1),
    18,
  );

  // Le recrutement externe dilue, l'interne non.
  const externalRatio = Math.max(input.hiringRatio - input.internalHiringRatio, 0);
  skill -= externalRatio * 22;
  skill += input.internalHiringRatio * 4;

  // La rotation emporte les plus qualifiés.
  skill -= input.turnoverRate * 25;

  return clamp100(skill);
}

// ---------------------------------------------------------------------------
// Standardisation
// ---------------------------------------------------------------------------

/**
 * Niveau de standardisation atteint par un DAS, 0–100.
 *
 * Il ne se décrète pas : il découle de ce que le DAS a effectivement adopté
 * ET standardisé parmi les ressources que le groupe a mutualisées. C'est le
 * maillon que réclamait le cahier des charges — mutualiser, puis standardiser,
 * puis seulement alors pouvoir réduire l'effectif sans perdre en qualité.
 */
export function standardisationLevel(
  resources: { adoptionLevel: number; standardised: boolean }[],
): number {
  if (resources.length === 0) return 0;

  const contribution = resources.reduce(
    (acc, r) => acc + (r.standardised ? clamp100(r.adoptionLevel) : 0),
    0,
  );
  // Rapporté au nombre de ressources OUVERTES, non au nombre standardisé :
  // standardiser une plateforme sur cinq n'est pas standardiser son organisation.
  return clamp100(contribution / resources.length);
}

/**
 * Effectif que la standardisation permet de retirer SANS perte de qualité.
 *
 * Au-delà, chaque poste supprimé se paie en qualité. C'est la contrepartie
 * exacte de la règle énoncée au cahier des charges : les KPI autorisent la
 * réduction, ils ne l'offrent pas gratuitement.
 */
export function safeHeadcountReduction(
  headcount: number,
  standardisation: number,
  automation: number,
  params: EngineParams,
): number {
  const rate = param(params, 'hr.safe_reduction_rate');
  return Math.floor(
    headcount * rate * ((clamp100(standardisation) + clamp100(automation)) / 200),
  );
}

/**
 * Perte de qualité d'une réduction d'effectif qui dépasse ce que la
 * standardisation autorise, en points de qualité produit.
 */
export function qualityLossFromCuts(
  layoffs: number,
  safeReduction: number,
  headcount: number,
): number {
  const excess = Math.max(layoffs - safeReduction, 0);
  if (excess <= 0 || headcount <= 0) return 0;
  return Math.min((excess / headcount) * 120, 30);
}

// ---------------------------------------------------------------------------
// Orientation de la formation
// ---------------------------------------------------------------------------

export type TrainingFocus = 'technique' | 'management' | 'qualite' | 'polyvalence';

/**
 * Ce que chaque orientation de formation produit RÉELLEMENT.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * `training_focus` était saisi, validé, stocké, chargé dans l'instantané — et
 * lu par personne. Les quatre orientations avaient exactement le même effet :
 * aucun. L'écran annonçait pourtant quatre destinations distinctes — « le
 * geste métier », « l'encadrement intermédiaire », « normes et contrôle »,
 * « absorbe les à-coups » — ce qui en faisait une décision d'apparence, la
 * pire espèce dans un jeu qui enseigne l'arbitrage.
 *
 * Les coefficients sont des MULTIPLICATEURS de ce que la formation produit
 * déjà, et non des primes ajoutées : une orientation ne crée pas d'effet, elle
 * répartit un budget. Leur somme s'écarte volontairement de 4 — spécialiser
 * rend plus sur sa cible que la polyvalence ne rend partout, sinon choisir
 * n'aurait aucune conséquence.
 */
export const TRAINING_FOCUS_EFFECTS: Record<
  TrainingFocus,
  { skill: number; quality: number; climat: number; standardisation: number }
> = {
  // Le geste métier : c'est la compétence technique, et elle sert la qualité.
  technique: { skill: 1.25, quality: 1.15, climat: 0.9, standardisation: 0.9 },
  // L'encadrement intermédiaire : ce qui se joue est le climat et la capacité
  // à déléguer, pas la technicité.
  management: { skill: 0.85, quality: 0.9, climat: 1.35, standardisation: 1.0 },
  // Normes et contrôle : la montée en gamme, au détriment de la polyvalence.
  qualite: { skill: 0.95, quality: 1.4, climat: 0.9, standardisation: 0.95 },
  // La polyvalence rend un peu partout et beaucoup nulle part — c'est ce qui
  // permet de réduire un effectif sans perdre en qualité.
  polyvalence: { skill: 1.0, quality: 0.95, climat: 1.1, standardisation: 1.35 },
};

export function trainingFocusEffects(focus: TrainingFocus | null | undefined) {
  return TRAINING_FOCUS_EFFECTS[focus ?? 'technique'] ?? TRAINING_FOCUS_EFFECTS.technique;
}

// ---------------------------------------------------------------------------
// Consolidation d'équipe
// ---------------------------------------------------------------------------

/**
 * Climat social du GROUPE, consolidé depuis celui de chaque domaine.
 *
 * ── LE DÉFAUT CORRIGÉ ──────────────────────────────────────────────────────
 * Deux modèles de climat coexistaient, et le mauvais gagnait.
 *
 * Le modèle par DOMAINE — celui de ce module — tient compte de la charge de
 * travail, du ratio de recrutement, des départs, de l'intensité de formation,
 * de l'écart salarial, du saut d'automatisation et du type de restructuration.
 * Il est calculé, persisté dans `das_hr_state`, et relu au tour suivant.
 *
 * Le modèle de GROUPE n'avait que trois effets en marche d'escalier — un choc
 * de recrutement au-delà d'un seuil, un malus si l'on restructure, un bonus si
 * l'on forme — appliqués en addition sur la valeur précédente. Sans décision
 * RH, il rendait donc EXACTEMENT la valeur précédente : sur une partie de dix
 * tours, le climat de groupe restait figé à sa valeur de départ, quelle que
 * soit la charge que les équipes faisaient peser sur leurs effectifs.
 *
 * Ce n'était pas un détail d'affichage : c'est cette valeur que lit le
 * Balanced Scorecard pour noter la dimension sociale en fin de partie, et
 * c'est elle que le cockpit affiche tout au long.
 *
 * Un groupe n'a pas de climat propre — il a celui de ses équipes, pondéré par
 * leurs effectifs. Un domaine de quarante personnes en souffrance ne compense
 * pas mille personnes sereines, et l'inverse non plus.
 */
export function consolidateClimate(
  units: { climatSocial: number; headcount: number }[],
  fallback: number,
): number {
  if (units.length === 0) return clamp100(fallback);

  const total = units.reduce((acc, u) => acc + Math.max(u.headcount, 0), 0);
  if (total <= 0) return clamp100(mean(units.map((u) => u.climatSocial)));

  return clamp100(
    units.reduce((acc, u) => acc + (Math.max(u.headcount, 0) / total) * u.climatSocial, 0),
  );
}

/**
 * Effectif du GROUPE : la somme de ses domaines, et rien d'autre.
 *
 * Il se recalculait séparément à partir de la consolidation RH, si bien que
 * deux chemins produisaient deux nombres — celui-ci ignorait les transferts
 * internes et le plancher appliqué par domaine. Additionner ce que le moteur a
 * réellement calculé domaine par domaine supprime la divergence.
 */
export function consolidateHeadcount(
  units: { headcount: number }[],
  fallback: number,
): number {
  if (units.length === 0) return Math.max(Math.round(fallback), 0);
  return units.reduce((acc, u) => acc + Math.max(u.headcount, 0), 0);
}
