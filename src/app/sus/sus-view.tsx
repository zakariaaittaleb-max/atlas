'use client';

/**
 * ATLAS — questionnaire de satisfaction (System Usability Scale).
 *
 * Rempli par CHAQUE participant, seul — jamais par le facilitateur, jamais à
 * plusieurs sur le même écran. Un score SUS individuel n'a pas de valeur en
 * lui-même (Brooke, 1996) : c'est la moyenne du panel qui s'interprète. On
 * l'affiche donc juste après l'envoi, avec le nombre de réponses déjà reçues.
 */

import Link from 'next/link';
import { useState } from 'react';

import type { SubmitSusResult, SusAggregate } from '@/lib/sus-types';

const QUESTIONS = [
  "Je pense que j'aimerais utiliser Atlas fréquemment",
  'J’ai trouvé Atlas inutilement complexe',
  'J’ai trouvé Atlas facile à utiliser',
  'Je pense que j’aurais eu besoin de l’aide d’une personne pour utiliser Atlas',
  'J’ai trouvé que les fonctions d’Atlas étaient bien intégrées',
  'J’ai trouvé qu’il y avait trop d’incohérences dans Atlas',
  'J’imagine que la plupart des gens apprendraient à utiliser Atlas très rapidement',
  'J’ai trouvé Atlas très lourd à utiliser',
  'Je me suis senti très en confiance en utilisant Atlas',
  'J’ai eu besoin d’apprendre beaucoup de choses avant de pouvoir utiliser Atlas',
] as const;

function verdictFor(score: number) {
  if (score >= 80) return { text: 'Excellent — très utilisable', tone: 'text-(--positive)' };
  if (score >= 68) return { text: 'Au-dessus de la moyenne', tone: 'text-(--positive)' };
  if (score >= 50) return { text: 'Acceptable, améliorations à prévoir', tone: 'text-(--warning)' };
  return { text: 'À revoir en profondeur', tone: 'text-(--negative)' };
}

