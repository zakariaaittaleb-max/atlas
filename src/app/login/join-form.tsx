"use client";

/**
 * Deux voies d'entree, deux identites differentes.
 *
 * Facilitateur : email + mot de passe, authentification Supabase classique.
 * Un compte reel, cree une fois pour toutes, qui possede ses sessions via
 * `facilitator_id`.
 *
 * Participant : code de session + code d'equipe, authentification anonyme.
 * Pas de mot de passe pour la salle de classe : ni a distribuer, ni a
 * retenir, ni a perdre entre deux tours.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "participant" | "facilitateur";

export function JoinForm() {
  const [mode, setMode] = useState<Mode>("participant");

  return (
    <div>
      <div className="mb-8 flex gap-1 rounded-lg bg-(--surface-muted) p-1">
        <TabButton active={mode === "participant"} onClick={() => setMode("participant")}>
          Participant
        </TabButton>
        <TabButton active={mode === "facilitateur"} onClick={() => setMode("facilitateur")}>
          Facilitateur
        </TabButton>
      </div>

      {mode === "participant" ? <ParticipantForm /> : <FacilitatorForm />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-(--surface) text-(--foreground) shadow-sm"
          : "text-(--foreground-muted) hover:text-(--foreground)")
      }
    >
      {children}
    </button>
  );
}

function ParticipantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      sessionCode: String(form.get("sessionCode") ?? "").trim(),
      teamCode: String(form.get("teamCode") ?? "").trim(),
      displayName: String(form.get("displayName") ?? "").trim(),
    };

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const { error: authError } = await supabase.auth.signInAnonymously();
        if (authError) {
          setError(
            "Impossible d'ouvrir une session. Verifiez que la connexion anonyme est activee sur le projet Supabase.",
          );
          setBusy(false);
          return;
        }
      }

      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Le rattachement a echoue.");
        setBusy(false);
        return;
      }

      startTransition(() => {
        router.replace("/cockpit");
        router.refresh();
      });
    } catch {
      setError("Le reseau est indisponible. Vos codes n'ont pas ete envoyes.");
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field
        name="sessionCode"
        label="Code de session"
        hint="Affiche au tableau par votre formateur"
        autoComplete="off"
        uppercase
      />
      <Field name="teamCode" label="Code d'equipe" autoComplete="off" uppercase />
      <Field
        name="displayName"
        label="Votre prenom"
        hint="Affiche a vos coequipiers pour qu'ils sachent qui travaille avec eux"
        autoComplete="given-name"
        maxLength={40}
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-(--accent) px-4 py-3.5 text-base font-medium text-white disabled:opacity-50"
      >
        {disabled ? "Rattachement..." : "Rejoindre ma session"}
      </button>

      <p className="text-sm text-(--foreground-muted)">
        Les deux codes vous sont remis par votre formateur. Aucun mot de passe n’est demandé.
      </p>
    </form>
  );
}

function FacilitatorForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError("Identifiants incorrects.");
        setBusy(false);
        return;
      }

      startTransition(() => {
        router.replace("/facilitateur");
        router.refresh();
      });
    } catch {
      setError("Le reseau est indisponible.");
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field name="email" label="Adresse e-mail" autoComplete="username" type="email" />
      <Field
        name="password"
        label="Mot de passe"
        autoComplete="current-password"
        type="password"
      />

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-(--accent) px-4 py-3.5 text-base font-medium text-white disabled:opacity-50"
      >
        {disabled ? "Connexion..." : "Se connecter"}
      </button>

      <p className="text-sm text-(--foreground-muted)">
        Compte réservé à l’animation des sessions. Demandez vos identifiants à l’administrateur.
      </p>
    </form>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-(--negative) bg-(--surface) px-4 py-3 text-sm text-(--negative)"
    >
      {children}
    </p>
  );
}

function Field({
  name,
  label,
  hint,
  autoComplete,
  type,
  uppercase,
  maxLength,
}: {
  name: string;
  label: string;
  hint?: string;
  autoComplete?: string;
  type?: string;
  uppercase?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type ?? "text"}
        required
        autoComplete={autoComplete}
        maxLength={maxLength}
        autoCapitalize={uppercase ? "characters" : "off"}
        spellCheck={false}
        className={
          "mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-lg " +
          (uppercase ? "tabular tracking-widest uppercase" : "")
        }
      />
      {hint ? <p className="mt-2 text-sm text-(--foreground-muted)">{hint}</p> : null}
    </div>
  );
}
