/**
 * ATLAS — les textes de la coque, en français, anglais et arabe.
 *
 * ── PÉRIMÈTRE ──────────────────────────────────────────────────────────────
 * Premier incrément : ce qui entoure chaque écran d'équipe — navigation, barre
 * d'argent, domaine piloté, barre de validation, étape suivante, présence,
 * bandeaux. Les écrans de saisie suivront, écran par écran ; le contenu
 * pédagogique (glossaire, explications du moteur, études) reste en français.
 *
 * ── RÈGLES DE TRADUCTION ───────────────────────────────────────────────────
 *   • Arabe standard moderne ; les sigles restent en caractères latins, tels
 *     qu'enseignés au Maroc : DAS, BCG, PESTEL, EBITDA, RH n'est pas un sigle
 *     et se traduit.
 *   • Traductions à faire relire par un locuteur natif avant la première séance.
 *
 * ── PLURIELS ───────────────────────────────────────────────────────────────
 * Une clé plurielle se décline par suffixe, selon `Intl.PluralRules` : le
 * français et l'anglais n'ont que `one` et `other`, l'arabe distingue `zero`,
 * `one`, `two`, `few`, `many` et `other`. On appelle la clé sans suffixe, avec
 * `count` : `t('nav.todo', { count: 3 })`.
 *
 * Module client-safe.
 */

import { DEFAULT_LOCALE, type Locale } from './locales';

