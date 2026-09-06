'use client';

import { useState, useTransition } from 'react';

type ActionResult = { ok: true } | { ok: false; error: string };

interface SessionRow {
  id: string;
  name: string;
  facilitatorId: string;
  facilitatorEmail: string;
  status: string;
  currentRound: number;
  plannedRounds: number;
  joinCode: string;
  createdAt: string;
  teamCount: number;
}

interface FacilitatorOption {
  id: string;
  email: string;
}

interface Props {
  sessions: SessionRow[];
  facilitatorOptions: FacilitatorOption[];
  renameAction: (input: { sessionId: string; name: string }) => Promise<ActionResult>;
  reassignAction: (input: { sessionId: string; facilitatorId: string }) => Promise<ActionResult>;
  deleteAction: (input: { sessionId: string }) => Promise<ActionResult>;
}

export function SessionsPanel({
  sessions,
  facilitatorOptions,
  renameAction,
  reassignAction,
  deleteAction,
}: Props) {
  return (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <SessionRowItem
          key={s.id}
          session={s}
          facilitatorOptions={facilitatorOptions}
          renameAction={renameAction}
          reassignAction={reassignAction}
          deleteAction={deleteAction}
        />
      ))}
      {sessions.length === 0 ? (
        <p className="text-(--foreground-muted)">Aucune session pour l’instant.</p>
      ) : null}
    </ul>
  );
}

function SessionRowItem({
  session,
  facilitatorOptions,
  renameAction,
  reassignAction,
  deleteAction,
}: {
  session: SessionRow;
  facilitatorOptions: FacilitatorOption[];
  renameAction: Props['renameAction'];
  reassignAction: Props['reassignAction'];
  deleteAction: Props['deleteAction'];
}) {
  const [name, setName] = useState(session.name);
  const [facilitatorId, setFacilitatorId] = useState(session.facilitatorId);
  const [facilitatorEmail, setFacilitatorEmail] = useState(session.facilitatorEmail);
  const [deleted, setDeleted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );

  if (deleted) return null;

  function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await renameAction({ sessionId: session.id, name });
      setMessage(
        result.ok
          ? { kind: 'success', text: 'Renommée.' }
          : { kind: 'error', text: result.error },
      );
    });
  }

  function handleReassign(event: React.ChangeEvent<HTMLSelectElement>) {
    const newFacilitatorId = event.target.value;
    const option = facilitatorOptions.find((f) => f.id === newFacilitatorId);
    setMessage(null);
    startTransition(async () => {
      const result = await reassignAction({ sessionId: session.id, facilitatorId: newFacilitatorId });
      if (result.ok) {
        setFacilitatorId(newFacilitatorId);
        setFacilitatorEmail(option?.email ?? facilitatorEmail);
        setMessage({ kind: 'success', text: 'Réattribuée.' });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Supprimer définitivement la session « ${session.name} » et toutes ses données (équipes, décisions, résultats) ?`,
      )
    ) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAction({ sessionId: session.id });
      if (result.ok) setDeleted(true);
      else setMessage({ kind: 'error', text: result.error });
    });
  }

  return (
    <li className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <form onSubmit={submitRename} className="flex min-w-[240px] flex-1 items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5"
            />
          </div>
          <button
            type="submit"
            disabled={pending || name === session.name}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Renommer
          </button>
        </form>

        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="rounded-lg border border-(--negative) px-3 py-1.5 text-sm font-medium text-(--negative) disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>

      <p className="tabular mt-3 text-sm text-(--foreground-muted)">
        Code <strong className="tracking-widest">{session.joinCode}</strong>
        {' · '}
        {session.currentRound === 0 ? 'T0' : `Tour ${session.currentRound}`} sur{' '}
        {session.plannedRounds} prévus · {session.status} · {session.teamCount} équipe(s)
      </p>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <label className="font-medium">Facilitateur :</label>
        <select
          value={facilitatorId}
          onChange={handleReassign}
          disabled={pending}
          className="rounded-lg border border-(--border) bg-(--surface) px-2 py-1"
        >
          {!facilitatorOptions.some((f) => f.id === facilitatorId) ? (
            <option value={facilitatorId}>{facilitatorEmail}</option>
          ) : null}
          {facilitatorOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.email}
            </option>
          ))}
        </select>
      </div>

      {message ? (
        <p
          role="alert"
          className={
            'mt-3 text-sm ' + (message.kind === 'success' ? 'text-(--positive)' : 'text-(--negative)')
          }
        >
          {message.text}
        </p>
      ) : null}
    </li>
  );
}
