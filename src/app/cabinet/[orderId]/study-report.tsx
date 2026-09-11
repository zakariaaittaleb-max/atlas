'use client';

/**
 * Le rapport d'une étude.
 *
 * Un livrable ne se lisait qu'en téléchargeant un classeur : l'équipe sortait
 * du jeu pour le consulter, puis revenait décider de mémoire. Puis il s'est
 * déplié dans la liste du cabinet — mieux, mais cinq études empilées faisaient
 * une page interminable, et rien ne se projetait au débriefing.
 *
 * Il a maintenant sa page : en-tête qui dit ce qu'on a payé et ce que ça vaut,
 * synthèse chiffrée, courbes d'évolution, notes méthodologiques. Il se lit, se
 * projette, et se retrouve par son adresse.
 */

import Link from 'next/link';

import { DisclosureList } from '@/components/disclosure-list';
import { StudyCharts, SupplierRanks, type ChartSubject } from '@/components/study-charts';
import type { FieldDisclosure } from '@/lib/consulting-types';
import { formatMadCompact, formatPct } from '@/lib/format';

const TIER_LABELS: Record<string, string> = {
  express: 'Note express',
  standard: 'Étude standard',
  approfondie: 'Étude approfondie',
};

interface ReportSubject extends ChartSubject {
  fields: FieldDisclosure[];
}

export function StudyReport({
  studyName, studyDescription, scopeLabel, tier, errorMargin, roundNumber,
  priceMad, orderId, subjects, notes, auditVerdict, canPrint, canExport,
}: {
  studyName: string;
  studyDescription: string;
  scopeLabel: string;
  tier: string;
  errorMargin: number;
  roundNumber: number;
  priceMad: number;
  catalogPriceMad: number;
  orderId: string;
  /**
   * Sortir le rapport du jeu — l'imprimer, l'analyser ailleurs — n'est pas
   * neutre : tous les formateurs ne le veulent pas. Ce sont des capacités que
   * le facilitateur OUVRE, fermées tant qu'il n'a rien dit.
   */
  canPrint: boolean;
  canExport: boolean;
  subjects: ReportSubject[];
  notes: string[];
  auditVerdict: string | null;
}) {
  const hasHistory = subjects.some((s) => (s.history ?? []).length > 1);

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-6 py-10">
      <div className="mb-6 print:hidden">
        <Link href="/cabinet" className="text-sm underline">
          ← Retour au cabinet
        </Link>
      </div>

      <header className="mb-8 border-b border-(--border) pb-6">
        <p className="text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
          Rapport de mission · {TIER_LABELS[tier] ?? tier}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{studyName}</h1>
        <p className="mt-2 text-(--foreground-muted)">{scopeLabel}</p>
        {studyDescription ? (
          <p className="mt-3 max-w-3xl text-sm text-(--foreground-muted)">{studyDescription}</p>
        ) : null}

        <dl className="tabular mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Fact label="Exercice observé" value={roundNumber < 0 ? 'Dotation' : `Tour ${roundNumber}`} />
          <Fact label="Honoraires" value={formatMadCompact(priceMad)} />
          <Fact
            label="Précision annoncée"
            value={errorMargin > 0 ? `±${formatPct(errorMargin, 0)}` : 'sans marge d’erreur'}
          />
          <Fact label="Sujets analysés" value={String(subjects.length)} />
        </dl>
      </header>

      {auditVerdict ? (
        <section className="mb-8 rounded-xl border border-(--accent) bg-(--surface) p-6">
          <h2 className="mb-2 text-lg font-medium">Verdict du cabinet</h2>
          <p>{auditVerdict}</p>
        </section>
      ) : null}

      {hasHistory ? (
        <section className="mb-8">
          <h2 className="mb-1 text-xl font-medium">Évolution</h2>
          <p className="mb-4 max-w-3xl text-sm text-(--foreground-muted)">
            Une photo ne décide rien. Savoir qu’un concurrent détient 22 % du marché ne dit pas
            s’il vient d’en gagner huit ou d’en perdre douze.
          </p>
          <StudyCharts subjects={subjects} errorMargin={errorMargin} />
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-medium">Synthèse chiffrée</h2>
        <div className="space-y-4">
          {subjects.map((subject) => (
            <div
              key={subject.subjectId}
              className="rounded-xl border bg-(--surface) p-5"
              style={{ borderColor: subject.isSelf ? 'var(--accent)' : 'var(--border)' }}
            >
              <p className="mb-3 font-medium">{subject.subjectName}</p>
              <DisclosureList fields={subject.fields} />
            </div>
          ))}
        </div>
      </section>

      {subjects.some((s) => (s.suppliers ?? []).length > 0) ? (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-medium">Chaînes d’approvisionnement</h2>
          <SupplierRanks subjects={subjects} />
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className="border-t border-(--border) pt-5">
          <h2 className="mb-3 text-sm font-medium tracking-wide text-(--foreground-muted) uppercase">
            Notes méthodologiques
          </h2>
          <ul className="space-y-1.5 text-sm text-(--foreground-muted)">
            {notes.map((note) => (
              <li key={note}>— {note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3 print:hidden">
        <a
          href={`/api/consulting/${orderId}/download`}
          className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
        >
          Télécharger le classeur
        </a>

        {canPrint ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
          >
            Imprimer le rapport
          </button>
        ) : null}

        {canExport ? (
          <a
            href={`/api/consulting/${orderId}/table`}
            className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium"
          >
            Export analytique (table à plat)
          </a>
        ) : null}
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-(--foreground-muted)">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
