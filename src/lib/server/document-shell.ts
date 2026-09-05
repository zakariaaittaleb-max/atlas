import 'server-only';

/**
 * ATLAS — l'enveloppe HTML des documents de séance.
 *
 * Les documents (`src/content/*.html`) sont écrits pour être ENVELOPPÉS : ils
 * commencent au `<title>`, portent leur `<style>`, puis leur corps — sans
 * `<html>`, `<head>` ni `<body>`. C'est la forme qu'attend la plateforme
 * d'artefacts, et la conserver permet de publier et de servir localement LE
 * MÊME fichier, engendré une seule fois depuis le moteur.
 *
 * Cette fonction est isolée pour être testable : la route qui l'emploie exige
 * une session de facilitateur, ce qui rendrait la vérification dépendante
 * d'une authentification. La découpe, elle, se vérifie sans rien.
 */

const HEAD_END = '</style>';

export function wrapDocument(fragment: string): string {
  const cut = fragment.indexOf(HEAD_END);

  // Sans bloc de style, on ne sait pas où finit l'en-tête : tout part dans le
  // corps. Le document reste lisible, seulement sans mise en forme — mieux
  // qu'une page coupée au hasard.
  const head = cut === -1 ? '' : fragment.slice(0, cut + HEAD_END.length);
  const body = cut === -1 ? fragment : fragment.slice(cut + HEAD_END.length);

  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + head
    + '</head><body>'
    + body
    + '</body></html>';
}
