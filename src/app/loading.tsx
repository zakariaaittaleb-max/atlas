/**
 * Ce qu'on voit pendant qu'un écran se prépare côté serveur.
 *
 * Les écrans de décision chargent une quinzaine de tables avant d'afficher quoi
 * que ce soit. Sans cet état, un clic dans la navigation ne produisait rien
 * pendant une à deux secondes : on recliquait, ou l'on croyait l'application
 * figée. La coque (navigation, argent, domaine) reste en place ; seule la zone
 * de contenu montre sa silhouette, et le lecteur d'écran entend le chargement.
 */
export default function Loading() {
  return (
    <div role="status" className="mx-auto w-full min-w-0 max-w-5xl px-6 py-8 lg:py-10">
      <span className="sr-only">Chargement de l’écran…</span>
      <div aria-hidden className="animate-pulse space-y-4 motion-reduce:animate-none">
        <div className="h-3 w-40 rounded bg-(--border)" />
        <div className="h-8 w-72 max-w-full rounded bg-(--border)" />
        <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-(--border) bg-(--surface)" />
          ))}
        </div>
        <div className="h-16 rounded-xl border border-(--border) bg-(--surface)" />
        <div className="h-16 rounded-xl border border-(--border) bg-(--surface)" />
        <div className="h-16 rounded-xl border border-(--border) bg-(--surface)" />
      </div>
    </div>
  );
}