const fr = {
  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.menu': 'Menu',
  'nav.drawer': 'Navigation',
  'nav.main': 'Navigation principale',
  'nav.closeMenu': 'Fermer le menu',
  'nav.expand': 'Déplier la navigation',
  'nav.collapse': 'Replier la navigation',
  'nav.allDone': 'Toutes vos décisions sont renseignées',
  'nav.todo.one': '{count} décision à renseigner',
  'nav.todo.other': '{count} décisions à renseigner',
  'nav.filled': 'renseigné',
  'nav.initialDossier': 'Dossier initial',
  'nav.myResults': 'Mes résultats',
  'nav.survey': 'Questionnaire de satisfaction',
  'nav.adminConfig': 'Configuration admin',
  'nav.logout': 'Se déconnecter',

  'nav.group.dashboard': 'Dashboard',
  'nav.group.strategie': 'Stratégie',
  'nav.group.das': 'DAS',
  'nav.group.soumission': 'Soumission',
  'nav.group.conseils': 'Conseils',
  'nav.link./dashboard': 'Dashboard',
  'nav.link./strategie': 'Stratégie du Groupe',
  'nav.link./finance': 'Finance du Groupe',
  'nav.link./cession': 'Cession & acquisitions',
  'nav.link./strategie/das': 'Stratégie du DAS',
  'nav.link./organisation': 'Organisation & RH',
  'nav.link./marches': 'Achats & distribution',
  'nav.link./war-room': 'War Room',
  'nav.link./recapitulatif': 'Récapitulatif du tour',
  'nav.link./cabinet': 'Cabinet',
  'nav.link./revelation': 'Révélation',

  // ── État du tour ──────────────────────────────────────────────────────────
  'round.onboarding': 'T0',
  'round.number': 'Tour {n}',
  'status.draft': 'Session non ouverte',
  'status.onboarding': 'Onboarding — décisions ouvertes',
  'status.round_active': 'Décisions ouvertes',
  'status.round_locked': 'Tour verrouillé',
  'status.round_resolving': 'Calcul en cours',
  'status.round_resolved': 'Résultats publiés',
  'status.completed': 'Session terminée',
  'readOnly.draft': 'Session pas encore ouverte — lecture seule.',
  'readOnly.round_locked': 'Tour verrouillé — lecture seule. Les valeurs affichées sont celles que le moteur a reçues.',
  'readOnly.round_resolving': 'Calcul en cours — lecture seule. Les valeurs affichées sont celles que le moteur a reçues.',
  'readOnly.round_resolved': 'Résultats publiés — lecture seule jusqu’à l’ouverture du tour suivant.',
  'readOnly.completed': 'Session terminée — lecture seule.',
  'readOnly.default': 'Lecture seule.',

  // ── Barre d'argent ────────────────────────────────────────────────────────
  'money.available': 'Vous disposez de',
  'money.drawn': 'dont {amount} de crédit pris',
  'money.engaged': 'Engagé ce tour',
  'money.remaining': 'Il vous reste',
  'money.debt': 'Crédits en cours',

  // ── Commandes communes ────────────────────────────────────────────────────
  'shell.skipToContent': 'Aller au contenu',
  'theme.group': 'Thème d’affichage',
  'theme.system': 'Suivre le système',
  'theme.light': 'Thème clair',
  'theme.dark': 'Thème sombre',
  'lang.label': 'Langue',
  'glossary.button': 'Glossaire',

  // ── Étape suivante ────────────────────────────────────────────────────────
  'next.aria': 'Étape suivante',
  'next.position': 'Étape {index} sur {total}',
  'next.link': 'Étape suivante : {label}',

  // ── Barre de validation ───────────────────────────────────────────────────
  'bar.locked': 'Tour verrouillé',
  'bar.review': 'Relire et soumettre le tour',
  'bar.missing.one': '{count} décision manquante',
  'bar.missing.other': '{count} décisions manquantes',
  'bar.missingList': 'Manquant :',
  'bar.hintTitle': 'Enregistrement de vos saisies',
  'bar.hint': 'Vos saisies sont enregistrées au fil de la frappe : le bouton de droite ne sauvegarde rien. Il envoie ce qui reste en file, puis ouvre le récapitulatif du tour, d’où votre équipe le soumet.',
  'save.idle': 'Aucune modification',
  'save.pending': 'Modification en cours…',
  'save.saving': 'Enregistrement…',
  'save.saved': 'Enregistré',
  'save.savedAt': 'Enregistré à {time}',
  'save.error': 'Hors ligne — vos saisies sont conservées et repartiront seules',
  'save.locked': 'Tour verrouillé — cette saisie n’a pas été prise en compte',
  'save.queued': '({count} en attente)',

  // ── Présence ──────────────────────────────────────────────────────────────
  'presence.online.one': '{count} connecté',
  'presence.online.other': '{count} connectés',
  'presence.statusOnline': 'en ligne',
  'presence.statusOffline': 'hors ligne',
  'presence.statusHidden': 'discret',
  'presence.self': '(vous)',
  'presence.facilitator': 'Facilitateur',

  // ── Bandeau du facilitateur qui joue ──────────────────────────────────────
  'play.banner': 'Vous jouez dans {team} — vos saisies comptent pour cette équipe.',
  'play.hide': 'Passer en discret',
  'play.show': 'Me rendre visible',
  'play.leave': 'Revenir à l’animation',
  'play.leaving': 'Retour…',

  // ── Domaine piloté ────────────────────────────────────────────────────────
  'das.piloted': 'Domaine piloté',
  'das.pilotedHintMany': 'Stratégie du DAS, achats, distribution, organisation et RH portent sur le domaine choisi ici. Renseignez-le partout, puis passez au suivant.',
  'das.pilotedHintOne': 'Votre unique domaine. Un rachat sur le marché des acquisitions en ajoutera d’autres ici.',
  'das.group': 'Domaine d’activité piloté',
  'das.forSale': '· en vente',
  'das.noClosedYear': 'Aucun exercice clos pour ce domaine',
  'das.growth': 'Croissance',
  'das.marketShare': 'Part de marché',
  'das.poolMedian': 'médiane du pool {value}',
  'das.weight': 'Poids dans le Groupe',
  'das.margin': 'Marge',
  'das.vitalsTitle': 'Chiffres du domaine',
  'das.vitalsYear': 'Exercice {n}, le dernier clos.',
  'das.vitalsEndowment': 'Chiffres de la dotation.',
  'das.vitalsHint': 'Croissance : variation du chiffre d’affaires sur l’exercice précédent. Poids : part du chiffre d’affaires du Groupe. Marge : EBITDA rapporté au chiffre d’affaires. Médiane du pool : part de marché médiane des groupes sur ce domaine, au même exercice.',
} as const;

type FrKey = keyof typeof fr;
/** Une clé plurielle s'appelle sans suffixe : `nav.todo` pour `nav.todo.one` / `nav.todo.other`. */
type PluralBase = { [K in FrKey]: K extends `${infer Base}.other` ? Base : never }[FrKey];
export type MessageKey = FrKey | PluralBase;

