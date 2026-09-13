'use client';

/**
 * ATLAS — réglages de salle : niveau de difficulté et cartes sur mesure.
 *
 * ── LA DIFFICULTÉ NE CHANGE PAS LES RÈGLES ─────────────────────────────────
 * Elle ne touche qu'à la marge d'erreur tolérée et à la vitesse à laquelle
 * l'environnement se dérobe. Si elle changeait les formules, le débriefing
 * deviendrait faux : « vous avez échoué parce que le niveau était dur »
 * n'enseigne rien.
 *
 * Deux règles d'usage, appliquées ici :
 *   • visible du facilitateur, INVISIBLE des équipes — une équipe qui connaît
 *     le réglage l'invoquera en excuse ;
 *   • VERROUILLÉE dès la première résolution — la changer en cours de partie
 *     casserait la comparabilité entre tours.
 */

import { useState } from 'react';

import {
  DIAL_EXPLANATIONS, DIFFICULTY_PRESETS, type DifficultyDials,
} from '@/lib/difficulty-types';
import { EFFECT_SPECS } from '@/lib/shock-types';

const LEVELS = [
  ['decouverte', 'Découverte',
   'Un marché qui croît, une banque patiente, un alignement indulgent. Pour une première séance.'],
  ['standard', 'Standard',
   'Le calibrage de référence. C’est contre lui que le jeu a été réglé.'],
  ['exigeant', 'Exigeant',
   'Marché atone, banque dure, incohérence sanctionnée vite. Pour un public déjà rodé.'],
  ['sur_mesure', 'Sur mesure',
   'Vous réglez chaque molette. Part de « standard ».'],
] as const;

const DIAL_LABELS: Record<keyof DifficultyDials, string> = {
  marketGrowth: 'Croissance du marché',
  alignmentTolerance: 'Tolérance à l’incohérence',
  financialSlack: 'Marge financière',
  ecosystemPower: 'Pouvoir de l’écosystème',
  competitivenessExponent: 'Brutalité du partage des parts',
};

const DIAL_BOUNDS: Record<keyof DifficultyDials, [number, number, number]> = {
  marketGrowth: [0, 3, 0.05],
  alignmentTolerance: [0.4, 2, 0.05],
  financialSlack: [0.5, 2, 0.05],
  ecosystemPower: [0.5, 2, 0.05],
  competitivenessExponent: [1, 4, 0.1],
};

const DIMENSIONS = [
  'politique', 'economique', 'socioculturel', 'technologique', 'ecologique', 'legal',
] as const;

