'use client';

/**
 * Ce que cette session fait jouer.
 *
 * Réglable en cours d'atelier, délibérément : ouvrir les acquisitions au tour 3
 * quand les équipes maîtrisent le pilotage est un geste pédagogique, pas une
 * reconfiguration. Un champ refermé garde la dernière valeur saisie par les
 * équipes — on ne dissout pas au tour 4 ce qui a été décidé au tour 3.
 */

import { useState, useTransition } from 'react';

import { ModulesPicker } from '@/components/modules-picker';
import { ALL_MODULE_FIELDS, MODULE_PRESETS } from '@/lib/modules-catalog';
import { isOn, type EnabledModules } from '@/lib/modules-state';

type Result = { ok: true } | { ok: false; error: string };

export interface SavedPresetRef {
  id: string;
  name: string;
  fields: string[];
}

function stateFromKeys(keys: readonly string[]): EnabledModules {
  const open = new Set(keys);
  const state: Record<string, boolean> = {};
  for (const field of ALL_MODULE_FIELDS) state[field.key] = open.has(field.key);
  return state;
}

export function ModulesSection({
  sessionId,
  modules,
  ceiling,
  savedPresets,
  setModulesAction,
  savePresetAction,
  deletePresetAction,
}: {
  sessionId: string;
  modules: EnabledModules;
  ceiling: EnabledModules;
  savedPresets: SavedPresetRef[];
  setModulesAction: (input: {
    sessionId: string;
    fields: Record<string, boolean>;
  }) => Promise<Result>;
  savePresetAction: (input: {
    name: string;
    fields: Record<string, boolean>;
  }) => Promise<Result>;
  deletePresetAction: (input: { presetId: string }) => Promise<Result>;
}) {
  const [draft, setDraft] = useState<EnabledModules>(modules);
  const [dirty, setDirty] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'ko'; text: string } | null>(null);

  const openCount = ALL_MODULE_FIELDS.filter((f) => isOn(draft, f.key)).length;

  function apply(keys: readonly string[]) {
    setDraft(stateFromKeys(keys));
    setDirty(true);
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setModulesAction({ sessionId, fields: draft });
      if (result.ok) {
        setDirty(false);
        setMessage({ kind: 'ok', text: 'Les écrans des équipes sont à jour.' });
      } else {
        setMessage({ kind: 'ko', text: result.error });
      }
    });
  }

  return (
    <section className="mb-8 rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Ce que cette session fait jouer</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-(--foreground-muted)">
        Atlas complet demande plusieurs séances. Fermez ce que vous ne traitez pas : le bloc
        disparaît de l’écran des équipes, et un écran entièrement fermé disparaît de leur barre
        de navigation. Réglable à tout moment — un champ refermé conserve la dernière valeur
        saisie par les équipes.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-(--foreground-muted)">Préréglages :</span>
        {MODULE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            title={preset.description}
            disabled={pending}
            onClick={() => apply(preset.fields)}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
        {savedPresets.map((preset) => (
          <span key={preset.id} className="flex items-center">
            <button
              type="button"
              disabled={pending}
              onClick={() => apply(preset.fields)}
              className="rounded-l-lg border border-(--border) px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {preset.name}
            </button>
            <button
              type="button"
              aria-label={`Supprimer le préréglage ${preset.name}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deletePresetAction({ presetId: preset.id });
                })
              }
              className="rounded-r-lg border border-l-0 border-(--border) px-2 py-1.5 text-sm text-(--foreground-muted) disabled:opacity-40"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <ModulesPicker
        value={draft}
        ceiling={ceiling}
        disabled={pending}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
          setMessage(null);
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={save}
          className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-4 py-2 text-sm font-medium text-(--on-accent) disabled:opacity-40"
        >
          {pending ? 'Application…' : `Appliquer (${openCount} champs)`}
        </button>

        <span className="flex items-center gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="Nom du préréglage"
            maxLength={60}
            className="rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || presetName.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await savePresetAction({ name: presetName, fields: draft });
                if (result.ok) {
                  setPresetName('');
                  setMessage({ kind: 'ok', text: 'Préréglage enregistré.' });
                } else {
                  setMessage({ kind: 'ko', text: result.error });
                }
              })
            }
            className="rounded-lg border border-(--border) px-3 py-2 text-sm disabled:opacity-40"
          >
            Enregistrer cette configuration
          </button>
        </span>
      </div>

      {message ? (
        <p
          role="status"
          className={
            'mt-3 text-sm ' +
            (message.kind === 'ok' ? 'text-(--positive)' : 'text-(--negative)')
          }
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
