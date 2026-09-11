/**
 * Export analytique d'un livrable : une table À PLAT.
 *
 * Le classeur existant est fait pour être LU — une feuille par sujet, des
 * libellés, des unités. Il ne s'analyse pas : un tableau croisé dynamique ou
 * Power BI veulent une observation par ligne, pas une mise en page.
 *
 * D'où ce format long — sujet, tour, indicateur, valeur, régime, marge — qui
 * se pivote sans retouche. C'est le même livrable, figé à la commande : on
 * change la forme, jamais les chiffres.
 *
 * ── POURQUOI C'EST UN MODULE ───────────────────────────────────────────────
 * Sortir les données du jeu n'est pas neutre : ça permet de préparer ses
 * analyses hors séance, et tous les formateurs ne le veulent pas. C'est donc
 * une capacité qu'on OUVRE, jamais un défaut qu'on découvre.
 */

import { NextResponse } from 'next/server';

import { requireTeam } from '@/lib/dal';
import { isOn } from '@/lib/modules-state';
import { loadEnabledModules } from '@/lib/server/modules';
import { createServerClient } from '@/lib/supabase/server';

interface Field {
  key: string;
  label: string;
  mode: string;
  value?: number;
  band?: string;
  lower?: number;
  upper?: number;
  unit?: string;
  errorMargin?: number;
}

interface Subject {
  subjectId: string;
  subjectName: string;
  isSelf?: boolean;
  fields?: Field[];
  history?: { roundNumber: number; values: Record<string, number | null> }[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const team = await requireTeam();

  const modules = await loadEnabledModules(team.sessionId);
  if (!isOn(modules, 'cabinet.export_analytique')) {
    return NextResponse.json(
      { error: 'L’export analytique n’est pas ouvert sur cette session.' },
      { status: 403 },
    );
  }

  const supabase = await createServerClient();
  const { data: order } = await supabase
    .from('consulting_orders')
    .select('id, study_key, tier, round_number, error_margin, payload')
    .eq('id', orderId)
    .eq('team_id', team.teamId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Rapport introuvable.' }, { status: 404 });
  }

  const payload = order.payload as { subjects?: Subject[] } | null;
  const subjects = payload?.subjects ?? [];

  const rows: string[][] = [[
    'etude', 'palier', 'marge_erreur', 'sujet', 'sujet_est_vous',
    'tour', 'indicateur', 'libelle', 'valeur', 'regime', 'unite',
  ]];

  const labelOf = new Map<string, string>();
  const unitOf = new Map<string, string>();
  const modeOf = new Map<string, string>();
  for (const subject of subjects) {
    for (const field of subject.fields ?? []) {
      labelOf.set(field.key, field.label);
      if (field.unit) unitOf.set(field.key, field.unit);
      modeOf.set(`${subject.subjectId}:${field.key}`, field.mode);
    }
  }

  for (const subject of subjects) {
    // L'historique porte déjà le tour observé : on n'ajoute pas la photo, qui
    // ferait doublon et fausserait tout décompte.
    for (const point of subject.history ?? []) {
      for (const [key, value] of Object.entries(point.values)) {
        if (value === null) continue;
        rows.push([
          String(order.study_key),
          String(order.tier),
          String(order.error_margin),
          subject.subjectName,
          subject.isSelf ? 'oui' : 'non',
          String(point.roundNumber),
          key,
          labelOf.get(key) ?? key,
          String(value),
          modeOf.get(`${subject.subjectId}:${key}`) ?? 'estimate',
          unitOf.get(key) ?? '',
        ]);
      }
    }
  }

  // Point-virgule et BOM : Excel francophone ouvre la virgule comme séparateur
  // décimal, et sans BOM il mange les accents.
  const csv = '﻿' + rows.map((r) => r.map(escapeCell).join(';')).join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="atlas-${order.study_key}-t${order.round_number}.csv"`,
    },
  });
}

function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