const en: Record<string, string> = {
  'nav.menu': 'Menu',
  'nav.drawer': 'Navigation',
  'nav.main': 'Main navigation',
  'nav.closeMenu': 'Close menu',
  'nav.expand': 'Expand navigation',
  'nav.collapse': 'Collapse navigation',
  'nav.allDone': 'All your decisions are filled in',
  'nav.todo.one': '{count} decision to fill in',
  'nav.todo.other': '{count} decisions to fill in',
  'nav.filled': 'filled in',
  'nav.initialDossier': 'Starting pack',
  'nav.myResults': 'My results',
  'nav.survey': 'Satisfaction survey',
  'nav.adminConfig': 'Admin settings',
  'nav.logout': 'Log out',

  'nav.group.dashboard': 'Dashboard',
  'nav.group.strategie': 'Strategy',
  'nav.group.das': 'DAS',
  'nav.group.soumission': 'Submission',
  'nav.group.conseils': 'Advisory',
  'nav.link./dashboard': 'Dashboard',
  'nav.link./strategie': 'Group strategy',
  'nav.link./finance': 'Group finance',
  'nav.link./cession': 'Divestments & acquisitions',
  'nav.link./strategie/das': 'DAS strategy',
  'nav.link./organisation': 'Organisation & HR',
  'nav.link./marches': 'Purchasing & distribution',
  'nav.link./war-room': 'War Room',
  'nav.link./recapitulatif': 'Round summary',
  'nav.link./cabinet': 'Consulting firm',
  'nav.link./revelation': 'Results reveal',

  'round.onboarding': 'R0',
  'round.number': 'Round {n}',
  'status.draft': 'Session not open',
  'status.onboarding': 'Onboarding — decisions open',
  'status.round_active': 'Decisions open',
  'status.round_locked': 'Round locked',
  'status.round_resolving': 'Calculating',
  'status.round_resolved': 'Results published',
  'status.completed': 'Session ended',
  'readOnly.draft': 'Session not open yet — read only.',
  'readOnly.round_locked': 'Round locked — read only. The values shown are those the engine received.',
  'readOnly.round_resolving': 'Calculating — read only. The values shown are those the engine received.',
  'readOnly.round_resolved': 'Results published — read only until the next round opens.',
  'readOnly.completed': 'Session ended — read only.',
  'readOnly.default': 'Read only.',

  'money.available': 'Available',
  'money.drawn': 'including {amount} borrowed',
  'money.engaged': 'Committed this round',
  'money.remaining': 'Remaining',
  'money.debt': 'Outstanding loans',

  'shell.skipToContent': 'Skip to content',
  'theme.group': 'Display theme',
  'theme.system': 'Follow system',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',
  'lang.label': 'Language',
  'glossary.button': 'Glossary',

  'next.aria': 'Next step',
  'next.position': 'Step {index} of {total}',
  'next.link': 'Next step: {label}',

  'bar.locked': 'Round locked',
  'bar.review': 'Review and submit the round',
  'bar.missing.one': '{count} missing decision',
  'bar.missing.other': '{count} missing decisions',
  'bar.missingList': 'Missing:',
  'bar.hintTitle': 'How your entries are saved',
  'bar.hint': 'Your entries are saved as you type: the button on the right saves nothing. It sends anything still queued, then opens the round summary, from which your team submits.',
  'save.idle': 'No changes',
  'save.pending': 'Editing…',
  'save.saving': 'Saving…',
  'save.saved': 'Saved',
  'save.savedAt': 'Saved at {time}',
  'save.error': 'Offline — your entries are kept and will be sent automatically',
  'save.locked': 'Round locked — this entry was not taken into account',
  'save.queued': '({count} queued)',

  'presence.online.one': '{count} online',
  'presence.online.other': '{count} online',
  'presence.statusOnline': 'online',
  'presence.statusOffline': 'offline',
  'presence.statusHidden': 'hidden',
  'presence.self': '(you)',
  'presence.facilitator': 'Facilitator',

  'play.banner': 'You are playing in {team} — your entries count for this team.',
  'play.hide': 'Go hidden',
  'play.show': 'Make me visible',
  'play.leave': 'Back to facilitation',
  'play.leaving': 'Returning…',

  'das.piloted': 'Business unit',
  'das.pilotedHintMany': 'DAS strategy, purchasing, distribution, organisation and HR apply to the unit chosen here. Fill it in everywhere, then move to the next one.',
  'das.pilotedHintOne': 'Your only unit. An acquisition on the market will add more here.',
  'das.group': 'Business unit being managed',
  'das.forSale': '· for sale',
  'das.noClosedYear': 'No closed financial year for this unit yet',
  'das.growth': 'Growth',
  'das.marketShare': 'Market share',
  'das.poolMedian': 'pool median {value}',
  'das.weight': 'Weight in the Group',
  'das.margin': 'Margin',
  'das.vitalsTitle': 'Unit figures',
  'das.vitalsYear': 'Financial year {n}, the latest closed.',
  'das.vitalsEndowment': 'Starting endowment figures.',
  'das.vitalsHint': 'Growth: change in revenue over the previous year. Weight: share of Group revenue. Margin: EBITDA over revenue. Pool median: median market share of the groups in this unit, same year.',
};

