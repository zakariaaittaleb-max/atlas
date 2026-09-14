import { describe, expect, it } from 'vitest';

import { FRENCH_KEYS, MESSAGES, translate } from './messages';

describe('dictionnaires', () => {
  it('ne laisse aucune clé du français sans traduction', () => {
    for (const locale of ['en', 'ar'] as const) {
      const missing = FRENCH_KEYS.filter((key) => !(key in MESSAGES[locale]));
      expect(missing, locale).toEqual([]);
    }
  });

  it('garde les mêmes variables dans chaque langue', () => {
    const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of FRENCH_KEYS) {
      const expected = vars(MESSAGES.fr[key]);
      for (const locale of ['en', 'ar'] as const) {
        // En arabe, les formes « un » et « deux » s'écrivent sans le nombre.
        if (locale === 'ar' && /\.(one|two|zero)$/.test(key)) continue;
        expect(vars(MESSAGES[locale][key]), `${locale} ${key}`).toEqual(expected);
      }
    }
  });
});

describe('translate', () => {
  it('remplace les variables', () => {
    expect(translate('fr', 'next.link', { label: 'Finance du Groupe' })).toBe('Étape suivante : Finance du Groupe');
    expect(translate('en', 'round.number', { n: 3 })).toBe('Round 3');
  });

  it('suit les règles de pluriel de chaque langue', () => {
    expect(translate('fr', 'nav.todo', { count: 1 })).toBe('1 décision à renseigner');
    expect(translate('fr', 'nav.todo', { count: 4 })).toBe('4 décisions à renseigner');
    expect(translate('ar', 'bar.missing', { count: 2 })).toBe('قراران ناقصان');
    expect(translate('ar', 'bar.missing', { count: 5 })).toBe('5 قرارات ناقصة');
    expect(translate('ar', 'bar.missing', { count: 11 })).toBe('11 قرارًا ناقصًا');
  });

  it('retombe sur le français plutôt que sur un identifiant', () => {
    expect(translate('en', 'nav.menu')).toBe('Menu');
  });
});
