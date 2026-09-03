'use client';

/**
 * Coque commune aux écrans de saisie.
 *
 * Porte les deux invariants d'interface du cahier (doc 00 §8) :
 *
 *   • **Barre de validation fixée en bas d'écran**, grisée tant que des
 *     décisions obligatoires manquent, avec le NOMBRE de décisions restantes
 *     affiché dessus. Une équipe doit savoir à tout instant ce qui lui manque,
 *     sans parcourir les quatre écrans.
 *
 *   • **Aucune action de sauvegarde manuelle.** Le bouton ne sauvegarde pas —
 *     tout est déjà parti. Il force l'envoi de ce qui reste en file et déclare
 *     le tour prêt. L'étiquette le dit explicitement, sinon les étudiants
 *     cliquent par réflexe et croient que c'est lui qui enregistre.
 */

import { SAVE_LABELS, type SaveState } from '@/lib/use-autosave';

export interface MissingDecision {
  label: string;
  href: string;
}

export function SaveIndicator({
  state, pending, lastError,
}: { state: SaveState; pending: number; lastError: string | null }) {
  const colour =
    state === 'saved' ? 'var(--positive)'
    : state === 'error' || state === 'locked' ? 'var(--negative)'
    : 'var(--foreground-muted)';

  return (
    <p className="flex items-center gap-2 text-sm" style={{ color: colour }} role="status">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-current" />
      {/* Le message du serveur prime quand il existe ; sinon l'étiquette
          générique, qui dit l'essentiel : rien n'est perdu. */}
      {lastError && (state === 'error' || state === 'locked') ? lastError : SAVE_LABELS[state]}
      {pending > 0 ? (
        <span className="tabular text-(--foreground-muted)">({pending} en attente)</span>
      ) : null}
    </p>
  );
}

export function DecisionBar({
  state, pending, lastError, missing, decisionsOpen, onValidate,
}: {
  state: SaveState;
  pending: number;
  lastError: string | null;
  missing: MissingDecision[];
  decisionsOpen: boolean;
  onValidate: () => void;
}) {
  const blocked = missing.length > 0 || !decisionsOpen;

  return (
    <div className="sticky bottom-0 z-10 border-t border-(--border) bg-(--surface)">
      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <SaveIndicator state={state} pending={pending} lastError={lastError} />
          {missing.length > 0 ? (
            <p className="mt-1 text-sm text-(--foreground-muted)">
              Manquant :{' '}
              {missing.map((m, i) => (
                <span key={m.href + m.label}>
                  {i > 0 ? ' · ' : ''}
                  <a href={m.href} className="underline">{m.label}</a>
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={blocked}
          onClick={onValidate}
          className="rounded-lg bg-(--accent) px-6 py-3 font-medium text-white disabled:opacity-40"
        >
          {!decisionsOpen
            ? 'Tour verrouillé'
            : missing.length > 0
              ? `${missing.length} décision${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''}`
              : 'Valider mes décisions'}
        </button>
      </div>

      <p className="mx-auto w-full max-w-5xl px-6 pb-3 text-xs text-(--foreground-muted)">
        Vos saisies sont enregistrées au fil de la frappe : ce bouton ne sauvegarde rien, il
        déclare votre tour prêt.
      </p>
    </div>
  );
}

/** Champ numérique en dirhams, avec coût dérivé affiché en direct. */
export function MoneyField({
  label, value, onChange, hint, disabled, max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number" min={0} step={100_000} max={max} value={value} disabled={disabled}
        onChange={(e) => onChange(Math.max(Number(e.target.value) || 0, 0))}
        className="tabular mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 disabled:opacity-50"
      />
      {hint ? <p className="mt-1 text-xs text-(--foreground-muted)">{hint}</p> : null}
    </label>
  );
}

/**
 * Barre d'allocation sous contrainte de trésorerie.
 *
 * Elle EMPÊCHE la sur-allocation avant même la soumission (doc 00 §8.3) : une
 * équipe doit voir qu'elle dépasse pendant qu'elle arbitre, pas le découvrir à
 * la résolution quand il est trop tard pour corriger.
 */
export function BudgetGauge({
  allocated, available, label,
}: { allocated: number; available: number; label: string }) {
  const ratio = available > 0 ? allocated / available : 0;
  const over = ratio > 1;
  const width = Math.min(ratio, 1) * 100;

  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular text-sm" style={{ color: over ? 'var(--negative)' : 'var(--foreground-muted)' }}>
          {formatCompact(allocated)} / {formatCompact(available)}
          {over ? ` — dépassement de ${formatCompact(allocated - available)}` : ''}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-(--surface-muted)">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${width}%`, background: over ? 'var(--negative)' : 'var(--accent)' }}
        />
      </div>

      {over ? (
        <p className="mt-2 text-sm text-(--negative)">
          Vous engagez plus que votre trésorerie disponible. Le moteur l’acceptera — et vous
          passerez en trésorerie négative.
        </p>
      ) : null}
    </div>
  );
}

function formatCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1).replace('.', ',')} Md DH`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')} M DH`;
  return `${sign}${Math.round(abs).toLocaleString('fr-FR')} DH`;
}
