'use client';

/**
 * Sélecteur de modules — soixante-huit interrupteurs qui doivent rester lisibles.
 *
 * D'où l'arbre écran → catégorie → champ, replié par défaut : on ouvre l'écran
 * qu'on veut régler, pas les neuf. Chaque niveau affiche son compte
 * (« 7 / 13 ouverts »), parce que la question du formateur n'est pas « quelles
 * cases sont cochées » mais « qu'est-ce que mes équipes vont voir ».
 *
 * Deux usages, un seul composant :
 *   • le SUPER-ADMIN règle le plafond d'un facilitateur (`ceiling` vaut `null`) ;
 *   • le FACILITATEUR règle une session dans les limites de ce plafond — les
 *     champs qu'on lui a fermés apparaissent barrés et non cochables, jamais
 *     absents : il doit pouvoir constater qu'ils existent et les demander.
 */

import { useMemo } from 'react';

import {
  MODULE_SCREENS,
  type ModuleField,
  type ModuleTier,
} from '@/lib/modules-catalog';
import { isOn, type EnabledModules } from '@/lib/modules-state';

const TIER_LABELS: Record<ModuleTier, string> = {
  noyau: 'indispensable au calcul',
  standard: 'standard',
  avance: 'avancé',
};

export function ModulesPicker({
  value,
  ceiling,
  onChange,
  disabled = false,
}: {
  value: EnabledModules;
  /** Champs autorisés par le super-admin. `null` quand c'est LUI qui règle. */
  ceiling: EnabledModules | null;
  onChange: (next: EnabledModules) => void;
  disabled?: boolean;
}) {
  const total = useMemo(
    () => MODULE_SCREENS.flatMap((s) => s.categories.flatMap((c) => c.fields)).length,
    [],
  );
  const openCount = useMemo(
    () =>
      MODULE_SCREENS.flatMap((s) => s.categories.flatMap((c) => c.fields)).filter((f) =>
        isOn(value, f.key),
      ).length,
    [value],
  );

  function allowed(field: ModuleField): boolean {
    if (field.tier === 'noyau') return true;
    return ceiling === null || isOn(ceiling, field.key);
  }

  function setFields(fields: readonly ModuleField[], enabled: boolean) {
    const next: Record<string, boolean> = { ...value };
    for (const field of fields) {
      if (field.tier === 'noyau') continue;
      if (!allowed(field)) continue;
      next[field.key] = enabled;
    }
    onChange(next);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-(--foreground-muted)">
        <strong className="tabular text-(--foreground)">
          {openCount} / {total}
        </strong>{' '}
        champs ouverts
      </p>

      <div className="space-y-2">
        {MODULE_SCREENS.map((screen) => {
          const fields = screen.categories.flatMap((c) => c.fields);
          const open = fields.filter((f) => isOn(value, f.key)).length;

          return (
            <details
              key={screen.key}
              className="rounded-lg border border-(--border) bg-(--surface)"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="font-medium">{screen.label}</span>
                <span className="tabular text-sm text-(--foreground-muted)">
                  {open} / {fields.length}
                </span>
                {open === 0 ? (
                  <span className="rounded bg-(--surface-muted) px-2 py-0.5 text-xs text-(--foreground-muted)">
                    onglet masqué
                  </span>
                ) : null}
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.preventDefault();
                      setFields(fields, true);
                    }}
                    className="rounded border border-(--border) px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Tout ouvrir
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.preventDefault();
                      setFields(fields, false);
                    }}
                    className="rounded border border-(--border) px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Tout fermer
                  </button>
                </span>
              </summary>

              <div className="border-t border-(--border) px-4 py-3">
                {screen.categories.map((category) => (
                  <fieldset key={category.key} className="mb-4 last:mb-0">
                    <legend className="mb-2 text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
                      {category.label}
                    </legend>
                    <ul className="space-y-1.5">
                      {category.fields.map((field) => {
                        const core = field.tier === 'noyau';
                        const blocked = !allowed(field);
                        return (
                          <li key={field.key}>
                            <label
                              className={
                                'flex items-start gap-2 text-sm ' +
                                (blocked ? 'text-(--foreground-muted) line-through' : '')
                              }
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={isOn(value, field.key)}
                                disabled={disabled || core || blocked}
                                onChange={(event) =>
                                  onChange({ ...value, [field.key]: event.target.checked })
                                }
                              />
                              <span>
                                {field.label}
                                <span className="ml-2 text-xs text-(--foreground-muted)">
                                  {core
                                    ? TIER_LABELS.noyau
                                    : blocked
                                      ? 'fermé par le super-admin'
                                      : TIER_LABELS[field.tier]}
                                </span>
                                {!core && !isOn(value, field.key) ? (
                                  <span className="block text-xs text-(--foreground-muted)">
                                    Fermé : {field.neutral.toLowerCase()}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
