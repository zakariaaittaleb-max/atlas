'use client';

/**
 * Coque commune aux écrans de saisie.
 *
 * Porte les invariants d'interface du cahier (doc 00 §8) :
 *
 *   • **Barre de validation fixée en bas d'écran**, grisée tant que des
 *     décisions obligatoires manquent, avec le NOMBRE de décisions restantes
 *     affiché dessus. Une équipe doit savoir à tout instant ce qui lui manque,
 *     sans parcourir les écrans.
 *
 *   • **Aucune action de sauvegarde manuelle.** Le bouton du bas ne sauvegarde
 *     pas — tout est déjà parti. Il force l'envoi de ce qui reste en file et
 *     déclare le tour prêt.
 *
 * ── VALIDER ET RÉINITIALISER, PAR BLOC ─────────────────────────────────────
 * L'auto-sauvegarde ne règle pas deux besoins réels, et les confondre avec elle
 * était une erreur :
 *
 *   • **Valider ce bloc** écrit les valeurs AFFICHÉES, même si personne n'y a
 *     touché. C'est le geste d'une équipe qui reconduit sciemment les choix de
 *     l'exercice précédent : sans lui, il fallait déplacer un curseur puis le
 *     remettre pour que la reconduction soit enregistrée.
 *
 *   • **Réinitialiser** ramène le bloc à son état d'OUVERTURE DE TOUR. Après
 *     vingt minutes d'hypothèses empilées, plus personne ne se souvient de ce
 *     qui a été changé ; « annuler » doit avoir une définition, et c'est
 *     celle-là.
 *
 * Le geste est confirmé : il efface un travail, et un clic malheureux à la fin
 * d'un tour serré coûterait la séance.
 */

import { Circle, CircleCheck, CloudOff, LoaderCircle, Lock, PencilLine } from 'lucide-react';
import { useState } from 'react';

import { InfoHint } from '@/components/ui/info-hint';
import { formatMadCompact, formatScore, formatUnits } from '@/lib/format';
import { SAVE_LABELS, type SaveState } from '@/lib/use-autosave';

export interface MissingDecision {
  label: string;
  href: string;
  /** Domaine concerné, ou `null` pour une décision de niveau Groupe. */
  dasId: string | null;
}

const SAVE_ICONS: Record<SaveState, typeof Circle> = {
  idle: Circle,
  pending: PencilLine,
  saving: LoaderCircle,
  saved: CircleCheck,
  error: CloudOff,
  locked: Lock,
};

/**
 * L'état de l'enregistrement, en mots, en icône et en heure.
 *
 * Un point de couleur portait l'état : invisible en daltonisme, et muet sur ce
 * qui compte en fin de tour — « enregistré », mais QUAND ? L'heure de la
 * dernière sauvegarde répond, et chaque état a sa forme.
 *
 * Le lecteur d'écran n'entend que les issues (enregistré, hors ligne, refusé) :
 * annoncer « modification en cours » à chaque frappe couvrirait tout le reste.
 */
export function SaveIndicator({
  state, pending, lastError, savedAt = null,
}: { state: SaveState; pending: number; lastError: string | null; savedAt?: number | null }) {
  const colour =
    state === 'saved' ? 'var(--positive)'
    : state === 'error' || state === 'locked' ? 'var(--negative)'
    : 'var(--foreground-muted)';
  const Icon = SAVE_ICONS[state];

  // Le message du serveur prime quand il existe ; sinon l'étiquette générique,
  // qui dit l'essentiel : rien n'est perdu.
  const label =
    lastError && (state === 'error' || state === 'locked') ? lastError
    : state === 'saved' && savedAt !== null ? `${SAVE_LABELS.saved} à ${clockOf(savedAt)}`
    : SAVE_LABELS[state];
  const announce = state === 'saved' || state === 'error' || state === 'locked' ? label : '';

  return (
    <p className="flex items-center gap-2 text-sm" style={{ color: colour }}>
      <Icon
        aria-hidden
        className={`h-4 w-4 shrink-0 ${state === 'saving' ? 'animate-spin motion-reduce:animate-none' : ''}`}
      />
      <span>{label}</span>
      {pending > 0 ? (
        <span className="tabular text-(--foreground-muted)">({pending} en attente)</span>
      ) : null}
      <span role="status" className="sr-only">{announce}</span>
    </p>
  );
}