const ar: Record<string, string> = {
  'nav.menu': 'القائمة',
  'nav.drawer': 'التنقل',
  'nav.main': 'التنقل الرئيسي',
  'nav.closeMenu': 'إغلاق القائمة',
  'nav.expand': 'توسيع شريط التنقل',
  'nav.collapse': 'طي شريط التنقل',
  'nav.allDone': 'تم إدخال جميع قراراتكم',
  'nav.todo.zero': 'لا قرارات متبقية',
  'nav.todo.one': 'قرار واحد متبقٍ للإدخال',
  'nav.todo.two': 'قراران متبقيان للإدخال',
  'nav.todo.few': '{count} قرارات متبقية للإدخال',
  'nav.todo.many': '{count} قرارًا متبقيًا للإدخال',
  'nav.todo.other': '{count} قرار متبقٍ للإدخال',
  'nav.filled': 'تم الإدخال',
  'nav.initialDossier': 'الملف الأولي',
  'nav.myResults': 'نتائجي',
  'nav.survey': 'استبيان الرضا',
  'nav.adminConfig': 'إعدادات المشرف',
  'nav.logout': 'تسجيل الخروج',

  'nav.group.dashboard': 'لوحة القيادة',
  'nav.group.strategie': 'الاستراتيجية',
  'nav.group.das': 'DAS',
  'nav.group.soumission': 'التقديم',
  'nav.group.conseils': 'الاستشارات',
  'nav.link./dashboard': 'لوحة القيادة',
  'nav.link./strategie': 'استراتيجية المجموعة',
  'nav.link./finance': 'مالية المجموعة',
  'nav.link./cession': 'التفويت والاستحواذ',
  'nav.link./strategie/das': 'استراتيجية DAS',
  'nav.link./organisation': 'التنظيم والموارد البشرية',
  'nav.link./marches': 'المشتريات والتوزيع',
  'nav.link./war-room': 'غرفة الأزمات',
  'nav.link./recapitulatif': 'ملخص الجولة',
  'nav.link./cabinet': 'مكتب الاستشارات',
  'nav.link./revelation': 'كشف النتائج',

  'round.onboarding': 'الجولة 0',
  'round.number': 'الجولة {n}',
  'status.draft': 'الجلسة غير مفتوحة',
  'status.onboarding': 'مرحلة التعرّف — القرارات مفتوحة',
  'status.round_active': 'القرارات مفتوحة',
  'status.round_locked': 'الجولة مقفلة',
  'status.round_resolving': 'جارٍ الحساب',
  'status.round_resolved': 'النتائج منشورة',
  'status.completed': 'انتهت الجلسة',
  'readOnly.draft': 'الجلسة لم تُفتح بعد — للقراءة فقط.',
  'readOnly.round_locked': 'الجولة مقفلة — للقراءة فقط. القيم المعروضة هي التي تلقّاها المحرّك.',
  'readOnly.round_resolving': 'جارٍ الحساب — للقراءة فقط. القيم المعروضة هي التي تلقّاها المحرّك.',
  'readOnly.round_resolved': 'النتائج منشورة — للقراءة فقط إلى حين فتح الجولة التالية.',
  'readOnly.completed': 'انتهت الجلسة — للقراءة فقط.',
  'readOnly.default': 'للقراءة فقط.',

  'money.available': 'المتاح لديكم',
  'money.drawn': 'منها {amount} قروض مسحوبة',
  'money.engaged': 'الملتزم به هذه الجولة',
  'money.remaining': 'المتبقي',
  'money.debt': 'القروض الجارية',

  'shell.skipToContent': 'الانتقال إلى المحتوى',
  'theme.group': 'مظهر العرض',
  'theme.system': 'حسب إعدادات النظام',
  'theme.light': 'المظهر الفاتح',
  'theme.dark': 'المظهر الداكن',
  'lang.label': 'اللغة',
  'glossary.button': 'المسرد',

  'next.aria': 'الخطوة التالية',
  'next.position': 'الخطوة {index} من {total}',
  'next.link': 'الخطوة التالية: {label}',

  'bar.locked': 'الجولة مقفلة',
  'bar.review': 'مراجعة الجولة وتقديمها',
  'bar.missing.zero': 'لا قرارات ناقصة',
  'bar.missing.one': 'قرار واحد ناقص',
  'bar.missing.two': 'قراران ناقصان',
  'bar.missing.few': '{count} قرارات ناقصة',
  'bar.missing.many': '{count} قرارًا ناقصًا',
  'bar.missing.other': '{count} قرار ناقص',
  'bar.missingList': 'الناقص:',
  'bar.hintTitle': 'حفظ مدخلاتكم',
  'bar.hint': 'تُحفظ مدخلاتكم أثناء الكتابة: الزر على اليسار لا يحفظ شيئًا. يرسل ما تبقّى في الانتظار، ثم يفتح ملخص الجولة الذي يقدّم منه فريقكم الجولة.',
  'save.idle': 'لا تعديلات',
  'save.pending': 'جارٍ التعديل…',
  'save.saving': 'جارٍ الحفظ…',
  'save.saved': 'تم الحفظ',
  'save.savedAt': 'تم الحفظ على الساعة {time}',
  'save.error': 'غير متصل — مدخلاتكم محفوظة وستُرسل تلقائيًا',
  'save.locked': 'الجولة مقفلة — لم يُؤخذ هذا الإدخال بعين الاعتبار',
  'save.queued': '({count} في الانتظار)',

  'presence.online.zero': 'لا أحد متصل',
  'presence.online.one': 'متصل واحد',
  'presence.online.two': 'متصلان',
  'presence.online.few': '{count} متصلين',
  'presence.online.many': '{count} متصلًا',
  'presence.online.other': '{count} متصل',
  'presence.statusOnline': 'متصل',
  'presence.statusOffline': 'غير متصل',
  'presence.statusHidden': 'متخفٍّ',
  'presence.self': '(أنت)',
  'presence.facilitator': 'الميسّر',

  'play.banner': 'أنت تلعب ضمن {team} — مدخلاتك تُحتسب لهذا الفريق.',
  'play.hide': 'التخفّي',
  'play.show': 'إظهاري',
  'play.leave': 'العودة إلى التنشيط',
  'play.leaving': 'جارٍ العودة…',

  'das.piloted': 'مجال النشاط المُدار',
  'das.pilotedHintMany': 'استراتيجية DAS والمشتريات والتوزيع والتنظيم والموارد البشرية تخص المجال المختار هنا. أدخلوا بياناته في كل مكان، ثم انتقلوا إلى المجال التالي.',
  'das.pilotedHintOne': 'مجالكم الوحيد. أي استحواذ في سوق الاستحواذات سيضيف مجالات أخرى هنا.',
  'das.group': 'مجال النشاط الاستراتيجي المُدار',
  'das.forSale': '· معروض للتفويت',
  'das.noClosedYear': 'لا توجد سنة مالية مقفلة لهذا المجال بعد',
  'das.growth': 'النمو',
  'das.marketShare': 'الحصة السوقية',
  'das.poolMedian': 'الوسيط في المجموعة التنافسية {value}',
  'das.weight': 'الوزن داخل المجموعة',
  'das.margin': 'الهامش',
  'das.vitalsTitle': 'أرقام المجال',
  'das.vitalsYear': 'السنة المالية {n}، آخر سنة مقفلة.',
  'das.vitalsEndowment': 'أرقام الرصيد الأولي.',
  'das.vitalsHint': 'النمو: تغيّر رقم المعاملات مقارنة بالسنة السابقة. الوزن: حصة المجال من رقم معاملات المجموعة. الهامش: EBITDA مقسومًا على رقم المعاملات. الوسيط: الحصة السوقية الوسيطة للمجموعات في هذا المجال، في السنة نفسها.',
};

export const MESSAGES: Record<Locale, Record<string, string>> = { fr, en, ar };

/**
 * Le texte d'une clé dans une langue, variables remplacées.
 *
 * Repli : la clé manquante dans une langue retombe sur le français plutôt que
 * d'afficher un identifiant — un écran à moitié traduit reste utilisable.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const fallback = MESSAGES[DEFAULT_LOCALE];

  let template: string | undefined;
  if (typeof vars.count === 'number') {
    const rule = new Intl.PluralRules(locale).select(vars.count);
    template =
      table[`${key}.${rule}`] ?? table[`${key}.other`] ??
      fallback[`${key}.${new Intl.PluralRules(DEFAULT_LOCALE).select(vars.count)}`] ?? fallback[`${key}.other`];
  }
  template ??= table[key] ?? fallback[key] ?? key;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Les clés du français, pour vérifier que les autres langues n'en oublient aucune. */
export const FRENCH_KEYS = Object.keys(fr) as FrKey[];
