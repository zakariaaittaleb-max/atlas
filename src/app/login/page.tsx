import Image from "next/image";
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
        <header className="mb-10 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Atlas Business Game" width={140} height={139} priority />
          <p className="mt-3 text-lg text-(--foreground-muted)">
            Simulateur de stratégie d’entreprise
          </p>
        </header>

        <JoinForm />
      </div>
    </main>
  );
}
