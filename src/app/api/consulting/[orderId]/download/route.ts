/**
 * Téléchargement du livrable d'une étude, en classeur Excel.
 *
 * Le contenu est celui FIGÉ à la commande (`consulting_orders.payload`), jamais
 * recalculé : une équipe doit pouvoir relire au tour 5 ce qu'elle a acheté au
 * tour 2, avec les mêmes chiffres — y compris s'ils étaient faux. C'est la
 * matière du débriefing, et recalculer effacerait l'erreur qu'on veut montrer.
 */

import { NextResponse } from 'next/server';

import { TIER_PROFILES, type StudyTier } from '@/lib/engine/consulting';
import { getTeamContext } from '@/lib/dal';
import type { Deliverable } from '@/lib/server/consulting-fulfil';
import { buildWorkbook, safeFileName, type SheetSpec } from '@/lib/server/xlsx';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const team = await getTeamContext();
  if (!team) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const { orderId } = await params;
  const admin = createAdminClient();

  const { data: order } = await admin
    .from('consulting_orders')
    .select('id, team_id, study_key, tier, round_number, price_paid_mad, error_margin, payload, consulting_studies(name)')
    .eq('id', orderId)
    .maybeSingle();

  // Le contrôle de propriété est explicite : la clé service_role contourne la
  // RLS, c'est donc ici et nulle part ailleurs que se joue l'autorisation.
  if (!order || order.team_id !== team.teamId) {
    return NextResponse.json({ error: 'Étude introuvable.' }, { status: 404 });
  }

  const deliverable = order.payload as unknown as Deliverable | null;
  if (!deliverable) {
    return NextResponse.json({ error: 'Livrable indisponible.' }, { status: 409 });
  }

  const studyName =
    (order.consulting_studies as unknown as { name: string } | null)?.name ?? order.study_key;
  const tier = order.tier as StudyTier;
  const profile = TIER_PROFILES[tier];

  // La marge vient du LIVRABLE, pas du palier : l'audit d'alignement est acheté
  // en « approfondie » mais ne comporte aucune erreur, et annoncer ±3 % sur un
  // rapport exact contredirait la page suivante.
  const margin = deliverable.errorMargin ?? profile.errorMargin;

  const preamble = [
    `${studyName} — ${profile.label}`,
    `Équipe : ${team.teamName} · Données du tour ${deliverable.roundNumber}`,
    margin > 0
      ? `Marge d'erreur annoncée : ±${(margin * 100).toFixed(0)} %. Les valeurs ci-dessous sont des ESTIMATIONS : raisonnez sur les fourchettes de l'onglet « Intervalles », pas sur le point.`
      : "Aucune marge d'erreur : ce rapport analyse les données que vous avez vous-même transmises.",
    ...deliverable.notes,
  ];

  const sheets: SheetSpec[] = [];

  // ── Audit d'alignement : décomposition axe par axe ───────────────────────
  if (deliverable.auditRows) {
    sheets.push({
      name: 'Audit alignement',
      preamble: [...preamble, '', deliverable.auditVerdict ?? ''],
      columns: [
        { header: 'Niveau', key: 'level', width: 12 },
        { header: 'Axe', key: 'axis', width: 26 },
        { header: 'Observé', key: 'observed', format: 'score' },
        { header: 'Cible', key: 'target', format: 'score' },
        { header: 'Écart', key: 'gap', format: 'score' },
        { header: 'Poids', key: 'weight', format: 'score' },
        { header: "Points d'IA perdus", key: 'penaltyPts', format: 'score', width: 20 },
      ],
      rows: deliverable.auditRows.map((r) => ({
        level: r.level === 'business' ? 'Business' : 'Corporate',
        axis: r.axis,
        observed: round2(r.observed),
        target: round2(r.target),
        gap: round2(r.gap),
        weight: round2(r.weight),
        penaltyPts: round2(r.penaltyPts),
      })),
    });
  }

  // ── Études de marché : un onglet, une ligne par sujet ────────────────────
  if (deliverable.subjects.length > 0) {
    // Toutes les lignes partagent les mêmes champs : on prend l'ordre du
    // premier sujet comme ordre de colonnes.
    const fieldKeys = deliverable.subjects[0].fields.map((f) => f.key);
    const labels = new Map(deliverable.subjects[0].fields.map((f) => [f.key, f.label]));

    sheets.push({
      name: 'Données',
      preamble,
      columns: [
        { header: 'Sujet', key: 'subject', width: 34 },
        ...fieldKeys.map((k) => ({ header: labels.get(k) ?? k, key: k, width: 20 })),
      ],
      rows: deliverable.subjects.map((subject) => {
        const row: Record<string, string | number | null> = { subject: subject.subjectName };
        for (const field of subject.fields) {
          row[field.key] =
            field.mode === 'withheld'
              ? 'non couvert par ce palier'
              : field.mode === 'band'
                ? `${field.band} (${round2(field.lower)} – ${round2(field.upper)})`
                : round2(field.value);
        }
        return row;
      }),
    });

    // Second onglet : les intervalles, pour que les étudiants puissent
    // raisonner sous incertitude au lieu de prendre l'estimation pour la vérité.
    const estimates = deliverable.subjects.flatMap((subject) =>
      subject.fields
        .filter((f) => f.mode === 'estimate')
        .map((f) => ({
          subject: subject.subjectName,
          field: f.label,
          value: round2(f.value),
          lower: round2(f.lower),
          upper: round2(f.upper),
          margin: f.errorMargin,
        })),
    );

    if (estimates.length > 0) {
      sheets.push({
        name: 'Intervalles',
        preamble: [
          'Fourchettes de confiance',
          'Chaque estimation est encadrée par son intervalle. La valeur vraie s’y trouve toujours.',
          'Raisonnez sur la fourchette, pas sur le point.',
        ],
        columns: [
          { header: 'Sujet', key: 'subject', width: 34 },
          { header: 'Indicateur', key: 'field', width: 26 },
          { header: 'Estimation', key: 'value', format: 'score' },
          { header: 'Borne basse', key: 'lower', format: 'score' },
          { header: 'Borne haute', key: 'upper', format: 'score' },
          { header: "Marge d'erreur", key: 'margin', format: 'pct' },
        ],
        rows: estimates,
      });
    }
  }

  if (sheets.length === 0) {
    return NextResponse.json({ error: 'Ce livrable ne contient aucune donnée.' }, { status: 409 });
  }

  const buffer = await buildWorkbook(studyName, sheets);
  const filename = safeFileName('atlas', order.study_key, tier, team.teamName, `T${order.round_number}`);

  await admin.from('exports_log').insert({
    session_id: team.sessionId, team_id: team.teamId,
    round_number: order.round_number, export_type: 'etude', requested_by: team.userId,
  });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Deux décimales : au-delà, un tableur affiche du bruit de calcul. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
