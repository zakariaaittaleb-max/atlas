'use client';

import { useTransition } from 'react';

type EndImpersonationResult = { ok: true } | { ok: false; error: string };
type EndImpersonationAction = () => Promise<EndImpersonationResult>;

export function ImpersonationBanner({
  adminEmail,
  endImpersonationAction,
}: {
  adminEmail: string;
  endImpersonationAction: EndImpersonationAction;
}) {
  const [pending, startTransition] = useTransition();

  function handleReturn() {
    startTransition(async () => {
      await endImpersonationAction();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-(--warning) px-4 py-2 text-sm font-medium text-(--on-warning)">
      <span>
        Vous agissez en tant que ce facilitateur, connecté comme super-admin ({adminEmail}).
      </span>
      <button
        type="button"
        onClick={handleReturn}
        disabled={pending}
        className="rounded-md bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-50"
      >
        {pending ? 'Retour…' : 'Revenir au super-admin'}
      </button>
    </div>
  );
}
