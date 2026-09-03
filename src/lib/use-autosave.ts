'use client';

/**
 * ATLAS — auto-sauvegarde des décisions.
 *
 * Deux exigences du cahier (doc 00 §12), et elles se répondent :
 *
 *   • **Aucune action de sauvegarde manuelle.** Un étudiant qui débat pendant
 *     vingt minutes ne doit pas découvrir en fin de tour qu'il a oublié de
 *     cliquer. Chaque champ part tout seul, après une courte temporisation.
 *
 *   • **Aucune perte si un poste redémarre.** Les écritures en attente sont
 *     persistées AVANT l'envoi réseau et rejouées au retour. Une salle de
 *     classe a du wifi capricieux et des postes qu'on rallume.
 *
 * La file vit dans `localStorage` plutôt qu'IndexedDB : les charges utiles sont
 * de petits objets JSON, la persistance au redémarrage est acquise, et une base
 * transactionnelle serait de la complexité sans contrepartie.
 *
 * La clé de file est le `plan` (et le DAS le cas échéant) : une saisie plus
 * récente ÉCRASE la précédente au lieu de s'empiler. Rejouer dix états
 * intermédiaires d'un curseur de prix n'a aucun intérêt — seul le dernier compte.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'locked';

const QUEUE_KEY = 'atlas.decisions.queue';
const DEBOUNCE_MS = 700;
const RETRY_MS = 4000;

type Payload = Record<string, unknown>;

function readQueue(): Record<string, Payload> {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '{}') as Record<string, Payload>;
  } catch {
    // Une file corrompue ne doit pas empêcher de jouer : on repart à vide.
    return {};
  }
}

function writeQueue(queue: Record<string, Payload>): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Stockage plein ou refusé (navigation privée) : la sauvegarde réseau reste
    // tentée, seule la reprise après redémarrage est perdue.
  }
}

/**
 * Point d'entrée par défaut. Une charge utile peut le surcharger avec
 * `__endpoint` — l'écran d'organisation écrit ailleurs que les sept plans.
 */
const DEFAULT_ENDPOINT = '/api/decisions';

function endpointOf(payload: Payload): string {
  const custom = payload.__endpoint;
  return typeof custom === 'string' ? custom : DEFAULT_ENDPOINT;
}

/** La charge réellement transmise : `__endpoint` est un détail de routage. */
function bodyOf(payload: Payload): Payload {
  const rest = { ...payload };
  delete rest.__endpoint;
  return rest;
}

/**
 * Identifiant de file : une saisie plus récente remplace la précédente.
 *
 * La clé retient le PLAN ou le BLOC, et le DAS. Sans le bloc, enregistrer les
 * axes stratégiques écraserait la structure encore en attente d'envoi — deux
 * décisions distinctes du même écran, perdues l'une par l'autre.
 */
function queueKey(payload: Payload): string {
  const kind = String(payload.plan ?? payload.block ?? 'inconnu');
  const das = payload.dasId ? `:${String(payload.dasId)}` : '';
  return `${endpointOf(payload)}|${kind}${das}`;
}

export interface AutosaveResult {
  state: SaveState;
  /** Nombre d'écritures encore en attente d'acquittement. */
  pending: number;
  lastError: string | null;
  save: (payload: Payload) => void;
  /** Force l'envoi immédiat — au clic sur « Valider mes décisions ». */
  flush: () => Promise<void>;
}

export function useAutosave(): AutosaveResult {
  const [state, setState] = useState<SaveState>('idle');
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(false);

  const drain = useCallback(async () => {
    if (inFlight.current) return;
    const queue = readQueue();
    const keys = Object.keys(queue);
    if (keys.length === 0) {
      setPending(0);
      return;
    }

    inFlight.current = true;
    setState('saving');

    for (const key of keys) {
      try {
        const res = await fetch(endpointOf(queue[key]), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyOf(queue[key])),
        });

        if (res.ok) {
          const current = readQueue();
          delete current[key];
          writeQueue(current);
          continue;
        }

        const body = await res.json().catch(() => ({}));

        // Tour verrouillé ou saisie invalide : réessayer ne servirait à rien et
        // la file tournerait indéfiniment. On abandonne CETTE écriture en le
        // disant, plutôt que de faire croire à une sauvegarde.
        if (res.status === 409 || res.status === 400) {
          const current = readQueue();
          delete current[key];
          writeQueue(current);
          setLastError(body.error ?? 'Saisie refusée.');
          setState(body.locked ? 'locked' : 'error');
          inFlight.current = false;
          setPending(Object.keys(readQueue()).length);
          return;
        }

        // Erreur serveur ou réseau : on garde l'écriture et on réessaiera.
        throw new Error(body.error ?? 'Sauvegarde impossible.');
      } catch (error) {
        // Une panne réseau remonte un `TypeError` du navigateur (« Failed to
        // fetch »). L'afficher tel quel n'apprend rien à un étudiant et
        // l'inquiète : on lui dit ce qui compte, à savoir que rien n'est perdu.
        // Un message venu du SERVEUR, lui, est conservé — il est explicite.
        const isNetwork = error instanceof TypeError;
        setLastError(
          isNetwork || !(error instanceof Error)
            ? null
            : error.message,
        );
        setState('error');
        inFlight.current = false;
        setPending(Object.keys(readQueue()).length);
        return;
      }
    }

    inFlight.current = false;
    const remaining = Object.keys(readQueue()).length;
    setPending(remaining);
    if (remaining === 0) {
      setLastError(null);
      setState('saved');
    }
  }, []);

  const save = useCallback(
    (payload: Payload) => {
      const key = queueKey(payload);

      // Persister AVANT d'envoyer : si le poste redémarre pendant la requête,
      // la saisie est déjà à l'abri.
      const queue = readQueue();
      queue[key] = payload;
      writeQueue(queue);
      setPending(Object.keys(queue).length);
      setState('pending');

      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      timers.current.set(key, setTimeout(() => { void drain(); }, DEBOUNCE_MS));
    },
    [drain],
  );

  const flush = useCallback(async () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    await drain();
  }, [drain]);

  // Reprise au montage — c'est ici que se rattrape un poste redémarré — puis
  // relance périodique tant qu'il reste des écritures en souffrance.
  useEffect(() => {
    // Différé d'un tour de boucle : `drain` met à jour l'état, et l'appeler
    // synchronement dans le corps d'un effet déclencherait un rendu en cascade.
    const initial = setTimeout(() => { void drain(); }, 0);
    const interval = setInterval(() => {
      if (Object.keys(readQueue()).length > 0) void drain();
    }, RETRY_MS);

    const onOnline = () => { void drain(); };
    window.addEventListener('online', onOnline);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [drain]);

  // Dernière chance : vider la file avant que l'onglet ne parte.
  useEffect(() => {
    const onHide = () => {
      const queue = readQueue();
      for (const key of Object.keys(queue)) {
        // `sendBeacon` survit à la fermeture de l'onglet là où `fetch` est coupé.
        navigator.sendBeacon?.(
          endpointOf(queue[key]),
          new Blob([JSON.stringify(bodyOf(queue[key]))], { type: 'application/json' }),
        );
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return { state, pending, lastError, save, flush };
}

export const SAVE_LABELS: Record<SaveState, string> = {
  idle: 'Aucune modification',
  pending: 'Modification en cours…',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Hors ligne — vos saisies sont conservées et repartiront seules',
  locked: 'Tour verrouillé — cette saisie n’a pas été prise en compte',
};
