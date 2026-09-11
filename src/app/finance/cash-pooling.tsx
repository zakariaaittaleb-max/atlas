'use client';

/**
 * Cash pooling : déplacer la trésorerie d'un domaine vers un autre.
 *
 * ── POURQUOI LA SOMME DOIT VALOIR ZÉRO ─────────────────────────────────────
 * C'est un transfert, pas une levée de fonds. Pour donner à l'étoile, il faut
 * prendre à la vache à lait — et c'est là tout l'arbitrage. Un solde non nul
 * n'est donc pas corrigé en silence : l'écran l'affiche, et le serveur refuse.
 * Une équipe qui croit avoir déplacé un milliard et n'en a déplacé que la
 * moitié prendrait ses décisions suivantes sur une trésorerie qu'elle n'a pas.
 *
 * ── CE QUE LE DOMAINE QUI REÇOIT GAGNE ─────────────────────────────────────
 * Rien, par lui-même. De l'argent ne produit pas de la part de marché : il
 * donne les moyens d'investir, et c'est l'investissement qui produit. Le
 * domaine qu'on PONCTIONNE, en revanche, paie ses fournisseurs plus tard et le
 * perd en compétitivité. L'écran le dit, parce qu'une équipe qui l'apprend à
 * la révélation l'apprend trop tard.
 */

import { formatMadCompact } from '@/lib/format';
import type { DasEntry } from '@/lib/decision-types';

export function CashPooling({
  das,
  transfers,
  disabled,
  onChange,
}: {
  das: DasEntry[];
  transfers: { dasId: string; transferMad: number }[];
  disabled: boolean;
  onChange: (next: { dasId: string; transferMad: number }[]) => void;
}) {
  const valueOf = (dasId: string) =>
    transfers.find((t) => t.dasId === dasId)?.transferMad ?? 0;

  const solde = transfers.reduce((acc, t) => acc + t.transferMad, 0);
  const equilibre = Math.abs(solde) <= 1;

  function set(dasId: string, transferMad: number) {
    const autres = transfers.filter((t) => t.dasId !== dasId);
    onChange(transferMad === 0 ? autres : [...autres, { dasId, transferMad }]);
  }

  return (
    <fieldset disabled={disabled} className="mt-8 border-t border-(--border) pt-6">
      <legend className="mb-1 text-sm font-medium">
        Transferts de trésorerie entre vos domaines
      </legend>
      <p className="mb-4 max-w-3xl text-xs text-(--foreground-muted)">
        Prendre là où l’argent dort pour le mettre là où il pousse. Les montants doivent
        s’équilibrer : pour donner à l’un, prenez à l’autre. Un domaine ponctionné paie ses
        fournisseurs plus tard et <strong>perd en compétitivité</strong> ; celui qui reçoit ne
        gagne rien de lui-même — c’est ce que vous en investirez qui produira.
      </p>

      <ul className="flex flex-col gap-3 p-0 m-0 list-none">
        {das.map((d) => {
          const v = valueOf(d.dasId);
          return (
            <li key={d.dasId} className="flex flex-wrap items-center gap-3">
              <span className="min-w-[12rem] text-sm font-medium">{d.name}</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Transfert pour ${d.name}`}
                value={v === 0 ? '' : String(Math.round(v))}
                onChange={(e) => {
                  const brut = e.target.value.replace(/[^0-9-]/g, '');
                  set(d.dasId, Number(brut) || 0);
                }}
                placeholder="0"
                className="tabular w-44 rounded-lg border border-(--border) bg-(--background) px-3 py-2 text-sm"
              />
              <span className="text-sm text-(--foreground-muted)">DH</span>
              {v !== 0 ? (
                <span
                  className="tabular text-sm"
                  style={{ color: v > 0 ? 'var(--positive)' : 'var(--warning)' }}
                >
                  {v > 0
                    ? `reçoit ${formatMadCompact(v)}`
                    : `cède ${formatMadCompact(-v)}`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p
        className="tabular mt-4 text-sm font-medium"
        style={{ color: equilibre ? 'var(--foreground-muted)' : 'var(--negative)' }}
      >
        {equilibre
          ? 'Transferts équilibrés.'
          : `Déséquilibre de ${formatMadCompact(solde)} : ces transferts seront refusés tant qu’ils ne s’annulent pas.`}
      </p>
    </fieldset>
  );
}
