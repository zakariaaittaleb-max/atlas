'use client';

/**
 * Création d'une session.
 *
 * Le formulaire décide de trois choses qui ne se rattrapent pas ensuite :
 *   • la composition des pools — un pool est une LIGUE, la concurrence à somme
 *     nulle se joue en son sein ;
 *   • les DAS ouverts, et parmi eux le PORTEFEUILLE DE DÉPART — deux choses
 *     distinctes : ouvrir un domaine le fait exister avec son écosystème et ses
 *     segments, l'attribuer le met dans les mains des équipes. Un domaine ouvert
 *     mais non attribué est précisément ce qui reste à acquérir ;
 *   • le nombre de tours prévu, purement indicatif : le facilitateur peut en
 *     ajouter jusqu'au maximum, et la partie ne s'arrête jamais d'elle-même.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { MODULE_PRESETS } from '@/lib/modules-catalog';

export function SessionLauncher({ sectors }: { sectors: { key: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  // Plusieurs ligues : le moteur simule des marchés parallèles indépendants,
  // ce qui permet de faire tourner deux salles sans qu'elles interfèrent.
  const [pools, setPools] = useState<{ name: string; teams: string }[]>([
    { name: 'Pool A', teams: 'Équipe A\nÉquipe B\nÉquipe C' },
  ]);
  const [selected, setSelected] = useState<string[]>([sectors[0]?.key ?? '']);
  // Le portefeuille de départ est un SOUS-ENSEMBLE des domaines ouverts, tenu
  // comme tel : fermer un domaine le retire aussi du portefeuille, sinon on
  // provisionnerait des équipes sur un DAS qui n'existe pas.
  const [starting, setStarting] = useState<string[]>([sectors[0]?.key ?? '']);
  const [plannedRounds, setPlannedRounds] = useState(3);
  const [modulePreset, setModulePreset] = useState('standard');

  const disabled = busy || pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const payload = pools.map((p) => ({
      name: p.name.trim(),
      teamNames: p.teams.split('\n').map((t) => t.trim()).filter(Boolean),
    }));

    // Une ligue d'une seule équipe n'a pas de sens : sans concurrent, il n'y a
    // rien à se partager et la somme nulle devient un monologue.
    const tropPetit = payload.find((p) => p.teamNames.length < 2);
    if (tropPetit) {
      setError(
        `« ${tropPetit.name || 'Pool sans nom'} » compte moins de deux équipes : sans concurrent, la somme nulle n’a pas de sens.`,
      );
      setBusy(false);
      return;
    }
    if (new Set(payload.map((p) => p.name)).size !== payload.length) {
      setError('Deux ligues ne peuvent pas porter le même nom.');
      setBusy(false);
      return;
    }
    if (new Set(payload.flatMap((p) => p.teamNames)).size !== payload.reduce((a, p) => a + p.teamNames.length, 0)) {
      setError('Deux équipes ne peuvent pas porter le même nom, même dans des ligues différentes.');
      setBusy(false);
      return;
    }
    // Sans domaine de départ, les équipes n'auraient rien à piloter et tous les
    // écrans de saisie s'ouvriraient vides.
    if (starting.length === 0) {
      setError(
        'Le portefeuille de départ est vide : les équipes n’exploiteraient aucun domaine.',
      );
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/sessions/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionName: name,
          pools: payload,
          sectorKeys: selected,
          startingSectorKeys: starting,
          plannedRounds,
          modulePreset,
          maxRounds: 10,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Création refusée.');
        setBusy(false);
        return;
      }
      startTransition(() => { router.refresh(); setBusy(false); });
    } catch {
      setError('Le réseau est indisponible.');
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
      <h2 className="text-xl font-medium">Créer une session</h2>
      <p className="mt-1 mb-5 text-sm text-(--foreground-muted)">
        Le provisionnement génère les DAS, l’écosystème fictif et la dotation — strictement
        identique pour toutes les équipes.
      </p>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border border-(--negative) px-4 py-3 text-sm text-(--negative)">
          {error}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Nom de la session</span>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Atelier stratégie — promotion 2026"
            className="mt-1.5 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Ligues et équipes</legend>
          <p className="mt-1 mb-3 text-xs text-(--foreground-muted)">
            Une ligue est un marché : les équipes d’une même ligue se disputent 100 % des parts.
            Deux ligues simulent des marchés <strong>parallèles et indépendants</strong> — c’est
            ainsi qu’on fait tourner deux salles sans qu’elles interfèrent.
          </p>

          <div className="space-y-3">
            {pools.map((pool, index) => (
              <div key={index} className="rounded-lg border border-(--border) p-4">
                <div className="mb-2 flex items-center gap-3">
                  <input
                    value={pool.name}
                    onChange={(e) =>
                      setPools((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)),
                      )
                    }
                    placeholder="Nom de la ligue"
                    className="flex-1 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm font-medium"
                  />
                  {pools.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPools((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded-lg border border-(--border) px-3 py-2 text-sm"
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
                <textarea
                  rows={4} value={pool.teams}
                  onChange={(e) =>
                    setPools((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, teams: e.target.value } : p)),
                    )
                  }
                  placeholder="Une équipe par ligne"
                  className="w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 font-mono text-sm"
                />
                <p className="tabular mt-1 text-xs text-(--foreground-muted)">
                  {pool.teams.split('\n').filter((t) => t.trim()).length} équipe(s)
                </p>
              </div>
            ))}
          </div>

          {pools.length < 3 ? (
            <button
              type="button"
              onClick={() =>
                setPools((prev) => [
                  ...prev,
                  { name: `Pool ${String.fromCharCode(65 + prev.length)}`, teams: '' },
                ])
              }
              className="mt-3 rounded-lg border border-(--border) px-4 py-2 text-sm"
            >
              Ajouter une ligue
            </button>
          ) : (
            <p className="mt-3 text-xs text-(--foreground-muted)">
              Trois ligues au maximum par session.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Domaines d’activité ouverts</legend>
          <p className="mt-1 mb-2 text-xs text-(--foreground-muted)">
            Ces domaines sont <strong>provisionnés</strong> : segments, fournisseurs,
            distributeurs et cibles de rachat. Ouvrir un domaine le fait exister — cela ne
            l’attribue à personne.
          </p>
          <div className="flex flex-wrap gap-2">
            {sectors.map((s) => {
              const on = selected.includes(s.key);
              return (
                <button
                  key={s.key} type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      if (!prev.includes(s.key)) return [...prev, s.key];
                      if (prev.length === 1) return prev;
                      // Fermer un domaine le retire aussi du portefeuille :
                      // sans quoi on doterait les équipes d'un DAS jamais créé.
                      setStarting((cur) =>
                        cur.length > 1 ? cur.filter((k) => k !== s.key) : cur,
                      );
                      return prev.filter((k) => k !== s.key);
                    })
                  }
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: on ? 'var(--accent)' : 'var(--border)',
                    background: on ? 'var(--surface-muted)' : undefined,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {on ? '✓ ' : ''}{s.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Portefeuille de départ</legend>
          <p className="mt-1 mb-2 text-xs text-(--foreground-muted)">
            Ce que <strong>toutes les équipes exploitent au tour 1</strong>, à l’identique.
            Chaque domaine retenu apporte sa propre dotation — trésorerie, effectif et
            capacité s’additionnent. Les domaines ouverts que vous ne retenez pas ici
            restent la <strong>réserve à acquérir</strong> en cours de partie.
          </p>
          <div className="flex flex-wrap gap-2">
            {sectors
              .filter((s) => selected.includes(s.key))
              .map((s) => {
                const on = starting.includes(s.key);
                return (
                  <button
                    key={s.key} type="button"
                    onClick={() =>
                      setStarting((prev) =>
                        prev.includes(s.key)
                          ? prev.length > 1 ? prev.filter((k) => k !== s.key) : prev
                          : [...prev, s.key],
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      background: on ? 'var(--surface-muted)' : undefined,
                      fontWeight: on ? 600 : 400,
                    }}
                  >
                    {on ? '✓ ' : ''}{s.name}
                  </button>
                );
              })}
          </div>
          <p className="mt-2 text-xs text-(--foreground-muted)">
            {starting.length === 1
              ? 'Un seul domaine au départ : les équipes se diversifieront par acquisition.'
              : `${starting.length} domaines au départ — les équipes arbitrent entre eux dès le premier tour.`}
            {selected.length > starting.length
              ? ` · ${selected.length - starting.length} domaine(s) en réserve.`
              : ' · aucune réserve : rien à acquérir en cours de partie.'}
          </p>
        </fieldset>

        {/* ── L'ampleur du jeu ────────────────────────────────────────────
            Atlas complet demande plusieurs séances. Le préréglage se choisit
            d'entrée pour que les équipes n'ouvrent jamais un écran qu'on ne
            traitera pas, et s'affine champ par champ depuis l'écran de
            pilotage, même en cours de partie. */}
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Ampleur du jeu</legend>
          <p className="mb-3 text-xs text-(--foreground-muted)">
            Vous pourrez ouvrir ou fermer chaque champ ensuite, depuis l’écran de pilotage.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODULE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setModulePreset(preset.key)}
                aria-pressed={modulePreset === preset.key}
                className="rounded-lg border p-3 text-left"
                style={{
                  borderColor: modulePreset === preset.key ? 'var(--accent)' : 'var(--border)',
                  background: modulePreset === preset.key ? 'var(--surface-muted)' : undefined,
                }}
              >
                <span className="block text-sm font-medium">{preset.label}</span>
                <span className="mt-1 block text-xs text-(--foreground-muted)">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block max-w-xs">
          <span className="text-sm font-medium">Tours prévus : <span className="tabular">{plannedRounds}</span></span>
          <input
            type="range" min={3} max={10} value={plannedRounds}
            onChange={(e) => setPlannedRounds(Number(e.target.value))}
            className="mt-1.5 w-full"
          />
          <span className="mt-1 block text-xs text-(--foreground-muted)">
            Indicatif : vous pourrez en ajouter jusqu’à dix, ou clore avant.
          </span>
        </label>

        <button
          type="submit" disabled={disabled}
          className="rounded-lg bg-(--accent) px-6 py-3 font-medium text-white disabled:opacity-40"
        >
          {disabled ? 'Provisionnement…' : 'Créer la session'}
        </button>
      </form>
    </section>
  );
}
