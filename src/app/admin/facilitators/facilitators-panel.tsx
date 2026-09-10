'use client';

import { useState, useTransition } from 'react';

import {
  FACILITATOR_CAPABILITIES,
  type FacilitatorCapability,
  type FacilitatorCapabilityState,
} from '@/lib/facilitator-capabilities-types';

type ActionResult = { ok: true } | { ok: false; error: string };

interface Facilitator {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  banned: boolean;
  sessionCount: number;
  capabilities: FacilitatorCapabilityState;
}

interface Props {
  facilitators: Facilitator[];
  createAction: (input: { email: string; password: string }) => Promise<ActionResult>;
  setBannedAction: (input: { userId: string; banned: boolean }) => Promise<ActionResult>;
  resetPasswordAction: (input: { userId: string; newPassword: string }) => Promise<ActionResult>;
  deleteAction: (input: { userId: string }) => Promise<ActionResult>;
  impersonateAction: (userId: string) => Promise<ActionResult>;
  setCapabilityAction: (input: {
    userId: string;
    capability: FacilitatorCapability;
    enabled: boolean;
  }) => Promise<ActionResult>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export function FacilitatorsPanel({
  facilitators,
  createAction,
  setBannedAction,
  resetPasswordAction,
  deleteAction,
  impersonateAction,
  setCapabilityAction,
}: Props) {
  return (
    <section className="space-y-8">
      <CreateFacilitatorForm createAction={createAction} />

      <ul className="space-y-3">
        {facilitators.map((f) => (
          <FacilitatorRow
            key={f.id}
            facilitator={f}
            setBannedAction={setBannedAction}
            resetPasswordAction={resetPasswordAction}
            deleteAction={deleteAction}
            impersonateAction={impersonateAction}
            setCapabilityAction={setCapabilityAction}
          />
        ))}
      </ul>
    </section>
  );
}

function CreateFacilitatorForm({
  createAction,
}: {
  createAction: Props['createAction'];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createAction({ email, password });
      if (result.ok) {
        setMessage({ kind: 'success', text: `Compte créé pour ${email}.` });
        setEmail('');
        setPassword('');
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-(--border) bg-(--surface) p-5"
    >
      <h2 className="mb-4 font-medium">Créer un facilitateur</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="new-facilitator-email" className="block text-sm font-medium">
            E-mail
          </label>
          <input
            id="new-facilitator-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <label htmlFor="new-facilitator-password" className="block text-sm font-medium">
            Mot de passe (8 caractères min.)
          </label>
          <input
            id="new-facilitator-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-(--accent) px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Création…' : 'Créer'}
        </button>
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
    </form>
  );
}

function FacilitatorRow({
  facilitator,
  setBannedAction,
  resetPasswordAction,
  deleteAction,
  impersonateAction,
  setCapabilityAction,
}: {
  facilitator: Facilitator;
  setBannedAction: Props['setBannedAction'];
  resetPasswordAction: Props['resetPasswordAction'];
  deleteAction: Props['deleteAction'];
  impersonateAction: Props['impersonateAction'];
  setCapabilityAction: Props['setCapabilityAction'];
}) {
  const [capabilities, setCapabilities] = useState(facilitator.capabilities);
  const [banned, setBanned] = useState(facilitator.banned);
  const [deleted, setDeleted] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null,
  );

  if (deleted) return null;

  function toggleBan() {
    setMessage(null);
    startTransition(async () => {
      const result = await setBannedAction({ userId: facilitator.id, banned: !banned });
      if (result.ok) {
        setBanned((v) => !v);
        setMessage({ kind: 'success', text: banned ? 'Débloqué.' : 'Bloqué.' });
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await resetPasswordAction({ userId: facilitator.id, newPassword });
      if (result.ok) {
        setMessage({ kind: 'success', text: 'Mot de passe réinitialisé.' });
        setNewPassword('');
        setResetOpen(false);
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer définitivement le compte ${facilitator.email} ?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAction({ userId: facilitator.id });
      if (result.ok) {
        setDeleted(true);
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  function toggleCapability(capability: FacilitatorCapability) {
    const next = !capabilities[capability];
    setMessage(null);
    startTransition(async () => {
      const result = await setCapabilityAction({
        userId: facilitator.id,
        capability,
        enabled: next,
      });
      if (result.ok) {
        setCapabilities((current) => ({ ...current, [capability]: next }));
      } else {
        setMessage({ kind: 'error', text: result.error });
      }
    });
  }

  function handleImpersonate() {
    setMessage(null);
    startTransition(async () => {
      const result = await impersonateAction(facilitator.id);
      // En cas de succès, l'action redirige elle-même vers /facilitateur —
      // ce code ne s'exécute alors jamais.
      if (!result.ok) setMessage({ kind: 'error', text: result.error });
    });
  }

  return (
    <li className="rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            {facilitator.email}
            {banned ? (
              <span className="ml-2 rounded-full bg-(--negative) px-2 py-0.5 text-xs font-medium text-white">
                Bloqué
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-(--foreground-muted)">
            {facilitator.sessionCount} session(s) · créé le {formatDate(facilitator.createdAt)} ·
            dernière connexion {formatDate(facilitator.lastSignInAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleImpersonate}
            disabled={pending}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Se connecter en tant que
          </button>
          <button
            type="button"
            onClick={() => setResetOpen((v) => !v)}
            disabled={pending}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Changer le mot de passe
          </button>
          <button
            type="button"
            onClick={toggleBan}
            disabled={pending}
            className="rounded-lg border border-(--border) px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {banned ? 'Débloquer' : 'Bloquer'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded-lg border border-(--negative) px-3 py-1.5 text-sm font-medium text-(--negative) disabled:opacity-50"
          >
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-(--border) pt-4">
        <p className="text-xs font-medium tracking-wide text-(--foreground-muted) uppercase">
          Droits
        </p>
        <ul className="mt-2 space-y-2">
          {FACILITATOR_CAPABILITIES.map((capability) => (
            <li key={capability.name}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={capabilities[capability.name]}
                  onChange={() => toggleCapability(capability.name)}
                  disabled={pending}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{capability.label}</span>
                  <span className="block text-xs text-(--foreground-muted)">
                    {capability.description}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {resetOpen ? (
        <form onSubmit={submitReset} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="block text-sm font-medium">Nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirmer
          </button>
        </form>
      ) : null}

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
