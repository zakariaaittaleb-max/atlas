import { describe, expect, it } from 'vitest';

import {
  CORPORATE_DEFAULTS,
  FINANCE_DEFAULTS,
  dasDecisionDefaults,
} from '../decision-types';
import { ALL_MODULE_FIELDS } from '../modules-catalog';
import {
  CORPORATE_FIELDS,
  DAS_FIELDS,
  DIRECTIVES_FIELDS,
  FINANCE_FIELDS,
  HR_FIELDS,
} from './module-enforcement';

/**
 * Le garde-fou du garde-fou.
 *
 * `keepClosed` associe une clé de module à un NOM DE CHAMP, par chaîne de
 * caractères. Une faute de frappe des deux côtés est silencieuse : le champ
 * fermé continuerait de s'écrire, et rien ne le signalerait — ni le
 * compilateur, ni l'interface, qui masque le bloc de toute façon.
 */

const MAPPINGS = {
  CORPORATE_FIELDS,
  DAS_FIELDS,
  FINANCE_FIELDS,
  HR_FIELDS,
  DIRECTIVES_FIELDS,
};

describe('correspondances de neutralisation', () => {
  it('ne référence que des clés du catalogue', () => {
    const known = new Set(ALL_MODULE_FIELDS.map((field) => field.key));
    const unknown: string[] = [];

    for (const [name, mapping] of Object.entries(MAPPINGS)) {
      for (const moduleKey of Object.keys(mapping)) {
        if (!known.has(moduleKey)) unknown.push(`${name} → ${moduleKey}`);
      }
    }

    expect(unknown).toEqual([]);
  });

  it('ne nomme que des champs qui existent, là où la forme est connue', () => {
    const shapes: [string, Readonly<Record<string, string>>, object][] = [
      ['CORPORATE_FIELDS', CORPORATE_FIELDS, CORPORATE_DEFAULTS],
      ['FINANCE_FIELDS', FINANCE_FIELDS, FINANCE_DEFAULTS],
      ['DAS_FIELDS', DAS_FIELDS, dasDecisionDefaults([{ key: 'seg' }])],
    ];

    const missing: string[] = [];
    for (const [name, mapping, shape] of shapes) {
      for (const field of Object.values(mapping)) {
        if (!(field in shape)) missing.push(`${name} → ${field}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('couvre tout champ désactivable du catalogue', () => {
    // Un champ du catalogue sans correspondance serait masqué dans l'interface
    // mais toujours écrivable par POST direct. Les blocs entiers (achats,
    // distribution, cabinet, cession, war room, organigramme…) sont refusés en
    // bloc par `requireOpen` et n'ont donc pas de correspondance de champ.
    const WHOLE_BLOCKS = new Set([
      'marches.procurement', 'marches.distribution',
      'org.axes', 'org.delegation', 'org.positions', 'org.kpis', 'org.budgets',
      'org.shared_resources',
      'cession.sell', 'cession.acquire', 'cession.integration', 'cession.bid',
      'warroom.events',
    ]);

    const mapped = new Set(
      Object.values(MAPPINGS).flatMap((mapping) => Object.keys(mapping)),
    );

    const uncovered = ALL_MODULE_FIELDS.filter(
      (field) =>
        field.tier !== 'noyau' &&
        !mapped.has(field.key) &&
        !WHOLE_BLOCKS.has(field.key) &&
        !field.key.startsWith('cabinet.'),
    ).map((field) => field.key);

    expect(uncovered).toEqual([]);
  });
});