function ResultCard({ score, aggregate }: { score: number; aggregate: SusAggregate }) {
  const v = verdictFor(score);
  const cv = aggregate.average !== null ? verdictFor(aggregate.average) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-(--border) bg-(--surface) p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-(--foreground-muted)">Votre score SUS</p>
        <p className="mt-1 font-mono text-5xl font-semibold tabular text-(--accent)">{score}</p>
        <p className={'mt-1 text-sm font-medium ' + v.tone}>{v.text}</p>
        <p className="mt-1 text-xs text-(--foreground-muted)">Échelle standard SUS (Brooke, 1996) — 0 à 100</p>
      </div>

      <div className="rounded-xl border border-(--border) bg-(--surface) p-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--border) bg-(--border)">
          <div className="bg-(--surface) p-3 text-center">
            <div className="font-mono text-xl font-semibold text-(--accent)">{aggregate.average ?? '—'}</div>
            <div className="text-xs text-(--foreground-muted)">Moyenne du panel</div>
          </div>
          <div className="bg-(--surface) p-3 text-center">
            <div className="font-mono text-xl font-semibold text-(--accent)">{aggregate.count}</div>
            <div className="text-xs text-(--foreground-muted)">Réponses reçues</div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-(--foreground-muted)">
          {aggregate.count < 3
            ? `Moyenne indicative — un panel SUS fiable compte au moins 5 réponses (n=${aggregate.count} pour l’instant).`
            : cv ? `${cv.text} sur l’ensemble du panel.` : ''}
        </p>
      </div>

      <div className="rounded-xl border border-(--border) bg-(--surface) p-6">
        <h3 className="mb-3 text-sm font-semibold">Points relevés par le panel</h3>
        {aggregate.responses.filter((r) => r.comment).length === 0 ? (
          <p className="text-sm text-(--foreground-muted)">Aucun commentaire du panel pour l’instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {aggregate.responses.filter((r) => r.comment).map((r, i) => (
              <div key={i} className="rounded-lg bg-(--surface-muted) px-3 py-2 text-sm">
                <span className="mr-2 rounded-full bg-(--surface) px-2 py-0.5 font-mono text-xs text-(--accent)">
                  {r.label} · {r.score}/100
                </span>
                {r.comment}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SusView({
  alreadySubmitted, myScore, initialAggregate, submitAction,
}: {
  alreadySubmitted: boolean;
  myScore: number | null;
  initialAggregate: SusAggregate;
  /** Passée par la page : un composant client n'importe pas une action serveur. */
  submitAction: (input: {
    label: string; answers: number[]; comment: string;
  }) => Promise<SubmitSusResult>;
}) {
  const [label, setLabel] = useState('');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; aggregate: SusAggregate } | null>(
    alreadySubmitted && myScore !== null ? { score: myScore, aggregate: initialAggregate } : null,
  );

  async function submit() {
    const values = QUESTIONS.map((_, i) => answers[i]);
    const missing = values.findIndex((v) => v === undefined);
    if (missing !== -1) {
      setError(`Merci de répondre à la question ${missing + 1}.`);
      document.getElementById(`q-${missing}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError(null);
    setBusy(true);
    const res = await submitAction({ label, answers: values, comment });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setResult({ score: res.score, aggregate: res.aggregate });
  }

  if (result) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-2xl px-6 py-10">
        <p className="mb-6 text-sm text-(--foreground-muted)">
          <Link href="/cockpit" className="hover:underline">← Retour au cockpit</Link>
        </p>
        <ResultCard score={result.score} aggregate={result.aggregate} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-2xl px-6 py-10">
      <header className="mb-6">
        <p className="mb-3 text-sm text-(--foreground-muted)">
          <Link href="/cockpit" className="hover:underline">← Retour au cockpit</Link>
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-(--accent)">Panel de test · réponse individuelle</p>
        <h1 className="text-2xl font-bold text-(--heading)">Questionnaire de satisfaction — Atlas</h1>
        <p className="mt-2 text-sm text-(--foreground-muted)">
          Répondez seul·e, sans consulter les autres participants. Vos réponses sont anonymes pour le facilitateur ;
          seul le score global du groupe est calculé automatiquement.
        </p>
      </header>

      <div className="mb-4 rounded-xl border border-(--border) bg-(--surface) p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Votre prénom ou pseudonyme <span className="font-normal text-(--foreground-muted)">(optionnel)</span>
          </span>
          <input
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
            value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex : Participant B"
          />
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-(--border) bg-(--surface) p-5">
        {QUESTIONS.map((q, i) => (
          <div key={i} id={`q-${i}`} className="border-b border-(--border) pb-4 last:border-0 last:pb-0">
            <p className="mb-2 flex gap-2 text-sm font-medium">
              <span className="font-mono text-xs text-(--accent)">{String(i + 1).padStart(2, '0')}</span>
              {q}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [i]: v }))}
                  className={
                    'rounded-lg py-2 text-sm font-medium ' +
                    (answers[i] === v
                      ? 'bg-(--accent) text-(--on-accent)'
                      : 'bg-(--surface-muted) text-(--foreground-muted)')
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-(--foreground-muted)">
              <span>Pas d’accord</span><span>Tout à fait d’accord</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-(--border) bg-(--surface) p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Un point important à expliquer sur votre note ?</span>
          <textarea
            className="min-h-20 w-full resize-y rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm"
            value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Ex : j’ai mis 2/5 à la question 7 car je n’ai pas trouvé où revenir en arrière depuis le cabinet conseil"
          />
        </label>
        {error && <p className="mt-3 text-sm text-(--negative)">{error}</p>}
        <button
          type="button" onClick={submit} disabled={busy}
          className="mt-4 w-full rounded-lg bg-(--accent) py-2.5 text-sm font-semibold text-(--on-accent) disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Envoyer ma réponse'}
        </button>
      </div>
    </main>
  );
}
