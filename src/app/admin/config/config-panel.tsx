'use client';

import { useMemo, useState, useTransition } from 'react';

import { InfoHint } from '@/components/ui/info-hint';
import { MetricToggle } from '@/components/ui/metric-toggle';
import type {
  DashboardSectionKey,
  DisplayConfig,
  FontScale,
  ThemeChoice,
  ViewLevel,
} from '@/lib/display-config-types';

type UpdateResult = { ok: true } | { ok: false; error: string };

/**
 * Panneau `/admin/config`.
 *
 * Même contrat que le panneau de sécurité : les bascules restent un brouillon
 * local tant que « Enregistrer » n'a pas confirmé l'écriture — un clic
 * malheureux ne fait disparaître aucune section devant une salle entière.
 * La Server Function arrive en prop, pour ne pas tirer le graphe serveur dans
 * ce composant client (voir `boundaries.test.ts`).
 */
export function ConfigPanel({
  sections,
  views,
  initialConfig,
  updateAction,
}: {
  sections: ReadonlyArray<{ key: DashboardSectionKey; label: string; description: string }>;
  views: ReadonlyArray<{ key: ViewLevel; label: string; description: string }>;
  initialConfig: DisplayConfig;
  updateAction: (next: DisplayConfig) => Promise<UpdateResult>;
}) {
  const [applied, setApplied] = useState(initialConfig);
  const [draft, setDraft] = useState(initialConfig);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(applied), [draft, applied]);
  const hiddenCount = sections.filter((s) => !draft.sections[s.key]).length;

  function update(patch: Partial<DisplayConfig>) {
    setMessage(null);
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAction(draft);
      if (result.ok) {
        setApplied(draft);
        setMessage({ kind: 'success', text: 'Configuration enregistrée. Les équipes la verront au prochain chargement.' });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  return (
    <div className="space-y-10">
      <Group
        title="Sections du dashboard"
        hint={
          hiddenCount === 0
            ? 'Toutes les sections sont visibles.'
            : `${hiddenCount} section${hiddenCount > 1 ? 's' : ''} masquée${hiddenCount > 1 ? 's' : ''}.`
        }
      >
        {sections.map((section) => (
          <SwitchRow
            key={section.key}
            label={section.label}
            description={section.description}
            checked={draft.sections[section.key]}
            disabled={pending}
            onChange={(checked) =>
              update({ sections: { ...draft.sections, [section.key]: checked } })
            }
          />
        ))}
      </Group>

      <Group
        title="Données sensibles"
        hint="Dans la barre d’argent affichée en haut de chaque écran d’équipe."
      >
        <SwitchRow
          label="Budget disponible"
          description="« Vous disposez de » et « Il vous reste ». Le montant engagé reste affiché."
          checked={draft.showBudget}
          disabled={pending}
          onChange={(checked) => update({ showBudget: checked })}
        />
        <SwitchRow
          label="Crédits"
          description="Crédit tiré ce tour et crédits en cours de remboursement."
          checked={draft.showCredits}
          disabled={pending}
          onChange={(checked) => update({ showCredits: checked })}
        />
      </Group>

      <Group title="Vue par défaut du dashboard" hint="Chaque membre peut ensuite changer de niveau ; son choix est retenu sur son appareil.">
        <div className="rounded-xl border border-(--border) bg-(--surface) p-5">
          <MetricToggle
            variant="segmented"
            label="Vue par défaut"
            options={views}
            value={draft.defaultView}
            onChange={(defaultView) => update({ defaultView })}
          />
          <p className="mt-3 text-sm text-(--foreground-muted)">
            {views.find((v) => v.key === draft.defaultView)?.description}
          </p>
        </div>
      </Group>

      <Group title="Apparence" hint="Pour toute l’application, équipes comme facilitateurs.">
        <div className="grid gap-4 rounded-xl border border-(--border) bg-(--surface) p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Thème</p>
            <MetricToggle<ThemeChoice>
              variant="segmented"
              size="sm"
              label="Thème"
              options={[
                { key: 'system', label: 'Système' },
                { key: 'light', label: 'Clair' },
                { key: 'dark', label: 'Sombre' },
              ]}
              value={draft.theme}
              onChange={(theme) => update({ theme })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Taille de police</p>
            <MetricToggle<FontScale>
              variant="segmented"
              size="sm"
              label="Taille de police"
              options={[
                { key: 'standard', label: 'Standard' },
                { key: 'grand', label: 'Grand (projection)' },
              ]}
              value={draft.fontScale}
              onChange={(fontScale) => update({ fontScale })}
            />
          </div>
        </div>
      </Group>

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-4 border-t border-(--border) bg-(--background)/95 px-6 py-4 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || pending}
          className="rounded-lg bg-(--accent) px-5 py-2.5 font-medium text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:opacity-50"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {isDirty && !pending ? (
          <button
            type="button"
            onClick={() => { setDraft(applied); setMessage(null); }}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-(--foreground-muted) hover:bg-(--surface-muted)"
          >
            Annuler les modifications
          </button>
        ) : null}
        {message ? (
          <p role="alert" className={`text-sm ${message.kind === 'success' ? 'text-(--positive)' : 'text-(--negative)'}`}>
            {message.text}
          </p>
        ) : isDirty ? (
          <p className="text-sm text-(--foreground-muted)">Modifications non enregistrées.</p>
        ) : null}
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-(--heading)">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-(--foreground-muted)">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SwitchRow({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {label}
          <InfoHint label={label}>{description}</InfoHint>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* L'état est écrit en toutes lettres : la position du curseur ne
            suffit pas sur un écran délavé. */}
        <span className={`text-xs font-semibold uppercase ${checked ? 'text-(--positive)' : 'text-(--foreground-muted)'}`}>
          {checked ? 'Affiché' : 'Masqué'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          disabled={disabled}
          className={`relative h-7 w-12 rounded-full transition-colors duration-200 disabled:opacity-50 ${
            checked ? 'bg-(--accent)' : 'bg-(--border-strong)'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