function clockOf(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Valider / réinitialiser un bloc de saisie.
 *
 * `changed` compare l'affichage à l'état d'ouverture du tour : sans lui, le
 * bouton « Réinitialiser » resterait actif alors qu'il n'y a rien à défaire, ce
 * qui laisse croire qu'il fait autre chose.
 */
export function SectionActions({
  what, locked, changed, recorded, onValidate, onReset,
}: {
  /** Ce qu'on valide, au singulier : « la stratégie du Groupe ». */
  what: string;
  locked: boolean;
  changed: boolean;
  /** Le tour a-t-il déjà reçu une écriture pour ce bloc ? */
  recorded: boolean;
  onValidate: () => void | Promise<void>;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [validated, setValidated] = useState(false);

  if (locked) {
    return (
      <p className="mt-6 flex items-center gap-2 border-t border-(--border) pt-4 text-sm text-(--foreground-muted)">
        <Lock aria-hidden className="h-4 w-4 shrink-0" />
        Tour verrouillé — ce bloc n’accepte plus de modification.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-(--border) pt-4">
      <button
        type="button"
        onClick={async () => {
          await onValidate();
          setValidated(true);
          setConfirming(false);
        }}
        className="rounded-lg bg-(--accent) hover:bg-(--accent-hover) transition-colors px-5 py-2.5 text-sm font-medium text-(--on-accent)"
      >
        Valider {what}
      </button>

      {confirming ? (
        <>
          <button
            type="button"
            onClick={() => { onReset(); setConfirming(false); setValidated(false); }}
            className="rounded-lg border border-(--negative) px-4 py-2.5 text-sm font-medium text-(--negative)"
          >
            Confirmer la réinitialisation
          </button>
          <button
            type="button" onClick={() => setConfirming(false)}
            className="rounded-lg border border-(--border) px-4 py-2.5 text-sm"
          >
            Annuler
          </button>
          <span className="text-sm text-(--foreground-muted)">
            Les valeurs de ce bloc reviendront à ce qu’elles étaient à l’ouverture du tour.
          </span>
        </>
      ) : (
        <button
          type="button" disabled={!changed} onClick={() => setConfirming(true)}
          className="rounded-lg border border-(--border) px-4 py-2.5 text-sm disabled:opacity-40"
        >
          Réinitialiser au début du tour
        </button>
      )}

      {!confirming ? (
        <span className="flex items-center gap-2 text-sm text-(--foreground-muted)">
          <span role="status">
            {validated
              ? '✓ Validé — vos valeurs sont enregistrées.'
              : recorded
                ? 'Déjà enregistré ce tour'
                : 'Pas encore enregistré ce tour'}
          </span>
          <InfoHint label={`Valider ${what}`}>
            {recorded
              ? 'Valider à nouveau écrase l’enregistrement par les valeurs affichées.'
              : 'Valider écrit les valeurs affichées, même si vous n’y avez pas touché : c’est ainsi qu’on reconduit sciemment les choix du tour précédent.'}
            <span className="mt-2 block">
              « Réinitialiser » ramène le bloc à son état d’ouverture du tour.
            </span>
          </InfoHint>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Où en est le domaine piloté, volet par volet.
 *
 * Le parcours attendu est « je choisis un domaine, je le renseigne partout,
 * je passe au suivant ». Encore faut-il voir ce qui reste : sans cette liste,
 * une équipe qui a soigné sa stratégie découvrait au verrouillage qu'elle
 * n'avait jamais ouvert l'écran des achats.
 */
export function DasChecklist({
  items, className = 'mb-8',
}: { items: { label: string; href: string; done: boolean }[]; className?: string }) {
  const left = items.filter((i) => !i.done).length;

  return (
    <div className={`rounded-xl border border-(--border) bg-(--surface) p-4 ${className}`}>
      <p className="text-sm font-medium">
        {left === 0
          ? '✓ Ce domaine est renseigné sur tous les volets.'
          : `${left} volet${left > 1 ? 's' : ''} à renseigner sur ce domaine`}
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <a
              href={item.href}
              className="hover:underline"
              style={{ color: item.done ? 'var(--foreground-muted)' : 'var(--foreground)' }}
            >
              {/* Le signe double la couleur : jamais d'information portée par
                  la seule teinte. */}
              <span aria-hidden>{item.done ? '✓ ' : '○ '}</span>
              {item.label}
              <span className="sr-only">{item.done ? ' — fait' : ' — à faire'}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DecisionBar({
  state, pending, lastError, savedAt = null, missing, decisionsOpen, onValidate,
}: {
  state: SaveState;
  pending: number;
  lastError: string | null;
  savedAt?: number | null;
  missing: MissingDecision[];
  decisionsOpen: boolean;
  onValidate: () => void;
}) {
  const blocked = missing.length > 0 || !decisionsOpen;

  return (
    <div className="sticky bottom-0 z-10 border-t border-(--border) bg-(--surface)">
      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SaveIndicator state={state} pending={pending} lastError={lastError} savedAt={savedAt} />
            <InfoHint label="Enregistrement de vos saisies">
              Vos saisies sont enregistrées au fil de la frappe : le bouton de droite ne
              sauvegarde rien, il déclare votre tour prêt.
            </InfoHint>
          </div>
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
          className="rounded-lg bg-(--accent) enabled:hover:bg-(--accent-hover) transition-colors px-6 py-3 font-medium text-(--on-accent) disabled:opacity-40"
        >
          {!decisionsOpen
            ? 'Tour verrouillé'
            : missing.length > 0
              ? `${missing.length} décision${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''}`
              : 'Déclarer mon tour prêt'}
        </button>
      </div>

    </div>
  );
}

/** Champ numérique en dirhams, avec coût dérivé affiché en direct. */
export function MoneyField({
  label, value, onChange, hint, disabled, max, previous, shareOf, shareLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  disabled?: boolean;
  max?: number;
  /** Montant du tour précédent, pour situer la saisie. */
  previous?: number;
  /** Dénominateur d'une expression en part — trésorerie, chiffre d'affaires. */
  shareOf?: number;
  /** Ce que `shareOf` désigne : « de la trésorerie », « du CA du domaine ». */
  shareLabel?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-medium">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </span>
      <NumberInput
        value={value} onChange={onChange} max={max} disabled={disabled}
        className="mt-1.5 w-full"
      />
      <Reference value={value} previous={previous} shareOf={shareOf} shareLabel={shareLabel} />
    </label>
  );
}

/**
 * Saisie d'un entier long, avec séparateurs de milliers.
 *
 * ── POURQUOI PAS `type="number"` ───────────────────────────────────────────
 * Parce qu'il INTERDIT les séparateurs : un champ natif refuse « 180 500 000 »
 * comme invalide et n'accepte que la suite brute `180500000`. Or personne ne
 * lit neuf chiffres collés — on les recompte un à un, et on se trompe d'un
 * facteur dix sans le voir. Sur un montant qui engage la trésorerie du groupe,
 * c'est une erreur que l'écran doit rendre impossible, pas une coquetterie.
 *
 * On passe donc en `type="text"` avec `inputMode="numeric"`, ce qui conserve le
 * pavé numérique sur mobile, et on formate soi-même. Ce qui se perd : les
 * flèches natives du navigateur. Elles ne servaient à rien sur des pas de
 * 100 000 — cinquante clics pour un investissement courant.
 *
 * ── POURQUOI LE FORMAT NE S'APPLIQUE QU'AU REPOS ───────────────────────────
 * Regrouper les chiffres À CHAQUE FRAPPE déplace le curseur : on insère une
 * espace derrière la position courante et le caret saute d'un cran, si bien
 * qu'on tape « 1500 » et qu'on obtient « 1 005 ». Tant que le champ a le focus
 * il montre donc les chiffres bruts, et il se regroupe à la sortie. L'équipe
 * tape sans surprise, et relit en lisible.
 */
export function NumberInput({
  value, onChange, disabled, max, className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  max?: number;
  className?: string;
}) {
  // `null` = champ au repos, affiché groupé. Une chaîne = ce que l'équipe est
  // en train de taper, laissé intact jusqu'à ce qu'elle sorte du champ.
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => {
    const floored = Math.max(Number.isFinite(n) ? n : 0, 0);
    return max !== undefined ? Math.min(floored, max) : floored;
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? formatUnits(value)}
      // Un zéro laissé en place oblige à le sélectionner avant de taper, et
      // produit « 0500000 » quand on l'oublie.
      onFocus={() => setDraft(value === 0 ? '' : String(Math.round(value)))}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        setDraft(digits);
        onChange(clamp(Number(digits)));
      }}
      onBlur={() => setDraft(null)}
      className={`tabular rounded-lg border border-(--border) bg-(--surface) px-3 py-2 disabled:opacity-50 ${className}`}
    />
  );
}

/**
 * La ligne de repères sous un champ de montant.
 *
 * ── POURQUOI ───────────────────────────────────────────────────────────────
 * Un champ vide demandant « combien investissez-vous ? » n'a pas de réponse
 * raisonnable : dix millions est énorme pour un domaine et négligeable pour un
 * autre, et l'équipe n'a aucun moyen de le savoir en regardant le champ. Elle
 * tape alors un chiffre rond, et le débriefing porte sur un arbitrage qui n'a
 * jamais eu lieu.
 *
 * Deux repères suffisent à rendre la décision réelle :
 *   • CE QU'ELLE A FAIT L'AN DERNIER — le point de départ, avec l'écart en
 *     pourcentage plutôt qu'en dirhams, parce que « +12 % » se compare d'un
 *     domaine à l'autre là où « +3,2 M DH » ne se compare à rien ;
 *   • CE QUE ÇA PÈSE — la part de la trésorerie ou du chiffre d'affaires
 *     engagée, seule façon de voir qu'on vient de mettre le quart du groupe
 *     sur une seule ligne.
 */
function Reference({
  value, previous, shareOf, shareLabel,
}: {
  value: number;
  previous?: number;
  shareOf?: number;
  shareLabel?: string;
}) {
  const bits: string[] = [];

  if (previous !== undefined && Number.isFinite(previous)) {
    if (previous === 0 && value === 0) {
      bits.push('Rien engagé l’an dernier');
    } else if (previous === 0) {
      bits.push('Nouveau — rien l’an dernier');
    } else {
      const pct = ((value - previous) / previous) * 100;
      // Sous 0,5 %, l'écart relève de l'arrondi et non d'une décision.
      const move = Math.abs(pct) < 0.5
        ? 'inchangé'
        : `${pct > 0 ? '↑ +' : '↓ −'}${formatScore(Math.abs(pct), 0)} %`;
      bits.push(`Tour précédent ${formatMadCompact(previous)} · ${move}`);
    }
  }

  if (shareOf !== undefined && Number.isFinite(shareOf) && shareOf > 0) {
    const share = (value / shareOf) * 100;
    // Virgule décimale : la plateforme est francophone, et « 3.2 % » au milieu
    // de « 1,30 Md DH » dans la même phrase se lit comme une coquille.
    bits.push(`${formatScore(share, share < 10 ? 1 : 0)} %${shareLabel ? ` ${shareLabel}` : ''}`);
  }

  if (bits.length === 0) return null;

  return (
    <p className="tabular mt-1 text-sm text-(--foreground-muted)">{bits.join('  ·  ')}</p>
  );
}

/**
 * Compteur d'effectif : une valeur en place, qu'on augmente ou qu'on baisse.
 *
 * Le cahier de saisie demandait auparavant « combien recrutez-vous ? » devant
 * un champ à zéro. La question n'a pas de sens sans le point de départ : on ne
 * décide pas de recruter quarante personnes, on décide de passer de 1 240 à
 * 1 280. Le champ porte donc l'effectif EN PLACE, et les flèches l'ajustent ;
 * l'écart est affiché en clair sous le champ.
 */
export function HeadcountStepper({
  label, current, value, onChange, hint, step = 10, max, disabled,
}: {
  label: string;
  /** Effectif en place, celui du dernier exercice clos. */
  current: number;
  /** Effectif visé en fin d'exercice. */
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
  /** Plafond, quand la session interdit de dépasser un effectif. */
  max?: number;
  disabled?: boolean;
}) {
  const diff = value - current;
  const cap = (v: number) => (max === undefined ? v : Math.min(v, max));

  return (
    <div className="block">
      <span className="flex items-center gap-2 text-sm font-medium">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </span>
      <div className="mt-1.5 flex items-stretch gap-1.5">
        <button
          type="button" disabled={disabled} aria-label={`Baisser ${label}`}
          onClick={() => onChange(Math.max(value - step, 0))}
          className="w-10 shrink-0 rounded-lg border border-(--border) text-lg leading-none disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number" min={0} max={max} step={step} value={value} disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(cap(Math.max(Math.round(Number(e.target.value) || 0), 0)))}
          className="tabular min-w-0 flex-1 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-center disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label={`Augmenter ${label}`}
          onClick={() => onChange(cap(value + step))}
          className="w-10 shrink-0 rounded-lg border border-(--border) text-lg leading-none disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p className="tabular mt-1 text-sm" style={{ color: diff === 0 ? 'var(--foreground-muted)' : undefined }}>
        En place : {current.toLocaleString('fr-FR')}
        {diff !== 0 ? (
          <>
            {' · '}
            <strong style={{ color: diff > 0 ? 'var(--positive)' : 'var(--negative)' }}>
              {diff > 0 ? `+${diff.toLocaleString('fr-FR')} à recruter` : `−${(-diff).toLocaleString('fr-FR')} à supprimer`}
            </strong>
          </>
        ) : ' · inchangé'}
      </p>
    </div>
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
          {formatMadCompact(allocated)} / {formatMadCompact(available)}
          {over ? ` — dépassement de ${formatMadCompact(allocated - available)}` : ''}
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

