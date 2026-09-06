"use server";

import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { IMPERSONATION_LABEL_COOKIE, IMPERSONATION_RETURN_COOKIE } from '@/lib/impersonation';
import { createServerClient } from '@/lib/supabase/server';

export type EndImpersonationResult = { ok: true } | { ok: false; error: string };

/**
 * Restaure la session super-admin mise de côté par `impersonateFacilitatorAction`.
 * N'importe qui peut appeler cette action (elle ne vérifie pas l'allowlist :
 * l'autorisation est portée par la possession du cookie lui-même, comme pour
 * tout cookie de session), mais sans le cookie il n'y a rien à restaurer.
 */
export async function endImpersonationAction(): Promise<EndImpersonationResult> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_RETURN_COOKIE)?.value;

  if (!raw) return { ok: false, error: 'Aucune session super-admin à restaurer.' };

  jar.delete(IMPERSONATION_RETURN_COOKIE);
  jar.delete(IMPERSONATION_LABEL_COOKIE);

  let tokens: { access_token: string; refresh_token: string };
  try {
    tokens = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Cookie de restauration invalide.' };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.setSession(tokens);

  if (error) {
    return { ok: false, error: 'La session super-admin a expiré. Reconnectez-vous depuis /login.' };
  }

  redirect('/admin/facilitators');
}
