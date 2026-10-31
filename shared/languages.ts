/** Languages the course can show. English is the source, and a page with no translation stays English. */
export const languages = [
  { id: 'en', name: 'English' },
  { id: 'mn', name: 'Монгол' },
] as const;

export type Language = (typeof languages)[number]['id'];

export const isLanguage = (value: unknown): value is Language => languages.some((language) => language.id === value);
