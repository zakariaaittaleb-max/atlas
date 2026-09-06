/**
 * Types purs, sans dépendance serveur : importables tels quels depuis un
 * composant `"use client"` (voir `security-panel.tsx`), contrairement à
 * `security-config.ts` qui embarque le client `service_role`.
 */

export type SecurityMeasureName =
  | 'strict_auth'
  | 'security_headers'
  | 'css_anti_selection'
  | 'rate_limit_api';

export type SecurityConfigState = Record<SecurityMeasureName, boolean>;
