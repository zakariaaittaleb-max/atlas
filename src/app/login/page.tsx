import { redirect } from "next/navigation";

import { getTeamContext, getUser } from "@/lib/dal";
import { JoinForm } from "./join-form";

export const metadata = {
  title: "Atlas — Connexion",
};

export default async function LoginPage() {
  const context = await getTeamContext();
  if (context) redirect("/dashboard");

  const user = await getUser();
  if (user && !user.is_anonymous) redirect("/facilitateur");

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-(--heading) tracking-tight">Atlas</h1>
          <p className="mt-2 text-lg text-(--foreground-muted)">
            Simulateur de stratégie d’entreprise
          </p>
        </header>

        <JoinForm />
      </div>
    </main>
  );
}