export function SettingsSection({
  sessionId, difficulty, dials, locked, sectors, call, disabled,
}: {
  sessionId: string;
  difficulty: string;
  dials: DifficultyDials;
  locked: boolean;
  sectors: string[];
  call: (path: string, body: Record<string, unknown>, ok: string) => void;
  disabled: boolean;
}) {
  const [level, setLevel] = useState(difficulty);
  const [custom, setCustom] = useState<DifficultyDials>(dials);

  const [card, setCard] = useState({
    name: '', description: '', nature: 'menace' as 'menace' | 'opportunite',
    pestelDimension: 'economique' as (typeof DIMENSIONS)[number],
    targetSectors: [] as string[], durationRounds: 1, sourceReference: '',
  });
  const [effects, setEffects] = useState<Record<string, number>>({});

  const posed = Object.entries(effects).filter(([, v]) => v !== 0);

  return (
    <>
      {/* ── Difficulté ─────────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="text-xl font-medium">Niveau de difficulté</h2>
        <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">
          Il ne change aucune formule : seulement la marge d’erreur tolérée et la vitesse à
          laquelle l’environnement se dérobe. <strong>Les équipes ne le voient pas</strong> — sans
          quoi elles l’invoqueraient en excuse.
        </p>

        {locked ? (
          <p className="mb-5 rounded-lg border border-(--warning) px-4 py-3 text-sm text-(--warning)">
            Verrouillé depuis la première résolution. Le modifier maintenant rendrait les tours
            incomparables entre eux — ce qui est précisément l’intérêt d’une partie en plusieurs
            exercices.
          </p>
        ) : null}

        <fieldset disabled={locked || disabled} className="grid gap-2 sm:grid-cols-2">
          {LEVELS.map(([value, label, hint]) => (
            <button
              key={value} type="button" disabled={locked || disabled}
              onClick={() => {
                setLevel(value);
                if (value !== 'sur_mesure') {
                  setCustom(DIFFICULTY_PRESETS[value as keyof typeof DIFFICULTY_PRESETS]);
                }
              }}
              className="rounded-lg border px-4 py-3 text-left text-sm disabled:opacity-50"
              style={{
                borderColor: level === value ? 'var(--accent)' : 'var(--border)',
                background: level === value ? 'var(--surface-muted)' : undefined,
              }}
            >
              <span className="font-medium">{label}</span>
              <span className="mt-1 block text-(--foreground-muted)">{hint}</span>
            </button>
          ))}
        </fieldset>

        {level === 'sur_mesure' ? (
          <div className="mt-5 space-y-4">
            {(Object.keys(DIAL_LABELS) as (keyof DifficultyDials)[]).map((key) => {
              const [min, max, step] = DIAL_BOUNDS[key];
              return (
                <label key={key} className="block">
                  <span className="text-sm font-medium">
                    {DIAL_LABELS[key]} · <span className="tabular">{custom[key].toFixed(2)}</span>
                  </span>
                  <p className="mt-0.5 mb-1.5 text-xs text-(--foreground-muted)">
                    {DIAL_EXPLANATIONS[key]}
                  </p>
                  <input
                    type="range" min={min} max={max} step={step} value={custom[key]}
                    disabled={locked || disabled}
                    onChange={(e) =>
                      setCustom({ ...custom, [key]: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </label>
              );
            })}
          </div>
        ) : null}

        <button
          type="button" disabled={locked || disabled}
          onClick={() =>
            call('/api/facilitator', {
              action: 'set_difficulty', sessionId, level,
              dials: level === 'sur_mesure' ? custom : undefined,
            }, `Niveau réglé sur « ${level} ».`)
          }
          className="mt-5 rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
        >
          Appliquer le niveau
        </button>
      </section>

      {/* ── Carte sur mesure ───────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
        <h2 className="text-xl font-medium">Composer une crise ou une opportunité</h2>
        <p className="mt-1 mb-5 max-w-3xl text-sm text-(--foreground-muted)">
          Vous choisissez les variables touchées et leur amplitude. La carte rejoint le catalogue
          de cette session et se déclenche comme les autres. Les équipes en verront le nom et la
          description, jamais les chiffres.
        </p>

        <fieldset disabled={disabled} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Intitulé</span>
              <input
                value={card.name} maxLength={120}
                onChange={(e) => setCard({ ...card, name: e.target.value })}
                placeholder="Rupture du corridor logistique"
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Source invoquée</span>
              <input
                value={card.sourceReference} maxLength={160}
                onChange={(e) => setCard({ ...card, sourceReference: e.target.value })}
                placeholder="Agence Nationale des Ports"
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Ce que les équipes liront</span>
            <textarea
              value={card.description} rows={2} maxLength={600}
              onChange={(e) => setCard({ ...card, description: e.target.value })}
              placeholder="Un blocage portuaire prolonge les délais et renchérit les intrants importés."
              className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">Nature</span>
              <select
                value={card.nature}
                onChange={(e) => setCard({ ...card, nature: e.target.value as 'menace' | 'opportunite' })}
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              >
                <option value="menace">Crise</option>
                <option value="opportunite">Opportunité</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Dimension</span>
              <select
                value={card.pestelDimension}
                onChange={(e) =>
                  setCard({ ...card, pestelDimension: e.target.value as typeof card.pestelDimension })
                }
                className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Durée (tours)</span>
              <input
                type="number" min={0} max={6} value={card.durationRounds}
                onChange={(e) =>
                  setCard({ ...card, durationRounds: Math.max(Number(e.target.value) || 0, 0) })
                }
                className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
              />
            </label>
          </div>

          {sectors.length > 0 ? (
            <div>
              <span className="text-sm font-medium">Secteurs touchés</span>
              <p className="mt-0.5 mb-2 text-xs text-(--foreground-muted)">
                Aucun sélectionné = la carte frappe tous les secteurs.
              </p>
              <div className="flex flex-wrap gap-2">
                {sectors.map((s) => {
                  const on = card.targetSectors.includes(s);
                  return (
                    <button
                      key={s} type="button" disabled={disabled}
                      onClick={() =>
                        setCard({
                          ...card,
                          targetSectors: on
                            ? card.targetSectors.filter((x) => x !== s)
                            : [...card.targetSectors, s],
                        })
                      }
                      className="rounded-lg border px-3 py-1.5 text-sm"
                      style={{
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                        background: on ? 'var(--surface-muted)' : undefined,
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <span className="text-sm font-medium">Variables touchées</span>
            <p className="mt-0.5 mb-2 text-xs text-(--foreground-muted)">
              Laissez à zéro ce que la carte ne touche pas. Une carte sans effet est refusée.
            </p>
            <div className="space-y-2">
              {EFFECT_SPECS.map((spec) => {
                const v = effects[spec.key] ?? 0;
                const shown =
                  spec.unit === 'pct' ? `${(v * 100).toFixed(0)} %`
                  : spec.unit === 'taux' ? `${(v * 100).toFixed(2)} pt`
                  : spec.unit === 'jours' ? `${v.toFixed(0)} j`
                  : v.toFixed(0);

                return (
                  <div
                    key={spec.key}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-(--border) px-4 py-2.5"
                  >
                    <span className="min-w-[12rem] text-sm font-medium">{spec.label}</span>
                    <input
                      type="range"
                      min={spec.min} max={spec.max}
                      step={spec.unit === 'points' || spec.unit === 'jours' ? 1 : 0.01}
                      value={v} disabled={disabled}
                      onChange={(e) =>
                        setEffects({ ...effects, [spec.key]: Number(e.target.value) })
                      }
                      className="min-w-[10rem] flex-1"
                    />
                    <span className="tabular w-20 text-right text-sm">{shown}</span>
                    <span className="w-full text-xs text-(--foreground-muted)">
                      {v === 0 ? 'sans effet'
                        : v > 0 ? spec.positiveMeans
                        : spec.negativeMeans}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={disabled || card.name.trim().length < 3 || posed.length === 0}
            onClick={() =>
              call('/api/facilitator', {
                action: 'create_shock_card', sessionId,
                ...card, effects: Object.fromEntries(posed),
              }, `Carte « ${card.name} » ajoutée au catalogue de cette session.`)
            }
            className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent) disabled:opacity-40"
          >
            {posed.length === 0
              ? 'Renseignez au moins une variable'
              : `Créer la carte (${posed.length} variable${posed.length > 1 ? 's' : ''})`}
          </button>
        </fieldset>
      </section>
    </>
  );
}
